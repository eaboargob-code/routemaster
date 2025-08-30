
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs, doc, writeBatch, onSnapshot, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProfile } from '@/lib/useProfile';
import { useToast } from '@/hooks/use-toast';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Frown, LogIn, LogOut } from 'lucide-react';

interface TripRosterProps {
    tripId: string;
    schoolId: string;
    routeId?: string | null;
    busId: string;
}

interface Student {
    id: string;
    name: string;
}

interface PassengerStatus {
    studentId: string;
    status: 'IN' | 'OUT';
}

export function TripRoster({ tripId, schoolId, routeId, busId }: TripRosterProps) {
    const { user } = useProfile();
    const { toast } = useToast();
    const [students, setStudents] = useState<Student[]>([]);
    const [passengerStatuses, setPassengerStatuses] = useState<Map<string, PassengerStatus>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch the list of students for the route/bus
    useEffect(() => {
        const fetchStudents = async () => {
            if (!schoolId || (!routeId && !busId)) {
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            setError(null);
            
            try {
                let studentQuery;
                if (routeId) {
                    studentQuery = query(
                        collection(db, "students"),
                        where("schoolId", "==", schoolId),
                        where("assignedRouteId", "==", routeId)
                    );
                } else {
                     studentQuery = query(
                        collection(db, "students"),
                        where("schoolId", "==", schoolId),
                        where("assignedBusId", "==", busId)
                    );
                }

                const studentSnapshot = await getDocs(studentQuery);
                const studentData = studentSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })) as Student[];
                setStudents(studentData);
            } catch (e: any) {
                console.error("Failed to fetch students for roster:", e);
                setError(e.message || "Could not load student list.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchStudents();
    }, [schoolId, routeId, busId]);

    // Listen for real-time updates to passenger statuses
    useEffect(() => {
        const passengersRef = collection(db, "trips", tripId, "passengers");
        const unsubscribe = onSnapshot(passengersRef, (snapshot) => {
            const statuses = new Map<string, PassengerStatus>();
            snapshot.forEach(doc => {
                statuses.set(doc.id, doc.data() as PassengerStatus);
            });
            setPassengerStatuses(statuses);
        }, (err) => {
            console.error("Failed to listen to passenger statuses:", err);
            setError("Could not load real-time passenger data.");
        });

        return () => unsubscribe();
    }, [tripId]);

    const handleStatusToggle = async (studentId: string, currentStatus: 'IN' | 'OUT' | undefined) => {
        if (!user) return;

        const newStatus = currentStatus === 'IN' ? 'OUT' : 'IN';
        const passengerRef = doc(db, "trips", tripId, "passengers", studentId);

        try {
            await setDoc(passengerRef, {
                studentId: studentId,
                status: newStatus,
                lastActionAt: serverTimestamp(),
                lastActionBy: user.uid,
            });
             toast({
                title: `Student marked as ${newStatus}`,
                className: 'bg-accent text-accent-foreground border-0',
            });
        } catch (e: any) {
            console.error("Failed to update passenger status:", e);
            toast({
                variant: 'destructive',
                title: 'Update Failed',
                description: e.message,
            });
        }
    };
    
    if (isLoading) {
        return <Skeleton className="h-48 w-full" />;
    }

    if (error) {
        return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
    }
    
    if (students.length === 0) {
        return (
            <Alert>
                <Frown className="h-4 w-4" />
                <AlertTitle>No Students Found</AlertTitle>
                <AlertDescription>No students are assigned to this trip's route or bus.</AlertDescription>
            </Alert>
        )
    }

    return (
         <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {students.map(student => {
                    const passengerInfo = passengerStatuses.get(student.id);
                    const status = passengerInfo?.status;
                    const isCheckedIn = status === 'IN';
                    return (
                        <TableRow key={student.id}>
                            <TableCell className="font-medium">{student.name}</TableCell>
                            <TableCell>
                                <span className={`font-semibold ${isCheckedIn ? 'text-green-600' : 'text-red-600'}`}>
                                    {status || 'OUT'}
                                </span>
                            </TableCell>
                            <TableCell className="text-right">
                                 <Button 
                                    variant={isCheckedIn ? 'destructive' : 'default'} 
                                    size="sm"
                                    onClick={() => handleStatusToggle(student.id, status)}
                                    className="w-28"
                                >
                                    {isCheckedIn ? <><LogOut className="mr-2 h-4 w-4"/>Check Out</> : <><LogIn className="mr-2 h-4 w-4"/>Check In</>}
                                </Button>
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
          </Table>
        </div>
    )
}
