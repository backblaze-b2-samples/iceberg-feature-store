"""Tables service — table info, snapshot history, schema versions, rollback.

Powers the /tables warehouse-scoped explorer: the time-travel view of the
feature table plus a Warehouse-files sub-view that lists the warehouse/ prefix
on B2 (data files, manifests, metadata JSON).
"""

import logging

from app.config import settings
from app.repo import (
    list_files,
    list_snapshots,
    log_op,
    rollback_to,
    schema_versions,
    table_stats,
)
from app.types import ColumnInfo, FileMetadata, SchemaVersion, SnapshotInfo, TableInfo

logger = logging.getLogger(__name__)


class TableError(Exception):
    """Raised when a table operation is invalid."""

    def __init__(self, detail: str, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def get_table_info() -> TableInfo:
    """Current state of the Iceberg feature table."""
    stats = table_stats()
    return TableInfo(
        identifier=settings.table_identifier,
        exists=stats["exists"],
        current_schema_id=stats["current_schema_id"],
        columns=[ColumnInfo(**c) for c in stats["columns"]],
        snapshot_count=stats["snapshot_count"],
        current_snapshot_id=stats["current_snapshot_id"],
        total_rows=stats["total_rows"],
        total_data_files=stats["total_data_files"],
        warehouse_uri=settings.warehouse_uri,
    )


def get_snapshots() -> list[SnapshotInfo]:
    """Snapshot history, newest first."""
    return [SnapshotInfo(**s) for s in list_snapshots()]


def get_schema_versions() -> list[SchemaVersion]:
    """All schema versions the table has had."""
    return [
        SchemaVersion(
            schema_id=v["schema_id"],
            is_current=v["is_current"],
            columns=[ColumnInfo(**c) for c in v["columns"]],
        )
        for v in schema_versions()
    ]


def rollback(snapshot_id: int) -> TableInfo:
    """Roll the table pointer back to a prior snapshot, then return table info."""
    try:
        commit = rollback_to(snapshot_id)
    except RuntimeError as e:
        raise TableError(str(e)) from e
    log_op("rollback", f"rolled back to snapshot {snapshot_id}", snapshot_id, None)
    logger.info("Rolled back to snapshot %s (rows=%s)", snapshot_id, commit["total_rows"])
    return get_table_info()


def list_warehouse_files(limit: int = 1000) -> list[FileMetadata]:
    """List the warehouse/ prefix on B2 — Iceberg data files / manifests / metadata."""
    return list_files(prefix=settings.warehouse_prefix, max_keys=limit)
