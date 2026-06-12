import { IngestPanel } from "@/components/ingest/ingest-panel";

export default function IngestPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Ingest</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Append a batch of feature rows to the Iceberg table — every commit
          writes new Parquet data files, Avro manifests, and JSON metadata to the
          B2 warehouse as a new snapshot. Or evolve the schema to prove Iceberg
          schema evolution.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <IngestPanel />
      </div>
    </div>
  );
}
