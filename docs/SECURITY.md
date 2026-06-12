<!-- last_verified: 2026-06-12 -->
# Security

Security principles and implementation for iceberg-feature-store.

## Trust Boundaries

- **Frontend -> API**: CORS-restricted to configured origins, scoped to `GET/POST/DELETE/OPTIONS`
- **API -> B2**: Authenticated via `B2_APPLICATION_KEY_ID` + `B2_APPLICATION_KEY`, signature v4 (boto3 and PyIceberg's PyArrow S3 FileIO both use the same credentials)
- **Client -> B2**: Presigned URLs for download (10-min expiry, `Content-Disposition: attachment`)

## Single-Writer Catalog

- The Iceberg `SqlCatalog` is a local SQLite pointer DB. Commit atomicity lives in SQLite, so **a single API process must be the only writer** to a given table. Concurrent writers across processes/hosts are unsafe — front the table with one writer or a server-backed catalog for multi-writer production use. See [RELIABILITY.md](RELIABILITY.md).

## Upload Validation

- Filename sanitization: path traversal, null bytes, unsafe chars stripped
- MIME/extension consistency check against allowlist
- Chunked streaming with size enforcement (100MB default)
- Content-type allowlist (images, PDFs, text, archives, audio/video)
- Empty file rejection

## File Key Validation

- Empty keys rejected
- Path traversal patterns rejected (`../`, `%2e%2e`, backslashes, null bytes)
- The bucket is the only access boundary — add prefix scoping in
  `services/api/app/service/files.py::validate_key` if your deployment
  shares a bucket with other workloads

## Download Safety

- Presigned URLs force `Content-Disposition: attachment`
- Prevents inline rendering of user-uploaded content (XSS mitigation)

## Secrets Management

- All secrets loaded via environment variables (pydantic-settings)
- Never committed to source control
- `.env.example` documents required variables without values

## Agent Security Rules

- Never commit `.env`, credentials, or API keys
- Never weaken validation without explicit instruction
- Never bypass CORS, auth, or input sanitization
- Always validate at system boundaries
