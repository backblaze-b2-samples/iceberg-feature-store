import logging

from fastapi import APIRouter, HTTPException

from app.service.ingest import (
    IngestError,
    evolve,
    ingest_raw_file,
    ingest_synthetic,
)
from app.types import EvolveResponse, IngestRequest, IngestResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/ingest/batch", response_model=IngestResponse)
async def ingest_batch_endpoint(req: IngestRequest):
    """Append a synthetic batch of feature rows (commits a new snapshot)."""
    try:
        result = ingest_synthetic(req.rows)
    except IngestError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    logger.info("Ingested synthetic batch: snapshot=%s rows=%d", result.snapshot_id, result.rows_appended)
    return result


@router.post("/ingest/raw", response_model=IngestResponse)
async def ingest_raw_endpoint(key: str):
    """Parse a raw/ file already on B2 and append it to the feature table."""
    try:
        return ingest_raw_file(key)
    except IngestError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None


@router.post("/ingest/evolve-schema", response_model=EvolveResponse)
async def evolve_schema_endpoint():
    """Add the nullable feature_c column (schema-evolution demo)."""
    try:
        return evolve()
    except IngestError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
