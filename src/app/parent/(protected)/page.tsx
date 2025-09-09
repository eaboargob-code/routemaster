/**
 * One-time Firestore index recommendation for the queries in this file.
 *
 * Collection: schools/{schoolId}/trips (or collection group: trips)
 * Index A (active search):
 *   status (ASC, ==)
 *   passengers (array-contains)
 *   startedAt (DESC)
 * Index B (fallback search):
 *   passengers (array-contains)
 *   startedAt (DESC)
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useProfile } from "@/lib/useProfile";
import {
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  limit,
  Timestamp,
  type DocumentData,
  getDoc,
} from "firebase/firestore";
import { scol, sdoc } from "@/lib/schoolPath";
import { formatRelative } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Frown,
  Bus,
  Route as RouteIcon,
  Clock,
  CheckCircle,
  XCircle,
  Footprints,
  HelpCircle,
  Hourglass,
} from "lucide-react";

/* ---------------- types ---------------- */

type Student = {
  id: string;
  name: string;
  schoolId: string;
  assignedRouteId?: string;
  assignedBusId?: string;
  routeName?: string;
  busCode?: string;
};

type TripPassenger = {
  status: "boarded" | "absent" | "dropped" | "pending";
  studentId: string;
  studentName?: string;
  boardedAt?: Timestamp | null;
  droppedAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

type ChildState = {
  tripId: string | null;
  passenger: TripPassenger | null;
  lastLocationAt: Timestamp | null;
  loading: boolean;
};

/* --------------- helpers --------------- */

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
};

/* --------------- child card --------------- */

