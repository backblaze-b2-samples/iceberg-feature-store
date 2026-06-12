from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Backblaze B2 (Standard #3 env names) ---
    b2_endpoint: str = "https://s3.us-west-004.backblazeb2.com"
    b2_region: str = "us-west-004"
    b2_application_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = ""
    b2_public_url: str = ""

    api_port: int = 8000
    # Explicit allowlist by default — covers Next on :3000 and the
    # fallback :3001 it picks if 3000 is busy. Production deploys should
    # override with the exact frontend origin.
    api_cors_origins: str = "http://localhost:3000,http://localhost:3001"
    # Optional dev-only escape hatch: a regex that matches additional
    # allowed origins. Empty by default — set this to e.g.
    # `^http://localhost:\d+$` to accept any localhost port without
    # listing each one. NEVER ship this to production.
    api_cors_origin_regex: str = ""

    # Upload limits
    max_file_size: int = 100 * 1024 * 1024  # 100MB

    # Small durable counters (downloads, etc). Point at a persistent
    # volume in production if you care about surviving restarts.
    download_count_file: str = "data/download_count.json"

    # --- Iceberg feature store ---
    # PyIceberg SqlCatalog: a tiny local SQLite "pointer" DB tracks each
    # table's latest metadata.json. ALL table data, manifests, and metadata
    # live on B2 under warehouse_prefix. No catalog server, B2 creds only.
    catalog_name: str = "b2_feature_store"
    catalog_db_file: str = "data/catalog.db"  # under gitignored services/api/data/
    # Bucket prefixes.
    warehouse_prefix: str = "warehouse/"  # Iceberg data + manifests + metadata
    raw_prefix: str = "raw/"  # staged raw batches (CSV/JSON/Parquet uploads)
    exports_prefix: str = "exports/"  # derived training slices (Parquet)
    # Iceberg table identifier.
    namespace: str = "features"
    table_name: str = "feature_events"
    # Synthetic-batch default size for the zero-setup ingest demo.
    default_batch_rows: int = 500
    # Durable op log for the dashboard recent-activity table.
    ops_log_file: str = "data/ops_log.json"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.api_cors_origins.split(",")]

    @property
    def warehouse_uri(self) -> str:
        """Iceberg warehouse URI on B2 (s3://{bucket}/{warehouse_prefix})."""
        return f"s3://{self.b2_bucket_name}/{self.warehouse_prefix}"

    @property
    def table_identifier(self) -> str:
        """Fully-qualified Iceberg table identifier (namespace.table)."""
        return f"{self.namespace}.{self.table_name}"


settings = Settings()
