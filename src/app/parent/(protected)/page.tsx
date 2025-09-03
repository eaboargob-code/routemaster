
"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/lib/useProfile";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  documentId,
  DocumentData,
  Timestamp,
  orderBy,
  limit,
} from "firebase/firestore";
import { registerFcmToken } from "@/lib/notifications";
import { listenWithPath } from "@/lib/firestore-helpers";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

/* -------------------- Types -------------------- */

interface Student {
  id: string;
  name: string;
  assignedRouteId?: string;
  assignedBusId?: string;
  routeName?: string;
  busCode?: string;
  schoolId: string;
}

interface TripPassenger {
  status: "boarded" | "absent" | "dropped" | "pending";
  boardedAt?: Timestamp;
  droppedAt?: Timestamp;
}

interface ChildStatus extends Student {
  tripStatus?: TripPassenger | null;
  lastLocationUpdate?: Timestamp | null;
}

/* -------------------- Child card -------------------- */

function StudentCard({ student: initialStudent }: { student: Student }) {
  const [status, setStatus] = useState<ChildStatus>({
    ...initialStudent,
    tripStatus: null,
    lastLocationUpdate: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let stopTrips: (() => void) | undefined;
    let stopPassenger: (() => void) | undefined;
    let stopTripDoc: (() => void) | undefined;

    const startListening = async () => {
      setIsLoading(true);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const tripsQ = query(
        collection(db, "trips"),
        where("schoolId", "==", initialStudent.schoolId),
        where("passengers", "array-contains", initialStudent.id),
        where("startedAt", ">=", Timestamp.fromDate(startOfDay)),
        orderBy("startedAt", "desc"),
        limit(1)
      );

      stopTrips = listenWithPath(tripsQ, `trips for student ${initialStudent.id}`, (ts) => {
        // Clean up old listeners before starting new ones
        stopPassenger?.();
        stopTripDoc?.();

        if (ts.empty) {
          setStatus((prev) => ({ ...prev, tripStatus: null, lastLocationUpdate: null }));
          setIsLoading(false);
          return;
        }

        const tripDoc = ts.docs[0];
        const tripId = tripDoc.id;

        // 1) Passenger listener
        const passengerRef = doc(db, "trips", tripId, "passengers", initialStudent.id);
        stopPassenger = listenWithPath(passengerRef, `trips/${tripId}/passengers/${initialStudent.id}`, (snap) => {
            const p = snap.exists() ? (snap.data() as TripPassenger) : null;
            setStatus((prev) => ({ ...prev, tripStatus: p }));
          }
        );

        // 2) Trip doc listener (for lastLocation)
        const tripRef = doc(db, "trips", tripId);
        stopTripDoc = listenWithPath(tripRef, `trips/${tripId}`, (snap) => {
            const t = snap.data();
            setStatus((prev) => ({ ...prev, lastLocationUpdate: t?.lastLocation?.at ?? null }));
          }
        );
        setIsLoading(false);
      });
    };

    startListening();

    return () => {
      stopTrips?.();
      stopPassenger?.();
      stopTripDoc?.();
    };
  }, [initialStudent.id, initialStudent.schoolId]);

  const getStatusBadge = () => {
    if (isLoading) return <Skeleton className="h-6 w-24" />;

    if (!status.tripStatus) {
      return (
        <Badge variant="outline">
          <HelpCircle className="mr-1 h-3 w-3" />
          No trip data
        </Badge>
      );
    }

    switch (status.tripStatus.status) {
      case "boarded":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
            <Bus className="mr-1 h-3 w-3" /> On Bus
          </Badge>
        );
      case "dropped":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="mr-1 h-3 w-3" /> Dropped Off
          </Badge>
        );
      case "absent":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" /> Marked Absent
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge variant="secondary">
            <Footprints className="mr-1 h-3 w-3" /> Awaiting Check-in
          </Badge>
        );
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>{status.name}</CardTitle>
          <CardDescription className="flex flex-col gap-1 mt-2">
            {status.busCode && (
              <span className="flex items-center gap-2">
                <Bus className="h-4 w-4" /> {status.busCode}
              </span>
            )}
            {status.routeName && (
              <span className="flex items-center gap-2">
                <RouteIcon className="h-4 w-4" /> {status.routeName}
              </span>
            )}
          </CardDescription>
        </div>
        {getStatusBadge()}
      </CardHeader>
      <CardContent>
        {status.lastLocationUpdate && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>
              Last bus location update:{" "}
              {format(status.lastLocationUpdate.toDate(), "p")}
            </span>
          </div>
        )}
        {status.tripStatus?.status === "dropped" &&
          status.tripStatus.droppedAt && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>
                Dropped off at:{" "}
                {format(status.tripStatus.droppedAt.toDate(), "p")}
              </span>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

/* -------------------- Loading skeleton -------------------- */

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

/* -------------------- Page -------------------- */

export default function ParentDashboardPage() {
  const { user, profile, loading: profileLoading } = useProfile();
  const [children, setChildren] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Register parent FCM token on mount/login
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const t = await registerFcmToken(user.uid);
      console.log("FCM token (parent):", t);
    })();
  }, [user?.uid]);
  
  // Load children
  useEffect(() => {
    const fetchChildrenData = async () => {
      if (!user || !profile) return;
      setIsLoading(true);
      setError(null);

      try {
        // 1) parentStudents/{parentUid}
        const parentLinkRef = doc(db, "parentStudents", user.uid);
        const linkDocSnap = await getDoc(parentLinkRef);

        const linkedIds: string[] =
          (linkDocSnap.exists() && (linkDocSnap.data().studentIds as string[])) ||
          [];

        if (linkedIds.length === 0) {
          setChildren([]);
          setIsLoading(false);
          return;
        }

        // 2) Fetch the specific student docs by ID.
        const studentsQuery = query(
          collection(db, "students"),
          where(documentId(), "in", linkedIds)
        );
        const studentsSnapshot = await getDocs(studentsQuery);

        const studentData = studentsSnapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((s) => s.schoolId === profile.schoolId) as Student[];

        setChildren(studentData);
      } catch (e: any) {
        console.error("Failed to fetch parent data:", e);
        setError(e.message || "An unknown error occurred.");
      } finally {
        setIsLoading(false);
      }
    };

    if (profile) { // Wait for profile to be loaded
        fetchChildrenData();
    }
  }, [user, profile]);

  if (isLoading || profileLoading) return <LoadingState />;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Parent Dashboard</CardTitle>
          <CardDescription>
            Welcome, {profile?.displayName || "Parent"}. Real-time status for your
            children.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> My Children
          </h2>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {children.length === 0 && !error && (
            <div className="mt-4 border rounded-lg p-8 text-center text-muted-foreground">
              <Frown className="mx-auto h-12 w-12" />
              <p className="mt-4 font-semibold">No Children Found</p>
              <p>
                No students are currently linked to your account. Please contact
                the school administrator.
              </p>
            </div>
          )}

          {children.map((child) => (
            <StudentCard key={child.id} student={child} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
