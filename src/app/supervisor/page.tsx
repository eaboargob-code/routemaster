// src/app/supervisor/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  type DocumentData,
  Timestamp,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { useToast } from "@/hooks/use-toast";
import { registerFcmToken } from "@/lib/notifications";
import { format } from "date-fns";
import { sdoc, scol } from "@/lib/schoolPath";

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Eye, Frown, UserCheck } from "lucide-react";

/* ---------------- utils ---------------- */
const startOfTodayTs = () => {
  const d = new Date(); d.setHours(0,0,0,0);
  return Timestamp.fromDate(d);
};

type Trip = {
  id: string;
  driverId: string;
  busId: string;
  routeId?: string | null;
  supervisorId?: string | null;
  allowDriverAsSupervisor?: boolean;
  status: "active" | "ended";
  startedAt: Timestamp;
  endedAt?: Timestamp;
  lastLocation?: { lat: number; lng: number; at: Timestamp };
  schoolId: string;
};

type UserInfo = { displayName?: string; email?: string };
type BusInfo  = { busCode?: string };
type RouteInfo = { name?: string };

type UiState = { status: "loading" | "ready" | "empty" | "error"; errorMessage?: string };

/* -------------- page -------------- */
export default function SupervisorPage() {
  const { user, profile, loading: profileLoading, error: profileError } = useProfile();
  const { toast } = useToast();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [ui, setUi] = useState<UiState>({ status: "loading" });

  const [userMap, setUserMap]   = useState<Record<string, UserInfo>>({});
  const [busMap, setBusMap]     = useState<Map<string, BusInfo>>(new Map());
  const [routeMap, setRouteMap] = useState<Map<string, RouteInfo>>(new Map());

  useEffect(() => {
    if (user?.uid) registerFcmToken(user.uid).catch(() => {});
  }, [user?.uid]);

  const fetchTripsAndRefs = useCallback(async () => {
    if (!user || !profile) return;
    setUi({ status: "loading" });

    try {
      const schoolId = profile.schoolId;

      // trips where I'm the supervisor
      const qMine = query(
        scol(schoolId, "trips"),
        where("supervisorId", "==", user.uid),
        where("startedAt", ">=", startOfTodayTs()),
        orderBy("startedAt", "desc"),
      );

      // trips where driver acts as supervisor (visible to all supervisors in school)
      const qDriverAsSup = query(
        scol(schoolId, "trips"),
        where("allowDriverAsSupervisor", "==", true),
        where("startedAt", ">=", startOfTodayTs()),
        orderBy("startedAt", "desc"),
      );

      const [mineSnap, dasSnap] = await Promise.all([getDocs(qMine), getDocs(qDriverAsSup)]);

      const seen = new Set<string>();
      const all = [...mineSnap.docs, ...dasSnap.docs]
        .filter(d => !seen.has(d.id) && seen.add(d.id))
        .map(d => ({ id: d.id, ...(d.data() as any) })) as Trip[];

      setTrips(all);

      if (all.length === 0) {
        setUi({ status: "empty" });
        setUserMap({});
        setBusMap(new Map());
        setRouteMap(new Map());
        return;
      }

      // preload reference data (within school)
      const busIds   = Array.from(new Set(all.map(t => t.busId).filter(Boolean)));
      const routeIds = Array.from(new Set(all.map(t => t.routeId).filter(Boolean))) as string[];
      const driverIds= Array.from(new Set(all.map(t => t.driverId).filter(Boolean)));

      // buses
      const busPairs: [string, BusInfo][] = await Promise.all(
        busIds.map(async id => {
          const snap = await getDoc(sdoc(schoolId, "buses", id));
          return [id, (snap.exists() ? (snap.data() as BusInfo) : {})];
        })
      );
      setBusMap(new Map(busPairs));

      // routes
      const routePairs: [string, RouteInfo][] = await Promise.all(
        routeIds.map(async id => {
          const snap = await getDoc(sdoc(schoolId, "routes", id));
          return [id, (snap.exists() ? (snap.data() as RouteInfo) : {})];
        })
      );
      setRouteMap(new Map(routePairs));

      // drivers (from top-level users; we only read by id)
      const userPairs: [string, UserInfo][] = await Promise.all(
        driverIds.map(async id => {
          const snap = await getDoc(doc(db, "users", id));
          return [id, (snap.exists() ? (snap.data() as UserInfo) : {})];
        })
      );
      setUserMap(Object.fromEntries(userPairs));

      setUi({ status: "ready" });
    } catch (err: any) {
      console.error("[supervisor] fetch failed", err);
      setUi({ status: "error", errorMessage: "Could not load trip data. This may be due to a permissions issue." });
      toast({ variant: "destructive", title: "Data Loading Error", description: "Failed to fetch trip information." });
    }
  }, [user, profile, toast]);

  useEffect(() => {
    if (!profileLoading && user && profile) fetchTripsAndRefs();
  }, [profileLoading, user, profile, fetchTripsAndRefs]);

  /* --------- renders --------- */
  if (profileLoading || ui.status === "loading") return <Skeleton className="h-96 w-full" />;

  if (profileError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{profileError.message}</AlertDescription>
      </Alert>
    );
  }

  if (!user || !profile) {
    return (
      <Alert>
        <AlertTitle>Not Authorized</AlertTitle>
        <AlertDescription>You are not logged in or not associated with a school.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Trips</CardTitle>
        <CardDescription>Trips you supervise in {profile.schoolId} (including “driver as supervisor”).</CardDescription>
      </CardHeader>
      <CardContent>
        {ui.status === "error" && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{ui.errorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Bus</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Supervisor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Ended</TableHead>
                <TableHead>Last Update</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ui.status === "empty" ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Frown className="h-8 w-8" />
                      <span className="font-medium">No trips to supervise</span>
                      <span>Nothing for today.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                trips.map((t) => {
                  const driver = userMap[t.driverId];
                  const bus = busMap.get(t.busId);
                  const route = t.routeId ? routeMap.get(t.routeId) : undefined;

                  return (
                    <TableRow key={t.id}>
                      <TableCell>{driver?.displayName ?? driver?.email ?? "—"}</TableCell>
                      <TableCell>{bus?.busCode ?? "—"}</TableCell>
                      <TableCell>{route?.name ?? "—"}</TableCell>
                      <TableCell>
                        {t.allowDriverAsSupervisor ? (
                          <Badge variant="outline" className="flex items-center gap-2">
                            <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                            Driver as Supervisor
                          </Badge>
                        ) : t.supervisorId === user.uid ? (
                          profile.displayName || profile.email
                        ) : (
                          <span className="text-muted-foreground">No supervisor</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.status === "active" ? "default" : "secondary"}
                               className={t.status === "active" ? "bg-green-100 text-green-800 border-green-200" : ""}>
                          {t.status[0].toUpperCase() + t.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(t.startedAt.toDate(), "HH:mm")}</TableCell>
                      <TableCell>{t.endedAt ? format(t.endedAt.toDate(), "HH:mm") : <span className="text-muted-foreground">In Progress</span>}</TableCell>
                      <TableCell>{t.lastLocation?.at ? format(t.lastLocation.at.toDate(), "HH:mm:ss") : "N/A"}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/supervisor/trips/${t.id}`}> <Eye className="mr-2 h-4 w-4" /> View Roster </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
