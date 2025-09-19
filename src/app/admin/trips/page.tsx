
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  type DocumentData,
  Timestamp,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { format } from "date-fns";
import Link from "next/link";
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
import { Search, Frown, Eye, UserCheck, User, Route, Bus, Map } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

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

export default function TripsPage() {
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const schoolId = profile?.schoolId;
  const { toast } = useToast();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [referencedData, setReferencedData] = useState<Record<string, any>>({
    users: {},
    buses: new Map(),
    routes: new Map(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ended">("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!schoolId) {
        if (!profileLoading) setIsLoading(false);
        return;
    }

    setIsLoading(true);
    
    // Set up real-time listeners
    const tripsQuery = scol(schoolId, "trips");
    const usersQuery = scol(schoolId, "users");
    const busesQuery = scol(schoolId, "buses");
    const routesQuery = scol(schoolId, "routes");

    const unsubTrips = onSnapshot(tripsQuery, 
        (snapshot) => {
            const allTrips = snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Trip);
            const startOfDay = new Date();
            startOfDay.setHours(0,0,0,0);
            const todayTimestamp = Timestamp.fromDate(startOfDay);
            const todaysTrips = allTrips.filter(t => t.startedAt >= todayTimestamp);
            setTrips(todaysTrips.sort((a, b) => b.startedAt.toMillis() - a.startedAt.toMillis()));
            setIsLoading(false);
        }, 
        (err) => {
            console.error("Trips listener error:", err);
            setError("Failed to load trips.");
            setIsLoading(false);
        }
    );

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
        const userMap = Object.fromEntries(snapshot.docs.map(doc => [doc.id, doc.data()]));
        setReferencedData(prev => ({ ...prev, users: userMap }));
    });
    
    const unsubBuses = onSnapshot(busesQuery, (snapshot) => {
        const busMap = new Map(snapshot.docs.map(doc => [doc.id, doc.data()]));
        setReferencedData(prev => ({ ...prev, buses: busMap }));
    });

    const unsubRoutes = onSnapshot(routesQuery, (snapshot) => {
        const routeMap = new Map(snapshot.docs.map(doc => [doc.id, doc.data()]));
        setReferencedData(prev => ({ ...prev, routes: routeMap }));
    });

    return () => {
        unsubTrips();
        unsubUsers();
        unsubBuses();
        unsubRoutes();
    };

  }, [schoolId, profileLoading]);


  const filteredTrips = useMemo(() => {
    const lowercasedSearch = searchTerm.toLowerCase();
    
    return trips.filter(trip => {
        const driver = referencedData.users?.[trip.driverId] as UserInfo;
        const driverName = driver?.displayName?.toLowerCase() || driver?.email?.toLowerCase() || "";
        const bus = referencedData.buses?.get(trip.busId);
        const busCode = bus?.busCode?.toLowerCase() || "";
        
        const searchMatch = !lowercasedSearch || driverName.includes(lowercasedSearch) || busCode.includes(lowercasedSearch);
        const statusMatch = statusFilter === 'all' || trip.status === statusFilter;
        
        return searchMatch && statusMatch;
    });
  }, [trips, searchTerm, referencedData, statusFilter]);

  if (profileLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (profileError) {
    return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{profileError.message}</AlertDescription></Alert>;
  }

  if (!schoolId) {
    return <Alert><AlertTitle>No School ID</AlertTitle><AlertDescription>Your profile is not associated with a school.</AlertDescription></Alert>;
  }

  const renderCellContent = (content: React.ReactNode) => {
    return content || <span className="text-muted-foreground">N/A</span>;
  };
  
  const getSupervisorContent = (trip: Trip) => {
    if (trip.allowDriverAsSupervisor) {
      return (
        <Badge variant="outline" className="flex items-center gap-2">
          <UserCheck className="h-3.5 w-3.5 text-blue-600" />
          Driver as Supervisor
        </Badge>
      );
    }
    if (trip.supervisorId) {
      const supervisor = referencedData.users?.[trip.supervisorId] as UserInfo;
      return renderCellContent(supervisor?.displayName || supervisor?.email);
    }
    return <span className="text-muted-foreground">No supervisor</span>;
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

        {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error Loading Trips</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
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
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredTrips.length > 0 ? (
                filteredTrips.map(trip => {
                  const driver = referencedData.users?.[trip.driverId] as UserInfo;
                  const bus = referencedData.buses?.get(trip.busId);
                  const route = trip.routeId ? referencedData.routes?.get(trip.routeId) : null;
                  return (
                    <TableRow key={trip.id}>
                      <TableCell>{renderCellContent(
                          <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              {driver?.displayName || driver?.email}
                          </div>
                      )}</TableCell>
                      <TableCell>{renderCellContent(
                          <div className="flex items-center gap-2">
                              <Bus className="h-4 w-4 text-muted-foreground" />
                              {bus?.busCode}
                          </div>
                      )}</TableCell>
                      <TableCell>{renderCellContent(
                          route ? <div className="flex items-center gap-2">
                              <Route className="h-4 w-4 text-muted-foreground" />
                              {route.name}
                          </div> : null
                      )}</TableCell>
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
                         <div className="flex items-center justify-end gap-2">
                             <Button asChild variant="outline" size="sm">
                                <Link href={`/supervisor/trips/${trip.id}`}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Roster
                                </Link>
                             </Button>
                             <Button asChild variant="outline" size="sm">
                                <Link href={`/admin/trips/${trip.id}/telemetry`}>
                                    <Map className="mr-2 h-4 w-4" />
                                    Replay
                                </Link>
                             </Button>
                         </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center gap-2">
                       <Frown className="h-8 w-8" />
                       <span className="font-medium">No trips found</span>
                       <span>No trips have been recorded for today with the selected filters.</span>
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
