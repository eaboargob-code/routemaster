
"use client";

import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs, getDoc, doc, addDoc, updateDoc, Timestamp, limit, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProfile } from '@/lib/useProfile';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bus, Route, PlayCircle, StopCircle, Info, AlertTriangle, Send } from 'lucide-react';
import { format } from 'date-fns';

interface Bus {
    id: string;
    busCode: string;
    plate?: string;
    assignedRouteId?: string;
}

interface RouteInfo {
    id: string;
    name: string;
}

interface Trip {
    id: string;
    startedAt: Timestamp;
    endedAt?: Timestamp;
    status: 'active' | 'ended';
}

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
    )
}

export default function DriverPage() {
    const { user, profile, loading: profileLoading, error: profileError } = useProfile();
    const { toast } = useToast();

    const [bus, setBus] = useState<Bus | null>(null);
    const [route, setRoute] = useState<RouteInfo | null>(null);
    const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSendingLocation, setIsSendingLocation] = useState(false);
    
    const fetchData = useCallback(async () => {
        if (!user || !profile) return;

        // 1) Find bus
        let busDoc;
        try {
          const busQuery = query(
            collection(db, "buses"),
            where("driverId", "==", user.uid),
            where("schoolId", "==", profile.schoolId),
            limit(1)
          );
          const busSnap = await getDocs(busQuery);
          if (busSnap.empty) {
            setBus(null);
            setRoute(null);
            setActiveTrip(null);
            return;
          }
          busDoc = busSnap.docs[0];
          const busData = { id: busDoc.id, ...busDoc.data() } as Bus;
          setBus(busData);
        } catch (e) {
          console.error("[driver] failed bus query", e);
          toast({ variant: 'destructive', title: 'Error Loading Bus', description: (e as Error).message });
          throw e;
        }

        // 2) Load route (if any)
        try {
          const assigned = (busDoc.data() as any).assignedRouteId;
          if (assigned) {
            const routeRef = doc(db, "routes", assigned);
            const routeSnap = await getDoc(routeRef);
            if (routeSnap.exists()) {
              setRoute({ id: routeSnap.id, ...routeSnap.data() } as RouteInfo);
            } else {
              console.warn("[driver] route not found", assigned);
              setRoute(null);
            }
          } else {
            setRoute(null);
          }
        } catch (e) {
          console.error("[driver] failed route get", e);
          toast({ variant: 'destructive', title: 'Error Loading Route', description: (e as Error).message });
          throw e;
        }
        
        // 3) Check for an active trip for this driver (today)
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tripQuery = query(
              collection(db, "trips"),
              where("driverId", "==", user.uid),
              where("schoolId", "==", profile.schoolId),
              where("status", "==", "active"),
              where("startedAt", ">=", Timestamp.fromDate(today)),
              orderBy("startedAt", "desc"),
              limit(1)
            );

            const tripSnapshot = await getDocs(tripQuery);

            const active = tripSnapshot.docs[0];
            setActiveTrip(active ? ({ id: active.id, ...active.data() } as Trip) : null);

        } catch (e) {
          console.error("[driver] failed trips query", e);
          // don’t throw; we can still render bus/route
          toast({ variant: 'destructive', title: 'Error Loading Trips', description: 'Could not load active trip status.' });
        }
    }, [user, profile, toast]);

    useEffect(() => {
        if (!profileLoading && user && profile) {
            fetchData();
        }
    }, [profileLoading, user, profile, fetchData]);

    const handleStartTrip = async () => {
        if (!user || !profile || !bus) return;
        if (activeTrip) {
            toast({ variant: 'destructive', title: "Active trip exists", description: "You already have an active trip." });
            return;
        }

        setIsSubmitting(true);
        try {
            const newTrip = {
                driverId: user.uid,
                busId: bus.id,
                routeId: route?.id || null,
                schoolId: profile.schoolId,
                startedAt: Timestamp.now(),
                status: "active" as const,
            };
            const docRef = await addDoc(collection(db, "trips"), newTrip);
            setActiveTrip({ ...newTrip, id: docRef.id, startedAt: newTrip.startedAt });
            toast({ title: "Trip Started!", description: "Your trip is now active.", className: 'bg-accent text-accent-foreground border-0' });
        } catch (error) {
            console.error("[start trip]", error);
            toast({ variant: 'destructive', title: "Error", description: "Could not start a new trip." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEndTrip = async () => {
        if (!activeTrip) return;
        setIsSubmitting(true);
        try {
            const tripRef = doc(db, "trips", activeTrip.id);
            await updateDoc(tripRef, {
                endedAt: Timestamp.now(),
                status: "ended"
            });
            setActiveTrip(null);
            toast({ title: "Trip Ended", description: "Your trip has been successfully logged." });
        } catch (error) {
            console.error("[end trip]", error);
            toast({ variant: 'destructive', title: "Error", description: "Could not end the trip." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSendLocation = () => {
        if (!activeTrip) {
            toast({ variant: "destructive", title: "No Active Trip", description: "You must start a trip to send your location." });
            return;
        }
        setIsSendingLocation(true);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                const tripRef = doc(db, "trips", activeTrip.id);
                try {
                    await updateDoc(tripRef, {
                        lastLocation: {
                            lat: latitude,
                            lng: longitude,
                            at: serverTimestamp(),
                        }
                    });
                    toast({
                        title: "Location Sent!",
                        description: `Coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
                        className: 'bg-accent text-accent-foreground border-0',
                    });
                } catch (error) {
                    console.error("[send location]", error);
                    toast({ variant: "destructive", title: "Failed to Send Location", description: (error as Error).message });
                } finally {
                    setIsSendingLocation(false);
                }
            },
            (error) => {
                console.error("Geolocation error:", error);
                toast({ variant: "destructive", title: "Geolocation Error", description: error.message });
                setIsSendingLocation(false);
            },
            { enableHighAccuracy: true }
        );
    };

    if (profileLoading) {
        return <LoadingState />;
    }

    if (profileError) {
         return (
            <Card className="w-full max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle>Error Loading Data</CardTitle>
                </CardHeader>
                <CardContent>
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Could not load your assignment</AlertTitle>
                        <AlertDescription>
                            {profileError.message}
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        );
    }
    
    if (!bus) {
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
                            You have not been assigned to a bus yet. Please contact your administrator.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card className="w-full max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>Welcome, {profile?.displayName || 'Driver'}!</CardTitle>
                <CardDescription>Here is your assignment for today.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="border p-4 rounded-lg space-y-2">
                    <h3 className="font-semibold flex items-center gap-2"><Bus className="h-5 w-5 text-primary" /> Your Bus</h3>
                    <p className="pl-7"><strong>Code:</strong> {bus.busCode}</p>
                    {bus.plate && <p className="pl-7"><strong>Plate:</strong> {bus.plate}</p>}
                </div>

                 <div className="border p-4 rounded-lg space-y-2">
                    <h3 className="font-semibold flex items-center gap-2"><Route className="h-5 w-5 text-primary" /> Your Route</h3>
                    {route ? (
                         <p className="pl-7"><strong>Name:</strong> {route.name}</p>
                    ) : (
                         <p className="pl-7 text-muted-foreground">No route assigned to this bus.</p>
                    )}
                </div>

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
            <CardFooter className="flex flex-col gap-2">
                {activeTrip ? (
                    <>
                        <Button onClick={handleEndTrip} disabled={isSubmitting} className="w-full bg-red-600 hover:bg-red-700 text-white">
                            <StopCircle className="mr-2" />
                            {isSubmitting ? "Ending Trip..." : "End Trip"}
                        </Button>
                         <Button onClick={handleSendLocation} disabled={isSendingLocation} className="w-full" variant="outline">
                            <Send className="mr-2" />
                            {isSendingLocation ? "Sending..." : "Send Location"}
                        </Button>
                    </>
                ) : (
                    <Button onClick={handleStartTrip} disabled={isSubmitting || !bus || !!activeTrip} className="w-full">
                        <PlayCircle className="mr-2" />
                        {isSubmitting ? "Starting Trip..." : "Start Trip"}
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}
