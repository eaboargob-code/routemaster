
// src/app/supervisor/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { registerFcmToken } from "@/lib/notifications";
import {
  getSupervisorTrips,
  getSchoolUsersByIds,
  startOfToday,
} from "@/lib/firestoreQueries";
import { scol } from "@/lib/schoolPath";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Frown, Eye, UserCheck, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Trip = {
  id: string;
  driverId: string;
  busId: string;
  routeId?: string | null;
  supervisorId?: string | null;
  allowDriverAsSupervisor?: boolean;
  status: "active" | "ended";
  startedAt: any; // Timestamp
  endedAt?: any; // Timestamp
  schoolId: string;
  lastLocation?: { lat: number; lng: number; at: any }; // Timestamp
};

type UserDoc = {
  displayName?: string;
  email?: string;
};

type UiState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "empty" }
  | { status: "error"; errorMessage: string };

export default function SupervisorPage() {
  const { user, profile, loading: profileLoading, error: profileError } = useProfile();
  const { toast } = useToast();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [busMap, setBusMap] = useState<Map<string, any>>(new Map());
  const [routeMap, setRouteMap] = useState<Map<string, any>>(new Map());
  const [userMap, setUserMap] = useState<Record<string, UserDoc>>({});
  const [ui, setUi] = useState<UiState>({ status: "loading" });

  // Register FCM for the supervisor account
  useEffect(() => {
    if (user?.uid) {
      registerFcmToken(user.uid).catch(() => {});
    }
  }, [user?.uid]);

  const load = useCallback(async () => {
    if (!user || !profile) return;
    setUi({ status: "loading" });

    try {
      // 1) Preload buses and routes for this school
      const [busesSnap, routesSnap] = await Promise.all([
        getDocs(scol(profile.schoolId, "buses")),
        getDocs(scol(profile.schoolId, "routes")),
      ]);
      const bMap = new Map(busesSnap.docs.map((d) => [d.id, d.data()]));
      const rMap = new Map(routesSnap.docs.map((d) => [d.id, d.data()]));
      setBusMap(bMap);
      setRouteMap(rMap);

      // 2) Get today’s trips for this supervisor (including driver-as-supervisor trips)
      const todaysTrips = await getSupervisorTrips(profile.schoolId, user.uid);
      setTrips(todaysTrips as Trip[]);

      // 3) Fetch driver user docs (school-scoped)
      if (todaysTrips.length > 0) {
        const driverIds = Array.from(new Set(todaysTrips.map((t: any) => t.driverId).filter(Boolean)));
        if (driverIds.length > 0) {
          const users = await getSchoolUsersByIds(profile.schoolId, driverIds);
          setUserMap(users as Record<string, UserDoc>);
        } else {
          setUserMap({});
        }
      } else {
        setUserMap({});
      }

      setUi(todaysTrips.length ? { status: "ready" } : { status: "empty" });
    } catch (err: any) {
      console.error("[supervisor] load failed", err);
      setUi({ status: "error", errorMessage: "Could not load trip data. This may be due to a permissions issue." });
      toast({
        variant: "destructive",
        title: "Data Loading Error",
        description: err?.message || "Failed to fetch trip information.",
      });
    }
  }, [user, profile, toast]);

  useEffect(() => {
    if (!profileLoading && user && profile) {
      load();
    }
  }, [profileLoading, user, profile, load]);

  /* ------------------ Render guards ------------------ */

  if (profileLoading || ui.status === "loading") {
    return <Skeleton className="h-96 w-full" />;
  }

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
        <AlertDescription>
          Your profile is not associated with a school or you are not logged in.
        </AlertDescription>
      </Alert>
    );
  }

  /* ------------------ Helpers ------------------ */

  const renderSupervisorCol = (trip: Trip) => {
    if (trip.allowDriverAsSupervisor) {
      return (
        <Badge variant="outline" className="flex items-center gap-2">
          <UserCheck className="h-3.5 w-3.5 text-blue-600" />
          Driver as Supervisor
        </Badge>
      );
    }
    if (trip.supervisorId === user.uid) {
      return profile.displayName || profile.email || "—";
    }
    return <span className="text-muted-foreground">No supervisor</span>;
  };

  const driverLabel = (trip: Trip) => {
    const u = userMap[trip.driverId];
    return u?.displayName || u?.email || trip.driverId || "—";
    // If you want strictly name-or-dash, use: return u?.displayName ?? "—";
  };

  /* ------------------ UI ------------------ */

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Trips</CardTitle>
        <CardDescription>
          A real-time log of trips you supervise for school <span className="font-mono">{profile.schoolId}</span>.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {ui.status === "error" && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{ui.errorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border overflow-x-auto">
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
              {ui.status !== "ready" || trips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Frown className="h-8 w-8" />
                      <span className="font-medium">
                        {ui.status === "empty" ? "No trips to supervise" : "No trips found"}
                      </span>
                      <span>No trips have been assigned to you for today.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                trips.map((trip) => {
                  const bus = busMap.get(trip.busId);
                  const route = trip.routeId ? routeMap.get(trip.routeId) : null;

                  return (
                    <TableRow key={trip.id}>
                      <TableCell>{driverLabel(trip)}</TableCell>
                      <TableCell>{bus?.busCode ?? "—"}</TableCell>
                      <TableCell>{route?.name ?? "—"}</TableCell>
                      <TableCell>{renderSupervisorCol(trip)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={trip.status === "active" ? "default" : "secondary"}
                          className={
                            trip.status === "active"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : undefined
                          }
                        >
                          {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(trip.startedAt.toDate(), "HH:mm")}</TableCell>
                      <TableCell>
                        {trip.endedAt ? format(trip.endedAt.toDate(), "HH:mm") : <span className="text-muted-foreground">In Progress</span>}
                      </TableCell>
                      <TableCell>
                        {trip.lastLocation?.at ? format(trip.lastLocation.at.toDate(), "HH:mm:ss") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/supervisor/trips/${trip.id}`}> 
                            <Eye className="mr-2 h-4 w-4" />
                            View Roster
                          </Link>
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
