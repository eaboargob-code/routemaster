
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  deleteField,
} from "firebase/firestore";
import { useProfile } from "@/lib/useProfile";
import { listStudentsForSchool, listRoutesForSchool, listStopsForRoute, listBusesForSchool } from "@/lib/firestoreQueries";
import { scol, sdoc } from "@/lib/schoolPath";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Trash2, Pencil, Search, Route, Bus, GraduationCap, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const studentSchema = z.object({
  name: z.string().min(1, { message: "Student name is required." }),
  grade: z.string().max(15, "Grade is too long.").optional().nullable(),
  photoUrl: z.string().url("Must be a valid URL.").optional().nullable(),
  assignedRouteId: z.string().nullable().optional(),
  assignedBusId: z.string().nullable().optional(),
  defaultStopId: z.string().nullable().optional(),
});

type StudentFormValues = z.infer<typeof studentSchema>;

interface Student {
  id: string;
  name: string;
  grade?: string;
  photoUrl?: string;
  assignedRouteId?: string | null;
  assignedBusId?: string | null;
  defaultStopId?: string | null;
  schoolId: string;
}

interface RouteInfo {
    id: string;
    name: string;
}

interface BusInfo {
    id: string;
    busCode: string;
}

interface StopInfo {
    id: string;
    name: string;
    order: number;
}

const NONE_SENTINEL = "__none__";

