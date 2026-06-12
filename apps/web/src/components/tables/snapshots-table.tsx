"use client";

import { toast } from "sonner";
import { History, Loader2, Undo2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api-client";
import { useRollback, useSnapshots } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export function SnapshotsTable() {
  const { data: snapshots = [], isLoading, error, refetch } = useSnapshots();
  const rollback = useRollback();

  const onRollback = async (snapshotId: number) => {
    try {
      const res = await rollback.mutateAsync(snapshotId);
      toast.success(`Rolled back to snapshot ${snapshotId} · ${res.total_rows} rows`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Rollback failed");
    }
  };

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (snapshots.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No snapshots yet"
        description="Append a batch on the Ingest page to create the first snapshot."
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
                Snapshot
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Op
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                +Rows
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total rows
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Files
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Committed
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.map((s) => (
              <TableRow key={s.snapshot_id} className="table-row-hover">
                <TableCell className="font-mono text-xs">
                  {String(s.snapshot_id).slice(-8)}
                  {s.is_current && (
                    <Badge className="ml-2 text-[10px]">current</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[11px]">
                    {s.operation}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  +{s.added_records}
                </TableCell>
                <TableCell className="tabular-nums">{s.total_records}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {s.total_data_files}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(s.committed_at)}
                </TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        disabled={s.is_current || rollback.isPending}
                      >
                        {rollback.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Undo2 className="h-3.5 w-3.5" />
                        )}
                        Roll back
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Roll back the table?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This moves the table pointer to snapshot{" "}
                          <span className="font-mono">{s.snapshot_id}</span>.
                          Newer snapshots stay in history; their data files
                          remain on B2 until expiration.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onRollback(s.snapshot_id)}>
                          Roll back
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