function StudentCard({ student }: { student: Student }) {
  const [state, setState] = useState<ChildState>({
    tripId: null,
    passenger: null,
    lastLocationAt: null,
    loading: true,
  });

  useEffect(() => {
    let unsubPassenger: (() => void) | null = null;
    let unsubTrip: (() => void) | null = null;
    let isCancelled = false;

    async function findTripAndSubscribe() {
      if (!student.schoolId || !student.id) {
        setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
        return;
      }
      setState(prev => ({ ...prev, loading: true }));

      const tripsCol = scol(student.schoolId, "trips");

      // 1) Try ACTIVE trip containing this student today
      const qActive = query(
        tripsCol,
        where("status", "==", "active"),
        where("passengers", "array-contains", student.id),
        where("startedAt", ">=", startOfToday()),
        orderBy("startedAt", "desc"),
        limit(1)
      );

      let snap = await getDocs(qActive);
      if (isCancelled) return;

      // 2) If none, fallback to latest ANY trip that contains the student
      if (snap.empty) {
        const qFallback = query(
          tripsCol,
          where("passengers", "array-contains", student.id),
          orderBy("startedAt", "desc"),
          limit(1)
        );
        snap = await getDocs(qFallback);
        if (isCancelled) return;
      }

      if (snap.empty) {
        setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
        return;
      }

      const tripId = snap.docs[0].id;
      setState(prev => ({ ...prev, tripId }));

      // Listen to passenger row
      const passengerRef = sdoc(student.schoolId, "trips", tripId, "passengers", student.id);
      unsubPassenger = onSnapshot(
        passengerRef,
        (docSnap) => {
          if (isCancelled) return;
          const passengerData = docSnap.exists() ? (docSnap.data() as TripPassenger) : null;
          console.log(`[Passenger Sub] Student ${student.id}:`, passengerData);
          setState(prev => ({
            ...prev,
            passenger: passengerData
          }));
        },
        (err) => console.error(`[Parent] Passenger listener for ${student.id} failed:`, err)
      );

      // Listen to trip (for lastLocation.at)
      const tripRef = sdoc(student.schoolId, "trips", tripId);
      unsubTrip = onSnapshot(
        tripRef,
        (docSnap) => {
          if (isCancelled) return;
          const tripData = docSnap.data() as DocumentData | undefined;
          const lastLocation = tripData?.lastLocation?.at ?? null;
          console.log(`[Trip Sub] Trip ${tripId} lastLocation.at:`, lastLocation);
          setState(prev => ({ ...prev, lastLocationAt: lastLocation }));
        },
        (err) => console.error(`[Parent] Trip listener for ${tripId} failed:`, err)
      );

      setState(prev => ({ ...prev, loading: false }));
    }

    findTripAndSubscribe();

    return () => {
      isCancelled = true;
      unsubPassenger?.();
      unsubTrip?.();
    };
  }, [student.id, student.schoolId]);

  const statusBadge = useMemo(() => {
    if (state.loading) return <Skeleton className="h-6 w-24" />;

    if (!state.tripId) {
      return (
        <Badge variant="outline" className="flex items-center">
          <Hourglass className="mr-1 h-3 w-3" />
          No active trip
        </Badge>
      );
    }

    if (!state.passenger) {
      return (
        <Badge variant="outline" className="flex items-center">
          <HelpCircle className="mr-1 h-3 w-3" />
          No trip data
        </Badge>
      );
    }

    const s = state.passenger.status;
    if (s === "boarded")
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
          <Bus className="mr-1 h-3 w-3" />
          On Bus
        </Badge>
      );
    if (s === "dropped")
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="mr-1 h-3 w-3" />
          Dropped Off
        </Badge>
      );
    if (s === "absent")
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Marked Absent
        </Badge>
      );

    return (
      <Badge variant="secondary">
        <Footprints className="mr-1 h-3 w-3" />
        Awaiting Check-in
      </Badge>
    );
  }, [state.loading, state.tripId, state.passenger]);

  const primaryTime = useMemo(() => {
    if (!state.passenger) return state.lastLocationAt;
    return (
      state.passenger.droppedAt ??
      state.passenger.boardedAt ??
      state.passenger.updatedAt ??
      state.lastLocationAt
    );
  }, [state.passenger, state.lastLocationAt]);

  const timeLabel = useMemo(() => {
    if (!state.passenger) return "Updated ";
    const s = state.passenger.status;
    if (s === "dropped") return "Dropped ";
    if (s === "boarded") return "Boarded ";
    if (s === "absent") return "Marked ";
    return "Updated ";
  }, [state.passenger]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>{student.name}</CardTitle>
          <CardDescription className="flex flex-col gap-1 mt-2">
            {!!student.busCode && (
              <span className="flex items-center gap-2">
                <Bus className="h-4 w-4" /> {student.busCode}
              </span>
            )}
            {!!student.routeName && (
              <span className="flex items-center gap-2">
                <RouteIcon className="h-4 w-4" /> {student.routeName}
              </span>
            )}
          </CardDescription>
        </div>
        {statusBadge}
      </CardHeader>

      <CardContent className="space-y-1">
        {!!primaryTime && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>
              {timeLabel}
              {formatRelative(primaryTime)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------- skeletons --------------- */

function LoadingState() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-10 w-1/2 mb-4" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------- page --------------- */

export default function ParentDashboardPage() {
  const { user, profile, loading: profileLoading } = useProfile();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChildrenData = async () => {
      if (!user || !profile?.schoolId) return;
      setLoading(true);
      setError(null);

      try {
        // 1) get linked student IDs
        const parentLinkRef = sdoc(profile.schoolId, "parentStudents", user.uid);
        const linkDocSnap = await getDoc(parentLinkRef);
        const idsAll: string[] = (linkDocSnap.exists() && linkDocSnap.data().studentIds) || [];

        if (idsAll.length === 0) {
          setStudents([]);
          setLoading(false);
          return;
        }

        // 2) Firestore "in" is limited to 10 IDs → chunk queries
        const CHUNK = 10;
        const out: Student[] = [];
        for (let i = 0; i < idsAll.length; i += CHUNK) {
          const ids = idsAll.slice(i, i + CHUNK);
          const qStudents = query(scol(profile.schoolId, "students"), where("__name__", "in", ids));
          const snap = await getDocs(qStudents);
          snap.docs.forEach(d =>
            out.push({ id: d.id, ...(d.data() as any), schoolId: profile.schoolId })
          );
        }

        setStudents(out);
      } catch (e: any) {
        console.error("Failed to fetch parent data:", e);
        setError(e.message || "An unknown error occurred.");
      } finally {
        setLoading(false);
      }
    };

    if (!profileLoading && profile) {
      fetchChildrenData();
    }
  }, [user, profile, profileLoading]);

  if (loading || profileLoading) return <LoadingState />;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Parent Dashboard</CardTitle>
          <CardDescription>
            Welcome, {profile?.displayName || "Parent"}. Real-time status for your children.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            My Children
          </h2>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!error && students.length === 0 && (
            <div className="mt-4 border rounded-lg p-8 text-center text-muted-foreground">
              <Frown className="mx-auto h-12 w-12" />
              <p className="mt-4 font-semibold">No Children Found</p>
              <p>No students are currently linked to your account. Please contact the school administrator.</p>
            </div>
          )}

          {students.map((c) => (
            <StudentCard key={c.id} student={c} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
