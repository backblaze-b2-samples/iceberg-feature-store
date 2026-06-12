from fastapi import APIRouter, HTTPException

from app.service.tables import (
    TableError,
    get_schema_versions,
    get_snapshots,
    get_table_info,
    list_warehouse_files,
    rollback,
)
from app.types import FileMetadata, SchemaVersion, SnapshotInfo, TableInfo

router = APIRouter()


@router.get("/tables", response_model=TableInfo)
async def table_info_endpoint():
    """Current state of the Iceberg feature table."""
    return get_table_info()


@router.get("/tables/snapshots", response_model=list[SnapshotInfo])
async def snapshots_endpoint():
    """Snapshot history, newest first (time-travel view)."""
    return get_snapshots()


@router.get("/tables/schema", response_model=list[SchemaVersion])
async def schema_endpoint():
    """All schema versions the table has had."""
    return get_schema_versions()


@router.get("/tables/warehouse-files", response_model=list[FileMetadata])
async def warehouse_files_endpoint(limit: int = 1000):
    """List the warehouse/ prefix on B2 (data files, manifests, metadata)."""
    if limit < 1 or limit > 10_000:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 10000")
    return list_warehouse_files(limit=limit)


@router.post("/tables/rollback", response_model=TableInfo)
async def rollback_endpoint(snapshot_id: int):
    """Roll the table pointer back to a prior snapshot."""
    try:
        return rollback(snapshot_id)
    except TableError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
