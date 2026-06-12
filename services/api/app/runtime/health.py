from fastapi import APIRouter

from app.repo import check_catalog_connectivity, check_connectivity

router = APIRouter()


@router.get("/health")
async def health():
    b2_ok = check_connectivity()
    catalog_ok = check_catalog_connectivity()
    all_ok = b2_ok and catalog_ok
    return {
        "status": "healthy" if all_ok else "degraded",
        "b2_connected": b2_ok,
        "catalog_connected": catalog_ok,
    }
