
"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/lib/useProfile";
import {
  query,
  where,
  getDocs,
  getDoc,
  onSnapshot,
  limit,
  orderBy,
  type DocumentData,
  Timestamp,
} from "firebase/firestore";
import { scol, sdoc } from "@/lib/schoolPath";
import { startOfToday } from "@/lib/firestoreQueries";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Users,
  Frown,
  Bus,
  Route as RouteIcon,
  Clock,
  UserX,
  ArrowDownCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { relativeFrom } from "@/lib/datetime";

/* ---------------- types ---------------- */

type Student = {
  id: string;
  name: string;
  schoolId: string;
  busCode?: string;
  routeName?: string;
};

type TripPassenger = {
  status: "pending" | "boarded" | "dropped" | "absent";
  boardedAt?: Timestamp | null;
  droppedAt?: Timestamp | null;
};

type CardState = {
  tripId: string | null;
  passenger: TripPassenger | null;
  lastLocationAt: Timestamp | null;
  loading: boolean;
};


/* --------------- child card --------------- */

function StudentCard({ student }: { student: Student }) {
  const [state, setState] = useState<CardState>({
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

        if (qsnap.empty) {
          currentTripId = null;
          cleanupTripSubs();
          setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
          return;
        }

        const doc0 = qsnap.docs[0];
        const tripId = doc0.id;

        if (tripId !== currentTripId) {
          currentTripId = tripId;
          cleanupTripSubs();
          setState(prev => ({ ...prev, tripId, loading: true }));

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
                cleanupTripSubs();
                setState(prev => ({ ...prev, tripId: null, passenger: null, loading: false }));
              }
            },
            (err) => console.error(`[Parent] Trip listener ${tripId} error:`, err)
          );

          const primaryPassRef = sdoc(student.schoolId, "trips", tripId, "passengers", student.id);
          unsubPassengerDoc = onSnapshot(
            primaryPassRef,
            async (p) => {
              if (cancelled) return;
              if (p.exists()) {
                setState(prev => ({ ...prev, passenger: p.data() as TripPassenger, loading: false }));
                return;
              }

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
              console.error(`[Parent] Passenger listener (${student.id}) error:`, err);
              setState(prev => ({ ...prev, passenger: null, loading: false }));
            }
          );
        } else {
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

  const { passenger, loading, tripId, lastLocationAt } = state;
  const status = passenger?.status;
  const timeLabel = status === 'boarded' ? 'Boarded' : (status === 'dropped' ? 'Dropped' : 'Last update');
  const primaryTime = status === 'boarded' ? passenger?.boardedAt : (status === 'dropped' ? passenger?.droppedAt : lastLocationAt);

  const statusBadge = useMemo(() => {
    if (loading) {
      return <Badge variant="outline">Loading Status...</Badge>;
    }
    if (!tripId || !passenger) {
      return <Badge variant="secondary">No active trip</Badge>;
    }
    switch (passenger.status) {
      case 'boarded':
        return <Badge className="bg-green-100 text-green-800 border-green-200">On Bus</Badge>;
      case 'dropped':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Dropped Off</Badge>;
      case 'absent':
        return <Badge variant="destructive">Marked Absent</Badge>;
      case 'pending':
      default:
        return <Badge variant="outline">Awaiting Check-in</Badge>;
    }
  }, [loading, tripId, passenger]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-start justify-between">
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
        </div>
      </CardHeader>
      {tripId && (
         <CardContent>
           <div className="text-sm text-muted-foreground flex items-center">
             <Clock className="h-4 w-4 mr-2"/> {timeLabel}: {relativeFrom(primaryTime)}
           </div>
         </CardContent>
      )}
    </Card>
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
        const linkRef = sdoc(profile.schoolId, "parentStudents", user.uid);
        const linkSnap = await getDoc(linkRef);
        const studentIds: string[] =
          (linkSnap.exists() && linkSnap.data().studentIds) || [];

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
          (d) =>
            ({
              id: d.id,
              ...d.data(),
              schoolId: profile.schoolId,
            } as Student)
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

  if (loading || profileLoading) {
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

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Parent Dashboard</CardTitle>
          <CardDescription>
            Welcome, {profile?.displayName || "Parent"}. Real-time status for
            your children will appear as notifications.
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
              <p>
                No students are currently linked to your account. Please contact
                the school administrator.
              </p>
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
