"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Play } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, exportSlice, runQuery } from "@/lib/api-client";
import { useSnapshots } from "@/lib/queries";
import { QueryResults } from "@/components/query/query-results";
import type { QueryResult } from "@iceberg-feature-store/shared";

const CURRENT = "current";

export function QueryPanel() {
  const { data: snapshots = [] } = useSnapshots();
  const [mode, setMode] = useState<string>(CURRENT);
  const [rowFilter, setRowFilter] = useState("");
  const [sql, setSql] = useState("SELECT * FROM t");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);

  const snapshotId = mode === CURRENT ? null : Number.parseInt(mode, 10);
  const scope = {
    snapshot_id: snapshotId,
    row_filter: rowFilter.trim() || null,
  };

  const onRun = async () => {
    setRunning(true);
    try {
      const res = await runQuery({ ...scope, sql: sql.trim() || null, limit: 100 });
      setResult(res);
      toast.success(`Scanned ${res.scan_stats.files_scanned} file(s), ${res.row_count} rows`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Query failed");
    } finally {
      setRunning(false);
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const res = await exportSlice(scope);
      toast.success(`Exported ${res.rows_exported} rows -> ${res.key} (${res.size_human})`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle className="card-title">Time-travel query</CardTitle>
          <CardDescription className="text-xs">
            Resolve against the current state or any prior snapshot, optionally
            filter rows (Iceberg expression), then run SQL with DuckDB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Snapshot</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CURRENT}>Current</SelectItem>
                  {snapshots.map((s) => (
                    <SelectItem key={s.snapshot_id} value={String(s.snapshot_id)}>
                      {String(s.snapshot_id).slice(-8)} · {s.total_records} rows
                      {s.is_current ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="row-filter">Row filter (optional)</Label>
              <Input
                id="row-filter"
                placeholder="e.g. label = 1"
                value={rowFilter}
                onChange={(e) => setRowFilter(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sql">
              SQL (the scanned Arrow table is aliased <code>t</code>)
            </Label>
            <Textarea
              id="sql"
              rows={3}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={onRun} disabled={running} className="h-9">
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run query
            </Button>
            <Button
              variant="secondary"
              onClick={onExport}
              disabled={exporting}
              className="h-9"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export slice to B2
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && <QueryResults result={result} />}
    </div>
  );
}
