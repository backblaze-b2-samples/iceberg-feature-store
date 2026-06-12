"use client";

import type { QueryResult } from "@iceberg-feature-store/shared";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return String(value);
  return String(value);
}

export function QueryResults({ result }: { result: QueryResult }) {
  const { columns, rows, scan_stats } = result;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          Snapshot:{" "}
          <span className="font-mono text-foreground">
            {scan_stats.snapshot_id ?? "—"}
          </span>
        </span>
        <span>
          Files scanned:{" "}
          <span className="tabular-nums text-foreground">
            {scan_stats.files_scanned}
          </span>{" "}
          / {scan_stats.total_data_files}
        </span>
        <span>
          Rows read:{" "}
          <span className="tabular-nums text-foreground">
            {scan_stats.rows_read}
          </span>
        </span>
        <span>
          Returned:{" "}
          <span className="tabular-nums text-foreground">{result.row_count}</span>
        </span>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {columns.map((c) => (
                  <TableHead
                    key={c}
                    className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} className="table-row-hover">
                  {columns.map((c) => (
                    <TableCell
                      key={c}
                      className="whitespace-nowrap font-mono text-xs"
                    >
                      {renderCell(row[c])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
