
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { scol } from "@/lib/schoolPath";
import { boardStudent, dropStudent, markAbsent } from "@/lib/roster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type PassengerRow = {
  id: string;
  status: "pending" | "boarded" | "dropped" | "absent";
  boardedAt?: any | null;
  droppedAt?: any | null;
};

type Props = {
  tripId: string;
  schoolId: string;
  canEdit?: boolean; // for driver: true only when allowDriverAsSupervisor === true
};

export function Roster({ tripId, schoolId, canEdit = false }: Props) {
  const { toast } = useToast();

  const [rows, setRows] = useState<PassengerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // studentId that is saving

  // live subscription to passengers under the school-scoped path
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, `schools/${schoolId}/trips/${tripId}/passengers`),
      orderBy("__name__") // stable order by studentId
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as DocumentData;
          return {
            id: d.id,
            status: (data.status ?? "pending") as PassengerRow["status"],
            boardedAt: data.boardedAt ?? null,
            droppedAt: data.droppedAt ?? null,
          } as PassengerRow;
        });
        setRows(list);
        setLoading(false);
      },
      (err) => {
        console.error("[Roster] subscribe error", err);
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "Missing or insufficient permissions.",
        });
        setLoading(false);
      }
    );
    return () => unsub();
  }, [schoolId, tripId, toast]);

  const counts = useMemo(() => {
    const c = { pending: 0, boarded: 0, absent: 0, dropped: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const doBoard = useCallback(
    async (studentId: string) => {
      try {
        setBusy(studentId);
        await boardStudent(schoolId, tripId, studentId);
        toast({
          title: "Boarded",
          description: "Student marked as boarded.",
          className: "bg-green-600 text-white border-0",
        });
      } catch (e: any) {
        console.error(e);
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "Missing or insufficient permissions.",
        });
      } finally {
        setBusy(null);
      }
    },
    [schoolId, tripId, toast]
  );

  const doDrop = useCallback(
    async (studentId: string) => {
      try {
        setBusy(studentId);
        await dropStudent(schoolId, tripId, studentId);
        toast({
          title: "Dropped",
          description: "Student marked as dropped.",
          className: "bg-blue-600 text-white border-0",
        });
      } catch (e: any) {
        console.error(e);
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "Missing or insufficient permissions.",
        });
      } finally {
        setBusy(null);
      }
    },
    [schoolId, tripId, toast]
  );

  const doAbsent = useCallback(
    async (studentId: string) => {
      try {
        setBusy(studentId);
        await markAbsent(schoolId, tripId, studentId);
        toast({ title: "Absent", description: "Student marked as absent." });
      } catch (e: any) {
        console.error(e);
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "Missing or insufficient permissions.",
        });
      } finally {
        setBusy(null);
      }
    },
    [schoolId, tripId, toast]
  );

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">Loading roster…</div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No students found for this trip.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <span className="mr-3">Total: {rows.length}</span>
        <span className="mr-3">Pending: {counts.pending}</span>
        <span className="mr-3">Boarded: {counts.boarded}</span>
        <span className="mr-3">Absent: {counts.absent}</span>
        <span>Dropped: {counts.dropped}</span>
      </div>

      <div className="divide-y rounded-md border">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{r.id}</span>
              <Badge
                variant={
                  r.status === "boarded"
                    ? "default"
                    : r.status === "dropped"
                    ? "secondary"
                    : r.status === "absent"
                    ? "destructive"
                    : "outline"
                }
              >
                {r.status[0].toUpperCase() + r.status.slice(1)}
              </Badge>
            </div>

            {canEdit ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === r.id}
                  onClick={() => doBoard(r.id)}
                >
                  Board
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === r.id}
                  onClick={() => doAbsent(r.id)}
                >
                  Absent
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === r.id}
                  onClick={() => doDrop(r.id)}
                >
                  Drop
                </Button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Read-only (enable “Supervise” to edit)
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
