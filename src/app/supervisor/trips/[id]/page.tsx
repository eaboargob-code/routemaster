
"use client";

import { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProfile } from '@/lib/useProfile';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from '@/components/ui/skeleton';
import { TripRoster } from './TripRoster';
import { ArrowLeft, Bus, Route, Info } from 'lucide-react';
import Link from 'next/link';

interface TripDetails {
    id: string;
    routeId?: string;
    busId: string;
    schoolId: string;
}

interface RouteInfo {
    name: string;
}

interface BusInfo {
    busCode: string;
}

export default function TripDetailsPage({ params }: { params: { id: string }}) {
    const { profile, loading: profileLoading } = useProfile();
    const [trip, setTrip] = useState<TripDetails | null>(null);
    const [route, setRoute] = useState<RouteInfo | null>(null);
    const [bus, setBus] = useState<BusInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const tripId = params.id;

    const fetchTripData = useCallback(async (currentSchoolId: string) => {
        setIsLoading(true);
        setError(null);

        try {
            // 1. Fetch trip document
            const tripRef = doc(db, "trips", tripId);
            const tripSnap = await getDoc(tripRef);

            if (!tripSnap.exists() || tripSnap.data().schoolId !== currentSchoolId) {
                throw new Error("Trip not found or access denied.");
            }
            
            const tripData = { id: tripSnap.id, ...tripSnap.data() } as TripDetails;
            setTrip(tripData);

            // 2. Fetch associated route and bus in parallel
            const promises: Promise<DocumentData | null>[] = [
                getDoc(doc(db, 'buses', tripData.busId))
            ];
            if (tripData.routeId) {
                promises.push(getDoc(doc(db, 'routes', tripData.routeId)));
            } else {
                promises.push(Promise.resolve(null));
            }
            
            const [busSnap, routeSnap] = await Promise.all(promises);
            
            if (busSnap && busSnap.exists()) setBus(busSnap.data() as BusInfo);
            if (routeSnap && routeSnap.exists()) setRoute(routeSnap.data() as RouteInfo);

        } catch (err: any) {
            console.error("Failed to fetch trip details:", err);
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    }, [tripId]);

    useEffect(() => {
        if (profile?.schoolId) {
            fetchTripData(profile.schoolId);
        }
    }, [profile?.schoolId, fetchTripData]);

    if (isLoading || profileLoading) {
        return (
            <div className="grid gap-4">
                <Skeleton className="h-10 w-1/4" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    if (error) {
        return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
    }

    if (!trip) {
        return <Alert><AlertTitle>Not Found</AlertTitle><AlertDescription>The requested trip could not be found.</AlertDescription></Alert>
    }

    return (
        <div className="grid gap-8">
            <Link href="/supervisor" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
                Back to All Trips
            </Link>
            <Card>
                <CardHeader>
                    <CardTitle>Trip Roster</CardTitle>
                    <CardDescription className="flex items-center gap-4 pt-1">
                        <div className="flex items-center gap-2">
                            <Bus className="h-4 w-4 text-primary" />
                            <span>{bus?.busCode || 'Loading...'}</span>
                        </div>
                        {route && (
                            <div className="flex items-center gap-2">
                                <Route className="h-4 w-4 text-primary" />
                                <span>{route.name}</span>
                            </div>
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <TripRoster 
                        tripId={trip.id} 
                        schoolId={trip.schoolId} 
                        routeId={trip.routeId} 
                        busId={trip.busId} 
                    />
                </CardContent>
            </Card>
        </div>
    )
}
