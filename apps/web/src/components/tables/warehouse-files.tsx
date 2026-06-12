"use client";

import { FileBox } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useWarehouseFiles } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

// Classify a warehouse object by its Iceberg role from the key/extension.
function fileKind(key: string): string {
  if (key.endsWith(".parquet")) return "data";
  if (key.endsWith(".metadata.json")) return "metadata";
  if (key.includes("snap-") && key.endsWith(".avro")) return "snapshot";
  if (key.endsWith(".avro")) return "manifest";
  return "other";
}

export function WarehouseFiles() {
  const { data: files = [], isLoading, error, refetch } = useWarehouseFiles(1000);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (files.length === 0) {
    return (
      <EmptyState
        icon={FileBox}
        title="Warehouse is empty"
        description="Ingest a batch to write Parquet data, Avro manifests, and JSON metadata under warehouse/."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Kind
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Key
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Size
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Modified
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((f) => (
              <TableRow key={f.key} className="table-row-hover">
                <TableCell>
                  <Badge variant="outline" className="text-[11px]">
                    {fileKind(f.key)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[420px]">
                  <div className="truncate font-mono text-xs" title={f.key}>
                    {f.key}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {f.size_human}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(f.uploaded_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
