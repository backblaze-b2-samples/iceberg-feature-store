import { TablesView } from "@/components/tables/tables-view";

export default function TablesPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Tables</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The warehouse-scoped explorer for your Iceberg feature table: snapshot
          history with time-travel and rollback, schema-version history, and the
          raw <code>warehouse/</code> files on B2 (Parquet data, Avro manifests,
          JSON metadata).
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <TablesView />
      </div>
    </div>
  );
}
