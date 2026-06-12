import Link from "next/link";
import { PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentActivityTable } from "@/components/dashboard/recent-uploads-table";
import { RowsOverSnapshotsChart } from "@/components/dashboard/upload-chart";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your Apache Iceberg feature table on Backblaze B2 — snapshots, row
            growth, and warehouse write amplification at a glance.
          </p>
        </div>
        <Button asChild size="sm" className="h-8">
          <Link href="/ingest">
            <PlusCircle className="h-3.5 w-3.5" />
            Ingest a batch
          </Link>
        </Button>
      </div>
      <StatsCards />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="animate-fade-in-up stagger-3">
          <RowsOverSnapshotsChart />
        </div>
        <div className="animate-fade-in-up stagger-4">
          <RecentActivityTable />
        </div>
      </div>
    </div>
  );
}
