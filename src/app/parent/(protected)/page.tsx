
"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import type { UserProfile } from "@/lib/useProfile";
import {
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  limit,
  Timestamp,
  DocumentData,
  doc,
} from "firebase/firestore";
import { scol } from "@/lib/schoolPath";

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
import { formatRelative } from "@/lib/utils";

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

type ChildStatus = {
  tripId?: string | null;
  tripStatus?: TripPassenger | null;
  lastLocationUpdate?: Timestamp | null;
};

/* --------------- child card --------------- */

function StudentCard({ student }: { student: Student }) {
  const [state, setState] = useState<ChildStatus>({
    tripId: null,
    tripStatus: null,
    lastLocationUpdate: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubPassenger: (() => void) | null = null;
    let unsubTrip: (() => void) | null = null;
    let cancelled = false;

    const fetchTripAndListen = async () => {
        setLoading(true);

        const tripsQ = query(
          scol(student.schoolId, 'trips'),
          where('status', '==', 'active'), 
          where('passengers', 'array-contains', student.id),
          orderBy('startedAt', 'desc'),
          limit(1)
        );

        try {
            const tripsSnap = await getDocs(tripsQ);
            if (cancelled) return;

            const t = tripsSnap.docs[0];
            if (!t) {
                setState({ tripId: null, tripStatus: null, lastLocationUpdate: null });
                setLoading(false);
                return;
            }

            const tripId = t.id;
            setState(prev => ({ ...prev, tripId }));

            // Listener for passenger status
            const passengerRef = doc(db, 'schools', student.schoolId, 'trips', tripId, 'passengers', student.id);
            unsubPassenger = onSnapshot(passengerRef, (snap) => {
                if (!cancelled) {
                    setState(prev => ({ ...prev, tripStatus: snap.exists() ? (snap.data() as TripPassenger) : null }));
                }
            }, (err) => console.error(`[Parent] Passenger listener for ${student.id} failed:`, err));

            // Listener for trip's last location update
            const tripRef = doc(db, 'schools', student.schoolId, 'trips', tripId);
            unsubTrip = onSnapshot(tripRef, (snap) => {
                 if (!cancelled) {
                    const tripData = snap.data() as DocumentData | undefined;
                    setState(prev => ({ ...prev, lastLocationUpdate: tripData?.lastLocation?.at ?? null }));
                 }
            }, (err) => console.error(`[Parent] Trip listener for ${tripId} failed:`, err));

        } catch (err) {
            console.error(`[Parent] Error fetching trip for student ${student.id}:`, err);
        } finally {
            if (!cancelled) {
                setLoading(false);
            }
        }
    };
    
    fetchTripAndListen();

    return () => {
      cancelled = true;
      unsubPassenger?.();
      unsubTrip?.();
    };
  }, [student]);

  const statusBadge = useMemo(() => {
    if (loading) return <Skeleton className="h-6 w-24" />;
    
    if (!state.tripId) {
      return (
        <Badge variant="outline">
          <Hourglass className="mr-1 h-3 w-3" />
          No active trip
        </Badge>
      );
    }
    
    const s = state.tripStatus?.status;
    if (!s) {
       return (
        <Badge variant="outline">
          <HelpCircle className="mr-1 h-3 w-3" />
          No trip data
        </Badge>
      );
    }
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
  }, [loading, state.tripStatus, state.tripId]);

  const primaryTime =
    state.tripStatus?.status === "dropped"
      ? state.tripStatus?.droppedAt
      : state.tripStatus?.status === "boarded"
      ? state.tripStatus?.boardedAt
      : state.lastLocationUpdate;

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
            <span>Updated {formatRelative(primaryTime)}</span>
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

interface ParentDashboardPageProps {
  profile: UserProfile;
  childrenData: {
    students: Student[];
    loading: boolean;
    error: string | null;
  };
}

export default function ParentDashboardPage({ profile, childrenData }: ParentDashboardPageProps) {
  const { students, loading, error } = childrenData;

  if (loading) return <LoadingState />;

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

/**
 * 🔧 Composite index needed for the query on this page (create once via console link if prompted):
 * Collection: trips
 * Fields:
 * 1. schoolId (==)
 * 2. status (==)
 * 3. passengers (array-contains)
 * 4. startedAt (desc)
 */

    