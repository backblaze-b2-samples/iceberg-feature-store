"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Columns3, Loader2, PlusCircle } from "lucide-react";

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
import { ApiError } from "@/lib/api-client";
import { useEvolveSchema, useIngestBatch } from "@/lib/queries";

export function IngestPanel() {
  const [rows, setRows] = useState("500");
  const ingest = useIngestBatch();
  const evolve = useEvolveSchema();

  const onIngest = async () => {
    const n = Number.parseInt(rows, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Enter a positive row count");
      return;
    }
    try {
      const res = await ingest.mutateAsync(n);
      toast.success(
        `Appended ${res.rows_appended} rows · snapshot ${res.snapshot_id} · ${res.total_rows} rows total`,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Ingest failed");
    }
  };

  const onEvolve = async () => {
    try {
      const res = await evolve.mutateAsync();
      toast.success(
        res.already_present
          ? `Column ${res.column_added} already present (schema v${res.current_schema_id})`
          : `Added column ${res.column_added} · schema v${res.new_schema_id}`,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Schema evolution failed");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle className="card-title">Append a synthetic batch</CardTitle>
          <CardDescription className="text-xs">
            Zero-setup demo — generates feature rows and commits a new Iceberg
            snapshot to B2.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="rows">Rows</Label>
            <Input
              id="rows"
              type="number"
              min={1}
              value={rows}
              onChange={(e) => setRows(e.target.value)}
              className="max-w-[200px]"
            />
          </div>
          <Button onClick={onIngest} disabled={ingest.isPending} className="h-9">
            {ingest.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            Append batch
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle className="card-title">Evolve the schema</CardTitle>
          <CardDescription className="text-xs">
            Add a nullable <code>feature_c</code> column. Iceberg tracks columns
            by ID, so time-travel back to an older snapshot still reads cleanly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            New rows ingested after this will carry <code>feature_c</code>;
            existing snapshots are untouched.
          </p>
          <Button
            variant="secondary"
            onClick={onEvolve}
            disabled={evolve.isPending}
            className="h-9"
          >
            {evolve.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Columns3 className="h-4 w-4" />
            )}
            Add feature_c column
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
