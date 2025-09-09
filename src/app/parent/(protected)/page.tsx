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
    let unsubTrip: (() => void) | null = null;
    let unsubPassenger: (() => void) | null = null;
    let cancelled = false;
  
    async function findAndSubscribeToTrip() {
      if (!student.schoolId || !student.id || cancelled) {
        setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
        return;
      }
      setState({ tripId: null, passenger: null, lastLocationAt: null, loading: true });
  
      // Query for the most recent trip containing the student today (active or ended)
      const tripsQuery = query(
        scol(student.schoolId, "trips"),
        where("passengers", "array-contains", student.id),
        where("startedAt", ">=", startOfToday()),
        orderBy("startedAt", "desc"),
        limit(1)
      );
  
      try {
        const tripSnap = await getDocs(tripsQuery);
        if (cancelled || tripSnap.empty) {
          setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
          return;
        }
  
        const tripDoc = tripSnap.docs[0];
        const tripId = tripDoc.id;
        const tripData = tripDoc.data();
  
        setState(prev => ({ ...prev, tripId, lastLocationAt: tripData.lastLocation?.at ?? null }));
  
        // Subscribe to Trip document for location updates and status changes
        const tripRef = sdoc(student.schoolId, "trips", tripId);
        unsubTrip = onSnapshot(tripRef, (t) => {
          if (cancelled) return;
          const data = t.data();
          console.log(`[Parent] Trip listener for ${tripId}:`, data);
          const lastAt = data?.lastLocation?.at ?? null;
          // Only update location, don't overwrite passenger state
          setState(prev => ({ ...prev, lastLocationAt: lastAt }));
        });
  
        // Subscribe to Passenger document for status changes
        const passengerRef = sdoc(student.schoolId, "trips", tripId, "passengers", student.id);
        unsubPassenger = onSnapshot(passengerRef, (p) => {
          if (cancelled) return;
          const passengerData = p.data() as TripPassenger | undefined;
          console.log(`[Parent] Passenger listener for ${student.id} in trip ${tripId}:`, passengerData);
          setState(prev => ({ ...prev, passenger: passengerData || null, loading: false }));
        }, (err) => {
          console.error(`[Parent] Passenger listener error for ${student.id}:`, err);
          if (!cancelled) setState(prev => ({ ...prev, loading: false }));
        });
  
      } catch (err) {
        console.error(`[Parent] Error finding trip for student ${student.id}:`, err);
        if (!cancelled) {
          setState({ tripId: null, passenger: null, lastLocationAt: null, loading: false });
        }
      }
    }
  
    findAndSubscribeToTrip();
  
    return () => {
      cancelled = true;
      unsubTrip?.();
      unsubPassenger?.();
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
