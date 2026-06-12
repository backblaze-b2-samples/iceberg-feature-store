# Scaffold plan — `iceberg-feature-store`

Source of truth: `.claude/scratch/vcsk-5c782003-8afe-490e-974d-d299561e4dd2/` (fresh clone of
`vibe-coding-starter-kit`). Closest existing analog studied for structure:
`../lance-multimodal-search` (a non-boto3 store — LanceDB — that lives directly on B2; same
shape as an Iceberg warehouse on B2). Build *from the starter kit*, using lance only as a
structural reference for "external SDK that does its own S3 I/O lives on B2."

## 1. Purpose

`iceberg-feature-store` is a lightweight, object-storage-native lakehouse for ML/data teams.
It uses **Apache Iceberg (via PyIceberg)** to keep a versioned feature table on **Backblaze B2**:
every append, schema change, and snapshot writes new Parquet data files plus Avro manifests and
JSON metadata to B2 — a continuously growing, versioned dataset with real write amplification.
Users ingest batches, browse snapshots, run **time-travel queries with DuckDB**, roll back to a
prior version, and export a training slice as new Parquet — all resolved against the Iceberg
catalog whose data/manifests/metadata live on B2. It runs on **local OSS only** — no second API
key, **B2 credentials only**. For: data engineers and ML teams who want schema evolution,
time-travel, and snapshot rollback without operating a cloud data warehouse.

## 2. Architecture delta from vibe-coding-starter-kit

The starter kit is the ceiling. Keep the reusable B2 scaffolding; strip nothing structural; add
the Iceberg surface. (Mirrors how lance kept Upload/Files/UI and added Search/Library.)

### KEEP as-is
- **UI kit / design system** — `apps/web/src/components/ui/`, design tokens in `globals.css`,
  `/design` page. Never edit generated `ui/` files.
- **Bucket explorer (NON-NEGOTIABLE keep)** — `/files` route + `apps/web/src/app/files/` +
  `apps/web/src/components/files/`. Full-bucket browse stays, Files sidebar entry stays.
- **Upload** — `/upload` route + components. Reframed in docs as "stage a raw batch
  (CSV/JSON/Parquet) into the bucket"; structurally unchanged (drag-drop -> B2 under `raw/`).
- Shared sidebar nav, layout, header, health banner, command palette, settings page, theme.
- Backend scaffolding: layered `types/config/repo/service/runtime`, `main.py` lifespan +
  JSON logging + CORS + middleware, `metrics.py`, structural tests, `scripts/`, `infra/railway/`,
  pnpm workspace, doctor.

### TRIM (remove from starter)
- `docs/images/b2-starterkit-*.png` — starter-kit screenshots (sample-4-screenshot regenerates).
- Nothing else removed. Metadata extraction stays (used by the Files/Upload surface).

### ADD (new for iceberg-feature-store)
- **Ingest** (`/ingest`, `components/ingest/`) — append a synthetic batch of feature rows
  (zero-setup demo) and/or ingest an uploaded raw file; **evolve schema** action (add a column).
  Each action commits a new Iceberg snapshot to B2.
- **Tables / Snapshots — the sample-specific asset explorer scoped to the warehouse**
  (`/tables`, `components/tables/`) — time-travel view of the feature table: snapshot history
  (id, committed_at, operation, rows/files added, total rows/files, schema id), schema-version
  history, **rollback to a prior snapshot**, and a "Warehouse files" sub-view that lists the
  `warehouse/` prefix on B2 (data files, manifests, metadata JSON). This satisfies the skill's
  "asset explorer scoped to the sample's own folder."
- **Query** (`/query`, `components/query/`) — pick current / a snapshot / "as of timestamp",
  optional row filter; PyIceberg plans the scan (prunes files), reads only needed Parquet from B2,
  hands the Arrow result to DuckDB for SQL; shows results + scan stats (files scanned / rows read)
  + **Export training slice** -> writes a new Parquet to `exports/` on B2 (the Derive step).
- **Dashboard (adapted)** — Iceberg metrics: tables, snapshots, current total rows, current data
  files, **warehouse size on B2**, **write-amplification ratio** (all-time warehouse bytes /
  current-snapshot logical bytes), current schema version; a "rows over snapshots" growth chart;
  a recent-activity table (recent snapshots + ingest/query/export ops).
