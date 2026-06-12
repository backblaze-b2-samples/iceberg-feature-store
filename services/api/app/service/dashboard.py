"""Dashboard service — Iceberg feature-store metrics + recent activity.

Assembles the dashboard cards (tables, snapshots, current rows, data files,
warehouse size on B2, write-amplification ratio, schema version), the
'rows over snapshots' growth chart, and the recent-activity table.
"""

from app.config import settings
from app.repo import (
    current_logical_bytes,
    get_prefix_size,
    get_recent_ops,
    list_snapshots,
    table_stats,
)
from app.types import ActivityEntry, DashboardStats, SnapshotGrowthPoint
from app.types.formatting import humanize_bytes


def _growth_points() -> list[SnapshotGrowthPoint]:
    """Rows-over-snapshots series, chronological (oldest first) for the chart."""
    snaps = sorted(list_snapshots(), key=lambda s: s["committed_at"])
    return [
        SnapshotGrowthPoint(
            snapshot_id=s["snapshot_id"],
            committed_at=s["committed_at"],
            total_rows=s["total_records"],
        )
        for s in snaps
    ]


def get_dashboard_stats() -> DashboardStats:
    """Aggregate Iceberg + warehouse-on-B2 metrics for the dashboard."""
    stats = table_stats()
    warehouse = get_prefix_size(settings.warehouse_prefix)
    all_time_bytes = warehouse["total_size_bytes"]
    logical_bytes = current_logical_bytes()
    # Write amplification: every superseded file still on B2 vs the current
    # logical footprint. >1.0 once appends/rollbacks accumulate dead files.
    amplification = round(all_time_bytes / logical_bytes, 2) if logical_bytes else 0.0
    return DashboardStats(
        table_exists=stats["exists"],
        snapshot_count=stats["snapshot_count"],
        current_total_rows=stats["total_rows"],
        current_data_files=stats["total_data_files"],
        current_schema_id=stats["current_schema_id"],
        warehouse_size_bytes=all_time_bytes,
        warehouse_size_human=warehouse["total_size_human"],
        write_amplification=amplification,
        current_logical_bytes=logical_bytes,
        current_logical_human=humanize_bytes(logical_bytes),
        growth=_growth_points(),
    )


def recent_activity(limit: int = 20) -> list[ActivityEntry]:
    """Most recent feature-store operations (newest first)."""
    return [ActivityEntry(**e) for e in get_recent_ops(limit=limit)]
