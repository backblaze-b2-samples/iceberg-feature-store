from pydantic import BaseModel


class DailyUploadCount(BaseModel):
    date: str
    uploads: int


class UploadStats(BaseModel):
    total_files: int
    total_size_bytes: int
    total_size_human: str
    uploads_today: int
    total_downloads: int


class SnapshotGrowthPoint(BaseModel):
    """One point on the 'rows over snapshots' growth chart."""

    snapshot_id: int
    committed_at: str
    total_rows: int


class DashboardStats(BaseModel):
    """Iceberg feature-store metrics for the dashboard cards + growth chart."""

    table_exists: bool
    snapshot_count: int
    current_total_rows: int
    current_data_files: int
    current_schema_id: int
    warehouse_size_bytes: int
    warehouse_size_human: str
    # Write amplification: all-time warehouse bytes / current logical bytes.
    write_amplification: float
    current_logical_bytes: int
    current_logical_human: str
    growth: list[SnapshotGrowthPoint]


class ActivityEntry(BaseModel):
    """One row in the dashboard recent-activity table."""

    ts: str
    op: str
    detail: str
    snapshot_id: int | None
    rows: int | None
