"""Iceberg repo layer — versioned feature table backed by B2 object storage.

All ``pyiceberg`` / ``pyarrow`` SDK usage is confined to this module. The table
data files (Parquet), manifests (Avro), and metadata (JSON) all live directly on
Backblaze B2 via PyIceberg's ``PyArrowFileIO`` S3 client. The only local state is
a tiny SQLite "pointer" DB (``SqlCatalog``) that tracks each table's latest
``metadata.json`` — the canonical "PyIceberg without a catalog server" pattern.
Commit atomicity lives in SQLite, not S3, so B2's lack of conditional PUT is a
non-issue here (no ``AWS_S3_ALLOW_UNSAFE_RENAME`` hack needed).

Standard #2 deviation (precedent: lance): PyIceberg's PyArrow ``S3FileSystem``
exposes no user-agent override through PyIceberg's public API, so its internal S3
client is not UA-tagged. The boto3 client in ``b2_client.py`` (all browse / upload
/ export / presign / delete) is fully tagged ``b2ai-iceberg-feature-store``.
Documented in ``ARCHITECTURE.md``.
"""

import functools
import logging
from datetime import datetime
from pathlib import Path

import pyarrow as pa
from pyiceberg.catalog.sql import SqlCatalog
from pyiceberg.types import DoubleType

from app.config import settings
from app.repo.iceberg_schema import EVOLVE_COLUMN

logger = logging.getLogger(__name__)


def _catalog_db_path() -> Path:
    p = Path(settings.catalog_db_file)
    if not p.is_absolute():
        # Anchor at services/api/ (three levels up from this file).
        p = Path(__file__).resolve().parents[2] / p
    return p


@functools.lru_cache(maxsize=1)
def get_catalog() -> SqlCatalog:
    """Return the PyIceberg SqlCatalog (SQLite pointer DB + B2 S3 FileIO).

    Fails fast with a clear message if B2 credentials are missing — there is no
    silent local fallback, so misconfiguration never masquerades as success.
    """
    if not (settings.b2_application_key_id and settings.b2_application_key and settings.b2_bucket_name):
        raise RuntimeError(
            "B2 credentials are not configured. Set B2_APPLICATION_KEY_ID, "
            "B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, and B2_REGION in "
            ".env — the Iceberg warehouse lives on B2 and cannot be created "
            "without them."
        )
    db_path = _catalog_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    logger.info(
        "Opening Iceberg SqlCatalog '%s' (pointer db=%s, warehouse=%s)",
        settings.catalog_name,
        db_path,
        settings.warehouse_uri,
    )
    return SqlCatalog(
        settings.catalog_name,
        **{
            "uri": f"sqlite:///{db_path}",
            "warehouse": settings.warehouse_uri,
            # PyArrowFileIO S3 props -> B2's S3-compatible API.
            "s3.endpoint": settings.b2_endpoint,
            "s3.region": settings.b2_region,
            "s3.access-key-id": settings.b2_application_key_id,
            "s3.secret-access-key": settings.b2_application_key,
        },
    )


def _table_has_evolved_column(table) -> bool:
    return EVOLVE_COLUMN in table.schema().column_names


def _load_table_or_none(catalog: SqlCatalog):
    if catalog.table_exists(settings.table_identifier):
        return catalog.load_table(settings.table_identifier)
    return None


def ensure_table(catalog: SqlCatalog | None = None):
    """Ensure the namespace exists; return the table or None if not yet created.

    The table itself is created lazily on the first real append (create-with-data),
    because empty ``create_table`` calls don't reliably round-trip on S3/B2.
    """
    catalog = catalog or get_catalog()
    catalog.create_namespace_if_not_exists(settings.namespace)
    return _load_table_or_none(catalog)


def append_arrow(arrow_table: pa.Table) -> dict:
    """Append an Arrow batch, creating the table with data on first append.

    Returns commit stats (snapshot id + running totals).
    """
    catalog = get_catalog()
    catalog.create_namespace_if_not_exists(settings.namespace)
    table = _load_table_or_none(catalog)
    if table is None:
        logger.info(
            "Creating Iceberg table '%s' with first batch (%d rows)",
            settings.table_identifier,
            arrow_table.num_rows,
        )
        table = catalog.create_table(settings.table_identifier, schema=arrow_table.schema)
    # Align the incoming batch to the table's current schema (handles the
    # evolved column being present/absent).
    table.append(arrow_table)
    table = catalog.load_table(settings.table_identifier)
    return _running_totals(table)


