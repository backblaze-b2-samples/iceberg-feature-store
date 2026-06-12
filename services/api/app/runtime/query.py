from fastapi import APIRouter, HTTPException

from app.service.query import QueryError, export_slice, run_query
from app.types import ExportRequest, ExportResponse, QueryRequest, QueryResult

router = APIRouter()


@router.post("/query", response_model=QueryResult)
async def query_endpoint(req: QueryRequest):
    """Time-travel scan (Iceberg prunes files) + DuckDB SQL over the result."""
    try:
        return run_query(req)
    except QueryError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None


@router.post("/query/export", response_model=ExportResponse)
async def export_endpoint(req: ExportRequest):
    """Export a training slice as a new Parquet under exports/ on B2."""
    try:
        return export_slice(req)
    except QueryError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
