from pydantic import BaseModel

from app.types.fields import SnapshotId


class SnapshotInfo(BaseModel):
    """One Iceberg snapshot in the table's history (newest first in lists)."""

    snapshot_id: SnapshotId
    parent_id: SnapshotId | None
    committed_at: str  # ISO 8601 UTC
    operation: str  # append | overwrite | delete | replace
    schema_id: int | None
    # Per-commit deltas (from snapshot summary).
    added_records: int
    added_data_files: int
    # Running totals as of this snapshot.
    total_records: int
    total_data_files: int
    is_current: bool
