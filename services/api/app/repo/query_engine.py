"""DuckDB query engine — in-memory SQL over the Arrow table PyIceberg returns.

All ``duckdb`` usage is confined to this module. DuckDB never touches B2: it runs
purely in-memory over the PyArrow table that ``iceberg_catalog.scan`` already read
from B2 (after Iceberg pruned files). This keeps the entire B2 S3 surface inside
two places — boto3 (``b2_client``) and PyIceberg (``iceberg_catalog``).
"""

import logging

import duckdb
import pyarrow as pa

logger = logging.getLogger(__name__)

# The scanned Arrow table is registered under this name for the user's SQL.
TABLE_ALIAS = "t"
_DEFAULT_SQL = f"SELECT * FROM {TABLE_ALIAS}"  # fixed identifier, not user input


def run_sql(arrow_table: pa.Table, sql: str | None, limit: int = 100) -> dict:
    """Run a read-only SQL statement over the Arrow table; return rows + columns.

    ``arrow_table`` is registered as ``t``. A ``LIMIT`` is appended when the
    query has none, so the UI never tries to render an unbounded result.
    """
    statement = (sql or _DEFAULT_SQL).strip().rstrip(";")
    if not statement:
        statement = _DEFAULT_SQL
    if "limit" not in statement.lower():
        statement = f"{statement} LIMIT {int(limit)}"

    con = duckdb.connect(database=":memory:")
    try:
        con.register(TABLE_ALIAS, arrow_table)
        relation = con.sql(statement)
        columns = list(relation.columns)
        result = relation.fetchall()
    finally:
        con.close()

    rows = [_coerce_row(dict(zip(columns, record, strict=True))) for record in result]
    return {"columns": columns, "rows": rows, "row_count": len(rows)}


def _coerce_row(row: dict) -> dict:
    """Make values JSON-serializable (datetimes -> ISO strings)."""
    out: dict = {}
    for key, value in row.items():
        if hasattr(value, "isoformat"):
            out[key] = value.isoformat()
        else:
            out[key] = value
    return out
