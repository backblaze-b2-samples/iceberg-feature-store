<!-- last_verified: 2026-06-12 -->
# Reliability

Reliability expectations and practices for this project.

## Iceberg on B2 — single-writer catalog

- The Iceberg catalog is a PyIceberg `SqlCatalog` backed by a local SQLite pointer DB (`services/api/data/catalog.db`). All table data, manifests, and metadata live on B2 under `warehouse/`.
- **Commit atomicity is in SQLite, not S3.** Unlike LanceDB-style object stores, Iceberg here does **not** rely on the S3 conditional PUT (`If-None-Match`) that B2 lacks — so **no `AWS_S3_ALLOW_UNSAFE_RENAME` flag is needed**.
- **Consequence: single-writer only.** One API process must own the SQLite catalog. Concurrent writers across processes/hosts can corrupt the pointer. Fine for a single-user demo; for multi-writer production use a server-backed catalog (REST / Glue / Nessie) instead of SQLite.
- **Lazy table creation.** Empty `create_table` doesn't round-trip on object stores, so the table is created **with data on the first append** (create-with-data).

## Rollback semantics & orphan files

- Rollback (`POST /tables/rollback`) moves the table's current-snapshot pointer to a prior snapshot via `manage_snapshots().set_current_snapshot()`. Newer snapshots remain in history (you can roll forward again).
- **Superseded data files stay on B2 until expiration.** Appends never rewrite old data files, and rollback doesn't delete the files written by the snapshots it skips past. These orphan/dead files are real and are what the dashboard's **write-amplification ratio** surfaces (all-time warehouse bytes ÷ current logical bytes). In production, run Iceberg snapshot-expiration / orphan-file cleanup to reclaim them.

## Health Checks

- `GET /health` verifies **both** B2 connectivity and Iceberg catalog reachability, returning `healthy` or `degraded` with `b2_connected` / `catalog_connected` flags
- Health endpoint is always available, even when B2 or the catalog is down
- Startup fails fast with a readable message if required `B2_*` settings are missing or still placeholders

## Error Handling

- HTTP handlers return structured error responses with appropriate status codes
- External service failures (B2) are caught and surfaced as 500/502/503 responses
- The catalog/append path fails fast with a clear message when B2 creds are missing — no silent local fallback
- No unhandled exceptions leak stack traces to clients

## Logging

- Structured JSON logging via Python stdlib
- Every request gets a `request_id` for tracing
- Log levels: ERROR for failures, WARNING for degraded state, INFO for requests

## Observability

- Request timing middleware logs duration for every request
- `/metrics` endpoint exposes basic Prometheus-format counters
- Upload success/failure counts tracked

## Graceful Degradation

- File listing returns empty list (not error) when B2 has no objects
- Query / snapshots / table info over a not-yet-created table return empty results (not errors)
- Metadata extraction failures don't block upload (return partial metadata)
- A per-asset query SQL error surfaces as a 400 with the DuckDB message rather than a 500
- Frontend shows skeleton states while loading, error states on failure

## Deployment

- Railway health checks on `/health`
- Zero-downtime deploys via rolling updates
- The SQLite catalog pointer needs a persistent volume for durability across restarts (or use a server-backed catalog)
- Environment-specific configuration via env vars (no config files in prod)
