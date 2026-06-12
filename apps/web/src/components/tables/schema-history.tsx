"use client";

import { Columns3 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useSchemaVersions } from "@/lib/queries";

export function SchemaHistory() {
  const { data: versions = [], isLoading, error, refetch } = useSchemaVersions();

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (versions.length === 0) {
    return (
      <EmptyState
        icon={Columns3}
        title="No schema yet"
        description="The schema appears once the table is created on first append."
      />
    );
  }

  return (
    <div className="space-y-4">
      {versions.map((v) => (
        <Card key={v.schema_id}>
          <CardHeader className="flex flex-row items-center gap-2 border-b border-border px-5 py-3">
            <CardTitle className="card-title">Schema v{v.schema_id}</CardTitle>
            {v.is_current && <Badge className="text-[10px]">current</Badge>}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    ID
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Column
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Type
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Required
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.columns.map((c) => (
                  <TableRow key={c.field_id} className="table-row-hover">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.field_id}
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.type}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.required ? "yes" : "no"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
