"use client";

import { Database } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useTableInfo } from "@/lib/queries";
import { SnapshotsTable } from "@/components/tables/snapshots-table";
import { SchemaHistory } from "@/components/tables/schema-history";
import { WarehouseFiles } from "@/components/tables/warehouse-files";

export function TablesView() {
  const { data: table, isLoading, error, refetch } = useTableInfo();

  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!table?.exists) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Database className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No feature table yet</p>
          <p className="max-w-md text-xs text-muted-foreground">
            The table is created lazily on the first append. Head to Ingest and
            append a batch to materialize <code>{table?.identifier}</code> at{" "}
            <code>{table?.warehouse_uri}</code>.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Identifier" value={table.identifier} mono />
        <Stat label="Total rows" value={String(table.total_rows)} />
        <Stat label="Data files" value={String(table.total_data_files)} />
        <Stat label="Schema" value={`v${table.current_schema_id}`} />
      </div>
      <Tabs defaultValue="snapshots">
        <TabsList>
          <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
          <TabsTrigger value="schema">Schema history</TabsTrigger>
          <TabsTrigger value="warehouse">Warehouse files</TabsTrigger>
        </TabsList>
        <TabsContent value="snapshots" className="mt-4">
          <SnapshotsTable />
        </TabsContent>
        <TabsContent value="schema" className="mt-4">
          <SchemaHistory />
        </TabsContent>
        <TabsContent value="warehouse" className="mt-4">
          <WarehouseFiles />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={`mt-0.5 truncate text-sm font-semibold ${mono ? "font-mono" : "tabular-nums"}`}
          title={value}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
