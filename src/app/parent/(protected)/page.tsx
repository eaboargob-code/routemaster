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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  MapPin,
  Link,
  AlertCircle,
  Edit,
  Save,
  X,
  User,
  AlertTriangle,
} from "lucide-react";
import { Notification } from "./layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { updateDoc } from "firebase/firestore";
import { parseLocationLink, formatCoordinates, type LocationCoordinates } from "@/lib/locationParser";

/* ---------------- types ---------------- */

type Student = {
  id: string;
  name: string;
  schoolId: string;
  assignedRouteId?: string;
  assignedBusId?: string;
  routeName?: string;
  busCode?: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  // Bus details with driver/supervisor info
  busDetails?: {
    driverId?: string | null;
    supervisorId?: string | null;
    driverName?: string;
    supervisorName?: string;
    driverPhotoUrl?: string;
    supervisorPhotoUrl?: string;
    driverPhoneNumber?: string;
    supervisorPhoneNumber?: string;
  };
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

/* --------------- pickup location manager --------------- */

function PickupLocationManager({ student }: { student: Student }) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [locationLink, setLocationLink] = useState("");
  const [pickupLat, setPickupLat] = useState(student.pickupLat?.toString() || "");
  const [pickupLng, setPickupLng] = useState(student.pickupLng?.toString() || "");
  const [locationParseResult, setLocationParseResult] = useState<{ success: boolean; coordinates?: LocationCoordinates; error?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleLocationLinkChange = (value: string) => {
    setLocationLink(value);
    
    if (!value.trim()) {
      setLocationParseResult(null);
      return;
    }

    const result = parseLocationLink(value);
    setLocationParseResult(result);

    if (result.success && result.coordinates) {
      setPickupLat(result.coordinates.latitude.toString());
      setPickupLng(result.coordinates.longitude.toString());
      
      toast({
        title: "Location Parsed Successfully!",
        description: `Coordinates: ${formatCoordinates(result.coordinates)}`,
        className: 'bg-accent text-accent-foreground border-0',
      });
    }
  };

  const handleSave = async () => {
    if (!pickupLat || !pickupLng) {
      toast({
        variant: "destructive",
        title: "Invalid Location",
        description: "Please provide both latitude and longitude.",
      });
      return;
    }

    const lat = parseFloat(pickupLat);
    const lng = parseFloat(pickupLng);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast({
        variant: "destructive",
        title: "Invalid Coordinates",
        description: "Please provide valid latitude (-90 to 90) and longitude (-180 to 180).",
      });
      return;
    }

    setIsSaving(true);
    try {
      const studentRef = sdoc(student.schoolId, "students", student.id);
      await updateDoc(studentRef, {
        pickupLat: lat,
        pickupLng: lng,
      });

      // Update local state
      student.pickupLat = lat;
      student.pickupLng = lng;

      toast({
        title: "Pickup Location Updated!",
        description: "Your child's pickup location has been saved successfully.",
        className: 'bg-accent text-accent-foreground border-0',
      });

      setIsEditing(false);
      setLocationLink("");
      setLocationParseResult(null);
    } catch (error) {
      console.error("Error updating pickup location:", error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Failed to update pickup location. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setLocationLink("");
    setPickupLat(student.pickupLat?.toString() || "");
    setPickupLng(student.pickupLng?.toString() || "");
    setLocationParseResult(null);
  };

  const hasLocation = student.pickupLat != null && student.pickupLng != null;

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Pickup Location
        </h4>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="h-7 gap-1"
          >
            <Edit className="h-3 w-3" />
            {hasLocation ? "Edit" : "Set"}
          </Button>
        )}
      </div>

      {!hasLocation && !isEditing && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-800">Pickup Location Required</AlertTitle>
          <AlertDescription className="text-orange-700">
            Please set your child's pickup location for route optimization to work properly. 
            This helps the school plan the most efficient bus routes.
          </AlertDescription>
        </Alert>
      )}

      {!isEditing ? (
        <div className="text-sm text-muted-foreground">
          {hasLocation ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>{student.pickupLat!.toFixed(4)}, {student.pickupLng!.toFixed(4)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-orange-500" />
              <span>Not set</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h5 className="text-sm font-medium text-blue-800 mb-2">How to set pickup location:</h5>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
              <li>Open Google Maps on your phone</li>
              <li>Find your home or preferred pickup location</li>
              <li>Tap and hold on the location to drop a pin</li>
              <li>Tap "Share" and copy the link</li>
              <li>Paste the link below, or enter coordinates manually</li>
            </ol>
          </div>

          {/* Location Link Input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Import from WhatsApp/Google Maps Link
            </label>
            <div className="relative">
              <Link className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Paste location link here..."
                value={locationLink}
                onChange={(e) => handleLocationLinkChange(e.target.value)}
                className="pl-7 text-xs"
                size="sm"
              />
              {locationParseResult && (
                <div className="absolute right-2 top-2.5">
                  {locationParseResult.success ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-red-500" />
                  )}
                </div>
              )}
            </div>
            {locationParseResult && !locationParseResult.success && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="h-2 w-2" />
                {locationParseResult.error}
              </p>
            )}
          </div>

          {/* Manual Coordinate Input */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Latitude</label>
              <Input
                type="number"
                step="any"
                placeholder="e.g., 32.8853"
                value={pickupLat}
                onChange={(e) => setPickupLat(e.target.value)}
                className="text-xs"
                size="sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Longitude</label>
              <Input
                type="number"
                step="any"
                placeholder="e.g., 13.1802"
                value={pickupLng}
                onChange={(e) => setPickupLng(e.target.value)}
                className="text-xs"
                size="sm"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !pickupLat || !pickupLng}
              className="h-7 gap-1"
            >
              <Save className="h-3 w-3" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
              className="h-7 gap-1"
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

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
      <CardHeader className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex-1">
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
        <div className="flex-shrink-0">
          {derived.badge}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {!!derived.time && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>
              {derived.label}
              {formatRelative(derived.time)}
            </span>
          </div>
        )}

        {/* Driver and Supervisor Information */}
        {student.busDetails && (student.busDetails.driverId || student.busDetails.supervisorId) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Bus Staff</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {student.busDetails.driverId && (
                <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={student.busDetails.driverPhotoUrl} alt={student.busDetails.driverName} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Driver</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {student.busDetails.driverName || 'Unknown Driver'}
                    </div>
                    {student.busDetails.driverPhoneNumber && (
                      <div className="text-xs text-muted-foreground">
                        {student.busDetails.driverPhoneNumber}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {student.busDetails.supervisorId && (
                <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={student.busDetails.supervisorPhotoUrl} alt={student.busDetails.supervisorName} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Supervisor</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {student.busDetails.supervisorName || 'Unknown Supervisor'}
                    </div>
                    {student.busDetails.supervisorPhoneNumber && (
                      <div className="text-xs text-muted-foreground">
                        {student.busDetails.supervisorPhoneNumber}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        <PickupLocationManager student={student} />
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
        const students = studentsSnap.docs.map(
          (d) => ({ id: d.id, ...d.data(), schoolId: profile.schoolId } as Student)
        );

        // Fetch bus details for students with assigned buses
        const studentsWithBusDetails = await Promise.all(
          students.map(async (student) => {
            if (!student.assignedBusId) return student;

            try {
              // Fetch bus information
              const busRef = sdoc(profile.schoolId, "buses", student.assignedBusId);
              const busSnap = await getDoc(busRef);
              
              if (!busSnap.exists()) return student;
              
              const busData = busSnap.data();
              const driverId = busData.driverId;
              const supervisorId = busData.supervisorId;

              // Fetch driver and supervisor details
              const userPromises = [];
              if (driverId) {
                userPromises.push(getDoc(sdoc(profile.schoolId, "users", driverId)));
              }
              if (supervisorId) {
                userPromises.push(getDoc(sdoc(profile.schoolId, "users", supervisorId)));
              }

              const userSnaps = await Promise.all(userPromises);
              let driverData = null;
              let supervisorData = null;

              if (driverId && userSnaps[0]?.exists()) {
                driverData = userSnaps[0].data();
              }
              if (supervisorId) {
                const supervisorIndex = driverId ? 1 : 0;
                if (userSnaps[supervisorIndex]?.exists()) {
                  supervisorData = userSnaps[supervisorIndex].data();
                }
              }

              return {
                ...student,
                busDetails: {
                  driverId,
                  supervisorId,
                  driverName: driverData?.displayName || driverData?.email,
                  supervisorName: supervisorData?.displayName || supervisorData?.email,
                  driverPhotoUrl: driverData?.photoUrl,
                  supervisorPhotoUrl: supervisorData?.photoUrl,
                  driverPhoneNumber: driverData?.phoneNumber,
                  supervisorPhoneNumber: supervisorData?.phoneNumber,
                }
              };
            } catch (error) {
              console.error(`Error fetching bus details for student ${student.id}:`, error);
              return student;
            }
          })
        );

        setStudents(studentsWithBusDetails);
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

  // Check for students without pickup locations
  const studentsWithoutPickup = students.filter(student => 
    student.pickupLat == null || student.pickupLng == null
  );

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

      {/* Global Pickup Location Warning */}
      {studentsWithoutPickup.length > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-800">Pickup Locations Required</AlertTitle>
          <AlertDescription className="text-orange-700">
            {studentsWithoutPickup.length === 1 ? (
              <>
                <strong>{studentsWithoutPickup[0].name}</strong> needs a pickup location set for route optimization to work properly.
              </>
            ) : (
              <>
                <strong>{studentsWithoutPickup.length} students</strong> need pickup locations set: {studentsWithoutPickup.map(s => s.name).join(", ")}.
              </>
            )}
            {" "}Please scroll down to set pickup locations for each student.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
