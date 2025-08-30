
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  doc,
  getDoc,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Search, Frown } from "lucide-react";

// --- Data Interfaces ---
interface Trip {
  id: string;
  driverId: string;
  busId: string;
  routeId: string | null;
  status: "active" | "ended";
  startedAt: Timestamp;
  endedAt?: Timestamp;
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

// --- Helper Functions ---
async function fetchReferencedDocs<T>(collectionName: string, ids: string[]): Promise<Map<string, T>> {
    const dataMap = new Map<string, T>();
    if (ids.length === 0) return dataMap;

    // Firestore `in` queries are limited to 30 elements.
    // We chunk the IDs to handle more than 30.
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

// --- Main Component ---
export default function TripsPage() {
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const schoolId = profile?.schoolId;

  const [trips, setTrips] = useState<Trip[]>([]);
  const [referencedData, setReferencedData] = useState<ReferencedData>({
    users: new Map(),
    buses: new Map(),
    routes: new Map(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ended">("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchTripsAndReferences = useCallback(async (currentSchoolId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch trips for the school
      const tripsQuery = query(
        collection(db, "trips"),
        where("schoolId", "==", currentSchoolId)
      );
      const tripsSnapshot = await getDocs(tripsQuery);
      
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const fetchedTrips = tripsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip))
        .filter(trip => {
            const startedAtDate = trip.startedAt.toDate();
            return startedAtDate >= todayStart && startedAtDate <= todayEnd;
        });

      setTrips(fetchedTrips);

      if (fetchedTrips.length > 0) {
        // 2. Collect unique IDs for batch fetching
        const userIds = [...new Set(fetchedTrips.map(t => t.driverId))];
        const busIds = [...new Set(fetchedTrips.map(t => t.busId))];
        const routeIds = [...new Set(fetchedTrips.map(t => t.routeId).filter(Boolean) as string[])];

        // 3. Batch fetch referenced documents
        const [users, buses, routes] = await Promise.all([
          fetchReferencedDocs<User>("users", userIds),
          fetchReferencedDocs<Bus>("buses", busIds),
          fetchReferencedDocs<Route>("routes", routeIds),
        ]);
        
        setReferencedData({ users, buses, routes });
      } else {
        // No trips, so no references to fetch
        setReferencedData({ users: new Map(), buses: new Map(), routes: new Map() });
      }

    } catch (err: any) {
      console.error("Failed to fetch trips:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (schoolId) {
      fetchTripsAndReferences(schoolId);
    } else if (!profileLoading) {
      setIsLoading(false);
    }
  }, [schoolId, profileLoading, fetchTripsAndReferences]);


  const filteredTrips = useMemo(() => {
    const lowercasedSearch = searchTerm.toLowerCase();
    
    return trips.filter(trip => {
      // Status filter
      if (statusFilter !== "all" && trip.status !== statusFilter) {
        return false;
      }

      // Search filter
      if (lowercasedSearch) {
        const driverName = referencedData.users.get(trip.driverId)?.displayName.toLowerCase() || "";
        const busCode = referencedData.buses.get(trip.busId)?.busCode.toLowerCase() || "";
        return driverName.includes(lowercasedSearch) || busCode.includes(lowercasedSearch);
      }

      return true;
    });
  }, [trips, statusFilter, searchTerm, referencedData]);

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
          A log of all bus trips for school {schoolId} that occurred today.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Driver or Bus..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value: "all" | "active" | "ended") => setStatusFilter(value)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-destructive py-8">
                    Error loading trips: {error}
                  </TableCell>
                </TableRow>
              ) : filteredTrips.length > 0 ? (
                filteredTrips.map(trip => {
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
                      <TableCell>{format(trip.startedAt.toDate(), "p")}</TableCell>
                      <TableCell>{trip.endedAt ? format(trip.endedAt.toDate(), "p") : "In Progress"}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center gap-2">
                       <Frown className="h-8 w-8" />
                       <span className="font-medium">No trips found</span>
                       <span>No trips match your current filters.</span>
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
