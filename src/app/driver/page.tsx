
"use client";

import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs, getDoc, doc, addDoc, updateDoc, Timestamp, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProfile } from '@/lib/useProfile';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bus, Route, PlayCircle, StopCircle, Info } from 'lucide-react';
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
    status: 'active' | 'ended';
}

function LoadingState() {
    return (
        <Card>
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
    const { user, profile, loading: profileLoading } = useProfile();
    const { toast } = useToast();

    const [bus, setBus] = useState<Bus | null>(null);
    const [route, setRoute] = useState<RouteInfo | null>(null);
    const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const fetchData = useCallback(async () => {
        if (!user || !profile?.schoolId) return;

        setIsLoading(true);
        try {
            // 1. Find assigned bus using a secure and efficient query
            const busQuery = query(
                collection(db, "buses"),
                where("driverId", "==", user.uid),
                where("schoolId", "==", profile.schoolId),
                limit(1)
            );
            const busSnapshot = await getDocs(busQuery);

            if (busSnapshot.empty) {
                setBus(null);
                setRoute(null);
                setIsLoading(false);
                return;
            }
            
            const busDoc = busSnapshot.docs[0];
            const busData = { id: busDoc.id, ...busDoc.data() } as Bus;
            setBus(busData);

            // 2. Find assigned route if it exists
            if (busData.assignedRouteId) {
                const routeRef = doc(db, "routes", busData.assignedRouteId);
                const routeDoc = await getDoc(routeRef);
                if (routeDoc.exists()) {
                    setRoute({ id: routeDoc.id, ...routeDoc.data() } as RouteInfo);
                } else {
                    console.warn(`[driver data fetch] Route with id ${busData.assignedRouteId} not found.`);
                    setRoute(null);
                }
            } else {
                setRoute(null);
            }

            // 3. Check for active trip for today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            const tripQuery = query(
                collection(db, "trips"),
                where("driverId", "==", user.uid),
                where("status", "==", "active"),
                where("startedAt", ">=", Timestamp.fromDate(today)),
                where("startedAt", "<", Timestamp.fromDate(tomorrow)),
                limit(1)
            );
            const tripSnapshot = await getDocs(tripQuery);

            if (!tripSnapshot.empty) {
                const tripDoc = tripSnapshot.docs[0];
                setActiveTrip({ id: tripDoc.id, ...tripDoc.data() } as Trip);
            } else {
                setActiveTrip(null);
            }
        } catch (error) {
            console.error("[driver data fetch]", error);
            // Avoid toast spam for fetch errors, UI will show a message.
            setBus(null);
            setRoute(null);
        } finally {
            setIsLoading(false);
        }
    }, [user, profile]);

    useEffect(() => {
        if (!profileLoading) {
            fetchData();
        }
    }, [profileLoading, fetchData]);

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
            setActiveTrip({ ...newTrip, id: docRef.id });
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


    if (isLoading || profileLoading) {
        return <LoadingState />;
    }

    if (!bus) {
        return (
            <Card>
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
                            Started at: {format(activeTrip.startedAt.toDate(), "p")}
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
            <CardFooter>
                {activeTrip ? (
                    <Button onClick={handleEndTrip} disabled={isSubmitting} className="w-full bg-red-600 hover:bg-red-700 text-white">
                        <StopCircle className="mr-2" />
                        {isSubmitting ? "Ending Trip..." : "End Trip"}
                    </Button>
                ) : (
                    <Button onClick={handleStartTrip} disabled={isSubmitting} className="w-full">
                        <PlayCircle className="mr-2" />
                        {isSubmitting ? "Starting Trip..." : "Start Trip"}
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}