- Backend repo modules: `repo/iceberg_catalog.py` (all `pyiceberg`/`pyarrow`),
  `repo/query_engine.py` (all `duckdb`), `repo/ops_log.py` (stdlib JSON activity log, mirrors
  lance `search_log.py`).

## 3. B2 surface (S3-compatible only — no b2-native API)

- **boto3 client** (`repo/b2_client.py`, carries the custom UA): `head_bucket`, `put_object`
  (raw uploads + **export Parquet writes**, so Derive writes are UA-tagged), `list_objects_v2`
  (bucket/warehouse/exports/raw browse + stats), `head_object`, `generate_presigned_url`
  (download), `delete_object`.
- **PyIceberg `PyArrowFileIO`** (S3) under `warehouse/`: GET/PUT/LIST/HEAD of Parquet data files,
  Avro manifests, and `metadata.json` — for append, schema evolution, snapshot listing,
  time-travel scans, rollback. All via B2's S3 API (`s3.endpoint`/`s3.region`/`s3.access-key-id`/
  `s3.secret-access-key`). **No b2-native API.**
- **DuckDB** runs purely in-memory over the PyArrow table PyIceberg returns — **no DuckDB S3
  access**, so all B2 I/O stays in two places (boto3 + PyIceberg). Keeps the S3 surface minimal.

### Standard compliance
- **#1 S3 default** — boto3 `s3v4` + PyIceberg S3 FileIO. No b2-native anywhere.
- **#2 Custom user agent** — `user_agent_extra="b2ai-iceberg-feature-store"` on the boto3 client.
  **Justified deviation (precedent: lance):** PyIceberg's `PyArrowFileIO` uses pyarrow's
  `S3FileSystem`, which exposes no user-agent override through PyIceberg's public API. The boto3
  client (all browse/upload/export/presign/delete + Derive writes) is fully UA-tagged; PyIceberg's
  internal client is not. Document in `ARCHITECTURE.md` exactly as lance documents the LanceDB case.
