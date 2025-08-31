
"use client";

import { useState, useEffect } from "react";
import { doc, updateDoc, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AdminTripActionsProps {
    trip: {
        id: string;
        schoolId: string;
        supervisorId?: string | null;
        allowDriverAsSupervisor?: boolean;
        status: 'active' | 'ended';
    };
    onTripUpdate: () => void;
}

interface Supervisor {
    id: string;
    displayName: string;
    email: string;
}

const NONE_SENTINEL = "__none__";

export function AdminTripActions({ trip, onTripUpdate }: AdminTripActionsProps) {
    const { toast } = useToast();
    const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchSupervisors = async () => {
            const q = query(
                collection(db, "users"),
                where("schoolId", "==", trip.schoolId),
                where("role", "==", "supervisor"),
                where("active", "==", true)
            );
            const snapshot = await getDocs(q);
            const supervisorList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supervisor));
            setSupervisors(supervisorList);
        };
        fetchSupervisors();
    }, [trip.schoolId]);

    const handleUpdate = async (field: string, value: any, successMessage: string) => {
        setIsSubmitting(true);
        try {
            const tripRef = doc(db, "trips", trip.id);
            await updateDoc(tripRef, { [field]: value });
            toast({
                title: "Success",
                description: successMessage,
                className: 'bg-accent text-accent-foreground border-0',
            });
            onTripUpdate(); // Trigger a refresh on the parent page
        } catch (error) {
            console.error(`[Admin Update Error: ${field}]`, error);
            toast({ variant: "destructive", title: "Update Failed", description: (error as Error).message });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleEndTrip = async () => {
         setIsSubmitting(true);
        try {
            const tripRef = doc(db, "trips", trip.id);
            await updateDoc(tripRef, { status: "ended", endedAt: Timestamp.now() });
            toast({ title: "Success", description: "The trip has been manually ended.", className: 'bg-accent text-accent-foreground border-0' });
            onTripUpdate();
        } catch (error) {
            console.error(`[Admin End Trip Error]`, error);
            toast({ variant: "destructive", title: "Update Failed", description: (error as Error).message });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleSupervisorChange = (newSupervisorId: string) => {
        const value = newSupervisorId === NONE_SENTINEL ? null : newSupervisorId;
        handleUpdate("supervisorId", value, "Supervisor has been reassigned.");
    };
    
    const handleToggleDriverSupervision = (canSupervise: boolean) => {
        handleUpdate("allowDriverAsSupervisor", canSupervise, `Driver supervision has been ${canSupervise ? 'enabled' : 'disabled'}.`);
    };

    return (
        <Card className="border-amber-500 bg-amber-50/50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-amber-600" />
                    Admin Controls
                </CardTitle>
                <CardDescription>
                    These actions are only available to administrators and will override current trip settings.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between space-x-2">
                    <Label htmlFor="driver-supervision-toggle" className="flex flex-col space-y-1">
                        <span>Allow Driver to Supervise</span>
                        <span className="font-normal leading-snug text-muted-foreground">
                            If enabled, the driver can manage the passenger roster.
                        </span>
                    </Label>
                    <Switch
                        id="driver-supervision-toggle"
                        checked={!!trip.allowDriverAsSupervisor}
                        onCheckedChange={handleToggleDriverSupervision}
                        disabled={isSubmitting || trip.status === 'ended'}
                    />
                </div>
                 <div className="flex items-center justify-between space-x-2">
                    <Label htmlFor="supervisor-select" className="flex flex-col space-y-1">
                        <span>Reassign Supervisor</span>
                         <span className="font-normal leading-snug text-muted-foreground">
                            Instantly change the supervisor assigned to this trip.
                        </span>
                    </Label>
                     <Select
                        value={trip.supervisorId ?? NONE_SENTINEL}
                        onValueChange={handleSupervisorChange}
                        disabled={isSubmitting || trip.status === 'ended'}
                      >
                        <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="Select a supervisor" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE_SENTINEL}>None</SelectItem>
                            {supervisors.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                    {s.displayName || s.email}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center justify-between space-x-2">
                    <Label htmlFor="end-trip-button" className="flex flex-col space-y-1">
                        <span>Manually End Trip</span>
                         <span className="font-normal leading-snug text-muted-foreground">
                            Forcefully end this trip if the driver is unable to.
                        </span>
                    </Label>
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                             <Button
                                id="end-trip-button"
                                variant="destructive"
                                disabled={isSubmitting || trip.status === 'ended'}
                            >
                                <AlertTriangle className="mr-2 h-4 w-4" />
                                End Trip
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action will immediately mark the trip as "ended" and cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleEndTrip} className="bg-destructive hover:bg-destructive/90">
                                    Yes, End Trip
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
    );
}

