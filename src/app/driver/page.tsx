
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  setDoc,
  Timestamp,
  limit,
  orderBy,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { useToast } from "@/hooks/use-toast";
import { registerFcmToken } from "@/lib/notifications";
import { seedPassengersForTrip } from "@/lib/roster";
import { getRouteById, startOfToday, getSchoolUsersByIds } from "@/lib/firestoreQueries";
import { sdoc, scol } from "@/lib/schoolPath";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Bus,
  Route as RouteIcon,
  PlayCircle,
  StopCircle,
  Info,
  AlertTriangle,
  Send,
  Users,
  UserCheck,
  Eye,
  User,
  Map as MapIcon,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Roster } from "@/app/supervisor/trips/[id]/TripRoster";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/* -------------------- Types -------------------- */

interface BusDoc extends DocumentData {
  id: string;
  busCode: string;
  plate?: string;
  assignedRouteId?: string;
  supervisorId?: string | null;
  schoolId: string;
}

interface RouteInfo extends DocumentData {
  id: string;
  name: string;
  schoolId: string;
}

interface Trip extends DocumentData {
  id: string;
  busId: string;
  routeId: string;
  driverId: string;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  status: "active" | "ended";
  supervisorId?: string | null;
  allowDriverAsSupervisor?: boolean;
  driverSupervisionLocked?: boolean;
  schoolId: string;
  passengers: string[];
  counts?: {
    pending: number;
    boarded: number;
    absent: number;
    dropped: number;
  };
}

interface Supervisor extends DocumentData {
  id: string;
  displayName?: string;
  email?: string;
}

type UiState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "empty" }
  | { status: "error"; errorMessage: string };

/* -------------------- Skeleton -------------------- */

function LoadingState() {
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
      <CardFooter>
        <Skeleton className="h-10 w-24" />
      </CardFooter>
    </Card>
  );
}

/* -------------------- Page -------------------- */

