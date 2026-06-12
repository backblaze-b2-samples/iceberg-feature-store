"use client";

import { Database, Layers, Rows3, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useDashboardStats } from "@/lib/queries";

export function StatsCards() {
  const { data: stats, isLoading, error, refetch } = useDashboardStats();

  // Surface fetch failures inline rather than rendering zeros — that would lie
  // about the table state when really the API is just unreachable.
  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const cards = [
    {
      title: "Current Rows",
      value: stats?.current_total_rows ?? 0,
      sub: stats ? `${stats.current_data_files} data files` : "",
      icon: Rows3,
    },
    {
      title: "Snapshots",
      value: stats?.snapshot_count ?? 0,
      sub: stats ? `schema v${stats.current_schema_id}` : "",
      icon: Layers,
    },
    {
      title: "Warehouse on B2",
      value: stats?.warehouse_size_human ?? "0 B",
      sub: "warehouse/ prefix (all-time)",
      icon: Database,
    },
    {
      title: "Write Amplification",
      value: stats ? `${stats.write_amplification.toFixed(2)}x` : "0x",
      sub: stats ? `${stats.current_logical_human} logical now` : "",
      icon: Repeat,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`card-hover animate-fade-in-up stagger-${i + 1}`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className="stat-icon-wrap">
              <card.icon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="stat-value truncate" title={String(card.value)}>
                  {card.value}
                </div>
                {card.sub && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {card.sub}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
