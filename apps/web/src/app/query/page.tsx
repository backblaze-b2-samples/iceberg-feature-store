import { QueryPanel } from "@/components/query/query-panel";

export default function QueryPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Query</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Time-travel query the feature table: pick the current state, a
          snapshot, or an as-of timestamp. PyIceberg prunes files and reads only
          the needed Parquet from B2; DuckDB runs your SQL in-memory. Export the
          result as a new Parquet slice on B2.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <QueryPanel />
      </div>
    </div>
  );
}
