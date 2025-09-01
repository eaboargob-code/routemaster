
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useProfile } from '@/lib/useProfile';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, DocumentData, Timestamp, documentId } from 'firebase/firestore';
import { registerFcmToken } from '@/lib/notifications';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Users, Frown, Bus, Route, Clock, CheckCircle, XCircle, Footprints, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface Student {
    id: string;
    name: string;
    assignedRouteId?: string;
    assignedBusId?: string;
    schoolId: string;
}

interface TripPassenger extends DocumentData {
    status: 'boarded' | 'absent' | 'dropped' | 'pending';
    boardedAt?: Timestamp;
    droppedAt?: Timestamp;
}

interface ChildStatus extends Student {
    tripStatus?: TripPassenger;
    routeName?: string;
    busCode?: string;
    lastLocationUpdate?: Timestamp;
}

function StudentCard({ student }: { student: ChildStatus }) {
    
    const getStatusBadge = () => {
        if (!student.tripStatus) {
            return <Badge variant="outline"><HelpCircle className="mr-1 h-3 w-3"/>No trip data</Badge>;
        }
        switch(student.tripStatus.status) {
            case 'boarded':
                return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Bus className="mr-1 h-3 w-3"/> On Bus</Badge>;
            case 'dropped':
                return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="mr-1 h-3 w-3"/> Dropped Off</Badge>;
            case 'absent':
                return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3"/> Marked Absent</Badge>;
            case 'pending':
            default:
                return <Badge variant="secondary"><Footprints className="mr-1 h-3 w-3"/> Awaiting Check-in</Badge>;
        }
    };
    
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle>{student.name}</CardTitle>
                    <CardDescription className="flex flex-col gap-1 mt-2">
                        {student.busCode && <span className="flex items-center gap-2"><Bus className="h-4 w-4"/> {student.busCode}</span>}
                        {student.routeName && <span className="flex items-center gap-2"><Route className="h-4 w-4"/> {student.routeName}</span>}
                    </CardDescription>
                </div>
                {getStatusBadge()}
            </CardHeader>
            <CardContent>
                {student.lastLocationUpdate && (
                     <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4"/>
                        <span>Last bus location update: {format(student.lastLocationUpdate.toDate(), 'p')}</span>
                    </div>
                )}
                 {student.tripStatus?.status === 'dropped' && student.tripStatus.droppedAt && (
                     <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4"/>
                        <span>Dropped off at: {format(student.tripStatus.droppedAt.toDate(), 'p')}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function LoadingState() {
    return (
        <div className="grid gap-4">
            <Skeleton className="h-10 w-1/2 mb-4" />
            <Card><CardHeader><Skeleton className="h-6 w-1/3"/></CardHeader><CardContent><Skeleton className="h-4 w-1/2"/></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-6 w-1/3"/></CardHeader><CardContent><Skeleton className="h-4 w-1/2"/></CardContent></Card>
        </div>
    )
}

export default function ParentDashboardPage() {
    const { user, profile } = useProfile();
    const [children, setChildren] = useState<ChildStatus[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (user?.uid) {
            registerFcmToken(user.uid);
        }
    }, [user?.uid]);
    
    const fetchChildrenData = useCallback(async () => {
        if (!user || !profile) return;
        setIsLoading(true);
        setError(null);
        
        try {
            // 1. Find linked students via direct GET
            const parentLinkRef = doc(db, "parentStudents", user.uid);
            const linkDoc = await getDoc(parentLinkRef);

            if (!linkDoc.exists() || !linkDoc.data()?.studentIds || linkDoc.data().studentIds.length === 0) {
                setChildren([]);
                setIsLoading(false);
                return;
            }
            const studentIds = linkDoc.data().studentIds;

            // 2. Fetch only the specific student documents.
            const studentsQuery = query(
                collection(db, "students"), 
                where(documentId(), "in", studentIds),
                where("schoolId", "==", profile.schoolId)
            );
            const studentsSnapshot = await getDocs(studentsQuery);
            const studentData = studentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Student));

            // 3. Find today's active trips for these students' routes/buses
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const relevantRouteIds = [...new Set(studentData.map(s => s.assignedRouteId).filter(Boolean))];
            
            let trips: DocumentData[] = [];
            if (relevantRouteIds.length > 0) {
                 const tripsQuery = query(
                    collection(db, 'trips'),
                    where('schoolId', '==', profile.schoolId),
                    where('status', '==', 'active'),
                    where('routeId', 'in', relevantRouteIds),
                    where('startedAt', '>=', Timestamp.fromDate(startOfDay))
                );
                const tripsSnapshot = await getDocs(tripsQuery);
                trips = tripsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            
             // 4. Create initial child status objects with bus/route names
            const initialChildrenStatus = await Promise.all(studentData.map(async (s) => {
                let busCode: string | undefined;
                let routeName: string | undefined;

                if (s.assignedBusId) {
                    const busSnap = await getDoc(doc(db, 'buses', s.assignedBusId));
                    busCode = busSnap.data()?.busCode;
                }
                if (s.assignedRouteId) {
                    const routeSnap = await getDoc(doc(db, 'routes', s.assignedRouteId));
                    routeName = routeSnap.data()?.name;
                }

                return { ...s, busCode, routeName };
            }));

            setChildren(initialChildrenStatus);
            setIsLoading(false);
            
            // 5. Set up listeners for each student on their respective trip
            const tripListeners: (()=>void)[] = [];
            
            studentData.forEach(student => {
                const relevantTrip = trips.find(t => t.routeId === student.assignedRouteId || t.busId === student.assignedBusId);
                if (relevantTrip) {
                    // Listen to the passenger subcollection
                    const passengerRef = doc(db, `trips/${relevantTrip.id}/passengers`, student.id);
                    const passengerUnsub = onSnapshot(passengerRef, (snap) => {
                        setChildren(prev => prev.map(c => c.id === student.id ? { ...c, tripStatus: snap.data() as TripPassenger } : c));
                    });
                    
                    // Listen to the trip for location updates
                    const tripRef = doc(db, 'trips', relevantTrip.id);
                    const tripUnsub = onSnapshot(tripRef, (snap) => {
                        const tripData = snap.data();
                        if (tripData?.lastLocation?.at) {
                             setChildren(prev => prev.map(c => {
                                 const associatedTrip = trips.find(t => t.routeId === c.assignedRouteId || t.busId === c.assignedBusId);
                                 if(associatedTrip?.id === snap.id) {
                                     return {...c, lastLocationUpdate: tripData.lastLocation.at }
                                 }
                                 return c;
                            }));
                        }
                    });
                    tripListeners.push(passengerUnsub, tripUnsub);
                }
            });
            
            return () => tripListeners.forEach(unsub => unsub());

        } catch (e: any) {
            console.error("Failed to fetch parent data:", e);
            if (e.code === 'permission-denied') {
                setError("Missing or insufficient permissions. Please check Firestore rules for parents.");
            } else {
                setError(e.message || "An unknown error occurred.");
            }
            setIsLoading(false);
        }
    }, [user, profile]);

    useEffect(() => {
        let unsub: (() => void) | undefined;
        if(profile && user) {
            fetchChildrenData().then(cleanup => {
                if (typeof cleanup === 'function') {
                    unsub = cleanup;
                }
            });
        }
        return () => {
            if (unsub) {
                unsub();
            }
        };
    }, [fetchChildrenData, profile, user]);

    if (isLoading) {
        return <LoadingState />;
    }

    return (
        <div className="grid gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Parent Dashboard</CardTitle>
                    <CardDescription>Welcome, {profile?.displayName || 'Parent'}. Real-time status for your children.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="h-5 w-5 text-primary"/> My Children</h2>
                    {error && <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
                    
                    {!isLoading && children.length === 0 && (
                        <div className="mt-4 border rounded-lg p-8 text-center text-muted-foreground">
                            <Frown className="mx-auto h-12 w-12" />
                            <p className="mt-4 font-semibold">No Children Found</p>
                           <p>No students are currently linked to your account. Please contact the school administrator.</p>
                        </div>
                    )}
                    {children.map(child => (
                        <StudentCard key={child.id} student={child} />
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}

    