export default function DriverPage() {
  const { user, profile, loading: profileLoading } = useProfile();
  const { toast } = useToast();

  const [bus, setBus] = useState<BusDoc | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [uiState, setUiState] = useState<UiState>({ status: "loading" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Register FCM token
  useEffect(() => {
    if (user?.uid && profile?.schoolId) {
      registerFcmToken(user.uid, profile.schoolId).catch(() => {});
    }
  }, [user?.uid, profile?.schoolId]);

  const fetchData = useCallback(async () => {
    if (!user || !profile) {
      console.log("[DriverPage] fetchData: Missing user or profile", { user: !!user, profile: !!profile });
      return;
    }
    
    console.log("[DriverPage] fetchData: Starting with", {
      userId: user.uid,
      userEmail: user.email,
      profileRole: profile.role,
      schoolId: profile.schoolId
    });
    
    setUiState({ status: "loading" });

    try {
      // 1) Find the bus assigned to this driver (scoped to school)
      console.log("[DriverPage] Step 1: Querying buses for driver", user.uid, "in school", profile.schoolId);
      const busQ = query(
        collection(db, "schools", profile.schoolId, "buses"),
        where("driverId", "==", user.uid),
        limit(1)
      );
      const busSnap = await getDocs(busQ);
      console.log("[DriverPage] Step 1 complete: Found", busSnap.size, "buses");

      if (busSnap.empty) {
        console.log("[DriverPage] No buses found for driver, setting empty state");
        setBus(null);
        setRoute(null);
        setSupervisor(null);
        setActiveTrip(null);
        setUiState({ status: "empty" });
        return;
      }
      const foundBus = {
        id: busSnap.docs[0].id,
        ...busSnap.docs[0].data(),
      } as BusDoc;
      setBus(foundBus);
      console.log("[DriverPage] Found bus:", { id: foundBus.id, busCode: foundBus.busCode });

      // 2) Fetch today's trips for this driver (scoped to school)
      console.log("[DriverPage] Step 2: Querying trips for driver", user.uid, "since", startOfToday());
      const tripsQ = query(
        collection(db, "schools", profile.schoolId, "trips"),
        where("driverId", "==", user.uid),
        where("startedAt", ">=", startOfToday()),
        orderBy("startedAt", "desc")
      );
      const tripsSnap = await getDocs(tripsQ);
      console.log("[DriverPage] Step 2 complete: Found", tripsSnap.size, "trips");
      
      const todaysTrips = tripsSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Trip)
      );
      const foundTrip =
        todaysTrips.find(t => String(t.status || "").toLowerCase() === "active")
        ?? todaysTrips.find(t => !t.endedAt)
        ?? null;
      setActiveTrip(foundTrip);
      console.log("[DriverPage] Active trip:", foundTrip ? { id: foundTrip.id, status: foundTrip.status } : "none");

      // 3) Related route + supervisor (parallel). Both must be school-scoped.
      console.log("[DriverPage] Step 3: Fetching route and supervisor data");
      const [routeData, supervisorData] = await Promise.all([
        foundBus.assignedRouteId
          ? getRouteById(profile.schoolId, foundBus.assignedRouteId)
          : Promise.resolve(null),
        foundBus.supervisorId
          ? getDoc(sdoc(profile.schoolId, "users", foundBus.supervisorId))
          : Promise.resolve(null),
      ]);
      console.log("[DriverPage] Step 3 complete: Route data:", !!routeData, "Supervisor data:", !!supervisorData);

      setRoute(routeData ? (routeData as RouteInfo) : null);
      setSupervisor(
        supervisorData && supervisorData.exists()
          ? ({ id: foundBus.supervisorId, ...supervisorData.data() } as Supervisor)
          : null
      );

      console.log("[DriverPage] fetchData completed successfully");
      setUiState({ status: "ready" });
    } catch (e: any) {
      console.error("[DriverPage] Fetch data error:", e);
      console.error("[DriverPage] Error details:", {
        code: e.code,
        message: e.message,
        stack: e.stack
      });
      setUiState({
        status: "error",
        errorMessage: e.message || "Could not load your assignment.",
      });
    }
  }, [user, profile]);

  useEffect(() => {
    if (!profileLoading && user && profile) {
      fetchData();
    }
  }, [profileLoading, user, profile, fetchData]);
  
  const handleSendLocation = useCallback((isAuto: boolean = false) => {
    if (!activeTrip || !profile) {
      if (!isAuto) {
         toast({
            variant: "destructive",
            title: "No Active Trip",
            description: "You must start a trip to send your location.",
         });
      }
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const tripRef = doc(db, "schools", profile.schoolId, "trips", activeTrip.id);
          console.log("Updating trip location at path:", `schools/${profile.schoolId}/trips/${activeTrip.id}`);
          
          await updateDoc(tripRef, {
            currentLocation: {
              lat: latitude,
              lng: longitude,
              timestamp: serverTimestamp(),
            },
          });
          if (!isAuto) {
              toast({
                title: "Location Sent!",
                description: `Coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
                className: "bg-accent text-accent-foreground border-0",
              });
          }
        } catch (error) {
           toast({
            variant: "destructive",
            title: "Failed to Send Location",
            description: (error as Error).message,
          });
        }
      },
      (error) => {
        if (!isAuto) {
            toast({
              variant: "destructive",
              title: "Geolocation Error",
              description: error.message,
            });
        }
      },
      { enableHighAccuracy: true }
    );
  }, [activeTrip, profile, toast]);

  // Effect to manage automatic location sending
  useEffect(() => {
    if (activeTrip?.status === 'active') {
      // Start the interval
      locationIntervalRef.current = setInterval(() => {
        handleSendLocation(true); // `true` for automatic, silent update
      }, 60000); // 60 seconds

      // Send one immediate location update on trip start
      handleSendLocation(true);
    }

    // Cleanup function: this runs when the trip ends or component unmounts
    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    };
  }, [activeTrip, handleSendLocation]);

  /* -------------------- Actions -------------------- */

  const handleSetActingAsSupervisor = async (acting: boolean) => {
    if (!user?.uid || !profile?.schoolId) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: "Missing user ID or school ID",
      });
      return;
    }
    
    try {
      const ref = doc(db, "schools", profile.schoolId, "users", user.uid);
      await setDoc(ref, { supervisorMode: acting }, { merge: true });
      toast({
        title: `Supervisor mode ${acting ? "enabled" : "disabled"}.`,
        className: "bg-accent text-accent-foreground border-0",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: e.message,
      });
    }
  };

  const handleStartTrip = async () => {
    if (!user || !profile || !bus) return;
    setIsSubmitting(true);

    try {
        const seedOptions = {
            schoolId: profile.schoolId,
            routeId: route?.id || null,
            busId: bus.id,
        };

        // First, get the count of passengers to be seeded.
        const { passengerData } = await seedPassengersForTrip({ ...seedOptions, mode: 'count' });
        const initialPendingCount = passengerData.length;
        const passengerIds = passengerData.map(p => p.id);

        const newTripData: Omit<Trip, "id"> = {
            driverId: user.uid,
            busId: bus.id,
            routeId: route?.id || "",
            schoolId: profile.schoolId,
            startedAt: Timestamp.now(),
            status: "active",
            supervisorId: bus.supervisorId || null,
            allowDriverAsSupervisor: false,
            driverSupervisionLocked: false,
            passengers: passengerIds,
            counts: { 
                pending: initialPendingCount, 
                boarded: 0, 
                absent: 0, 
                dropped: 0 
            },
        };

        const docRef = await addDoc(scol(profile.schoolId, "trips"), newTripData);
        const finalTrip = { id: docRef.id, ...newTripData } as Trip;
        setActiveTrip(finalTrip);

        toast({
            title: "Trip Started!",
            description: "Your trip is now active.",
            className: "bg-accent text-accent-foreground border-0",
        });

        // Now, seed the roster for real.
        if (initialPendingCount > 0) {
            await seedPassengersForTrip({ 
                ...seedOptions, 
                tripId: finalTrip.id,
                mode: 'write', 
                passengerData 
            });
             toast({
                title: "Roster Ready!",
                description: `${initialPendingCount} passengers have been added to your roster.`,
                className: "bg-accent text-accent-foreground border-0",
            });
        } else {
             toast({
                title: "Empty Roster",
                description: "No students are assigned to this route or bus.",
            });
        }
      
    } catch (error) {
        console.error("[start trip]", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not start a new trip.",
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleEndTrip = async () => {
    if (!activeTrip || !profile) return;
    setIsSubmitting(true);
    try {
      await updateDoc(sdoc(profile.schoolId, "trips", activeTrip.id), {
        endedAt: Timestamp.now(),
        status: "ended",
      });
      setActiveTrip(null);
    } catch (error) {
      console.error("[end trip]", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not end the trip.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };


  /* -------------------- UI helpers -------------------- */

  const getSupervisorContent = () => {
    const supervisorLabel = supervisor?.displayName || supervisor?.email || bus?.supervisorId || "No supervisor assigned";
    
    const effectiveSupervise = !!(
      activeTrip?.supervisorId === user?.uid ||
      profile?.supervisorMode === true ||
      activeTrip?.allowDriverAsSupervisor === true
    );
    
    if (effectiveSupervise) {
      return (
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">You are acting as supervisor</h3>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2">
        <Eye className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold">Your Supervisor</h3>
          <p className="pl-0">{supervisorLabel}</p>
        </div>
      </div>
    );
  };

  /* -------------------- Render -------------------- */

  if (profileLoading || uiState.status === "loading") return <LoadingState />;

  if (uiState.status === "error") {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Error Loading Data</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not load your assignment</AlertTitle>
            <AlertDescription>{uiState.errorMessage}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (uiState.status === "empty") {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>No Assignment Found</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>No Assigned Bus</AlertTitle>
            <AlertDescription>
              You have not been assigned to a bus yet. Please contact your
              administrator.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Driver Dashboard</h1>
        <Link href="/driver/profile">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            My Profile
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      <div className="lg:col-span-2 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Welcome, {profile?.displayName || "Driver"}!</CardTitle>
            <CardDescription>Here is your assignment for today.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border p-4 rounded-lg space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Bus className="h-5 w-5 text-primary" /> Your Bus
              </h3>
              <p className="pl-7">
                <strong>Code:</strong> {bus?.busCode}
              </p>
              {bus?.plate && (
                <p className="pl-7">
                  <strong>Plate:</strong> {bus.plate}
                </p>
              )}
            </div>

            <div className="border p-4 rounded-lg space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <RouteIcon className="h-5 w-5 text-primary" /> Your Route
              </h3>
              {route ? (
                <p className="pl-7">
                  <strong>Name:</strong> {route.name}
                </p>
              ) : (
                <p className="pl-7 text-muted-foreground">No route assigned.</p>
              )}
            </div>

            {activeTrip && (
              <div className="border p-4 rounded-lg space-y-2">
                {getSupervisorContent()}
              </div>
            )}

            {activeTrip && (
              <Alert variant="default" className="bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 !text-blue-700" />
                <AlertTitle className="text-blue-800">Trip in Progress</AlertTitle>
                <AlertDescription className="text-blue-700">
                  Started at: {format(activeTrip.startedAt.toDate(), "HH:mm")}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-2">
            {activeTrip ? (
              <>
                <Button
                  onClick={handleEndTrip}
                  disabled={isSubmitting}
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                >
                  <StopCircle className="mr-2" />
                  {isSubmitting ? "Ending Trip..." : "End Trip"}
                </Button>
                <div className="flex gap-2 w-full">
                  <Button
                    onClick={() => handleSendLocation(false)}
                    className="flex-1"
                    variant="outline"
                  >
                    <Send className="mr-2" />
                    Send Location
                  </Button>
                  <Link href="/driver/route" className="flex-1">
                    <Button className="w-full" variant="outline">
                      <MapIcon className="mr-2" />
                      Route Map
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <Button
                onClick={handleStartTrip}
                disabled={isSubmitting || !bus}
                className="w-full"
              >
                <PlayCircle className="mr-2" />
                {isSubmitting ? "Starting Trip..." : "Start Trip"}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      {activeTrip && profile && (
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Trip Roster
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="driver-supervisor-mode"
                  checked={!!profile?.supervisorMode}
                  onCheckedChange={handleSetActingAsSupervisor}
                  disabled={activeTrip.driverSupervisionLocked}
                />
                <Label htmlFor="driver-supervisor-mode">Supervise</Label>
              </div>
            </CardTitle>
            <CardDescription>
              Manage student check-ins and check-outs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Roster
              tripId={activeTrip.id}
              schoolId={profile.schoolId}
              canEdit={!!activeTrip.allowDriverAsSupervisor}
            />
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