def evolve_schema() -> dict:
    """Add the nullable ``feature_c`` column (schema-evolution demo)."""
    catalog = get_catalog()
    table = _load_table_or_none(catalog)
    if table is None:
        raise RuntimeError(
            "Cannot evolve schema: the feature table does not exist yet. "
            "Ingest a batch first."
        )
    already_present = _table_has_evolved_column(table)
    if not already_present:
        with table.update_schema() as update:
            update.add_column(EVOLVE_COLUMN, DoubleType(), required=False)
        table = catalog.load_table(settings.table_identifier)
    schema_id = table.schema().schema_id
    return {
        "already_present": already_present,
        "new_schema_id": schema_id,
        "current_schema_id": schema_id,
    }


def _running_totals(table) -> dict:
    """Snapshot id + running row/file totals for the current snapshot."""
    snap = table.current_snapshot()
    summary = snap.summary if snap else None
    return {
        "snapshot_id": snap.snapshot_id if snap else 0,
        "total_rows": int((summary.get("total-records") if summary else 0) or 0),
        "total_data_files": int((summary.get("total-data-files") if summary else 0) or 0),
    }


def _resolve_snapshot_id(table, snapshot_id: int | None, as_of: str | None) -> int | None:
    """Resolve an explicit snapshot id or an as-of timestamp to a snapshot id."""
    if snapshot_id is not None:
        return snapshot_id
    if as_of:
        target_ms = int(datetime.fromisoformat(as_of).timestamp() * 1000)
        candidates = [s for s in table.snapshots() if s.timestamp_ms <= target_ms]
        if not candidates:
            return None
        return max(candidates, key=lambda s: s.timestamp_ms).snapshot_id
    snap = table.current_snapshot()
    return snap.snapshot_id if snap else None


def scan(
    snapshot_id: int | None = None,
    as_of: str | None = None,
    row_filter: str | None = None,
    columns: list[str] | None = None,
) -> tuple[pa.Table, dict]:
    """Plan a (time-travel) scan, prune files, and materialize Arrow + stats."""
    catalog = get_catalog()
    table = _load_table_or_none(catalog)
    if table is None:
        return pa.table({}), {
            "snapshot_id": None,
            "total_data_files": 0,
            "files_scanned": 0,
            "rows_read": 0,
        }
    resolved = _resolve_snapshot_id(table, snapshot_id, as_of)
    total_files = _running_totals(table)["total_data_files"]
    builder = table.scan(
        row_filter=row_filter or "true",
        selected_fields=tuple(columns) if columns else ("*",),
        snapshot_id=resolved,
    )
    files_scanned = len(list(builder.plan_files()))
    arrow = builder.to_arrow()
    return arrow, {
        "snapshot_id": resolved,
        "total_data_files": total_files,
        "files_scanned": files_scanned,
        "rows_read": arrow.num_rows,
    }


def rollback_to(snapshot_id: int) -> dict:
    """Roll the current pointer back to a prior snapshot (superseded files stay)."""
    catalog = get_catalog()
    table = _load_table_or_none(catalog)
    if table is None:
        raise RuntimeError("Cannot rollback: the feature table does not exist yet.")
    valid = {s.snapshot_id for s in table.snapshots()}
    if snapshot_id not in valid:
        raise RuntimeError(f"Snapshot {snapshot_id} is not in this table's history.")
    table.manage_snapshots().set_current_snapshot(snapshot_id=snapshot_id).commit()
    table = catalog.load_table(settings.table_identifier)
    return _running_totals(table)


def check_catalog_connectivity() -> bool:
    """Check the Iceberg catalog is reachable (lists namespaces)."""
    try:
        get_catalog().list_namespaces()
        return True
    except Exception:
        logger.warning("Iceberg catalog connectivity check failed", exc_info=True)
        return False