function StudentForm({ student, onComplete, routes, buses, schoolId }: { student?: Student, onComplete: () => void, routes: RouteInfo[], buses: BusInfo[], schoolId: string }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [stops, setStops] = useState<StopInfo[]>([]);
    const [isLoadingStops, setIsLoadingStops] = useState(false);
    const isEditMode = !!student;

    const form = useForm<StudentFormValues>({
        resolver: zodResolver(studentSchema),
        defaultValues: {
            name: student?.name || "",
            grade: student?.grade || "",
            photoUrl: student?.photoUrl || "",
            assignedRouteId: student?.assignedRouteId || null,
            assignedBusId: student?.assignedBusId || null,
            defaultStopId: student?.defaultStopId || null,
        },
    });

    const selectedRouteId = form.watch("assignedRouteId");

    useEffect(() => {
        const fetchStops = async () => {
            if (selectedRouteId && schoolId) {
                setIsLoadingStops(true);
                const stopsData = await listStopsForRoute(schoolId, selectedRouteId);
                setStops(stopsData as StopInfo[]);
                setIsLoadingStops(false);
            } else {
                setStops([]);
            }
        };
        fetchStops();
    }, [selectedRouteId, schoolId]);


    const onSubmit = async (data: StudentFormValues) => {
        setIsSubmitting(true);
        try {
            const studentData: any = {
                name: data.name,
                grade: data.grade || deleteField(),
                photoUrl: data.photoUrl || deleteField(),
                defaultStopId: data.defaultStopId || deleteField(),
            };

            const selectedRoute = routes.find(r => r.id === data.assignedRouteId);
            const selectedBus = buses.find(b => b.id === data.assignedBusId);

            if (selectedRoute) {
                studentData.assignedRouteId = selectedRoute.id;
                studentData.routeName = selectedRoute.name;
            } else {
                studentData.assignedRouteId = deleteField();
                studentData.routeName = deleteField();
            }

            if (selectedBus) {
                studentData.assignedBusId = selectedBus.id;
                studentData.busCode = selectedBus.busCode;
            } else {
                studentData.assignedBusId = deleteField();
                studentData.busCode = deleteField();
            }

            if (isEditMode) {
                const studentRef = sdoc(schoolId, "students", student.id);
                await updateDoc(studentRef, studentData);
                toast({
                    title: "Success!",
                    description: "Student has been updated.",
                    className: 'bg-accent text-accent-foreground border-0',
                });
            } else {
                await addDoc(scol(schoolId, "students"), studentData);
                toast({
                    title: "Success!",
                    description: "New student has been added.",
                    className: 'bg-accent text-accent-foreground border-0',
                });
            }
            form.reset();
            onComplete();
        } catch (error) {
            console.error("[students save]", error);
            toast({
                variant: "destructive",
                title: "Uh oh! Something went wrong.",
                description: "There was a problem saving the student.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
         <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Student Name</FormLabel><FormControl><Input placeholder="e.g., Jane Doe" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="grade" render={({ field }) => (
                    <FormItem><FormLabel>Grade</FormLabel><FormControl><Input placeholder="e.g., 5" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )}/>
            </div>
             <FormField control={form.control} name="photoUrl" render={({ field }) => (
                <FormItem><FormLabel>Photo URL</FormLabel><FormControl><Input placeholder="https://example.com/photo.jpg" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="assignedRouteId" render={({ field }) => (
                <FormItem><FormLabel>Assign to Route (Optional)</FormLabel>
                  <Select value={field.value ?? NONE_SENTINEL} onValueChange={(value) => field.onChange(value === NONE_SENTINEL ? null : value)}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a route" /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value={NONE_SENTINEL}>Not Assigned</SelectItem>{routes.map((route) => (<SelectItem key={route.id} value={route.id}>{route.name}</SelectItem>))}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
            )}/>
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="assignedBusId" render={({ field }) => (
                    <FormItem><FormLabel>Assign to Bus (Optional)</FormLabel>
                    <Select value={field.value ?? NONE_SENTINEL} onValueChange={(value) => field.onChange(value === NONE_SENTINEL ? null : value)}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a bus" /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value={NONE_SENTINEL}>Not Assigned</SelectItem>{buses.map((bus) => (<SelectItem key={bus.id} value={bus.id}>{bus.busCode}</SelectItem>))}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )}/>
                 <FormField control={form.control} name="defaultStopId" render={({ field }) => (
                    <FormItem><FormLabel>Default Stop (Optional)</FormLabel>
                    <Select value={field.value ?? NONE_SENTINEL} onValueChange={(value) => field.onChange(value === NONE_SENTINEL ? null : value)} disabled={!selectedRouteId || isLoadingStops}>
                        <FormControl><SelectTrigger><SelectValue placeholder={isLoadingStops ? "Loading stops..." : "Select a stop"} /></SelectTrigger></FormControl>
                        <SelectContent>
                            <SelectItem value={NONE_SENTINEL}>None</SelectItem>
                            {stops.map((stop) => (<SelectItem key={stop.id} value={stop.id}>{stop.name}</SelectItem>))}
                        </SelectContent>
                    </Select><FormMessage /></FormItem>
                )}/>
            </div>
            
             <DialogFooter>
                <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : (isEditMode ? "Save Changes" : "Add Student")}
                </Button>
            </DialogFooter>
          </form>
        </Form>
    );
}

function StudentDialog({ children, student, onComplete, routes, buses, schoolId }: { children: React.ReactNode, student?: Student, onComplete: () => void, routes: RouteInfo[], buses: BusInfo[], schoolId: string }) {
    const [isOpen, setIsOpen] = useState(false);

    const handleComplete = () => {
        setIsOpen(false);
        onComplete();
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[625px]">
                <DialogHeader>
                    <DialogTitle>{student ? 'Edit Student' : 'Add New Student'}</DialogTitle>
                    <DialogDescription>
                       {student ? 'Update the details for this student.' : 'Fill in the details for the new student.'}
                    </DialogDescription>
                </DialogHeader>
                <StudentForm student={student} routes={routes} buses={buses} schoolId={schoolId} onComplete={handleComplete} />
            </DialogContent>
        </Dialog>
    );
}


function StudentsList({ routes, buses, schoolId, onDataNeedsRefresh }: { routes: RouteInfo[], buses: BusInfo[], schoolId: string, onDataNeedsRefresh: () => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const fetchStudents = async () => {
        if (!schoolId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const studentsData = await listStudentsForSchool(schoolId);
            setStudents(studentsData as Student[]);
        } catch (error) {
            console.error("Error fetching students:", error);
            toast({ variant: "destructive", title: "Error fetching students", description: (error as Error).message });
        } finally {
            setIsLoading(false);
        }
    };
    fetchStudents();
  }, [schoolId, toast, onDataNeedsRefresh]);

  const handleDelete = async (studentId: string, studentName: string) => {
      try {
          await deleteDoc(sdoc(schoolId, "students", studentId));
          toast({
              title: "Student Deleted",
              description: `Student "${studentName}" has been removed.`,
          });
          onDataNeedsRefresh();
      } catch (error) {
          console.error("[students delete]", error);
          toast({
              variant: "destructive",
              title: "Deletion Failed",
              description: "There was a problem deleting the student.",
          });
      }
  };
  
  const filteredStudents = useMemo(() => {
      const search = searchTerm.trim().toLowerCase();
      if (!search) return students;
      return students.filter(student =>
        (student.name?.toLowerCase?.() ?? "").includes(search)
      );
  }, [students, searchTerm]);
  
  const getRouteName = (student: Student) => {
      if (!student.assignedRouteId) return <span className="text-muted-foreground">Not Assigned</span>;
      const route = routes.find(r => r.id === student.assignedRouteId);
      return route ? (
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-muted-foreground"/>
            {route.name}
          </div>
      ) : <span className="text-muted-foreground">Unknown Route</span>;
  }
  
  const getBusCode = (student: Student) => {
      if (!student.assignedBusId) return <span className="text-muted-foreground">Not Assigned</span>;
      const bus = buses.find(b => b.id === student.assignedBusId);
      return bus ? (
          <div className="flex items-center gap-2">
            <Bus className="h-4 w-4 text-muted-foreground"/>
            {bus.busCode}
          </div>
      ) : <span className="text-muted-foreground">Unknown Bus</span>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>Student Management</CardTitle>
            <CardDescription>
            Manage students for school {schoolId}.
            </CardDescription>
        </div>
        <StudentDialog onComplete={onDataNeedsRefresh} routes={routes} buses={buses} schoolId={schoolId}>
            <Button disabled={!schoolId}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Student
            </Button>
        </StudentDialog>
      </CardHeader>
      <CardContent>
         <div className="relative w-full mb-4">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Search by Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
            />
         </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Assigned Route</TableHead>
              <TableHead>Assigned Bus</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Skeleton className="h-4 w-1/2 mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredStudents.length > 0 ? (
              filteredStudents.map((student) => (
                <TableRow key={student.id}>
                    <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                            <Avatar>
                                <AvatarImage src={student.photoUrl} alt={student.name} />
                                <AvatarFallback>
                                    <GraduationCap className="h-5 w-5 text-muted-foreground" />
                                </AvatarFallback>
                            </Avatar>
                           <span>{student.name}</span>
                        </div>
                    </TableCell>
                    <TableCell>{student.grade || "N/A"}</TableCell>
                    <TableCell>{getRouteName(student)}</TableCell>
                    <TableCell>{getBusCode(student)}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                            <StudentDialog student={student} onComplete={onDataNeedsRefresh} routes={routes} buses={buses} schoolId={schoolId}>
                                <Button variant="ghost" size="icon">
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </StudentDialog>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" aria-label="Delete student">
                                       <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this student?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete student "{student.name}".
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(student.id, student.name)} className="bg-destructive hover:bg-destructive/90">
                                        Delete
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No students found. Add one to get started!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function StudentsPage() {
    const { profile, loading: profileLoading, error: profileError } = useProfile();
    const [routes, setRoutes] = useState<RouteInfo[]>([]);
    const [buses, setBuses] = useState<BusInfo[]>([]);
    const [key, setKey] = useState(0); 
    const schoolId = profile?.schoolId;

    const onDataNeedsRefresh = useCallback(() => setKey(k => k+1), []);

    useEffect(() => {
        const fetchData = async () => {
            if (!schoolId) return;
            try {
                const routesData = await listRoutesForSchool(schoolId);
                setRoutes(routesData as RouteInfo[]);
            } catch (error) {
              console.error("Error fetching routes:", error);
            }
            try {
                const busesData = await listBusesForSchool(schoolId);
                setBuses(busesData as BusInfo[]);
            } catch (error) {
              console.error("Error fetching buses:", error);
            }
        };
        if (schoolId) {
            fetchData();
        }
      }, [schoolId, key]);

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
        )
    }

    if (profileError) {
        return <div className="text-red-500">Error loading profile: {profileError.message}</div>
    }

    if (!profile) {
        return <div>No user profile found. Access denied.</div>
    }

    return (
        <div className="grid gap-8">
            <StudentsList key={key} routes={routes} buses={buses} schoolId={profile.schoolId} onDataNeedsRefresh={onDataNeedsRefresh} />
        </div>
    );
}
