
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  type DocumentData,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { format, subDays } from "date-fns";
import Link from "next/link";
import type { DateRange } from "react-day-picker";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileText, Calendar as CalendarIcon, Frown, Eye, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// --- Interfaces ---
interface Trip extends DocumentData {
  id: string;
  driverId: string;
  busId: string;
  routeId: string | null;
  supervisorId?: string | null;
  status: "active" | "ended";
  startedAt: Timestamp;
  endedAt?: Timestamp;
  schoolId: string;
  counts?: {
    boarded?: number;
    absent?: number;
    dropped?: number;
  };
}

interface UserInfo { id: string; displayName: string; email: string; }
interface RouteInfo { id: string; name: string; }
interface BusInfo { id: string; busCode: string; }

// --- Main Component ---
export default function ReportsPage() {
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const schoolId = profile?.schoolId;
  const { toast } = useToast();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<UserInfo[]>([]);
  const [buses, setBuses] = useState<BusInfo[]>([]);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [users, setUsers] = useState<Record<string, UserInfo>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // --- Filters State ---
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [busFilter, setBusFilter] = useState<string>("all");
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchInitialData = useCallback(async (schId: string) => {
    setIsLoading(true);
    try {
        const [routesSnap, busesSnap, usersSnap] = await Promise.all([
            getDocs(query(collection(db, "routes"), where("schoolId", "==", schId))),
            getDocs(query(collection(db, "buses"), where("schoolId", "==", schId))),
            getDocs(query(collection(db, "users"), where("schoolId", "==", schId))),
        ]);

        setRoutes(routesSnap.docs.map(d => ({ id: d.id, ...d.data() } as RouteInfo)));
        setBuses(busesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BusInfo)));
        
        const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserInfo));
        setUsers(Object.fromEntries(allUsers.map(u => [u.id, u])));
        setDrivers(allUsers.filter(u => u.role === 'driver'));

    } catch (e) {
        console.error("[Reports] Fetch initial data error:", e);
        toast({ variant: "destructive", title: "Error", description: "Could not load filter options." });
    }
    setIsLoading(false);
  }, [toast]);
  
  const fetchTrips = useCallback(async (schId: string, range?: DateRange) => {
      if (!range?.from) {
        setTrips([]);
        return;
      }
      setIsLoading(true);
      try {
        const constraints = [
            where("schoolId", "==", schId),
            where("startedAt", ">=", Timestamp.fromDate(range.from)),
            orderBy("startedAt", "desc")
        ];
        if (range.to) {
            constraints.splice(2, 0, where("startedAt", "<=", Timestamp.fromDate(range.to)));
        }

        const tripsQuery = query(collection(db, "trips"), ...constraints);
        const tripsSnap = await getDocs(tripsQuery);
        setTrips(tripsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Trip)));

      } catch (e: any) {
         console.error("[Reports] Fetch trips error:", e);
         if (e.code === 'failed-precondition') {
             toast({ variant: "destructive", title: "Indexing Required", description: "This date range query requires a Firestore index. Please create it in the Firebase console." });
         } else {
             toast({ variant: "destructive", title: "Error", description: "Could not load trip data." });
         }
         setTrips([]); // Clear trips on error
      } finally {
        setIsLoading(false);
      }

  }, [toast]);

  useEffect(() => {
    if (schoolId) {
        fetchInitialData(schoolId);
    }
  }, [schoolId, fetchInitialData]);

  useEffect(() => {
    if (schoolId && dateRange?.from) {
        fetchTrips(schoolId, dateRange);
    }
  }, [schoolId, dateRange, fetchTrips]);

  const filteredTrips = useMemo(() => {
    return trips.filter(trip => {
        const routeMatch = routeFilter === 'all' || trip.routeId === routeFilter;
        const busMatch = busFilter === 'all' || trip.busId === busFilter;
        const driverMatch = driverFilter === 'all' || trip.driverId === driverFilter;
        const statusMatch = statusFilter === 'all' || trip.status === statusFilter;
        return routeMatch && busMatch && driverMatch && statusMatch;
    });
  }, [trips, routeFilter, busFilter, driverFilter, statusFilter]);

  const handleExport = () => {
    setIsExporting(true);
    try {
        const headers = ["TripID", "Driver", "Supervisor", "Bus", "Route", "Status", "Started", "Ended", "Boarded", "Absent", "Dropped Off"];
        const data = filteredTrips.map(trip => [
            trip.id,
            users[trip.driverId]?.displayName || trip.driverId,
            trip.supervisorId ? (users[trip.supervisorId]?.displayName || trip.supervisorId) : "N/A",
            buses.find(b => b.id === trip.busId)?.busCode || "N/A",
            routes.find(r => r.id === trip.routeId)?.name || "N/A",
            trip.status,
            format(trip.startedAt.toDate(), "yyyy-MM-dd HH:mm"),
            trip.endedAt ? format(trip.endedAt.toDate(), "yyyy-MM-dd HH:mm") : "In Progress",
            trip.counts?.boarded ?? 0,
            trip.counts?.absent ?? 0,
            trip.counts?.dropped ?? 0,
        ]);

        const csvContent = "data:text/csv;charset=utf-8," 
            + [headers.join(","), ...data.map(e => e.join(","))].join("\n");
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `trips_report_${format(new Date(), "yyyy-MM-dd")}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({ title: "Export Successful", description: "Your CSV file has been downloaded." });
    } catch (e) {
        console.error("[Export CSV] Error:", e);
        toast({ variant: "destructive", title: "Export Failed", description: "Could not generate the CSV file." });
    } finally {
        setIsExporting(false);
    }
  };


  if (profileLoading) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (profileError) {
    return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{profileError.message}</AlertDescription></Alert>;
  }
  if (!schoolId) {
    return <Alert><AlertTitle>No School ID</AlertTitle><AlertDescription>Your profile is not associated with a school.</AlertDescription></Alert>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle className="flex items-center gap-2"><FileText /> Reports</CardTitle>
                <CardDescription>Filter and export trip data for your school.</CardDescription>
            </div>
            <Button onClick={handleExport} disabled={isExporting || filteredTrips.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? "Exporting..." : "Export to CSV"}
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* --- Filter Controls --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6 p-4 border rounded-lg">
            <Popover>
                <PopoverTrigger asChild>
                <Button
                    id="date"
                    variant={"outline"}
                    className="justify-start text-left font-normal"
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                    dateRange.to ? (
                        `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`
                    ) : (
                        format(dateRange.from, "LLL dd, y")
                    )
                    ) : (
                    <span>Pick a date</span>
                    )}
                </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={dateRange}
                        onSelect={setDateRange}
                        numberOfMonths={2}
                    />
                </PopoverContent>
            </Popover>
            <Select value={routeFilter} onValueChange={setRouteFilter}>
                <SelectTrigger><SelectValue placeholder="Filter by route..." /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Routes</SelectItem>{routes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
             <Select value={busFilter} onValueChange={setBusFilter}>
                <SelectTrigger><SelectValue placeholder="Filter by bus..." /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Buses</SelectItem>{buses.map(b => <SelectItem key={b.id} value={b.id}>{b.busCode}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={driverFilter} onValueChange={setDriverFilter}>
                <SelectTrigger><SelectValue placeholder="Filter by driver..." /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Drivers</SelectItem>{drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.displayName || d.email}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Filter by status..." /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="ended">Ended</SelectItem></SelectContent>
            </Select>
        </div>

        {/* --- Trips Table --- */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver / Supervisor</TableHead>
                <TableHead>Route / Bus</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timestamps</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}><TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                ))
              ) : filteredTrips.length > 0 ? (
                filteredTrips.map(trip => {
                  const driver = users[trip.driverId];
                  const supervisor = trip.supervisorId ? users[trip.supervisorId] : null;
                  const bus = buses.find(b => b.id === trip.busId);
                  const route = routes.find(r => r.id === trip.routeId);
                  return (
                    <TableRow key={trip.id}>
                        <TableCell>
                            <div className="font-medium">{driver?.displayName || driver?.email || "Unknown"}</div>
                            <div className="text-sm text-muted-foreground">{supervisor?.displayName || supervisor?.email || "No supervisor"}</div>
                        </TableCell>
                        <TableCell>
                            <div className="font-medium">{route?.name || <span className="text-muted-foreground">N/A</span>}</div>
                            <div className="text-sm text-muted-foreground">{bus?.busCode || "N/A"}</div>
                        </TableCell>
                        <TableCell>{trip.status}</TableCell>
                        <TableCell>
                            <div className="font-medium">Start: {format(trip.startedAt.toDate(), "HH:mm")}</div>
                            <div className="text-sm text-muted-foreground">{trip.endedAt ? `End: ${format(trip.endedAt.toDate(), "HH:mm")}` : "In Progress"}</div>
                        </TableCell>
                        <TableCell>
                            <div className="flex gap-2 text-sm">
                                <span>B: <strong>{trip.counts?.boarded ?? 0}</strong></span>
                                <span>A: <strong>{trip.counts?.absent ?? 0}</strong></span>
                                <span>D: <strong>{trip.counts?.dropped ?? 0}</strong></span>
                            </div>
                        </TableCell>
                      <TableCell className="text-right">
                         <Button asChild variant="outline" size="sm">
                            <Link href={`/supervisor/trips/${trip.id}`}><Eye className="mr-2 h-4 w-4" /> View</Link>
                         </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center gap-2">
                       <Frown className="h-8 w-8" />
                       <span className="font-medium">No Trips Found</span>
                       <span>No trips match your current filter criteria.</span>
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
