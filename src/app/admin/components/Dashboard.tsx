
"use client";

import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  orderBy,
  limit,
  getDocs
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { DocumentData } from "firebase/firestore";
import { BarChart, Bus, Route, Users, GraduationCap, Activity, UserCog, PersonStanding } from "lucide-react";
import { MetricCard, MetricCardLoading } from "./MetricCard";
import { TripsByRouteChart, TripsByRouteChartLoading } from "./TripsByRouteChart";
import { DailyTripsChart, DailyTripsChartLoading } from "./DailyTripsChart";
import { RecentActivity, RecentActivityLoading } from "./RecentActivity";

interface DashboardProps {
  schoolId: string;
}

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

export function Dashboard({ schoolId }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [buses, setBuses] = useState<DocumentData[]>([]);
  const [routes, setRoutes] = useState<DocumentData[]>([]);
  const [activeTrips, setActiveTrips] = useState<Trip[]>([]);
  const [students, setStudents] = useState<DocumentData[]>([]);
  const [tripsLast7Days, setTripsLast7Days] = useState<Trip[]>([]);
  const [events, setEvents] = useState<DocumentData[]>([]);

  useEffect(() => {
    if (!schoolId) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);

    const subscriptions = [
      onSnapshot(query(collection(db, "users"), where("schoolId", "==", schoolId)), (snap) => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)))),
      onSnapshot(query(collection(db, "buses"), where("schoolId", "==", schoolId)), (snap) => setBuses(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "routes"), where("schoolId", "==", schoolId)), (snap) => setRoutes(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "students"), where("schoolId", "==", schoolId)), (snap) => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "trips"), where("schoolId", "==", schoolId), where("status", "==", "active")), (snap) => setActiveTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as Trip)))),
      onSnapshot(query(collection(db, "trips"), where("schoolId", "==", schoolId), where("startedAt", ">=", sevenDaysAgoTimestamp)), (snap) => setTripsLast7Days(snap.docs.map(d => ({ id: d.id, ...d.data() } as Trip)))),
    ];
    
    // Fetch events once initially for simplicity, can be converted to onSnapshot if high-frequency updates are needed
     const fetchEvents = async () => {
        const tripsQuery = query(
            collection(db, "trips"), 
            where("schoolId", "==", schoolId),
            orderBy("startedAt", "desc"),
            limit(5)
        );
        const tripsSnap = await getDocs(tripsQuery);
        const eventPromises = tripsSnap.docs.map(tripDoc => {
            const eventsQuery = query(collection(db, `trips/${tripDoc.id}/events`), orderBy('ts', 'desc'), limit(10));
            return getDocs(eventsQuery);
        });

        const eventSnapshots = await Promise.all(eventPromises);
        const allEvents = eventSnapshots.flatMap(snap => snap.docs.map(d => ({...d.data(), tripId: d.ref.parent.parent?.id })));
        allEvents.sort((a, b) => b.ts.toMillis() - a.ts.toMillis());
        setEvents(allEvents.slice(0, 10));
    };

    fetchEvents();

    Promise.all(subscriptions.map(unsub => new Promise(resolve => setTimeout(resolve, 0)))).then(() => {
        setLoading(false);
    });

    return () => subscriptions.forEach((unsub) => unsub());
  }, [schoolId]);

  const userCounts = users.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="grid gap-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            {loading ? Array.from({length: 5}).map((_, i) => <MetricCardLoading key={i}/>) :
            <>
                <MetricCard title="Total Users" value={users.length} icon={Users} description={`${userCounts.admin || 0} Admins, ${userCounts.driver || 0} Drivers`}/>
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
        <div className="grid gap-6">
            {loading ? <RecentActivityLoading /> : <RecentActivity events={events} schoolId={schoolId} />}
        </div>
    </div>
  );
}
