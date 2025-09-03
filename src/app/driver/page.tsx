

"use client";

import { useEffect, useState, useCallback } from 'react';
import {
  collection, query, where, getDocs, getDoc, doc,
  addDoc, updateDoc, Timestamp, limit, orderBy, serverTimestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProfile } from '@/lib/useProfile';
import { useToast } from '@/hooks/use-toast';
import { registerFcmToken } from '@/lib/notifications';


import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bus, Route, PlayCircle, StopCircle, Info, AlertTriangle, Send, Users, UserCheck, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { Roster } from '@/app/supervisor/trips/[id]/TripRoster';
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
    busId: string;
    routeId: string;
    driverId: string;
    startedAt: Timestamp;
    endedAt?: Timestamp;
    status: 'active' | 'ended';
    supervisorId?: string | null;
    allowDriverAsSupervisor?: boolean;
    driverSupervisionLocked?: boolean;
    schoolId: string;
    passengers: string[]; // <-- Added for parent query
    counts?: {
        pending: number;
        boarded: number;
        absent: number;
        dropped: number;
    }
}

interface Supervisor extends DocumentData {
    id: string;
    displayName: string;
    email: string;
}

type UiState = {
    status: 'loading' | 'ready' | 'error' | 'empty';
    errorMessage?: string;
}

