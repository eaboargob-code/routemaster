
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  collection, query, where, getDocs, getDoc, doc,
  Timestamp, type DocumentData
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { format } from "date-fns";
import { registerFcmToken } from '@/lib/notifications';
import { getUsersByIds } from "@/lib/firestoreQueries";

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

interface Trip extends DocumentData {
  id: string;
  driverId: string;
  busId: string;
  routeId: string | null;
  supervisorId?: string | null;
  allowDriverAsSupervisor?: boolean;
  status: "active" | "ended";
  startedAt: Timestamp;
  endedAt?: Timestamp;
  schoolId: string;
  lastLocation?: {
    lat: number;
    lng: number;
    at: Timestamp;
  };
}

interface UserInfo {
  displayName: string;
  email: string;
}

type UiState = {
    status: 'loading' | 'ready' | 'error' | 'empty';
    errorMessage?: string;
}

export default function SupervisorPage() {
  const { user, profile, loading: profileLoading, error: profileError } = useProfile();
  const { toast } = useToast();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [referenceData, setReferenceData] = useState<Record<string, any>>({
    userMap: {},
    busMap: new Map(),
    routeMap: new Map(),
  });
  const [uiState, setUiState] = useState<UiState>({ status: 'loading' });

  useEffect(() => {
    if (user?.uid) {
        registerFcmToken(user.uid);
    }
  }, [user?.uid]);

  const fetchTripsAndReferences = useCallback(async () => {
    if (!user || !profile) return;
    setUiState({ status: 'loading' });
  
    try {
      // Step 1: Pre-fetch all buses and routes for the school and cache them.
      const [busesSnap, routesSnap] = await Promise.all([
        getDocs(query(collection(db, "buses"), where("schoolId", "==", profile.schoolId))),
        getDocs(query(collection(db, "routes"), where("schoolId", "==", profile.schoolId))),
      ]);
      const busMap = new Map(busesSnap.docs.map(d => [d.id, d.data()]));
      const routeMap = new Map(routesSnap.docs.map(d => [d.id, d.data()]));

      // Step 2: Fetch trips assigned to this supervisor.
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const tripsQ = query(
        collection(db, 'trips'),
        where('schoolId', '==', profile.schoolId),
        where('supervisorId', '==', user.uid),
        where('startedAt', '>=', Timestamp.fromDate(startOfDay)),
        orderBy('startedAt', 'desc')
      );
      const tripsSnap = await getDocs(tripsQ);
      const fetchedTrips = tripsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      
      setTrips(fetchedTrips);
  
      // Step 3: Fetch only the required user data.
      let userMap = {};
      if (fetchedTrips.length > 0) {
        const userIds = Array.from(new Set(fetchedTrips.map(t => t.driverId).filter(Boolean)));
        if (userIds.length > 0) {
            userMap = await getUsersByIds(userIds);
        }
      }
      
      // Step 4: Set all state at once.
      setReferenceData({ userMap, busMap, routeMap });

      if (fetchedTrips.length === 0) {
        setUiState({ status: 'empty' });
      } else {
        setUiState({ status: 'ready' });
      }
  
    } catch (err: any) {
      console.error('[supervisor] trip fetch failed', err);
      setUiState({ status: 'error', errorMessage: 'Could not load trip data. This may be due to a permissions issue.' });
      toast({ variant: "destructive", title: "Data Loading Error", description: "Failed to fetch trip information." });
    }
  }, [user, profile, toast]);

  useEffect(() => {
    if (!profileLoading && user && profile) {
      fetchTripsAndReferences();
    }
  }, [profileLoading, user, profile, fetchTripsAndReferences]);

  if (profileLoading || uiState.status === 'loading') {
    return <Skeleton className="h-96 w-full" />;
  }

  if (profileError) {
    return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{profileError.message}</AlertDescription></Alert>;
  }

  if (!user || !profile) {
    return <Alert><AlertTitle>Not Authorized</AlertTitle><AlertDescription>Your profile is not associated with a school or you are not logged in.</AlertDescription></Alert>;
  }
  
  const getSupervisorContent = (trip: Trip) => {
    if (trip.allowDriverAsSupervisor) {
      return (
        <Badge variant="outline" className="flex items-center gap-2">
          <UserCheck className="h-3.5 w-3.5 text-blue-600" />
          Driver as Supervisor
        </Badge>
      );
    }
    const supervisor = trip.supervisorId ? referenceData.userMap?.[trip.supervisorId] as UserInfo : null;
    if (supervisor) {
      return supervisor.displayName || supervisor.email;
    }
    // If the logged-in user is the supervisor but their info isn't in the map (e.g., they are the only user), show their name.
    if (trip.supervisorId === user.uid) {
        return profile.displayName || profile.email;
    }
    return <span className="text-muted-foreground">No supervisor</span>;
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Trips</CardTitle>
        <CardDescription>
          A real-time log of all bus trips for school {profile.schoolId} that you are supervising.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {uiState.status === 'error' && <Alert variant="destructive" className="mb-4"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{uiState.errorMessage}</AlertDescription></Alert>}
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
              {uiState.status === 'loading' ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : trips.length > 0 ? (
                trips.map(trip => {
                  const driver = referenceData.userMap?.[trip.driverId] as UserInfo;
                  const bus = referenceData.busMap?.get(trip.busId);
                  const route = trip.routeId ? referenceData.routeMap?.get(trip.routeId) : null;
                  return (
                    <TableRow key={trip.id}>
                      <TableCell>{driver?.displayName ?? driver?.email ?? '—'}</TableCell>
                      <TableCell>{bus?.busCode ?? '—'}</TableCell>
                      <TableCell>{route?.name ?? '—'}</TableCell>
                      <TableCell>{getSupervisorContent(trip)}</TableCell>
                      <TableCell>
                        <Badge variant={trip.status === "active" ? "default" : "secondary"} className={trip.status === "active" ? 'bg-green-100 text-green-800 border-green-200' : ''}>
                          {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(trip.startedAt.toDate(), "HH:mm")}</TableCell>
                      <TableCell>{trip.endedAt ? format(trip.endedAt.toDate(), "HH:mm") : <span className="text-muted-foreground">In Progress</span>}</TableCell>
                      <TableCell>{trip.lastLocation?.at ? format(trip.lastLocation.at.toDate(), "HH:mm:ss") : "N/A"}</TableCell>
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
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center gap-2">
                       <Frown className="h-8 w-8" />
                       <span className="font-medium">{uiState.status === 'empty' ? "No trips to supervise" : "No trips found"}</span>
                       <span>No trips have been assigned to you for today.</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
