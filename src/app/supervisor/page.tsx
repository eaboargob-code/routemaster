
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { format } from "date-fns";

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
import { Frown, Eye, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Trip {
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

interface User {
  id: string;
  displayName: string;
}

interface Bus {
  id:string;
  busCode: string;
}

interface Route {
  id: string;
  name: string;
}

interface ReferencedData {
  users: Map<string, User>;
  buses: Map<string, Bus>;
  routes: Map<string, Route>;
}

async function fetchReferencedDocs<T>(collectionName: string, ids: string[]): Promise<Map<string, T>> {
    const dataMap = new Map<string, T>();
    if (ids.length === 0) return dataMap;

    const CHUNK_SIZE = 30;
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const idChunk = ids.slice(i, i + CHUNK_SIZE);
        const q = query(collection(db, collectionName), where("__name__", "in", idChunk));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            dataMap.set(doc.id, { id: doc.id, ...doc.data() } as T);
        });
    }
    return dataMap;
}

async function loadTripsForSupervisor(userUid: string, schoolId: string): Promise<Trip[]> {
  const tripsRef = collection(db, "trips");
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(today);

  // Query for trips directly assigned to the supervisor
  const qMine = query(
    tripsRef,
    where("schoolId", "==", schoolId),
    where("supervisorId", "==", userUid),
    where("startedAt", ">=", todayTs),
    orderBy("startedAt", "desc"),
    limit(100)
  );

  // Query for trips where the driver is acting as supervisor
  const qDriverAsSup = query(
    tripsRef,
    where("schoolId", "==", schoolId),
    where("allowDriverAsSupervisor", "==", true),
    where("startedAt", ">=", todayTs),
    orderBy("startedAt", "desc"),
    limit(100)
  );

  const [mineSnapshot, driverAsSupSnapshot] = await Promise.all([
    getDocs(qMine),
    getDocs(qDriverAsSup),
  ]);

  // Merge and de-duplicate results
  const seen = new Set<string>();
  const allDocs = [...mineSnapshot.docs, ...driverAsSupSnapshot.docs].filter(d => 
    !seen.has(d.id) && seen.add(d.id)
  );

  // Map to Trip objects and sort client-side
  return allDocs
    .map(d => ({ id: d.id, ...d.data() } as Trip))
    .sort((a, b) => b.startedAt.toMillis() - a.startedAt.toMillis());
}


export default function SupervisorPage() {
  const { user, profile, loading: profileLoading, error: profileError } = useProfile();
  const schoolId = profile?.schoolId;
  const { toast } = useToast();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [referencedData, setReferencedData] = useState<ReferencedData>({
    users: new Map(),
    buses: new Map(),
    routes: new Map(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTripsAndReferences = useCallback(async (currentSchoolId: string, currentUserUid: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const fetchedTrips = await loadTripsForSupervisor(currentUserUid, currentSchoolId);
      setTrips(fetchedTrips);

      if (fetchedTrips.length > 0) {
        const driverIds = [...new Set(fetchedTrips.map(t => t.driverId))];
        const supervisorIds = [...new Set(fetchedTrips.map(t => t.supervisorId).filter(Boolean) as string[])];
        const userIds = [...new Set([...driverIds, ...supervisorIds])];
        const busIds = [...new Set(fetchedTrips.map(t => t.busId))];
        const routeIds = [...new Set(fetchedTrips.map(t => t.routeId).filter(Boolean) as string[])];

        const [users, buses, routes] = await Promise.all([
          fetchReferencedDocs<User>("users", userIds),
          fetchReferencedDocs<Bus>("buses", busIds),
          fetchReferencedDocs<Route>("routes", routeIds),
        ]);
        
        setReferencedData({ users, buses, routes });
      } else {
        setReferencedData({ users: new Map(), buses: new Map(), routes: new Map() });
      }

    } catch (err: any) {
      console.error("Failed to fetch trips:", err);
       if (err.code === "failed-precondition") {
        setError("A required database index is still building. Please try again in a minute.");
        toast({
          title: "Database Index Building",
          description: "A required index for this query is still being created. Please wait a moment and try again.",
          variant: "destructive"
        });
      } else {
         setError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (schoolId && user) {
      fetchTripsAndReferences(schoolId, user.uid);
    } else if (!profileLoading) {
      setIsLoading(false);
    }
  }, [schoolId, user, profileLoading, fetchTripsAndReferences]);

  if (profileLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (profileError) {
    return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{profileError.message}</AlertDescription></Alert>;
  }

  if (!schoolId) {
    return <Alert><AlertTitle>No School ID</AlertTitle><AlertDescription>Your profile is not associated with a school.</AlertDescription></Alert>;
  }

  const renderCellContent = (content: string | undefined | null) => {
    return content || <span className="text-muted-foreground">N/A</span>;
  };

  const getSupervisorContent = (trip: Trip) => {
    if (trip.allowDriverAsSupervisor) {
      return (
        <Badge variant="outline">
          <UserCheck className="mr-2 h-3.5 w-3.5 text-blue-600" />
          Driver as Supervisor
        </Badge>
      );
    }
    if (trip.supervisorId) {
      const supervisor = referencedData.users.get(trip.supervisorId);
      return renderCellContent(supervisor?.displayName);
    }
    return <span className="text-muted-foreground">No supervisor</span>;
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Trips</CardTitle>
        <CardDescription>
          A real-time log of all bus trips for school {schoolId} that you are supervising.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-destructive py-8">
                    Error loading trips: {error}
                  </TableCell>
                </TableRow>
              ) : trips.length > 0 ? (
                trips.map(trip => {
                  const driver = referencedData.users.get(trip.driverId);
                  const bus = referencedData.buses.get(trip.busId);
                  const route = trip.routeId ? referencedData.routes.get(trip.routeId) : null;
                  return (
                    <TableRow key={trip.id}>
                      <TableCell>{renderCellContent(driver?.displayName)}</TableCell>
                      <TableCell>{renderCellContent(bus?.busCode)}</TableCell>
                      <TableCell>{renderCellContent(route?.name)}</TableCell>
                       <TableCell>{getSupervisorContent(trip)}</TableCell>
                      <TableCell>
                        <Badge variant={trip.status === "active" ? "default" : "secondary"} className={trip.status === "active" ? 'bg-green-100 text-green-800' : ''}>
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
                       <span className="font-medium">No relevant trips found for today</span>
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
