/**
 * Parent dashboard — robust child status.
 *
 * One-time index for this query:
 * Collection: schools/{schoolId}/trips
 * Fields:
 *   status (==)
 *   passengers (array-contains)
 *   startedAt (desc)
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProfile } from "@/lib/useProfile";
import {
  query,
  where,
  getDocs,
  getDoc,
  onSnapshot,
  orderBy,
  limit,
  Timestamp,
  type DocumentData,
  collection,
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
import { Notification } from "./layout";

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
  status: "boarded" | "absent" | "dropped" | "pending" | string;
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

function StudentCard({ student, notifications }: { student: Student, notifications: Notification[] }) {
  const [state, setState] = useState<ChildState>({
    tripId: null,
    passenger: null,
    lastLocationAt: null,
    loading: true,
  });

  const activePassengerSource = useRef<"docId" | "query" | null>(null);

  useEffect(() => {
    if (!student.schoolId || !student.id) {
      setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
      return;
    }

    let unsubActiveTrip: (() => void) | null = null;
    let unsubTripDoc: (() => void) | null = null;
    let unsubPassenger: (() => void) | null = null;
    let cancelled = false;
    let currentTripId: string | null = null;

    const cleanupPassengerSubs = () => {
        unsubPassenger?.();
        unsubPassenger = null;
    };

    const cleanupAll = () => {
      unsubActiveTrip?.();
      unsubActiveTrip = null;
      unsubTripDoc?.();
      unsubTripDoc = null;
      cleanupPassengerSubs();
    };

    setState({ tripId: null, passenger: null, lastLocationAt: null, loading: true });

    // LIVE: today's active trip that contains this student
    const qActive = query(
      scol(student.schoolId, "trips"),
      where("status", "==", "active"),
      where("passengers", "array-contains", student.id),
      where("startedAt", ">=", startOfToday()),
      orderBy("startedAt", "desc"),
      limit(1)
    );

    unsubActiveTrip = onSnapshot(
      qActive,
      (qsnap) => {
        if (cancelled) return;

        if (qsnap.empty) {
          currentTripId = null;
          cleanupPassengerSubs();
          setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
          return;
        }

        const doc0 = qsnap.docs[0];
        const tripId = doc0.id;

        if (tripId !== currentTripId) {
          currentTripId = tripId;
          cleanupPassengerSubs();
          setState((prev) => ({ ...prev, tripId, passenger: null, loading: true }));

          // Trip document listener (for lastLocation + end)
          const tripRef = sdoc(student.schoolId, "trips", tripId);
          unsubTripDoc = onSnapshot(
            tripRef,
            (t) => {
              if (cancelled) return;
              const td = t.data() as DocumentData | undefined;
              const lastAt = td?.lastLocation?.at ?? null;
              const status = (td?.status as string) || "active";
              setState((prev) => ({ ...prev, lastLocationAt: lastAt }));
              if (status !== "active") {
                // trip ended: clear until a new active one appears
                cleanupPassengerSubs();
                setState((prev) => ({ ...prev, tripId: null, passenger: null, loading: false }));
              }
            },
            (err) => {
              console.error(`[Parent] Trip listener ${tripId} error:`, err);
            }
          );
          
          // Backup became the primary: listen by field (works for any doc id)
          const passColl = collection(sdoc(student.schoolId, "trips", tripId), "passengers");
          const qOne = query(passColl, where("studentId", "==", student.id), limit(1));
          unsubPassenger = onSnapshot(qOne, (qs) => {
            const d = qs.docs[0];
            setState(prev => ({ ...prev, passenger: d?.data() as TripPassenger ?? null, loading: false }));
          }, (err) => console.error("[Parent] passenger query error:", err));


        } else {
          // same trip; make sure we’re not stuck loading
          setState((prev) => ({ ...prev, loading: false }));
        }
      },
      (err) => {
        console.error("[Parent] Active trip query listener error:", err);
        setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
      }
    );

    return () => {
      cancelled = true;
      cleanupAll();
    };
  }, [student.id, student.schoolId]);

  // ---- UI derivations ----

  const derived = useMemo(() => {
    // Find the most recent, relevant notification from the inbox
    const notification = notifications
        .filter(n => n.data?.studentId === student.id && n.data?.status)
        .sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
    
    // Combine live passenger data with notification data
    const p = state.passenger;
    const normStatus = (notification?.data?.status || p?.status || "").toLowerCase().trim();
    
    const isDropped = normStatus === 'dropped' || !!p?.droppedAt;
    const isBoarded = normStatus === 'boarded' || !!p?.boardedAt;
    const isAbsent = normStatus === 'absent';
    
    let badge: JSX.Element;
    let time: Timestamp | null = null;
    let label = "Updated ";

    if (state.loading) {
      badge = <Skeleton className="h-6 w-24" />;
    } else if (!state.tripId) {
      badge = (
        <Badge variant="outline" className="flex items-center">
          <Hourglass className="mr-1 h-3 w-3" />
          No active trip
        </Badge>
      );
    } else if (isDropped) {
      badge = (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="mr-1 h-3 w-3" />
          Dropped Off
        </Badge>
      );
      time = p?.droppedAt || notification?.createdAt || p?.updatedAt || state.lastLocationAt;
      label = "Dropped ";
    } else if (isBoarded) {
      badge = (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
          <Bus className="mr-1 h-3 w-3" />
          On Bus
        </Badge>
      );
      time = p?.boardedAt || notification?.createdAt || p?.updatedAt || state.lastLocationAt;
      label = "Boarded ";
    } else if (isAbsent) {
      badge = (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Marked Absent
        </Badge>
      );
      time = notification?.createdAt || p?.updatedAt || state.lastLocationAt;
      label = "Marked ";
    } else if (!p) {
        badge = (
          <Badge variant="outline" className="flex items-center">
            <HelpCircle className="mr-1 h-3 w-3" />
            No trip data
          </Badge>
        );
    } else {
      badge = (
        <Badge variant="secondary">
          <Footprints className="mr-1 h-3 w-3" />
          Awaiting Check-in
        </Badge>
      );
      time = notification?.createdAt || p?.updatedAt || state.lastLocationAt;
    }

    return { badge, time, label };
  }, [state.loading, state.tripId, state.passenger, state.lastLocationAt, notifications, student.id]);

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
        {derived.badge}
      </CardHeader>

      <CardContent className="space-y-1">
        {!!derived.time && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>
              {derived.label}
              {formatRelative(derived.time)}
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

export default function ParentDashboardPage({ notifications = [] }: { notifications?: Notification[] }) {
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
        // parentStudents/{parentUid}.studentIds = [studentId,...]
        const linkRef = sdoc(profile.schoolId, "parentStudents", user.uid);
        const linkSnap = await getDoc(linkRef);
        const studentIds: string[] = (linkSnap.exists() && linkSnap.data().studentIds) || [];

        if (studentIds.length === 0) {
          setStudents([]);
          setLoading(false);
          return;
        }

        const studentsQ = query(
          scol(profile.schoolId, "students"),
          where("__name__", "in", studentIds.slice(0, 30))
        );
        const studentsSnap = await getDocs(studentsQ);
        const rows = studentsSnap.docs.map(
          (d) => ({ id: d.id, ...d.data(), schoolId: profile.schoolId } as Student)
        );
        setStudents(rows);
      } catch (e: any) {
        console.error("Failed to fetch parent data:", e);
        setError(e.message || "An unknown error occurred.");
      } finally {
        setLoading(false);
      }
    };

    if (!profileLoading && profile) fetchChildrenData();
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

          {students.map((s) => (
            <StudentCard key={s.id} student={s} notifications={notifications} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
