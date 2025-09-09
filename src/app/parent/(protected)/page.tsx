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

import { useEffect, useMemo, useState } from "react";
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
    let unsubActiveTrip: (() => void) | null = null;
    let unsubTripDoc: (() => void) | null = null;
    let unsubPassengerDoc: (() => void) | null = null;
    let cancelled = false;
    let currentTripId: string | null = null;
  
    function cleanupTripSubs() {
      unsubTripDoc?.();
      unsubTripDoc = null;
      unsubPassengerDoc?.();
      unsubPassengerDoc = null;
    }
  
    setState({ tripId: null, passenger: null, lastLocationAt: null, loading: true });
  
    if (!student.schoolId || !student.id) {
      setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
      return;
    }
  
    // LIVE listener for today's active trip that contains this student
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
      async (qsnap) => {
        if (cancelled) return;
  
        // If there is no active trip, clear UI and stop trip/passenger listeners
        if (qsnap.empty) {
          currentTripId = null;
          cleanupTripSubs();
          setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
          return;
        }
  
        const doc0 = qsnap.docs[0];
        const tripId = doc0.id;
  
        // If active trip switched, resubscribe
        if (tripId !== currentTripId) {
          currentTripId = tripId;
          cleanupTripSubs();
          setState(prev => ({ ...prev, tripId, loading: true }));
  
          // Trip document listener (status + lastLocation.at)
          const tripRef = sdoc(student.schoolId, "trips", tripId);
          unsubTripDoc = onSnapshot(
            tripRef,
            (t) => {
              if (cancelled) return;
              const td = t.data() as DocumentData | undefined;
              const lastAt = td?.lastLocation?.at ?? null;
              const status = td?.status ?? "active";
  
              setState(prev => ({ ...prev, lastLocationAt: lastAt }));
              if (status !== "active") {
                // Trip ended -> clear and wait for a new active trip
                cleanupTripSubs();
                setState(prev => ({ ...prev, tripId: null, passenger: null, loading: false }));
              }
            },
            (err) => {
              console.error(`[Parent] Trip listener ${tripId} error:`, err);
            }
          );
  
          // Passenger doc listener (status/boarded/dropped)
          const primaryPassRef = sdoc(student.schoolId, "trips", tripId, "passengers", student.id);
          unsubPassengerDoc = onSnapshot(
            primaryPassRef,
            async (p) => {
              if (cancelled) return;
  
              if (p.exists()) {
                setState(prev => ({ ...prev, passenger: p.data() as TripPassenger, loading: false }));
                return;
              }
  
              // Fallback: passenger doc id might be random; look by studentId
              try {
                const alt = await getDocs(
                  query(
                    scol(student.schoolId, "trips", tripId, "passengers"),
                    where("studentId", "==", student.id),
                    limit(1)
                  )
                );
                const found = alt.docs[0];
                setState(prev => ({
                  ...prev,
                  passenger: found ? (found.data() as TripPassenger) : null,
                  loading: false,
                }));
              } catch (e) {
                console.error("[Parent] Passenger fallback query failed:", e);
                setState(prev => ({ ...prev, passenger: null, loading: false }));
              }
            },
            (err) => {
              // If you get permission errors here, ensure the parent has schools/{sid}/users/{uid} with role: "parent"
              console.error(`[Parent] Passenger listener (${student.id}) error:`, err);
              setState(prev => ({ ...prev, passenger: null, loading: false }));
            }
          );
        } else {
          // Same active trip; ensure not stuck in loading
          setState(prev => ({ ...prev, loading: false }));
        }
      },
      (err) => {
        console.error("[Parent] Active trip query listener error:", err);
        setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
      }
    );
  
    return () => {
      cancelled = true;
      unsubActiveTrip?.();
      cleanupTripSubs();
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

    switch (state.passenger.status) {
      case "boarded":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
            <Bus className="mr-1 h-3 w-3" />
            On Bus
          </Badge>
        );
      case "dropped":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="mr-1 h-3 w-3" />
            Dropped Off
          </Badge>
        );
      case "absent":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Marked Absent
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Footprints className="mr-1 h-3 w-3" />
            Awaiting Check-in
          </Badge>
        );
    }
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
    const s = state.passenger?.status;
    if (s === "dropped") return "Dropped ";
    if (s === "boarded") return "Boarded ";
    if (s === "absent") return "Marked ";
    return "Updated ";
  }, [state.passenger?.status]);

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
            <StudentCard key={s.id} student={s} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
