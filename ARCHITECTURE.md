<!-- last_verified: 2026-06-12 -->
# Architecture

`iceberg-feature-store` demonstrates an **object-storage-native lakehouse**: a versioned Apache Iceberg feature table whose data files, manifests, and metadata all live on Backblaze B2, with no cloud data warehouse to operate. Time-travel queries run locally with DuckDB; the only non-B2 state is a tiny SQLite catalog pointer.

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - **Ingest** — append a synthetic batch (or a raw `raw/` file) → a new Iceberg snapshot; evolve the schema (add a column)
  - **Tables** — warehouse-scoped explorer: snapshot history with time-travel + rollback, schema-version history, and a Warehouse-files sub-view listing the `warehouse/` prefix on B2
  - **Query** — pick current / a snapshot / an as-of timestamp + optional row filter; PyIceberg prunes files, DuckDB runs SQL; shows results + scan stats + an Export (Derive) action
  - **Dashboard** — Iceberg metrics (rows, snapshots, warehouse size on B2, write-amplification ratio, schema version), a rows-over-snapshots growth chart, and a recent-activity table
  - Raw-batch upload (drag-and-drop into `raw/`), full-bucket file browser, dark mode
- **services/api/** — FastAPI backend (layered architecture)
  - Iceberg catalog + table ops (append, evolve, snapshots, time-travel scan, rollback) and DuckDB query engine
  - B2 S3 integration via boto3; Iceberg warehouse on B2 via PyIceberg's PyArrow S3 FileIO
  - `/health` (B2 **and** catalog connectivity), JSON logging, `/metrics`
- **packages/shared/** — TypeScript types mirroring the Pydantic models

## Backend Layering

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access & external SDKs (boto3, pyiceberg, pyarrow, duckdb) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` → `config` → `repo` → `service` → `runtime`
2. No backward imports (e.g. service must not import from runtime)
3. **External SDKs are contained in `repo/`**: `boto3` (S3 client), `pyiceberg`/`pyarrow` (Iceberg + Arrow), and `duckdb` (query engine) are each confined to repo modules. The structural test mechanically enforces `boto3`-in-repo; `pyiceberg`/`pyarrow`/`duckdb` follow the same "contain external SDKs" intent.
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Each file stays under 300 lines

### Directory Structure

```
services/api/
  main.py                   App entrypoint, middleware, router registration, startup B2 validation
  app/
    types/                  Pydantic models (files, upload, stats/dashboard, table, snapshot, ingest, query)
    config/                 Settings (B2 creds, warehouse/raw/exports prefixes, catalog name/db, namespace/table)
    repo/
      b2_client.py          boto3 S3 client (UA b2ai-iceberg-feature-store, region_name=B2_REGION)
      iceberg_catalog.py    SqlCatalog + table mutations (append, evolve, scan, rollback) — pyiceberg/pyarrow
      iceberg_schema.py     Iceberg + PyArrow schema, synthetic batch + file parsing + Parquet bytes — pyarrow
      iceberg_history.py    Snapshot log, schema versions, table stats, logical bytes (read-only) — pyiceberg
      query_engine.py       DuckDB in-memory SQL over the scanned Arrow table — duckdb
      ops_log.py            Durable recent-activity JSON log (dashboard table)
    service/
      ingest.py             synthetic / raw-file → arrow → append; evolve; log op
      tables.py             table info, snapshots, schema versions, rollback, warehouse-files listing
      query.py              plan scan via repo + run SQL via query_engine; export slice → Parquet → exports/
      dashboard.py          assemble DashboardStats from table stats + warehouse object stats + ops
      upload.py, files.py, metadata.py
    runtime/                FastAPI route handlers (ingest, tables, query, dashboard, files, upload, health, metrics)
  tests/                    pytest (structural + integration + ingest/query units)
```

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API), the warehouse storage layer. Three prefixes:
  - `warehouse/` — the Iceberg table: Parquet data files, Avro manifests, manifest lists, and `metadata.json`
  - `raw/` — staged raw batches (CSV/JSON/Parquet) the user uploads, before ingest parses them
  - `exports/` — derived training slices (Parquet) written by the Export/Derive step
- **Local SQLite catalog pointer** — `services/api/data/catalog.db` (gitignored). A PyIceberg `SqlCatalog` that stores **only the pointer** to each table's latest `metadata.json`. This is the canonical "PyIceberg without a catalog server" pattern: no second service, B2 credentials only. The tiny pointer is local; the entire warehouse is on B2.

### The B2 ↔ PyIceberg mechanism

`app/repo/iceberg_catalog.py` wires the catalog to B2:

- `SqlCatalog(uri="sqlite:///…/catalog.db", warehouse="s3://<bucket>/warehouse/", s3.endpoint=…, s3.region=…, s3.access-key-id=…, s3.secret-access-key=…)`.
- PyIceberg's default `PyArrowFileIO` performs all GET/PUT/LIST/HEAD against B2's S3 API. **Verified working against B2 on the regional endpoint** (append + time-travel read + rollback round-trip) with no addressing/region workaround — pyarrow's `S3FileSystem` uses path-style addressing with `endpoint_override`, which B2 accepts. If a future B2/region change broke this, the fallback would be `pyiceberg.io.fsspec.FsspecFileIO` (s3fs) with the same `s3.*` props.

**No conditional-PUT problem.** LanceDB-style object stores commit on S3 with a conditional PUT (`If-None-Match`) that B2 does not support, forcing an unsafe-rename flag. **Iceberg here does not** — commit atomicity lives in the local SQLite catalog, not on S3, so **no `AWS_S3_ALLOW_UNSAFE_RENAME` hack is needed**. The trade-off is the same single-writer assumption (one process holds the SQLite catalog); see [docs/RELIABILITY.md](docs/RELIABILITY.md).

### Standard #2 — custom user agent (justified deviation)

Standard #2 (custom user agent on every S3 client) is satisfied for the **boto3** client (`b2ai-iceberg-feature-store`), which handles all browse / raw upload / **export Parquet writes** / presign / delete. It is **not** satisfiable for PyIceberg's internal client: PyIceberg's `PyArrowFileIO` uses pyarrow's `S3FileSystem`, which exposes **no user-agent override through PyIceberg's public API**. This is a **justified, documented deviation** — the same shape as the LanceDB case in the sibling `lance-multimodal-search` sample. Every Derive (export) write goes through the UA-tagged boto3 client specifically so that the user-authored output is tagged even though Iceberg's internal reads/writes are not.

### Table & schema

- Identifier `features.feature_events` (namespace `features`). Created lazily on the **first append** (create-with-data), because empty `create_table` calls don't reliably round-trip on object stores.
- Schema v1: `entity_id` string, `event_ts` timestamptz, `feature_a` double, `feature_b` double, `label` int, `ingested_at` timestamptz. Timestamps are timezone-aware microsecond UTC, matching `TimestamptzType` to avoid cast errors on append.
- Schema evolution (v2): add nullable `feature_c` double. Iceberg tracks columns by ID, so time-travel to a v1 snapshot still reads cleanly.

### Write amplification (real and demonstrated)

Appends add new data files without rewriting old ones; rollback leaves superseded files on B2 until expiration. The dashboard surfaces **all-time warehouse bytes** (every object under `warehouse/`, via `b2_client.get_prefix_size`) divided by **current-snapshot logical bytes** (sum of the data-file sizes the current snapshot references, via `iceberg_history.current_logical_bytes`) as the write-amplification ratio.

## Data Flows

- **Stage raw (upload)**: Browser → `POST /upload` (CSV/JSON/Parquet) → validated → `repo.upload_file` writes to `raw/`.
- **Ingest**: Browser → `POST /ingest/batch` (synthetic) or `POST /ingest/raw?key=…` → `service.ingest` builds an Arrow batch (`iceberg_schema`) → `iceberg_catalog.append_arrow` commits a snapshot to B2 → op logged.
- **Evolve schema**: `POST /ingest/evolve-schema` → `iceberg_catalog.evolve_schema` adds `feature_c`.
- **Tables**: `GET /tables`, `GET /tables/snapshots`, `GET /tables/schema`, `GET /tables/warehouse-files` (B2 `list_objects_v2` over `warehouse/`), `POST /tables/rollback?snapshot_id=…`.
- **Query**: `POST /query` → `iceberg_catalog.scan` resolves snapshot/as-of, prunes files (`plan_files`), reads only needed Parquet into Arrow → `query_engine.run_sql` (DuckDB) → results + scan stats.
- **Export (Derive)**: `POST /query/export` → scan → `arrow_to_parquet_bytes` → `b2_client.put_object` to `exports/` (UA-tagged) → op logged.
- **Dashboard**: `GET /dashboard/stats` aggregates table stats, `get_prefix_size("warehouse/")`, and `current_logical_bytes()`; `GET /dashboard/activity` reads the ops log.
- **List / download / delete**: unchanged from the starter (full-bucket browse via S3 `list_objects_v2` / `head_object`, presigned URLs, `delete_object`).

## Observability

- Structured JSON logging on all requests with `request_id`; request timing middleware
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint — checks **both** B2 connectivity and Iceberg catalog reachability

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently` (web `:3000`, API `:8000`)
- **Railway** — two services from the same repo; see `infra/railway/README.md`. The SQLite catalog pointer needs a persistent volume (or a server-backed catalog) for durability across restarts.

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md).

- **Frontend → API** — CORS-restricted to configured origins
- **API → B2** — authenticated via application keys, signature v4
- **Client → B2** — short-lived presigned URLs for downloads (no public bucket required)

## Canonical Files

- Iceberg catalog + table mutations: `services/api/app/repo/iceberg_catalog.py`
- Iceberg/PyArrow schema + batch builders: `services/api/app/repo/iceberg_schema.py`
- Iceberg history & stats: `services/api/app/repo/iceberg_history.py`
- DuckDB query engine: `services/api/app/repo/query_engine.py`
- Query/export service: `services/api/app/service/query.py`
- B2 data access: `services/api/app/repo/b2_client.py`
- Config: `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- Frontend API client / hooks: `apps/web/src/lib/api-client.ts`, `apps/web/src/lib/queries.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — single-writer catalog, rollback semantics, orphan files until expiration
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
