"use client";

import Link from "next/link";
import { ArrowRight, History } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useDashboardActivity } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

const OP_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  ingest: "default",
  evolve: "secondary",
  query: "outline",
  export: "secondary",
  rollback: "outline",
};

export function RecentActivityTable() {
  const { data: activity = [], isLoading, error, refetch } = useDashboardActivity(10);

  return (
    <Card>
      <CardHeader className="border-b border-border px-5 py-4">
        <CardTitle className="card-title">Recent Activity</CardTitle>
        <CardAction className="self-center">
          <Link
            href="/tables"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View snapshots
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : activity.length === 0 ? (
          <EmptyState
            icon={History}
            title="No activity yet"
            description="Ingest a batch, run a query, or export a slice to see it logged here."
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[18%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Op
                </TableHead>
                <TableHead className="w-[52%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Detail
                </TableHead>
                <TableHead className="w-[30%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  When
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.map((a, i) => (
                <TableRow key={`${a.ts}-${i}`} className="table-row-hover">
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={OP_VARIANT[a.op] ?? "outline"} className="text-[11px]">
                      {a.op}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="truncate" title={a.detail}>
                      {a.detail}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(a.ts)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
