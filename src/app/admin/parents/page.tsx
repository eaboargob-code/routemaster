
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { useProfile } from "@/lib/useProfile";
import { useToast } from "@/hooks/use-toast";
import { scol } from "@/lib/schoolPath";
import {
  listUsersForSchool,
  linkParentToStudent,
  unlinkParentFromStudent,
  updateUserPhone,
  setPrimaryParent,
} from "@/lib/firestoreQueries";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Link as LinkIcon, UserPlus, X, Phone, Star, UserX } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
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

// --- Data Interfaces ---
interface Student {
  id: string;
  name: string;
  primaryParentId?: string | null;
  linkedParentIds: string[];
}

interface Parent {
  id: string;
  displayName: string;
  email: string;
  phoneNumber?: string | null;
}

const NONE_SENTINEL = "__none__";

// --- Sub-components ---

function EditPhoneDialog({ parent, schoolId, onUpdate }: { parent: Parent, schoolId: string, onUpdate: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [phone, setPhone] = useState(parent.phoneNumber || "");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

    const handleSave = async () => {
        if (phone && !PHONE_REGEX.test(phone)) {
            toast({ variant: "destructive", title: "Invalid Phone Number", description: "Please enter a valid E.164 format number (e.g., +15551234567)." });
            return;
        }
        setIsSubmitting(true);
        try {
            await updateUserPhone(schoolId, parent.id, phone || null);
            toast({ title: "Phone Number Updated", className: 'bg-accent text-accent-foreground border-0' });
            onUpdate();
            setIsOpen(false);
        } catch (error) {
            console.error("[update phone]", error);
            toast({ variant: "destructive", title: "Update Failed", description: (error as Error).message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <button className="text-blue-600 hover:underline text-xs">Edit Phone</button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Phone for {parent.displayName}</DialogTitle>
                    <DialogDescription>Use E.164 format (e.g., +15551234567).</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Input 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+15551234567"
                    />
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleSave} disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function PrimaryParentSelect({ student, linkedParents, schoolId, onUpdate }: { student: Student, linkedParents: Parent[], schoolId: string, onUpdate: () => void }) {
    const { toast } = useToast();
    
    const handleSetPrimary = async (newPrimaryId: string | null) => {
        try {
            await setPrimaryParent(schoolId, student.id, newPrimaryId);
            toast({ title: "Primary Parent Updated", className: 'bg-accent text-accent-foreground border-0' });
            onUpdate();
        } catch(e) {
            toast({ variant: "destructive", title: "Update failed", description: (e as Error).message });
        }
    }
    
    if (linkedParents.length === 0) return null;

    return (
        <Select
            value={student.primaryParentId ?? NONE_SENTINEL}
            onValueChange={(val) => handleSetPrimary(val === NONE_SENTINEL ? null : val)}
        >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select a primary contact..." />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NONE_SENTINEL}>None</SelectItem>
                {linkedParents.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                           {p.id === student.primaryParentId && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                           {p.displayName || p.email}
                        </div>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function AddParentDialog({ student, allParents, onUpdate, schoolId }: { student: Student, allParents: Parent[], onUpdate: () => void, schoolId: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
    const { toast } = useToast();
    
    const availableParents = useMemo(() => 
        allParents.filter(p => !student.linkedParentIds.includes(p.id)), 
    [allParents, student.linkedParentIds]);

    const handleLink = async () => {
        if (!selectedParentId) return;
        setIsSubmitting(true);
        try {
            await linkParentToStudent(schoolId, selectedParentId, student.id);
            toast({ title: "Parent Linked!", className: 'bg-accent text-accent-foreground border-0' });
            onUpdate();
            setIsOpen(false);
        } catch (error) {
            toast({ variant: "destructive", title: "Linking Failed", description: (error as Error).message });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1">
                    <UserPlus className="h-4 w-4" /> Add Parent
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Link Parent to {student.name}</DialogTitle>
                </DialogHeader>
                 <div className="py-4 space-y-2">
                    <Select onValueChange={setSelectedParentId}>
                        <SelectTrigger><SelectValue placeholder="Select an existing parent..." /></SelectTrigger>
                        <SelectContent>
                            <ScrollArea className="h-72">
                                {availableParents.length > 0 ? availableParents.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.displayName || p.email}</SelectItem>
                                )) : (
                                    <div className="text-center text-sm text-muted-foreground p-4">No unlinked parents available.</div>
                                )}
                            </ScrollArea>
                        </SelectContent>
                    </Select>
                    <Alert>
                        <AlertTitle>TODO: Create New Parent</AlertTitle>
                        <AlertDescription>The UI to create a new parent user from this modal is not yet implemented.</AlertDescription>
                    </Alert>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleLink} disabled={isSubmitting || !selectedParentId}>
                        <LinkIcon className="mr-2 h-4 w-4" />
                        {isSubmitting ? "Linking..." : "Link Parent"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function UnlinkParentDialog({ student, parent, onUpdate, schoolId }: { student: Student, parent: Parent, onUpdate: () => void, schoolId: string }) {
    const { toast } = useToast();
    
    const handleUnlink = async () => {
        try {
            await unlinkParentFromStudent(schoolId, parent.id, student.id, student.primaryParentId === parent.id);
            toast({ title: "Parent Unlinked", description: `${parent.displayName} is no longer linked to ${student.name}.` });
            onUpdate();
        } catch (error) {
            toast({ variant: "destructive", title: "Unlinking Failed", description: (error as Error).message });
        }
    }

    return (
         <AlertDialog>
            <AlertDialogTrigger asChild>
                <button className="ml-1 opacity-50 hover:opacity-100"><UserX className="h-3 w-3"/></button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will unlink <strong>{parent.displayName}</strong> from <strong>{student.name}</strong>. This cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleUnlink} className="bg-destructive hover:bg-destructive/90">Unlink</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// --- Main List Component ---
function ParentContactsList({ schoolId }: { schoolId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [allParents, setAllParents] = useState<Parent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  const onDataNeedsRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    const fetchData = async () => {
        if (!schoolId) return;
        setIsLoading(true);

        try {
            // Fetch all students and all parents for the school in parallel
            const [studentsSnapshot, parentsData] = await Promise.all([
                getDocs(scol(schoolId, "students")),
                listUsersForSchool(schoolId, "parent") as Promise<Parent[]>,
            ]);
            setAllParents(parentsData);

            // Fetch the `parentStudents` links for each parent
            const parentLinkPromises = parentsData.map(p => getDoc(doc(scol(schoolId, "parentStudents"), p.id)));
            const parentLinkSnapshots = await Promise.all(parentLinkPromises);
            
            // Create a map of parentId -> studentIds[]
            const parentToStudentsMap = new Map<string, string[]>();
            parentLinkSnapshots.forEach((snap, index) => {
                if (snap.exists()) {
                    parentToStudentsMap.set(parentsData[index].id, snap.data().studentIds || []);
                }
            });

            // Invert the map to studentId -> parentIds[]
            const studentToParentsMap = new Map<string, string[]>();
            for (const [parentId, studentIds] of parentToStudentsMap.entries()) {
                for (const studentId of studentIds) {
                    const links = studentToParentsMap.get(studentId) || [];
                    studentToParentsMap.set(studentId, [...links, parentId]);
                }
            }

            // Combine with student data
            const studentsData = studentsSnapshot.docs.map(doc => ({ 
                id: doc.id,
                name: doc.data().name,
                primaryParentId: doc.data().primaryParentId || null,
                linkedParentIds: studentToParentsMap.get(doc.id) || [],
            } as Student));

            setStudents(studentsData);

        } catch (error) {
            console.error("Error fetching data:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load parent and student data. Check permissions or network." });
        } finally {
            setIsLoading(false);
        }
    };
    fetchData();
  }, [schoolId, refreshKey, toast]);

  const parentMap = useMemo(() => new Map(allParents.map(p => [p.id, p])), [allParents]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parent Contacts</CardTitle>
        <CardDescription>Link parents to students and manage primary contacts.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Linked Parents</TableHead>
              <TableHead>Primary Parent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={3}><Skeleton className="h-12 w-full" /></TableCell></TableRow>)
            ) : students.length > 0 ? (
              students.map(student => {
                const linkedParents = student.linkedParentIds.map(id => parentMap.get(id)).filter(Boolean) as Parent[];
                return (
                    <TableRow key={student.id}>
                        <TableCell className="font-medium">{student.name}</TableCell>
                        <TableCell>
                            <div className="flex flex-col gap-2 items-start">
                               {linkedParents.length > 0 ? linkedParents.map(p => (
                                   <div key={p.id} className="flex items-center gap-2">
                                       <Badge variant="secondary" className="text-sm">
                                            {p.displayName || p.email}
                                            <UnlinkParentDialog student={student} parent={p} onUpdate={onDataNeedsRefresh} schoolId={schoolId} />
                                       </Badge>
                                       <span className="text-xs text-muted-foreground">{p.phoneNumber || "No phone"}</span>
                                       <EditPhoneDialog parent={p} schoolId={schoolId} onUpdate={onDataNeedsRefresh} />
                                   </div>
                               )) : <span className="text-muted-foreground text-xs">No parents linked</span>}
                               <AddParentDialog student={student} allParents={allParents} onUpdate={onDataNeedsRefresh} schoolId={schoolId} />
                            </div>
                        </TableCell>
                        <TableCell>
                           <PrimaryParentSelect student={student} linkedParents={linkedParents} schoolId={schoolId} onUpdate={onDataNeedsRefresh} />
                        </TableCell>
                    </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  No students found. Add students in the Student Management page first.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}


export default function ParentsPage() {
    const { profile, loading: profileLoading, error: profileError } = useProfile();
    const schoolId = profile?.schoolId;

    if (profileLoading) {
        return (
             <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-1/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-40 w-full" />
                </CardContent>
            </Card>
        );
    }

    if (profileError) {
        return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{profileError.message}</AlertDescription></Alert>;
    }

    if (!profile || !schoolId) {
        return <Alert><AlertTitle>Not Authorized</AlertTitle><AlertDescription>No user profile found or school ID is missing.</AlertDescription></Alert>;
    }

    return (
        <div className="grid gap-8">
            <ParentContactsList schoolId={schoolId} />
        </div>
    );
}
