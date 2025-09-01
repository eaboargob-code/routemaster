

"use client";

import React, { useEffect, useState, useCallback, use } from 'react';
import { type DocumentData } from 'firebase/firestore';
import { useProfile } from '@/lib/useProfile';
import { getTripDetails } from '@/lib/firestoreQueries';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from '@/components/ui/skeleton';
import { Roster } from './TripRoster';
import { ArrowLeft, Bus, Route } from 'lucide-react';
import Link from 'next/link';
import { AdminTripActions } from './AdminTripActions';

interface TripDetails extends DocumentData {
    id: string;
    routeId?: string;
    busId: string;
    schoolId: string;
    supervisorId?: string;
    driverId: string;
    allowDriverAsSupervisor?: boolean;
    status: 'active' | 'ended';
}

export default function TripDetailsPage({ params }: { params: { id: string }}) {
    const { id: tripId } = params;
    const { user, profile, loading: profileLoading } = useProfile();
    const [trip, setTrip] = useState<TripDetails | null>(null);
    const [route, setRoute] = useState<DocumentData | null>(null);
    const [bus, setBus] = useState<DocumentData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [canEdit, setCanEdit] = useState(false);

    const fetchTripData = useCallback(async (currentSchoolId: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const details = await getTripDetails(tripId, currentSchoolId);
            if (!details) {
                throw new Error("Trip not found or access denied.");
            }
            const fetchedTrip = details.trip as TripDetails;
            setTrip(fetchedTrip);
            setBus(details.bus);
            setRoute(details.route);
            
            // Determine edit permissions based on the new logic
            if (profile && user) {
                const isAdmin = profile.role === 'admin';
                const isSupervisor = profile.role === 'supervisor' && user.uid === fetchedTrip.supervisorId;
                const isDriverSupervising = profile.role === 'driver' && user.uid === fetchedTrip.driverId && !!fetchedTrip.allowDriverAsSupervisor;
                setCanEdit(isAdmin || isSupervisor || isDriverSupervising);
            } else {
                setCanEdit(false);
            }

        } catch (err: any) {
            console.error("Failed to fetch trip details:", err);
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    }, [tripId, profile, user]);

    useEffect(() => {
        if (profile?.schoolId) {
            fetchTripData(profile.schoolId);
        } else if (!profileLoading) {
            setError("Could not determine your school to fetch data.");
            setIsLoading(false);
        }
    }, [profile?.schoolId, profileLoading, fetchTripData]);
    
    const onTripUpdate = () => {
        if (profile?.schoolId) {
            fetchTripData(profile.schoolId);
        }
    }

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

    const backUrl = profile?.role === 'admin' ? '/admin/trips' : '/supervisor';

    return (
        <div className="grid gap-8">
            <div className="flex justify-between items-center">
                <Link href={backUrl} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" />
                    Back to All Trips
                </Link>
            </div>
            
            {profile?.role === 'admin' && (
                <AdminTripActions trip={trip} onTripUpdate={onTripUpdate} />
            )}
            
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
                    <Roster 
                        tripId={trip.id} 
                        canEdit={canEdit && trip.status === 'active'}
                    />
                </CardContent>
            </Card>
        </div>
    )
}
