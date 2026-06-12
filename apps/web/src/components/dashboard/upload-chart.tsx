"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useDashboardStats } from "@/lib/queries";

const chartConfig = {
  total_rows: { label: "Total rows", color: "var(--chart-1)" },
} satisfies ChartConfig;

// Rows over snapshots: the table's logical row count at each commit, in order.
export function RowsOverSnapshotsChart() {
  const { data: stats, error, refetch } = useDashboardStats();

  const data = useMemo(
    () =>
      (stats?.growth ?? []).map((p, i) => ({
        label: `#${i + 1}`,
        total_rows: p.total_rows,
      })),
    [stats],
  );

  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader className="border-b border-border px-5 py-4">
        <CardTitle className="card-title">Rows Over Snapshots</CardTitle>
        <CardDescription className="text-xs">
          Cumulative row count at each Iceberg commit
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !hasData ? (
          <EmptyState
            icon={LineChartIcon}
            title="No snapshots yet"
            description="Ingest a batch to create the first snapshot and start the growth curve."
          />
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="rows-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-total_rows)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--color-total_rows)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={6} fontSize={11} width={36} />
              <ChartTooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="total_rows"
                stroke="var(--color-total_rows)"
                strokeWidth={2}
                fill="url(#rows-fill)"
                animationDuration={500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
