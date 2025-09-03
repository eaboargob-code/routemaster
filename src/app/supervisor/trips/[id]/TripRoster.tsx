

"use client";

import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, getDoc, writeBatch, increment, serverTimestamp, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProfile, type UserProfile } from '@/lib/useProfile';
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
import { Frown, LogIn, LogOut, XCircle, CheckCircle, MinusCircle, UserX, QrCode } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface RosterProps {
    tripId: string;
    canEdit: boolean;
}

interface Passenger {
    id: string;
    name: string;
    studentName?: string;
    schoolId: string;
    status: 'pending' | 'boarded' | 'absent' | 'dropped';
}

async function updatePassengerStatus(
  tripId: string,
  studentId: string,
  newStatus: 'pending' | 'boarded' | 'absent' | 'dropped',
  actor: { uid: string, role: UserProfile['role'] }
) {
  const passengerRef = doc(db, `trips/${tripId}/passengers`, studentId);
  const tripRef      = doc(db, `trips`, tripId);

  const passengerSnap = await getDoc(passengerRef);
  if (!passengerSnap.exists()) throw new Error("Passenger not found in roster.");
  const oldData = passengerSnap.data();
  const oldStatus = oldData.status;
  if (oldStatus === newStatus) return;

  const batch = writeBatch(db);

  // 🔹 use serverTimestamp everywhere
  const update: any = {
    status: newStatus,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  };
  if (newStatus === 'boarded') update.boardedAt = serverTimestamp();
  if (newStatus === 'dropped') update.droppedAt = serverTimestamp();
  
  // Ensure schoolId is present using set with merge
  update.schoolId = oldData.schoolId;

  batch.set(passengerRef, update, { merge: true });

  const counters: Record<string, any> = {};
  if (oldStatus) counters[`counts.${oldStatus}`] = increment(-1);
  counters[`counts.${newStatus}`] = increment(1);
  batch.update(tripRef, counters);

  await batch.commit();
}

export function Roster({ tripId, canEdit }: RosterProps) {
    const { user, profile } = useProfile();
    const { toast } = useToast();
    const [passengers, setPassengers] = useState<Passenger[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [qrValue, setQrValue] = useState("");

    useEffect(() => {
        setIsLoading(true);
        const passengersRef = collection(db, "trips", tripId, "passengers");
        const unsubscribe = onSnapshot(passengersRef, (snapshot) => {
            const passengerData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Passenger));
            setPassengers(passengerData);
            setIsLoading(false);
        }, (err) => {
            console.error("Failed to listen to passenger statuses:", err);
            setError("Could not load real-time passenger data.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [tripId]);

    const handleAction = async (studentId: string, status: Passenger['status']) => {
        if (!user || !profile) return;
        try {
            await updatePassengerStatus(tripId, studentId, status, { uid: user.uid, role: profile.role });
            toast({
                title: `Student marked as ${status}`,
                className: 'bg-accent text-accent-foreground border-0',
            });
        } catch (e: any) {
            console.error("Failed to update passenger status:", e);
            toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
        }
    };

    const handleQrScan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !qrValue.trim()) return;
        const studentId = qrValue.trim();

        // Check if student exists in the current roster
        const studentExists = passengers.some(p => p.id === studentId);
        if (!studentExists) {
            toast({ variant: 'destructive', title: 'Student Not Found', description: 'This student is not on the roster for this trip.' });
            setQrValue("");
            return;
        }

        await handleAction(studentId, 'boarded');
        setQrValue("");
    };

    const counters = useMemo(() => {
        return passengers.reduce((acc, p) => {
            acc[p.status] = (acc[p.status] || 0) + 1;
            return acc;
        }, {} as Record<Passenger['status'], number>);
    }, [passengers]);
    
    if (isLoading) {
        return <Skeleton className="h-48 w-full" />;
    }

    if (error) {
        return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
    }
    
    if (passengers.length === 0) {
        return (
            <Alert>
                <Frown className="h-4 w-4" />
                <AlertTitle>No Students Found</AlertTitle>
                <AlertDescription>No students are assigned to this trip's route or bus.</AlertDescription>
            </Alert>
        )
    }
    
    const getStatusBadge = (status: Passenger['status']) => {
        switch(status) {
            case 'boarded': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-green-200"><CheckCircle className="mr-1 h-3 w-3" /> Boarded</Badge>;
            case 'absent': return <Badge variant="destructive"><UserX className="mr-1 h-3 w-3" /> Absent</Badge>;
            case 'dropped': return <Badge variant="secondary"><LogOut className="mr-1 h-3 w-3" /> Dropped</Badge>;
            case 'pending':
            default:
                return <Badge variant="outline"><MinusCircle className="mr-1 h-3 w-3" /> Pending</Badge>;
        }
    }


    return (
         <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
                <span>Total: <strong>{passengers.length}</strong></span>
                <span>Pending: <strong>{counters.pending || 0}</strong></span>
                <span>Boarded: <strong>{counters.boarded || 0}</strong></span>
                <span>Absent: <strong>{counters.absent || 0}</strong></span>
                <span>Dropped: <strong>{counters.dropped || 0}</strong></span>
            </div>
            {canEdit && (
                <form onSubmit={handleQrScan} className="flex gap-2">
                    <QrCode className="h-10 w-10 text-muted-foreground p-2 border rounded-md" />
                    <Input 
                        placeholder="Scan Student QR Code..." 
                        value={qrValue}
                        onChange={(e) => setQrValue(e.target.value)}
                    />
                    <Button type="submit">Scan</Button>
                </form>
            )}
             <div className="rounded-md border">
                <Table>
                    <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Status</TableHead>{canEdit && <TableHead className="text-right">Actions</TableHead>}</TableRow></TableHeader>
                    <TableBody>
                        {passengers.map(p => (
                            <TableRow key={p.id}>
                                <TableCell className="font-medium">{p.studentName || p.name || p.id}</TableCell>
                                <TableCell>{getStatusBadge(p.status)}</TableCell>
                                {canEdit && (
                                    <TableCell className="text-right space-x-1">
                                         <Button variant="ghost" size="sm" onClick={() => handleAction(p.id, 'boarded')} disabled={p.status === 'boarded'}>Board</Button>
                                         <Button variant="ghost" size="sm" onClick={() => handleAction(p.id, 'absent')} disabled={p.status === 'absent'}>Absent</Button>
                                         <Button variant="ghost" size="sm" onClick={() => handleAction(p.id, 'dropped')} disabled={p.status !== 'boarded'}>Drop</Button>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
