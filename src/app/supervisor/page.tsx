
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
  type FirestoreError,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Frown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Trip {
  id: string;
  driverId: string;
  busId: string;
  routeId: string | null;
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

export default function SupervisorPage() {
  const { profile, loading: profileLoading, error: profileError } = useProfile();
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

  const fetchTripsAndReferences = useCallback(async (currentSchoolId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));
      
      const startOfDayTs = Timestamp.fromDate(startOfDay);
      const endOfDayTs = Timestamp.fromDate(endOfDay);

      const tripsQuery = query(
        collection(db, "trips"),
        where("schoolId", "==", currentSchoolId),
        where("startedAt", ">=", startOfDayTs),
        where("startedAt", "<=", endOfDayTs),
        orderBy("startedAt", "desc")
      );
      const tripsSnapshot = await getDocs(tripsQuery);
      
      const fetchedTrips = tripsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip));
      setTrips(fetchedTrips);

      if (fetchedTrips.length > 0) {
        const userIds = [...new Set(fetchedTrips.map(t => t.driverId))];
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
    if (schoolId) {
      fetchTripsAndReferences(schoolId);
    } else if (!profileLoading) {
      setIsLoading(false);
    }
  }, [schoolId, profileLoading, fetchTripsAndReferences]);

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
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Trips</CardTitle>
        <CardDescription>
          A real-time log of all bus trips for school {schoolId} that occurred today.
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
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Ended</TableHead>
                <TableHead>Last Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-destructive py-8">
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
                      <TableCell>
                        <Badge variant={trip.status === "active" ? "default" : "secondary"} className={trip.status === "active" ? 'bg-green-100 text-green-800' : ''}>
                          {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(trip.startedAt.toDate(), "HH:mm")}</TableCell>
                      <TableCell>{trip.endedAt ? format(trip.endedAt.toDate(), "HH:mm") : "In Progress"}</TableCell>
                      <TableCell>{trip.lastLocation?.at ? format(trip.lastLocation.at.toDate(), "HH:mm:ss") : "N/A"}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center gap-2">
                       <Frown className="h-8 w-8" />
                       <span className="font-medium">No trips found for today</span>
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
