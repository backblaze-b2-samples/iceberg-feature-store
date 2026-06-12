from fastapi import APIRouter, HTTPException

from app.service.dashboard import get_dashboard_stats, recent_activity
from app.types import ActivityEntry, DashboardStats

router = APIRouter()


@router.get("/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats_endpoint():
    """Iceberg feature-store metrics + rows-over-snapshots growth chart."""
    return get_dashboard_stats()


@router.get("/dashboard/activity", response_model=list[ActivityEntry])
async def dashboard_activity_endpoint(limit: int = 20):
    """Recent feature-store operations for the dashboard activity table."""
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 50")
    return recent_activity(limit=limit)
