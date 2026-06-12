"""Iceberg history & stats reads — snapshot log, schema versions, table stats.

Read-only views over the Iceberg table for the Tables and Dashboard surfaces.
All ``pyiceberg`` access is delegated through ``iceberg_catalog`` loaders; this
module never mutates the table. Part of the repo layer.
"""

from datetime import UTC, datetime

from app.repo.iceberg_catalog import _load_table_or_none, get_catalog


def _summary_int(summary, key: str) -> int:
    """Read an integer counter from a snapshot summary (0 if absent)."""
    return int((summary.get(key) if summary else 0) or 0)


def _columns_of(schema) -> list[dict]:
    """Build the JSON-friendly column list for a given Iceberg schema."""
    return [
        {
            "field_id": f.field_id,
            "name": f.name,
            "type": str(f.field_type),
            "required": f.required,
        }
        for f in schema.fields
    ]


def _snapshot_to_dict(snap, current_id: int | None) -> dict:
    summary = snap.summary
    return {
        "snapshot_id": snap.snapshot_id,
        "parent_id": snap.parent_snapshot_id,
        "committed_at": datetime.fromtimestamp(snap.timestamp_ms / 1000, tz=UTC).isoformat(),
        "operation": summary.operation.value if summary and summary.operation else "append",
        "schema_id": snap.schema_id,
        "added_records": _summary_int(summary, "added-records"),
        "added_data_files": _summary_int(summary, "added-data-files"),
        "total_records": _summary_int(summary, "total-records"),
        "total_data_files": _summary_int(summary, "total-data-files"),
        "is_current": snap.snapshot_id == current_id,
    }


def list_snapshots() -> list[dict]:
    """Return snapshot history, newest first."""
    table = _load_table_or_none(get_catalog())
    if table is None:
        return []
    current = table.current_snapshot()
    current_id = current.snapshot_id if current else None
    snaps = [_snapshot_to_dict(s, current_id) for s in table.snapshots()]
    snaps.sort(key=lambda s: s["committed_at"], reverse=True)
    return snaps


def schema_versions() -> list[dict]:
    """Return all schema versions the table has had (current flagged)."""
    table = _load_table_or_none(get_catalog())
    if table is None:
        return []
    current_id = table.schema().schema_id
    versions = [
        {
            "schema_id": sch.schema_id,
            "is_current": sch.schema_id == current_id,
            "columns": _columns_of(sch),
        }
        for sch in table.schemas().values()
    ]
    versions.sort(key=lambda v: v["schema_id"])
    return versions


def current_logical_bytes() -> int:
    """Sum the data-file sizes referenced by the current snapshot.

    This is the table's *logical* size now (after rollbacks/overwrites). The
    all-time warehouse byte total (every superseded file still on B2) divided by
    this is the write-amplification ratio the dashboard surfaces.
    """
    table = _load_table_or_none(get_catalog())
    if table is None or table.current_snapshot() is None:
        return 0
    total = 0
    for task in table.scan().plan_files():
        total += task.file.file_size_in_bytes
    return total


def table_stats() -> dict:
    """Current schema id, column metadata, snapshot/row/file totals."""
    table = _load_table_or_none(get_catalog())
    if table is None:
        return {
            "exists": False,
            "current_schema_id": 0,
            "columns": [],
            "snapshot_count": 0,
            "current_snapshot_id": None,
            "total_rows": 0,
            "total_data_files": 0,
        }
    snap = table.current_snapshot()
    summary = snap.summary if snap else None
    return {
        "exists": True,
        "current_schema_id": table.schema().schema_id,
        "columns": _columns_of(table.schema()),
        "snapshot_count": len(list(table.snapshots())),
        "current_snapshot_id": snap.snapshot_id if snap else None,
        "total_rows": _summary_int(summary, "total-records"),
        "total_data_files": _summary_int(summary, "total-data-files"),
    }
