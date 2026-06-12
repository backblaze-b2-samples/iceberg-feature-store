from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    """Request to append a synthetic batch of feature rows."""

    # None -> use settings.default_batch_rows.
    rows: int | None = Field(default=None, ge=1, le=100_000)


class IngestResponse(BaseModel):
    """Result of an append commit."""

    rows_appended: int
    snapshot_id: int
    total_rows: int
    total_data_files: int
    source: str  # "synthetic" | "raw:<key>"


class EvolveResponse(BaseModel):
    """Result of a schema-evolution commit (add a nullable column)."""

    column_added: str
    new_schema_id: int
    current_schema_id: int
    already_present: bool
