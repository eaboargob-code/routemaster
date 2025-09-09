"use client";

import { useEffect, useMemo, useState } from "react";
import type { UserProfile } from "@/lib/useProfile";
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

type ChildStatus = {
  tripId?: string | null;
  tripStatus?: TripPassenger | null;
  lastLocationUpdate?: Timestamp | null;
  tripEnded?: boolean;
};

/* --------------- helpers --------------- */

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
};

/**
 * Find the most relevant trip for a student:
 * 1) Prefer an ACTIVE trip that lists the student in `passengers` (array-contains).
 * 2) Otherwise pick TODAY's latest trip where /passengers/{studentId} exists.
 */
async function findRelevantTripIdForStudent(schoolId: string, studentId: string): Promise<string | null> {
  // 1) Try active trip first (fast path)
  try {
    const activeQ = query(
      scol(schoolId, "trips"),
      where("status", "==", "active"),
      where("passengers", "array-contains", studentId),
      orderBy("startedAt", "desc"),
      limit(1)
    );
    const activeSnap = await getDocs(activeQ);
    if (!activeSnap.empty) {
      return activeSnap.docs[0].id;
    }
  } catch (err) {
    // If there’s no composite index yet, or rules reject, we fall back to path #2.
    // console.warn("[Parent] Active trip query fallback:", err);
  }

  // 2) Fallback: today’s trips (newest first) — pick the first that actually has a passenger doc
  try {
    const todayQ = query(
      scol(schoolId, "trips"),
      where("startedAt", ">=", startOfToday()),
      orderBy("startedAt", "desc"),
      limit(10)
    );
    const todaySnap = await getDocs(todayQ);
    if (todaySnap.empty) return null;

    // Check passenger doc existence on the client (no extra index required)
    for (const d of todaySnap.docs) {
      try {
        const pSnap = await getDoc(
          sdoc(schoolId, "trips", d.id, "passengers", studentId)
        );
        if (pSnap.exists()) return d.id;
      } catch {
        // ignore and continue
      }
    }
  } catch (err) {
    // console.warn("[Parent] Fallback query failed:", err);
  }

  return null;
}

/* --------------- child card --------------- */

function StudentCard({ student }: { student: Student }) {
  const [state, setState] = useState<ChildStatus>({
    tripId: null,
    tripStatus: null,
    lastLocationUpdate: null,
    tripEnded: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubPassenger: (() => void) | null = null;
    let unsubTrip: (() => void) | null = null;
    let cancelled = false;

    async function wireUp() {
      setLoading(true);

      const tripId = await findRelevantTripIdForStudent(student.schoolId, student.id);

      if (cancelled) return;

      if (!tripId) {
        // No trip today with this student
        setState({ tripId: null, tripStatus: null, lastLocationUpdate: null, tripEnded: false });
        setLoading(false);
        return;
      }

      setState((prev) => ({ ...prev, tripId }));

      // Listen to passenger row
      const passengerRef = sdoc(student.schoolId, "trips", tripId, "passengers", student.id);
      unsubPassenger = onSnapshot(
        passengerRef,
        (snap) => {
          if (cancelled) return;
          setState((prev) => ({
            ...prev,
            tripStatus: snap.exists() ? (snap.data() as TripPassenger) : null,
          }));
        },
        (err) => console.error(`[Parent] Passenger listener for ${student.id} failed:`, err)
      );

      // Listen to trip for lastLocation and whether trip ended
      const tripRef = sdoc(student.schoolId, "trips", tripId);
      unsubTrip = onSnapshot(
        tripRef,
        (snap) => {
          if (cancelled) return;
          const t = snap.data() as (DocumentData & { lastLocation?: { at?: Timestamp }; status?: string }) | undefined;
          setState((prev) => ({
            ...prev,
            lastLocationUpdate: t?.lastLocation?.at ?? null,
            tripEnded: t?.status === "ended",
          }));
        },
        (err) => console.error(`[Parent] Trip listener for ${tripId} failed:`, err)
      );

      setLoading(false);
    }

    wireUp();

    return () => {
      cancelled = true;
      unsubPassenger?.();
      unsubTrip?.();
    };
  }, [student]);

  const statusBadge = useMemo(() => {
    if (loading) return <Skeleton className="h-6 w-24" />;

    // No relevant trip today
    if (!state.tripId) {
      return (
        <Badge variant="outline">
          <Hourglass className="mr-1 h-3 w-3" />
          No trip today
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

  // Show the most meaningful time: droppedAt > boardedAt > last bus ping
  const primaryTime: Timestamp | null =
    state.tripStatus?.status === "dropped"
      ? state.tripStatus?.droppedAt ?? null
      : state.tripStatus?.status === "boarded"
      ? state.tripStatus?.boardedAt ?? null
      : state.lastLocationUpdate ?? null;

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
              {state.tripEnded && state.tripStatus?.status === "dropped"
                ? "Dropped "
                : state.tripStatus?.status === "boarded"
                ? "Boarded "
                : "Updated "}
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
 * If you want to also allow the "active" + "array-contains" + "orderBy startedAt" query
 * (first fast path) without falling back, create this composite index:
 * 
 * Collection group: schools/{schoolId}/trips
 * Fields (in order):
 *   status == 
 *   passengers array-contains
 *   startedAt desc
 * 
 * Otherwise the fallback path (today’s trips + passenger doc existence) will still work.
 */