async function seedPassengersForTrip(
    fs: Firestore, 
    trip: Omit<Trip, 'id'> & { id: string },
) {
  const studentsCol = collection(fs, "students");
  const parentStudentsCol = collection(fs, "parentStudents");
  
  console.debug('[ROSTER] trip', trip.id, trip.routeId, trip.busId);

  // Query by route if it exists
  const byRouteQ = trip.routeId 
    ? query(
        studentsCol,
        where("schoolId", "==", trip.schoolId),
        where("assignedRouteId", "==", trip.routeId)
      )
    : null;

  // Query by bus if it exists
  const byBusQ = trip.busId
    ? query(
        studentsCol,
        where("schoolId", "==", trip.schoolId),
        where("assignedBusId", "==", trip.busId)
      )
    : null;
  
  if (!byRouteQ && !byBusQ) {
    console.debug("[ROSTER] No route or bus ID on trip. Cannot seed passengers.");
    return 0;
  }

  const [byRouteSnap, byBusSnap] = await Promise.all([
      byRouteQ ? getDocs(byRouteQ) : Promise.resolve({ docs: [] }),
      byBusQ ? getDocs(byBusQ) : Promise.resolve({ docs: [] })
  ]);
  
  const byRouteStudents = byRouteSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const byBusStudents = byBusSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.debug('[ROSTER] students by route', byRouteStudents.length);
  console.debug('[ROSTER] students by bus', byBusStudents.length);

  const studentMap = new Map<string, DocumentData>();
  [...byRouteStudents, ...byBusStudents].forEach(s => studentMap.set(s.id, s));
  const students = Array.from(studentMap.values()).sort((a,b)=>a.name.localeCompare(b.name));
  console.debug('[ROSTER] merged students', students.length);


  // Find all parent links for these students in a single query
  const studentIds = Array.from(studentMap.keys());
  const parentLinksByStudent = new Map<string, string[]>();
  if (studentIds.length > 0) {
      const CHUNK_SIZE = 10;
      for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
        const chunk = studentIds.slice(i, i + CHUNK_SIZE);
        if (chunk.length === 0) continue;

        const parentQuery = query(parentStudentsCol, where('schoolId', '==', trip.schoolId), where('studentIds', 'array-contains-any', chunk));
        const parentLinksSnap = await getDocs(parentQuery);
        parentLinksSnap.forEach(doc => {
            const parentId = doc.id;
            const data = doc.data();
            data.studentIds.forEach((studentId: string) => {
                if (studentMap.has(studentId)) {
                    if (!parentLinksByStudent.has(studentId)) {
                        parentLinksByStudent.set(studentId, []);
                    }
                    parentLinksByStudent.get(studentId)!.push(parentId);
                }
            });
        });
      }
  }

  const batch = writeBatch(fs);
  const passengerRefs = students.map(s => doc(fs, `trips/${trip.id}/passengers`, s.id));
  const existingDocs = await Promise.all(passengerRefs.map(ref => getDoc(ref)));

  students.forEach((s, index) => {
      if (!existingDocs[index].exists()) {
          batch.set(passengerRefs[index], {
              schoolId: trip.schoolId,
              studentId: s.id,
              studentName: s.name ?? null,
              parentUids: parentLinksByStudent.get(s.id) || [],
              status: "pending",
              boardedAt: null,
              droppedAt: null,
              updatedAt: serverTimestamp(),
          }, { merge: true });
      }
  });


  await batch.commit();

  // After seeding, update the trip's metadata
  if (studentMap.size > 0) {
      await updateDoc(doc(fs, 'trips', trip.id), {
          'counts.pending': studentMap.size,
          'passengers': Array.from(studentMap.keys()),
      });
  }

  return studentMap.size;
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
    const [uiState, setUiState] = useState<UiState>({ status: 'loading' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSendingLocation, setIsSendingLocation] = useState(false);
    
    useEffect(() => {
        if (user?.uid) {
            registerFcmToken(user.uid);
        }
    }, [user?.uid]);

    const fetchData = useCallback(async () => {
        if (!user || !profile) return;
        setUiState({ status: 'loading' });

        let foundBus: Bus | null = null;

        try {
            const busQ = query(
            collection(db, "buses"),
            where("schoolId", "==", profile.schoolId),
            where("driverId", "==", user.uid),
            limit(1)
            );
            const s = await getDocs(busQ);
            if (s.empty) {
                setBus(null); setRoute(null); setUiState({ status: 'empty' }); return;
            }
            foundBus = { id: s.docs[0].id, ...s.docs[0].data() } as Bus;
            setBus(foundBus);
        } catch (e:any) {
            setUiState({ status: 'error', errorMessage: "Permission denied reading your bus." });
            return;
        }

        if (foundBus?.assignedRouteId) {
            const rSnap = await getDoc(doc(db, "routes", foundBus.assignedRouteId));
            if (rSnap.exists()) setRoute({ id: rSnap.id, ...rSnap.data() } as RouteInfo);
        } else {
            setRoute(null);
        }
        
        if (foundBus?.supervisorId) {
            const supSnap = await getDoc(doc(db, 'users', foundBus.supervisorId));
            if (supSnap.exists()) {
                setSupervisor({id: supSnap.id, ...supSnap.data()} as Supervisor);
            }
        }

        // Check for an active trip for this driver (today)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        try {
          const tripQ = query(
            collection(db, 'trips'),
            where('schoolId', '==', profile.schoolId),
            where('driverId', '==', user.uid),
            where('startedAt', '>=', Timestamp.fromDate(startOfDay)),
            orderBy('startedAt', 'desc'),
            limit(10)
          );

          const tripSnap = await getDocs(tripQ);

          const active = tripSnap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }))
            .find(t => t.status === 'active') || null;

          setActiveTrip(active as Trip | null);
        } catch (e) {
          console.error('[driver] TRIPS query failed', e);
          setActiveTrip(null); // don’t block the page
        }
        setUiState({ status: 'ready' });
    }, [user, profile]);


    useEffect(() => {
        if (!profileLoading && user && profile) {
            fetchData();
        }
    }, [profileLoading, user, profile, fetchData]);
    
    const handleSetActingAsSupervisor = async (actingAsSupervisor: boolean) => {
        if (!activeTrip) return;
        try {
            await updateDoc(doc(db, "trips", activeTrip.id), { allowDriverAsSupervisor: actingAsSupervisor });
            setActiveTrip(prev => prev ? ({ ...prev, allowDriverAsSupervisor: actingAsSupervisor }) : null);
             toast({
                title: `Supervising mode ${actingAsSupervisor ? 'enabled' : 'disabled'}.`,
                className: 'bg-accent text-accent-foreground border-0',
            });
        } catch(e:any) {
             toast({ variant: "destructive", title: "Update failed", description: e.message });
        }
    }


    const handleStartTrip = async () => {
        if (!user || !profile || !bus) return;
        setIsSubmitting(true);
        
        try {
            // Prevent duplicate active trips
            const existingQ = query(
                collection(db, 'trips'),
                where('schoolId', '==', profile.schoolId),
                where('driverId', '==', user.uid),
                where('status', '==', 'active'),
                limit(1)
            );
            const existing = await getDocs(existingQ);
            if (!existing.empty) {
                const doc0 = existing.docs[0];
                setActiveTrip({ id: doc0.id, ...(doc0.data() as any) });
                toast({
                    variant: 'default',
                    title: 'Active Trip Found',
                    description: 'Your existing active trip has been loaded.',
                    className: 'bg-accent text-accent-foreground border-0',
                });
                setIsSubmitting(false);
                return;
            }

            const newTripData: Omit<Trip, 'id'> = {
                driverId: user.uid,
                busId: bus.id,
                routeId: route?.id || '',
                schoolId: profile.schoolId,
                startedAt: Timestamp.now(),
                status: "active",
                supervisorId: bus.supervisorId || null,
                allowDriverAsSupervisor: false,
                driverSupervisionLocked: false,
                passengers: [], // Initialize empty, will be populated by seed function
                counts: { pending: 0, boarded: 0, absent: 0, dropped: 0 }
            };
            const docRef = await addDoc(collection(db, "trips"), newTripData);
            const fullTrip = { ...newTripData, id: docRef.id };
            
            setActiveTrip(fullTrip);
            toast({ title: "Trip Started!", description: `Your trip is now active.`, className: 'bg-accent text-accent-foreground border-0' });

            // Seed passengers in the background
            seedPassengersForTrip(db, fullTrip)
                .then(count => {
                    if (count > 0) {
                        toast({
                            title: "Roster Ready!",
                            description: `${count} passengers have been added to your roster.`,
                            className: 'bg-accent text-accent-foreground border-0',
                        });
                    } else {
                         toast({
                            title: "Empty Roster",
                            description: `No students are assigned to this route or bus.`,
                        });
                    }
                })
                .catch(err => {
                    console.error("[seed passengers]", err);
                    toast({ variant: 'destructive', title: "Roster Error", description: "Could not create the passenger roster. Check permissions to read 'students'." });
                });

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
            fetchData();
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
                try {
                    await updateDoc(doc(db, "trips", activeTrip.id), {
                        lastLocation: { lat: latitude, lng: longitude, at: serverTimestamp() }
                    });
                    toast({
                        title: "Location Sent!",
                        description: `Coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
                        className: 'bg-accent text-accent-foreground border-0',
                    });
                } catch (error) {
                    toast({ variant: "destructive", title: "Failed to Send Location", description: (error as Error).message });
                } finally {
                    setIsSendingLocation(false);
                }
            },
            (error) => {
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
                    <h3 className="font-semibold">You are acting as supervisor</h3>
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

    if (profileLoading || uiState.status === 'loading') {
        return <LoadingState />;
    }

    if (uiState.status === 'error') {
         return (
            <Card className="w-full max-w-2xl mx-auto"><CardHeader><CardTitle>Error Loading Data</CardTitle></CardHeader>
                <CardContent><Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Could not load your assignment</AlertTitle><AlertDescription>{uiState.errorMessage}</AlertDescription></Alert></CardContent>
            </Card>
        );
    }
    
    if (uiState.status === 'empty') {
        return (
            <Card className="w-full max-w-2xl mx-auto"><CardHeader><CardTitle>No Assignment Found</CardTitle></CardHeader>
                <CardContent><Alert><Info className="h-4 w-4" /><AlertTitle>No Assigned Bus</AlertTitle><AlertDescription>You have not been assigned to a bus yet. Please contact your administrator.</AlertDescription></Alert></CardContent>
            </Card>
        );
    }
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2 space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Welcome, {profile?.displayName || 'Driver'}!</CardTitle>
                        <CardDescription>Here is your assignment for today.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="border p-4 rounded-lg space-y-2"><h3 className="font-semibold flex items-center gap-2"><Bus className="h-5 w-5 text-primary" /> Your Bus</h3><p className="pl-7"><strong>Code:</strong> {bus?.busCode}</p>{bus?.plate && <p className="pl-7"><strong>Plate:</strong> {bus.plate}</p>}</div>
                        <div className="border p-4 rounded-lg space-y-2"><h3 className="font-semibold flex items-center gap-2"><Route className="h-5 w-5 text-primary" /> Your Route</h3>{route ? <p className="pl-7"><strong>Name:</strong> {route.name}</p> : <p className="pl-7 text-muted-foreground">No route assigned.</p>}</div>
                        {activeTrip && <div className="border p-4 rounded-lg space-y-2">{getSupervisorContent()}</div>}
                        {activeTrip && (
                            <Alert variant="default" className="bg-blue-50 border-blue-200">
                                <Info className="h-4 w-4 !text-blue-700" /><AlertTitle className="text-blue-800">Trip in Progress</AlertTitle><AlertDescription className="text-blue-700">Started at: {format(activeTrip.startedAt.toDate(), "HH:mm")}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                    <CardFooter className="flex flex-col sm:flex-row gap-2">
                        {activeTrip ? (
                            <>
                                <Button onClick={handleEndTrip} disabled={isSubmitting} className="w-full bg-red-600 hover:bg-red-700 text-white"><StopCircle className="mr-2" />{isSubmitting ? "Ending Trip..." : "End Trip"}</Button>
                                <Button onClick={handleSendLocation} disabled={isSendingLocation} className="w-full" variant="outline"><Send className="mr-2" />{isSendingLocation ? "Sending..." : "Send Location"}</Button>
                            </>
                        ) : (
                            <Button onClick={handleStartTrip} disabled={isSubmitting || !bus} className="w-full"><PlayCircle className="mr-2" />{isSubmitting ? "Starting Trip..." : "Start Trip"}</Button>
                        )}
                    </CardFooter>
                </Card>
            </div>

            {activeTrip && (
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
                                    checked={!!activeTrip.allowDriverAsSupervisor} 
                                    onCheckedChange={handleSetActingAsSupervisor}
                                    disabled={activeTrip.driverSupervisionLocked}
                                />
                                <Label htmlFor="driver-supervisor-mode">Supervise</Label>
                            </div>
                        </CardTitle>
                        <CardDescription>Manage student check-ins and check-outs.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Roster 
                            tripId={activeTrip.id}
                            canEdit={!!activeTrip.allowDriverAsSupervisor}
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
