"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Columns3, FileUp, Loader2, PlusCircle } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { useEvolveSchema, useFiles, useIngestBatch, useIngestRawFile } from "@/lib/queries";

const RAW_PREFIX = "raw/";

export function IngestPanel() {
  const [rows, setRows] = useState("500");
  const [rawKey, setRawKey] = useState("");
  const ingest = useIngestBatch();
  const ingestRaw = useIngestRawFile();
  const evolve = useEvolveSchema();

  // Only objects actually staged under raw/ — drop the prefix placeholder.
  const { data: files = [], isLoading: rawLoading } = useFiles(RAW_PREFIX);
  const rawFiles = files.filter((f) => f.key !== RAW_PREFIX && !f.key.endsWith("/"));

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

  const onIngestRaw = async () => {
    if (!rawKey) {
      toast.error("Select a raw/ file to ingest");
      return;
    }
    try {
      const res = await ingestRaw.mutateAsync(rawKey);
      toast.success(
        `Appended ${res.rows_appended} rows from ${rawKey} · snapshot ${res.snapshot_id} · ${res.total_rows} rows total`,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Raw-file ingest failed");
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
    <div className="space-y-6">
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
            <CardTitle className="card-title">Ingest a raw file</CardTitle>
            <CardDescription className="text-xs">
              Parse a CSV/JSON/Parquet you staged under <code>raw/</code> on B2
              into the feature schema and commit it as a new snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="raw-file">Raw file</Label>
              <Select
                value={rawKey}
                onValueChange={setRawKey}
                disabled={rawLoading || rawFiles.length === 0}
              >
                <SelectTrigger id="raw-file">
                  <SelectValue
                    placeholder={
                      rawLoading
                        ? "Loading…"
                        : rawFiles.length > 0
                          ? "Select a raw/ file"
                          : "No files under raw/"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {rawFiles.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.key.slice(RAW_PREFIX.length)} · {f.size_human}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!rawLoading && rawFiles.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing staged yet — drag-drop a file on the{" "}
                <Link href="/upload" className="underline underline-offset-2">
                  Upload
                </Link>{" "}
                page; it lands under <code>raw/</code>.
              </p>
            )}
            <Button
              onClick={onIngestRaw}
              disabled={!rawKey || ingestRaw.isPending}
              className="h-9"
            >
              {ingestRaw.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              Ingest file
            </Button>
          </CardContent>
        </Card>
      </div>

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
