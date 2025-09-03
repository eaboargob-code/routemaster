
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
  DocumentData,
  Timestamp,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { registerFcmToken } from "@/lib/notifications";

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
import { formatRelative } from "@/lib/utils";

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

interface TripLocation {
  lastLocation?: {
    at?: Timestamp;
  }
}

/* -------------------- Child card -------------------- */

function StudentCard({ student: initialStudent }: { student: Student }) {
  const [tripStatus, setTripStatus] = useState<TripPassenger | null>(null);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<Timestamp | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubPassenger: (() => void) | undefined;
    let unsubTrip: (() => void) | undefined;

    const findTripAndListen = async () => {
      setIsLoading(true);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const tripsQuery = query(
        collection(db, "trips"),
        where("schoolId", "==", initialStudent.schoolId),
        where("passengers", "array-contains", initialStudent.id),
        where("startedAt", ">=", Timestamp.fromDate(startOfDay)),
        orderBy("startedAt", "desc"),
        limit(1)
      );

      try {
        const tripsSnapshot = await getDocs(tripsQuery);
        const tripDoc = tripsSnapshot.docs[0];

        if (tripDoc) {
          const tripId = tripDoc.id;
          const tripData = tripDoc.data() as TripLocation;

          // Set initial location data
          setLastLocationUpdate(tripData.lastLocation?.at ?? null);
          
          // Listen to passenger status
          const passengerRef = doc(db, "trips", tripId, "passengers", initialStudent.id);
          console.log(`[PARENT-LISTEN] Attaching listener to trips/${tripId}/passengers/${initialStudent.id}`);
          unsubPassenger = onSnapshot(passengerRef, 
            (snap) => {
              console.log(`[PARENT-UPDATE] Got update for trips/${tripId}/passengers/${initialStudent.id}`);
              setTripStatus(snap.exists() ? (snap.data() as TripPassenger) : null);
            },
            (err) => console.error(`[PARENT-LISTEN ERROR] passenger ${initialStudent.id}`, err)
          );

          // Listen to trip for location updates
          const tripRef = doc(db, "trips", tripId);
           console.log(`[PARENT-LISTEN] Attaching listener to trips/${tripId}`);
          unsubTrip = onSnapshot(tripRef, 
            (snap) => {
               console.log(`[PARENT-UPDATE] Got update for trips/${tripId}`);
               const t = snap.data() as TripLocation;
               setLastLocationUpdate(t.lastLocation?.at ?? null);
            },
            (err) => console.error(`[PARENT-LISTEN ERROR] trip ${tripId}`, err)
          );

        } else {
          setTripStatus(null);
          setLastLocationUpdate(null);
        }
      } catch (error) {
         console.error(`Error querying trips for student "${initialStudent.id}"`, error);
         setTripStatus(null);
         setLastLocationUpdate(null);
      } finally {
        setIsLoading(false);
      }
    };

    findTripAndListen();

    return () => {
      if (unsubPassenger) {
        console.log(`[PARENT-UNSUB] Detaching listener from passenger ${initialStudent.id}`);
        unsubPassenger();
      }
       if (unsubTrip) {
        console.log(`[PARENT-UNSUB] Detaching listener from trip`);
        unsubTrip();
      }
    };
  }, [initialStudent.id, initialStudent.schoolId]);

  const getStatusBadge = () => {
    if (isLoading) return <Skeleton className="h-6 w-24" />;

    if (!tripStatus) {
      return (
        <Badge variant="outline">
          <HelpCircle className="mr-1 h-3 w-3" />
          No trip data
        </Badge>
      );
    }

    switch (tripStatus.status) {
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
          <CardTitle>{initialStudent.name}</CardTitle>
          <CardDescription className="flex flex-col gap-1 mt-2">
            {initialStudent.busCode && (
              <span className="flex items-center gap-2">
                <Bus className="h-4 w-4" /> {initialStudent.busCode}
              </span>
            )}
            {initialStudent.routeName && (
              <span className="flex items-center gap-2">
                <RouteIcon className="h-4 w-4" /> {initialStudent.routeName}
              </span>
            )}
          </CardDescription>
        </div>
        {getStatusBadge()}
      </CardHeader>
      <CardContent>
        {lastLocationUpdate && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>
              Last bus location update:{" "}
              {format(lastLocationUpdate.toDate(), "p")}
            </span>
          </div>
        )}
        {tripStatus?.status === 'dropped' &&
          tripStatus.droppedAt && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>
                Dropped off at:{" "}
                {formatRelative(tripStatus.droppedAt)}
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

        const studentIds: string[] =
          (linkDocSnap.exists() && (linkDocSnap.data().studentIds as string[])) ||
          [];

        if (studentIds.length === 0) {
          setChildren([]);
          setIsLoading(false);
          return;
        }

        // 2) Fetch the specific student docs by ID.
        // Firestore's 'in' query is limited to 30 items per query.
        const CHUNK_SIZE = 30;
        const studentData: Student[] = [];
        for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
            const chunk = studentIds.slice(i, i + CHUNK_SIZE);
            if (chunk.length === 0) continue;
            
            const studentsSnapshot = await getDocs(query(
                collection(db, "students"), 
                where("__name__", "in", chunk))
            );

            const chunkData = studentsSnapshot.docs
              .map((d) => ({ id: d.id, ...(d.data() as any) }))
              .filter((s) => s.schoolId === profile.schoolId) as Student[];
            studentData.push(...chunkData);
        }

        setChildren(studentData);
      } catch (e: any) {
        console.error("Failed to fetch parent data:", e);
        setError(e.message || "An unknown error occurred.");
      } finally {
        setIsLoading(false);
      }
    };

    if (!profileLoading && profile) { // Wait for profile to be loaded
        fetchChildrenData();
    }
  }, [user, profile, profileLoading]);

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
