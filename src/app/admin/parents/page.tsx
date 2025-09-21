
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  getDoc,
  arrayUnion,
  arrayRemove,
  collectionGroup,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { useToast } from "@/hooks/use-toast";
import { scol, sdoc } from "@/lib/schoolPath";

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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkIcon, UserPlus, GraduationCap, X, Phone, Star } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";


// --- Data Interfaces ---
interface Student {
  id: string;
  name: string;
  primaryParentId?: string | null;
}

interface Parent {
  id: string;
  displayName: string;
  email: string;
  phoneNumber?: string | null;
}

interface ParentStudentLink {
  studentIds: string[];
}


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
            const userRef = sdoc(schoolId, "users", parent.id);
            await updateDoc(userRef, { phoneNumber: phone || null });
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


function ParentContactsList({ schoolId }: { schoolId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [studentParentMap, setStudentParentMap] = useState<Map<string, string[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  const onDataNeedsRefresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    const fetchData = async () => {
        if (!schoolId) return;
        setIsLoading(true);

        try {
            // Fetch all students and all parents for the school
            const studentsQuery = scol(schoolId, "students");
            const parentsQuery = query(scol(schoolId, "users"), where("role", "==", "parent"));
            const [studentsSnapshot, parentsSnapshot] = await Promise.all([
                getDocs(studentsQuery),
                getDocs(parentsQuery),
            ]);
            const studentsData = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
            const parentsData = parentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Parent));
            setStudents(studentsData);
            setParents(parentsData);

            // Fetch all parent-student links and build a map of student -> [parent IDs]
            const parentLinksSnapshot = await getDocs(collectionGroup(db, 'parentStudents'));
            const newStudentParentMap = new Map<string, string[]>();
            parentLinksSnapshot.forEach(doc => {
                if (doc.ref.path.startsWith(`schools/${schoolId}`)) {
                    const parentId = doc.ref.parent.parent?.id;
                    if (!parentId) return;
                    const data = doc.data() as ParentStudentLink;
                    data.studentIds?.forEach(studentId => {
                        const links = newStudentParentMap.get(studentId) || [];
                        links.push(parentId);
                        newStudentParentMap.set(studentId, links);
                    });
                }
            });
            setStudentParentMap(newStudentParentMap);

        } catch (error) {
            console.error("Error fetching data:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load parent and student data." });
        } finally {
            setIsLoading(false);
        }
    };
    fetchData();
  }, [schoolId, refreshKey, toast]);

  const parentMap = useMemo(() => new Map(parents.map(p => [p.id, p])), [parents]);

  const handleSetPrimary = async (studentId: string, parentId: string | null) => {
    try {
        const studentRef = sdoc(schoolId, "students", studentId);
        await updateDoc(studentRef, { primaryParentId: parentId });
        toast({ title: "Primary Parent Updated", className: 'bg-accent text-accent-foreground border-0' });
        onDataNeedsRefresh();
    } catch(e) {
        toast({ variant: "destructive", title: "Update failed", description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parent Contacts</CardTitle>
        <CardDescription>Manage parent contact information and primary contacts for each student.</CardDescription>
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
              <TableRow>
                <TableCell colSpan={3}><Skeleton className="h-24 w-full" /></TableCell>
              </TableRow>
            ) : students.length > 0 ? (
              students.map(student => {
                const linkedParentIds = studentParentMap.get(student.id) || [];
                const linkedParents = linkedParentIds.map(id => parentMap.get(id)).filter(Boolean) as Parent[];
                return (
                    <TableRow key={student.id}>
                        <TableCell className="font-medium">{student.name}</TableCell>
                        <TableCell>
                            <div className="flex flex-col gap-2 items-start">
                               {linkedParents.length > 0 ? linkedParents.map(p => (
                                   <div key={p.id} className="flex items-center gap-2">
                                       <Badge variant="secondary" className="text-sm">
                                            {p.displayName || p.email}
                                       </Badge>
                                       <span className="text-xs text-muted-foreground">{p.phoneNumber || "No phone"}</span>
                                       <EditPhoneDialog parent={p} schoolId={schoolId} onUpdate={onDataNeedsRefresh} />
                                   </div>
                               )) : <span className="text-muted-foreground text-xs">No parents linked</span>}
                            </div>
                        </TableCell>
                        <TableCell>
                           {linkedParents.length > 0 && (
                             <Select
                                value={student.primaryParentId ?? ""}
                                onValueChange={(val) => handleSetPrimary(student.id, val || null)}
                              >
                                <SelectTrigger className="w-[220px]">
                                  <SelectValue placeholder="Select a primary contact..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">None</SelectItem>
                                    {linkedParents.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.displayName || p.email}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                           )}
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
        return <div className="text-red-500">Error loading profile: {profileError.message}</div>
    }

    if (!profile || !schoolId) {
        return <div>No user profile found. Access denied.</div>
    }

    return (
        <div className="grid gap-8">
            <ParentContactsList schoolId={schoolId} />
        </div>
    );
}

    