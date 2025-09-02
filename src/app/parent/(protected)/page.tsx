
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
    routeName?: string;
    busCode?: string;
    schoolId: string;
}

interface TripPassenger extends DocumentData {
    status: 'boarded' | 'absent' | 'dropped' | 'pending';
    boardedAt?: Timestamp;
    droppedAt?: Timestamp;
}

interface ChildStatus extends Student {
    tripStatus?: TripPassenger | null;
    lastLocationUpdate?: Timestamp | null;
}


function StudentCard({ student: initialStudent }: { student: Student }) {
    const [status, setStatus] = useState<ChildStatus>({ ...initialStudent, tripStatus: null, lastLocationUpdate: null });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchDetailsAndListen = async () => {
            setIsLoading(true);
            
            // Find today's active trip for this student
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            // Build a flexible query.
            const studentTripQueryConstraints: any[] = [
                where('schoolId', '==', initialStudent.schoolId),
                where('status', '==', 'active'),
                where('startedAt', '>=', Timestamp.fromDate(startOfDay))
            ];

            if (initialStudent.assignedRouteId) {
                studentTripQueryConstraints.push(where('routeId', '==', initialStudent.assignedRouteId));
            } else if (initialStudent.assignedBusId) {
                 studentTripQueryConstraints.push(where('busId', '==', initialStudent.assignedBusId));
            } else {
                // No assignment, no trip data.
                 setIsLoading(false);
                 return;
            }
            
            const tripsQuery = query(collection(db, 'trips'), ...studentTripQueryConstraints);
            
            const tripsSnapshot = await getDocs(tripsQuery);
            const relevantTrip = tripsSnapshot.docs.length > 0 ? { id: tripsSnapshot.docs[0].id, ...tripsSnapshot.docs[0].data() } : null;

            setIsLoading(false);

            if (relevantTrip) {
                const passengerRef = doc(db, `trips/${relevantTrip.id}/passengers`, initialStudent.id);
                const tripRef = doc(db, 'trips', relevantTrip.id);

                const unsubPassenger = onSnapshot(passengerRef, (snap) => {
                    setStatus(prev => ({ ...prev, tripStatus: snap.exists() ? snap.data() as TripPassenger : null }));
                });

                const unsubTrip = onSnapshot(tripRef, (snap) => {
                    const tripData = snap.data();
                    if (tripData?.lastLocation?.at) {
                        setStatus(prev => ({ ...prev, lastLocationUpdate: tripData.lastLocation.at }));
                    }
                });

                return () => {
                    unsubPassenger();
                    unsubTrip();
                };
            }
        };

        const unsub = fetchDetailsAndListen();
        return () => {
            unsub.then(cleanup => cleanup && cleanup());
        };
    }, [initialStudent]);
    
    const getStatusBadge = () => {
        if (isLoading) {
            return <Skeleton className="h-6 w-24" />
        }
        if (!status.tripStatus) {
            return <Badge variant="outline"><HelpCircle className="mr-1 h-3 w-3"/>No trip data</Badge>;
        }
        switch(status.tripStatus.status) {
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
                    <CardTitle>{status.name}</CardTitle>
                    <CardDescription className="flex flex-col gap-1 mt-2">
                        {status.busCode && <span className="flex items-center gap-2"><Bus className="h-4 w-4"/> {status.busCode}</span>}
                        {status.routeName && <span className="flex items-center gap-2"><Route className="h-4 w-4"/> {status.routeName}</span>}
                    </CardDescription>
                </div>
                {getStatusBadge()}
            </CardHeader>
            <CardContent>
                {status.lastLocationUpdate && (
                     <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4"/>
                        <span>Last bus location update: {format(status.lastLocationUpdate.toDate(), 'p')}</span>
                    </div>
                )}
                 {status.tripStatus?.status === 'dropped' && status.tripStatus.droppedAt && (
                     <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4"/>
                        <span>Dropped off at: {format(status.tripStatus.droppedAt.toDate(), 'p')}</span>
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
    const [children, setChildren] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (user?.uid) {
            const registerAndLog = async () => {
                const t = await registerFcmToken(user.uid);
                console.log("FCM token (parent):", t);
            };
            registerAndLog();
        }
    }, [user?.uid]);
    
    useEffect(() => {
        const fetchChildrenData = async () => {
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
                setChildren(studentData);
            } catch (e: any) {
                console.error("Failed to fetch parent data:", e);
                setError(e.message || "An unknown error occurred.");
            } finally {
                setIsLoading(false);
            }
        };

        if (profile && user) {
            fetchChildrenData();
        }
    }, [user, profile]);


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

    