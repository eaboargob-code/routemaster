
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  addDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { useToast } from "@/hooks/use-toast";

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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkIcon, Link2Off, UserPlus, GraduationCap, X } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";


// --- Data Interfaces ---
interface Parent {
  id: string;
  email: string;
  active: boolean;
  schoolId: string;
}

interface Student {
  id: string;
  name: string;
}

interface ParentStudentLink {
  id: string;
  parentId: string;
  studentId: string;
}


function LinkStudentDialog({ parent, students, existingLinks, onLink, schoolId }: { parent: Parent, students: Student[], existingLinks: ParentStudentLink[], onLink: () => void, schoolId: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const availableStudents = useMemo(() => {
        const linkedStudentIds = new Set(existingLinks.map(l => l.studentId));
        return students.filter(s => !linkedStudentIds.has(s.id));
    }, [students, existingLinks]);

    const handleLink = async () => {
        if (!selectedStudentId) {
            toast({ variant: "destructive", title: "No student selected" });
            return;
        }
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "parentStudents"), {
                parentId: parent.id,
                studentId: selectedStudentId,
                schoolId: schoolId,
            });
            toast({
                title: "Student Linked!",
                description: "The student has been successfully linked to the parent.",
                className: 'bg-accent text-accent-foreground border-0',
            });
            setSelectedStudentId(null);
            onLink();
            setIsOpen(false);
        } catch (error) {
            console.error("[link student]", error);
            toast({ variant: "destructive", title: "Linking failed", description: (error as Error).message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <LinkIcon className="mr-2 h-4 w-4" />
                    Link Student
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Link Student to {parent.email}</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    {availableStudents.length > 0 ? (
                        <Select onValueChange={setSelectedStudentId} value={selectedStudentId ?? ""}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a student to link..." />
                            </SelectTrigger>
                            <SelectContent>
                                {availableStudents.map(student => (
                                    <SelectItem key={student.id} value={student.id}>{student.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                       <Alert>
                            <GraduationCap className="h-4 w-4" />
                            <AlertTitle>All Students Linked</AlertTitle>
                            <AlertDescription>
                                There are no un-linked students available to assign to this parent.
                            </AlertDescription>
                       </Alert>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="ghost">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleLink} disabled={isSubmitting || !selectedStudentId}>
                        {isSubmitting ? "Linking..." : "Link Student"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ParentsList({ schoolId }: { schoolId: string }) {
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<ParentStudentLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  const onDataNeedsRefresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    const fetchData = async () => {
        if (!schoolId) return;
        setIsLoading(true);

        try {
            const parentsQuery = query(collection(db, "users"), where("schoolId", "==", schoolId), where("role", "==", "parent"));
            const studentsQuery = query(collection(db, "students"), where("schoolId", "==", schoolId));
            const linksQuery = query(collection(db, "parentStudents"), where("schoolId", "==", schoolId));

            const [parentsSnapshot, studentsSnapshot, linksSnapshot] = await Promise.all([
                getDocs(parentsQuery),
                getDocs(studentsQuery),
                getDocs(linksQuery),
            ]);

            const parentsData = parentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Parent));
            const studentsData = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
            const linksData = linksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ParentStudentLink));

            setParents(parentsData);
            setStudents(studentsData);
            setLinks(linksData);

        } catch (error) {
            console.error("Error fetching parent data:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load parent and student data." });
        } finally {
            setIsLoading(false);
        }
    };
    fetchData();
  }, [schoolId, refreshKey, toast]);

  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s.name])), [students]);
  const parentLinks = useMemo(() => {
      const map = new Map<string, ParentStudentLink[]>();
      links.forEach(link => {
          const parentLinks = map.get(link.parentId) || [];
          parentLinks.push(link);
          map.set(link.parentId, parentLinks);
      });
      return map;
  }, [links]);


  const handleUnlink = async (linkId: string) => {
      try {
          await deleteDoc(doc(db, "parentStudents", linkId));
          toast({ title: "Student Unlinked", description: "The student is no longer linked to this parent." });
          onDataNeedsRefresh();
      } catch (error) {
          console.error("[unlink student]", error);
          toast({ variant: "destructive", title: "Unlinking Failed", description: (error as Error).message });
      }
  };
  
  const handleToggleActive = async (parent: Parent) => {
      try {
          await updateDoc(doc(db, "users", parent.id), { active: !parent.active });
          toast({ title: "Status Updated", description: `Parent ${parent.email} has been ${!parent.active ? 'activated' : 'deactivated'}.` });
          onDataNeedsRefresh();
      } catch (error) {
          console.error("[toggle active]", error);
          toast({ variant: "destructive", title: "Update Failed", description: (error as Error).message });
      }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parent Management</CardTitle>
        <CardDescription>Link parents to students for school {schoolId}.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parent Email</TableHead>
              <TableHead>Linked Students</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4}><Skeleton className="h-24 w-full" /></TableCell>
              </TableRow>
            ) : parents.length > 0 ? (
              parents.map(parent => {
                const linked = parentLinks.get(parent.id) || [];
                return (
                    <TableRow key={parent.id}>
                        <TableCell className="font-medium">{parent.email}</TableCell>
                        <TableCell>
                            {linked.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {linked.map(link => (
                                        <Badge key={link.id} variant="secondary" className="flex items-center gap-1.5">
                                            {studentMap.get(link.studentId) || "Unknown Student"}
                                            <button onClick={() => handleUnlink(link.id)} className="rounded-full hover:bg-muted-foreground/20 p-0.5">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            ) : <span className="text-muted-foreground">No students linked</span>}
                        </TableCell>
                        <TableCell>
                            <Switch checked={parent.active} onCheckedChange={() => handleToggleActive(parent)} />
                        </TableCell>
                        <TableCell className="text-right">
                             <LinkStudentDialog 
                                parent={parent}
                                students={students}
                                existingLinks={linked}
                                onLink={onDataNeedsRefresh}
                                schoolId={schoolId}
                             />
                        </TableCell>
                    </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No parents found. Invite a user with the 'parent' role to begin.
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

    if (!profile) {
        return <div>No user profile found. Access denied.</div>
    }

    return (
        <div className="grid gap-8">
            <ParentsList schoolId={profile.schoolId} />
        </div>
    );
}