- **#3 Env vars** — rename starter's `B2_KEY_ID`->`B2_APPLICATION_KEY_ID` and **add `B2_REGION`**.
  Final set: `B2_ENDPOINT`, `B2_REGION`, `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`,
  `B2_BUCKET_NAME` (+ optional `B2_PUBLIC_URL`). Update `.env.example`, `settings.py`,
  `main.py` required-settings tuple, `scripts/doctor.mjs`, README. (Starter kit is stale here —
  known issue; lance/supervision samples already use the Standard #3 names.)

## 4. Catalog & storage model (the integration core)

- **Catalog:** PyIceberg `SqlCatalog` backed by a **local SQLite pointer DB** at
  `services/api/data/catalog.db` (gitignored). The catalog only stores the pointer to each
  table's latest `metadata.json`; **all table data, manifests, and metadata live on B2** under
  `warehouse/`. This is the canonical "PyIceberg without a catalog server" pattern — no second
  service, B2 creds only. Document honestly: the tiny pointer is local; the warehouse is on B2.
  No B2 conditional-PUT problem (commit atomicity is in SQLite, not S3) — unlike lance, **no
  `AWS_S3_ALLOW_UNSAFE_RENAME` hack needed**.
- **Warehouse URI:** `s3://{B2_BUCKET_NAME}/{warehouse_prefix}` (default `warehouse/`).
- **Table:** identifier `features.feature_events` (namespace `features`).
  - Schema v1: `entity_id` string, `event_ts` timestamp, `feature_a` double, `feature_b` double,
    `label` int, `ingested_at` timestamp.
  - Schema evolution demo (v2): add nullable `feature_c` double — proves Iceberg schema evolution;
    time-travel back to a v1 snapshot still reads cleanly.
- **Prefixes:** `warehouse/` (Iceberg), `raw/` (uploaded batches), `exports/` (derived slices).
- **Write amplification** is real and demonstrated: appends add new data files without rewriting
  old ones; rollback leaves superseded files on B2 until expiration. Dashboard surfaces
  all-time warehouse bytes vs current-snapshot logical bytes.

### Integration risks the builder MUST verify (run a real append)
1. **PyArrow S3 addressing vs B2.** With `endpoint_override` set, pyarrow's `S3FileSystem`
   generally uses path-style addressing, which B2 accepts on the regional endpoint. Verify an
   append+read round-trips. Fallback if addressing/region errors: switch the table's FileIO to
   `pyiceberg.io.fsspec.FsspecFileIO` (s3fs) configured with the same `s3.*` props — and if doing
   so, pass `user_agent_extra` through s3fs `config_kwargs` to *also* satisfy Standard #2 for
   PyIceberg (preferred if it's not fragile).
2. **Empty-table persistence on S3.** Like lance, an empty `create_table` may not round-trip on
   object stores. Create the table at first real append (create-with-data), or seed-then-delete.
3. **Timestamp/UTC** columns: use timezone-aware microsecond timestamps consistent between the
   pyarrow schema and the Iceberg schema to avoid cast errors.

## 5. Backend module layout (layered; all SDKs confined to `repo/`, files <300 lines)

```
types/    files.py(keep) formatting.py(keep) upload.py(keep) stats.py(adapt: DashboardStats)
          + table.py (TableInfo, ColumnInfo, SchemaVersion)
          + snapshot.py (SnapshotInfo)
          + ingest.py (IngestRequest/Response, EvolveResponse)
          + query.py (QueryRequest, QueryResult, ExportRequest/Response, ScanStats)
config/   settings.py(adapt: Standard#3 names + warehouse/raw/exports prefixes, catalog name/db,
          namespace/table, default_batch_rows, ops_log_file; warehouse_uri property)
repo/     b2_client.py(keep; UA=b2ai-iceberg-feature-store; Standard#3 names)
          + iceberg_catalog.py (ALL pyiceberg/pyarrow: get_catalog, ensure_table, append_rows,
            evolve_schema, list_snapshots, schema_versions, scan(snapshot_id/as_of,row_filter,
            columns)->arrow+scanstats, rollback_to, table_stats, connectivity)
          + query_engine.py (ALL duckdb: run_sql(arrow, sql)->rows; canned aggregations)
          + ops_log.py (stdlib JSON activity log for dashboard)
service/  upload.py(keep->raw/) files.py(keep) metadata.py(keep)
          + ingest.py (synthetic batch / parse uploaded file -> arrow -> append; evolve; log op)
          + tables.py (table info, snapshots, schema versions, rollback orchestration)
          + query.py (plan scan via repo + run SQL via query_engine + build result; export slice
            -> parquet bytes -> b2_client.put_object to exports/; log op)
          + dashboard.py (assemble DashboardStats from table_stats + warehouse object stats + ops)
runtime/  health.py(adapt: + catalog connectivity) metrics.py(keep) upload.py(keep) files.py(keep,
          ensure prefix param) + ingest.py (POST /ingest/batch, POST /ingest/evolve-schema)
          + tables.py (GET /tables, GET /tables/snapshots, GET /tables/schema, POST /tables/rollback)
          + query.py (POST /query, POST /query/export)
          + dashboard.py (GET /dashboard/stats, GET /dashboard/activity)
```
`requirements.txt` adds: `pyiceberg[pyarrow,sql-sqlite]>=0.8`, `duckdb>=1.1`, `pyarrow>=18`,
`pandas>=2.2` (keep boto3; keep Pillow/PyPDF2/python-magic — metadata extraction is NOT trimmed).

## 6. Frontend layout

- Routes: `/`(dashboard adapt), `/ingest`(new), `/tables`(new), `/query`(new), `/upload`(keep),
  `/files`(keep), `/settings`(keep), `/design`(keep).
- `components/`: add `ingest/`, `tables/`, `query/`; adapt `dashboard/`; keep the rest.
- `lib/api-client.ts` + `lib/queries.ts`: add endpoints + TanStack Query hooks for ingest, tables,
  snapshots, schema, rollback, query, export, dashboard stats/activity. No bare `useEffect+fetch`.
- `packages/shared/src/types.ts`: add TS types mirroring the new Pydantic models.
- `layout/app-sidebar.tsx`: nav = Dashboard, Ingest, Tables, Query, Upload, Files, Settings
  (+ Design utility link). Header title "Iceberg Feature Store". Footer UTM ->
  `b2ai-iceberg-feature-store`. Pick lucide icons (e.g. Database/Layers, PlusCircle, History,
  Search/Terminal).

## 7. Doc transforms

- **Rewrite/adapt:** `README.md` (purpose, quick start, B2 setup with Standard#3 vars, feature
  list, tech stack: + PyIceberg/DuckDB), `AGENTS.md` (intro + section 1 key modules + section 2
  surface + section 3 SDK-containment for pyiceberg/pyarrow/duckdb), `ARCHITECTURE.md` (components,
  data stores = Iceberg-on-B2 + local catalog pointer, data flows for ingest/query/export/rollback,
  the Standard#2 UA deviation), `docs/features/dashboard.md`, `docs/features/file-upload.md`
  (-> stage raw batch), `docs/app-workflows.md`, `docs/dev-workflows.md`, `docs/SECURITY.md`
  (single-writer note), `docs/RELIABILITY.md` (single-writer catalog, no unsafe-rename needed,
  rollback semantics, orphan files until expiration).
- **Keep:** `docs/features/file-browser.md`, `docs/features/metadata-extraction.md`,
  `docs/features/_template.md`, `docs/exec-plans/tech-debt-tracker.md`, `docs/design-system.md`.
- **New feature docs:** `docs/features/ingestion.md`, `docs/features/snapshots-time-travel.md`,
  `docs/features/query-export.md`, `docs/features/iceberg-warehouse.md`.

## 8. Rename table (vibe-coding-starter-kit -> iceberg-feature-store)

| Form | From | To |
|------|------|----|
| kebab / repo / dir | `vibe-coding-starter-kit` | `iceberg-feature-store` |
| Title Case | `Vibe Coding Starter Kit` | `Iceberg Feature Store` |
| pnpm package scope | `@vibe-coding-starter-kit/web` | `@iceberg-feature-store/web` |
| root package.json name | `vibe-coding-starter-kit` | `iceberg-feature-store` |
| api pyproject name (snake) | starter name | `iceberg_feature_store` |
| FastAPI title | `OSS Starter Kit API` | `Iceberg Feature Store API` |
| user_agent_extra | `b2ai-oss-start` | `b2ai-iceberg-feature-store` |
| UTM content tag | `utm_content=b2ai-oss-start` | `utm_content=b2ai-iceberg-feature-store` |
| Railway / infra slugs, image tags | `vibe-coding-starter-kit` | `iceberg-feature-store` |
| Playwright filter / scripts refs | `@vibe-coding-starter-kit/web` | `@iceberg-feature-store/web` |

Grep the whole tree for both `vibe-coding-starter-kit` and `vibe_coding_starter_kit` and the
`oss-start` UA/UTM tag; leave none behind (except inside `pnpm-lock.yaml`, which is regenerated).

## 9. External API provider

**None.** The use case mandates "local OSS — no second API key, B2 credentials only," so
`api-provider-selection.md` does not apply. Estimated external-API cost for a full demo run: **$0**
(B2 storage only). The only env vars are the five `B2_*` (+ optional `B2_PUBLIC_URL`).

## 10. Definition of done (builder self-check before returning)
- `pnpm lint:api` (ruff), `pnpm test:api`, `pnpm check:structure` pass; files <300 lines;
  no `boto3`/`pyiceberg`/`pyarrow`/`duckdb` imports outside `repo/`; no `print()`.
- `.env.example` + `settings.py` + `main.py` + `doctor.mjs` use Standard #3 names incl. `B2_REGION`.
- No leftover `vibe-coding-starter-kit` / `vibe_coding_starter_kit` / `b2ai-oss-start` strings
  (outside `pnpm-lock.yaml`). `/files` bucket explorer present; `/tables` scoped explorer present.
- A real append->read round-trip verified (integration risk #1 resolved or fallback applied),
  or, if B2 creds are unavailable in the build env, the catalog/append path is structured so it
  fails fast with a clear message and the verification gap is reported as an open question.
