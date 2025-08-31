
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  type DocumentData,
  Timestamp,
} from "firebase/firestore";
import { useProfile } from "@/lib/useProfile";
import { format } from "date-fns";
import Link from "next/link";
import { listTodaysTripsForSchool, getUsersByIds, listBusesForSchool, listRoutesForSchool } from "@/lib/firestoreQueries";

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
import { Search, Frown, Eye, UserCheck, User, Route, Bus } from "lucide-react";
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

  const fetchTripsAndReferences = useCallback(async (currentSchoolId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const fetchedTrips = await listTodaysTripsForSchool(currentSchoolId, { status: statusFilter }) as Trip[];
      setTrips(fetchedTrips);

      if (fetchedTrips.length > 0) {
        const userIds = [...new Set([
          ...fetchedTrips.map(t => t.driverId),
          ...fetchedTrips.map(t => t.supervisorId).filter(Boolean) as string[]
        ])];
        
        const users = await getUsersByIds(userIds);
        const buses = await listBusesForSchool(currentSchoolId);
        const routes = await listRoutesForSchool(currentSchoolId);

        const busMap = new Map(buses.map(b => [b.id, b]));
        const routeMap = new Map(routes.map(r => [r.id, r]));

        setReferencedData({ users, buses: busMap, routes: routeMap });
      } else {
        setReferencedData({ users: {}, buses: new Map(), routes: new Map() });
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
      } else if (err.code === "permission-denied") {
          setError("Permission denied. You do not have access to view these trips.");
          toast({
            title: "Access Denied",
            description: "You do not have permission to view trips for this school.",
            variant: "destructive"
          });
      } else {
         setError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, toast]);

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
                         <Button asChild variant="outline" size="sm">
                            <Link href={`/supervisor/trips/${trip.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View
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
