from pydantic import BaseModel


class ColumnInfo(BaseModel):
    """One column in the current Iceberg table schema."""

    field_id: int
    name: str
    type: str
    required: bool


class SchemaVersion(BaseModel):
    """One historical schema version of the table."""

    schema_id: int
    columns: list[ColumnInfo]
    is_current: bool


class TableInfo(BaseModel):
    """Current state of the Iceberg feature table."""

    identifier: str
    exists: bool
    current_schema_id: int
    columns: list[ColumnInfo]
    snapshot_count: int
    current_snapshot_id: int | None
    total_rows: int
    total_data_files: int
    warehouse_uri: str
