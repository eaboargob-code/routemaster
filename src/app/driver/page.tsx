
"use client";

import { useEffect, useState, useCallback } from 'react';
import { doc, addDoc, updateDoc, Timestamp, serverTimestamp, collection, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProfile } from '@/lib/useProfile';
import { useToast } from '@/hooks/use-toast';
import { getAssignedBusForDriver, getRouteById, getActiveOrTodayTripsForDriver, getUsersByIds } from '@/lib/firestoreQueries';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bus, Route, PlayCircle, StopCircle, Info, AlertTriangle, Send, Users, UserCheck, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { TripRoster } from '../supervisor/trips/[id]/TripRoster';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface Bus extends DocumentData {
    id: string;
    busCode: string;
    plate?: string;
    assignedRouteId?: string;
    supervisorId?: string | null;
}

interface RouteInfo extends DocumentData {
    id: string;
    name: string;
}

interface Trip extends DocumentData {
    id: string;
    startedAt: Timestamp;
    endedAt?: Timestamp;
    status: 'active' | 'ended';
    supervisorId?: string | null;
    allowDriverAsSupervisor?: boolean;
}

interface Supervisor extends DocumentData {
    id: string;
    displayName: string;
    email: string;
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
    const { user, profile, loading: profileLoading } = useProfile();
    const { toast } = useToast();

    const [bus, setBus] = useState<Bus | null>(null);
    const [route, setRoute] = useState<RouteInfo | null>(null);
    const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
    const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSendingLocation, setIsSendingLocation] = useState(false);
    const [allowDriverAsSupervisor, setAllowDriverAsSupervisor] = useState(false);
    
    const fetchData = useCallback(async () => {
        if (!user || !profile) return;
        setIsLoading(true);
        setError(null);

        try {
            const assignedBus = await getAssignedBusForDriver(profile.schoolId, user.uid) as Bus | null;
            setBus(assignedBus);

            if (!assignedBus) {
                setIsLoading(false);
                return;
            }

            const [assignedRoute, trips, supervisorData] = await Promise.all([
                getRouteById(assignedBus.assignedRouteId),
                getActiveOrTodayTripsForDriver(profile.schoolId, user.uid),
                assignedBus.supervisorId ? getUsersByIds([assignedBus.supervisorId]) : Promise.resolve(null)
            ]);

            setRoute(assignedRoute as RouteInfo | null);
            
            if (supervisorData && assignedBus.supervisorId) {
                setSupervisor(supervisorData[assignedBus.supervisorId] as Supervisor);
            }

            const currentActiveTrip = trips.find(t => t.status === 'active') as Trip | null;
            setActiveTrip(currentActiveTrip ?? null);

        } catch (e: any) {
            console.error("[driver] failed to fetch data", e);
            const message = e.code === 'permission-denied'
                ? "Permission denied. Ask your admin to check your assignment."
                : e.message || "An unknown error occurred.";
            setError(message);
            toast({ variant: 'destructive', title: 'Error Loading Data', description: message });
        } finally {
            setIsLoading(false);
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
                supervisorId: bus.supervisorId || null,
                allowDriverAsSupervisor: allowDriverAsSupervisor || false,
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
            setSupervisor(null); // Clear supervisor on trip end
            fetchData(); // Re-fetch to confirm state
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
    
    const getSupervisorContent = () => {
        if (activeTrip?.allowDriverAsSupervisor) {
            return (
                <div className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-primary" />
                    <div>
                        <h3 className="font-semibold">You are acting as supervisor</h3>
                    </div>
                </div>
            );
        }
        if (supervisor) {
            return (
                <div className="flex items-center gap-2">
                     <Eye className="h-5 w-5 text-primary" />
                     <div>
                        <h3 className="font-semibold">Your Supervisor</h3>
                        <p className="pl-0">{supervisor.displayName || supervisor.email}</p>
                     </div>
                </div>
            )
        }
         return (
            <div className="flex items-center gap-2">
                 <Eye className="h-5 w-5 text-primary" />
                 <div>
                    <h3 className="font-semibold">Your Supervisor</h3>
                    <p className="pl-0 text-muted-foreground">No supervisor assigned</p>
                 </div>
            </div>
        )
    }

    if (profileLoading || isLoading) {
        return <LoadingState />;
    }

    if (error) {
         return (
            <Card className="w-full max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle>Error Loading Data</CardTitle>
                </CardHeader>
                <CardContent>
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Could not load your assignment</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
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

    const showRoster = activeTrip && activeTrip.allowDriverAsSupervisor;
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <Card className="w-full max-w-2xl mx-auto lg:col-span-2">
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
                         <div className="border p-4 rounded-lg space-y-2">
                           {getSupervisorContent()}
                        </div>
                    )}


                    {!activeTrip && (
                        <div className="flex items-center space-x-2 border p-4 rounded-lg">
                            <Switch 
                                id="driver-supervisor-mode" 
                                checked={allowDriverAsSupervisor} 
                                onCheckedChange={setAllowDriverAsSupervisor}
                            />
                            <Label htmlFor="driver-supervisor-mode">Act as Supervisor?</Label>
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
                        <Button onClick={handleStartTrip} disabled={isSubmitting || !bus} className="w-full">
                            <PlayCircle className="mr-2" />
                            {isSubmitting ? "Starting Trip..." : "Start Trip"}
                        </Button>
                    )}
                </CardFooter>
            </Card>

            {showRoster && activeTrip && profile && (
                 <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            Trip Roster
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <TripRoster 
                            tripId={activeTrip.id} 
                            schoolId={profile.schoolId} 
                            routeId={route?.id} 
                            busId={bus.id} 
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
