
"use client";

import { useProfile } from "@/lib/useProfile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  collection,
  onSnapshot,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { useState, useEffect } from "react";
import { scol } from "@/lib/schoolPath";
import { Bus, Route, Users, GraduationCap, Activity } from "lucide-react";
import { MetricCard, MetricCardLoading } from "./components/MetricCard";
import { TripsByRouteChart, TripsByRouteChartLoading } from "./components/TripsByRouteChart";
import { DailyTripsChart, DailyTripsChartLoading } from "./components/DailyTripsChart";


interface User extends DocumentData {
    id: string;
    role: 'admin' | 'driver' | 'supervisor' | 'parent';
}

interface Trip extends DocumentData {
    id: string;
    routeId?: string;
    status: 'active' | 'ended';
    startedAt: Timestamp;
}

function Dashboard({ schoolId }: { schoolId: string }) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [buses, setBuses] = useState<DocumentData[]>([]);
  const [routes, setRoutes] = useState<DocumentData[]>([]);
  const [students, setStudents] = useState<DocumentData[]>([]);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  
  useEffect(() => {
    if (!schoolId) return;

    const subscriptions = [
      onSnapshot(scol(schoolId, "users"), (snap) => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)))),
      onSnapshot(scol(schoolId, "buses"), (snap) => setBuses(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(scol(schoolId, "routes"), (snap) => setRoutes(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(scol(schoolId, "students"), (snap) => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(scol(schoolId, "trips"), (snap) => setAllTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as Trip)))),
    ];
    
    const timer = setTimeout(() => setLoading(false), 1500);

    return () => {
        subscriptions.forEach((unsub) => unsub());
        clearTimeout(timer);
    };
  }, [schoolId]);

  const userCounts = users.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeTrips = allTrips.filter(trip => trip.status === 'active');
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);
  const tripsLast7Days = allTrips.filter(trip => trip.startedAt >= sevenDaysAgoTimestamp);

  return (
    <div className="grid gap-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            {loading ? Array.from({length: 5}).map((_, i) => <MetricCardLoading key={i}/>) :
            <>
                <MetricCard 
                    title="Total Users" 
                    value={users.length} 
                    icon={Users} 
                    description={`${userCounts.admin || 0} Admins, ${userCounts.driver || 0} Drivers, ${userCounts.supervisor || 0} Supervisors, ${userCounts.parent || 0} Parents`}
                />
                <MetricCard title="Total Buses" value={buses.length} icon={Bus}/>
                <MetricCard title="Total Routes" value={routes.length} icon={Route}/>
                <MetricCard title="Active Trips" value={activeTrips.length} icon={Activity} />
                <MetricCard title="Total Students" value={students.length} icon={GraduationCap} />
            </>
            }
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
            {loading ? <TripsByRouteChartLoading /> : <TripsByRouteChart activeTrips={activeTrips} routes={routes} />}
            {loading ? <DailyTripsChartLoading /> : <DailyTripsChart trips={tripsLast7Days} />}
        </div>
    </div>
  );
}

export default function AdminDashboardPage() {
    const { profile, loading, error } = useProfile();

    if (loading) {
        return (
            <div className="grid gap-4 md:gap-8">
                 <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-1/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-40 w-full" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (error) {
        return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;
    }

    if (!profile) {
        return <Alert><AlertTitle>Profile Not Found</AlertTitle><AlertDescription>Admin profile could not be loaded.</AlertDescription></Alert>;
    }

    return <Dashboard schoolId={profile.schoolId} />;
}
