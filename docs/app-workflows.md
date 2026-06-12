<!-- last_verified: 2026-06-12 -->
# App Workflows

User journeys inside the application.

## Ingest a Batch (and Evolve the Schema)

- User navigates to `/ingest`
- Enters a row count and clicks **Append batch** — a synthetic feature batch is generated and committed as a new Iceberg snapshot on B2 (the table is created on the first append)
- Toast confirms the snapshot id and running totals
- Optionally clicks **Add feature_c column** — Iceberg schema evolution; new rows ingested afterward carry the column, existing snapshots are untouched
- Raw-file ingest: a CSV/JSON/Parquet staged under `raw/` (via Upload) can be parsed into the table via `POST /ingest/raw`
- See: [Batch Ingestion & Schema Evolution](features/ingestion.md)

## Browse Snapshots and Time-Travel / Roll Back

- User navigates to `/tables`
- Header shows the table identifier, total rows, data files, and schema version
- **Snapshots** tab: every commit with operation, +rows, totals, and a **Roll back** action (confirmation dialog; disabled for the current snapshot)
- **Schema history** tab: each schema version's columns, current flagged
- **Warehouse files** tab: the raw `warehouse/` objects on B2, classified as data / manifest / snapshot / metadata — the write amplification made tangible
- Rollback moves the table pointer to a prior snapshot; newer snapshots stay in history
- See: [Snapshots & Time Travel](features/snapshots-time-travel.md)

## Time-Travel Query and Export

- User navigates to `/query`
- Picks the scope: **Current**, a specific snapshot, or (via the API) an as-of timestamp; optionally adds a row filter (Iceberg expression, e.g. `label = 1`)
- Writes SQL over the scanned Arrow table (aliased `t`) and clicks **Run query**
- Results show with scan stats — files scanned vs. total (file pruning) and rows read
- Clicks **Export slice to B2** to write the (filtered/projected) result as a new Parquet under `exports/`
- See: [Time-Travel Query & Export](features/query-export.md)

## Stage a Raw Batch (Upload)

- User navigates to `/upload`
- Drops or selects a CSV / JSON / Parquet (or other allowed file); client validates size (max 100MB) and type
- Progress bar shows per-file status; the file lands under `raw/` on B2
- From Ingest, the staged file can then be parsed into the feature table
- See: [Raw Batch Staging (Upload)](features/file-upload.md)

## Browse and Manage Files

- User navigates to `/files`
- Full-bucket tree view (all prefixes: `warehouse/`, `raw/`, `exports/`), most recent first, type-specific icons
- Hover a row for preview / download / delete; preview opens a dialog with metadata
- See: [File Browser](features/file-browser.md)

## View Dashboard

- User navigates to `/` (home)
- Stat cards: current rows + data files, snapshots + schema version, all-time warehouse size on B2, write-amplification ratio
- Rows-over-snapshots growth chart and a recent-activity table (ingest / evolve / query / export / rollback)
- Empty state until the first ingest
- See: [Dashboard](features/dashboard.md)
