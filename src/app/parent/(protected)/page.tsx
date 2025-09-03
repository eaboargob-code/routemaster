"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { registerFcmToken } from "@/lib/notifications";

import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  orderBy,
  limit,
  Timestamp,
  DocumentData,
} from "firebase/firestore";

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
  schoolId: string;
  studentName?: string;
  boardedAt?: Timestamp | null;
  droppedAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

type ChildStatus = Student & {
  tripId?: string | null;
  tripStatus?: TripPassenger | null;
  lastLocationUpdate?: Timestamp | null;
};

/* --------------- utils ---------------- */

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
};

const timeAgo = (t?: Timestamp | null) => {
  if (!t) return null;
  const then = t.toDate().getTime();
  const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
};

/* --------------- child card --------------- */

function StudentCard({ student }: { student: Student }) {
  const [state, setState] = useState<ChildStatus>({
    ...student,
    tripId: null,
    tripStatus: null,
    lastLocationUpdate: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopPassenger: (() => void) | null = null;
    let stopTrip: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Find today's latest passenger doc for this student
      // Requires composite index (see file footer comment)
      const cg = query(
        collectionGroup(db, "passengers"),
        where("schoolId", "==", student.schoolId),
        where("studentId", "==", student.id),
        where("updatedAt", ">=", startOfToday()),
        orderBy("updatedAt", "desc"),
        limit(1)
      );

      const found = await getDocs(cg);
      if (cancelled) return;

      const latest = found.docs[0];
      if (!latest) {
        setState((p) => ({ ...p, tripId: null, tripStatus: null, lastLocationUpdate: null }));
        setLoading(false);
        return;
      }

      const passengerRef = latest.ref;
      const tripRef = passengerRef.parent.parent; // trips/{tripId}
      setState((p) => ({ ...p, tripId: tripRef?.id ?? null }));

      // live passenger row
      stopPassenger = onSnapshot(
        passengerRef,
        (ps) => {
          setState((p) => ({ ...p, tripStatus: ps.exists() ? (ps.data() as TripPassenger) : null }));
        },
        (err) => console.error("[parent] passenger listen error", err)
      );

      // live trip for lastLocation.at
      if (tripRef) {
        stopTrip = onSnapshot(
          tripRef,
          (ts) => {
            const td = ts.data() as DocumentData | undefined;
            setState((p) => ({ ...p, lastLocationUpdate: td?.lastLocation?.at ?? null }));
          },
          (err) => console.error("[parent] trip listen error", err)
        );
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
      stopPassenger?.();
      stopTrip?.();
    };
  }, [student]);

  const statusBadge = useMemo(() => {
    if (loading) return <Skeleton className="h-6 w-24" />;
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
  }, [loading, state.tripStatus]);

  const primaryTime =
    state.tripStatus?.status === "dropped"
      ? state.tripStatus?.droppedAt
      : state.tripStatus?.status === "boarded"
      ? state.tripStatus?.boardedAt
      : state.lastLocationUpdate;

  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
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
            <span>Updated {timeAgo(primaryTime)}</span>
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
  const [children, setChildren] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // FCM once
  useEffect(() => {
    if (user?.uid) {
      registerFcmToken(user.uid).catch(() => {});
    }
  }, [user?.uid]);

  // Load linked children and their student docs
  useEffect(() => {
    (async () => {
      if (!user || !profile) return;
      setLoading(true);
      setError(null);

      try {
        // Read parent link
        const linkRef = doc(db, "parentStudents", user.uid);
        const linkSnap = await getDoc(linkRef);
        const studentIds: string[] = (linkSnap.exists() && linkSnap.data().studentIds) || [];

        if (studentIds.length === 0) {
          setChildren([]);
          setLoading(false);
          return;
        }

        // Fetch students in chunks of 10 (IN clause limit)
        const chunks: string[][] = [];
        for (let i = 0; i < studentIds.length; i += 10) chunks.push(studentIds.slice(i, i + 10));

        const results: Student[] = [];
        for (const ids of chunks) {
          const qx = query(collection(db, "students"), where("__name__", "in", ids));
          const ss = await getDocs(qx);
          ss.forEach((d) => {
            const s = { id: d.id, ...(d.data() as any) } as Student;
            if (s.schoolId === profile.schoolId) results.push(s);
          });
        }

        setChildren(results);
      } catch (e: any) {
        setError(e.message || "Failed to load children.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, profile]);

  if (profileLoading || loading) return <LoadingState />;

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

          {!error && children.length === 0 && (
            <div className="mt-4 border rounded-lg p-8 text-center text-muted-foreground">
              <Frown className="mx-auto h-12 w-12" />
              <p className="mt-4 font-semibold">No Children Found</p>
              <p>No students are currently linked to your account. Please contact the school administrator.</p>
            </div>
          )}

          {children.map((c) => (
            <StudentCard key={c.id} student={c} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 🔧 Composite index needed (create once via console link if prompted):
 * collectionGroup: passengers
 * where: schoolId ==, studentId ==, updatedAt >=
 * orderBy: updatedAt desc
 */
