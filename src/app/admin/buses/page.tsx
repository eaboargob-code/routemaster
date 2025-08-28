
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";

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
  FormDescription,
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
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Trash2, Pencil, Search, Route } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const busSchema = z.object({
  busCode: z.string().min(1, { message: "Bus code is required." }),
  plate: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  assignedRouteId: z.string().optional(),
  active: z.boolean().default(true),
});

type BusFormValues = z.infer<typeof busSchema>;

interface Bus {
  id: string;
  busCode: string;
  plate?: string;
  capacity?: number;
  assignedRouteId?: string;
  active: boolean;
  schoolId: string;
}

interface Route {
    id: string;
    name: string;
}


function BusForm({ bus, onComplete, routes, schoolId }: { bus?: Bus, onComplete: () => void, routes: Route[], schoolId: string }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isEditMode = !!bus;

    const form = useForm<BusFormValues>({
        resolver: zodResolver(busSchema),
        defaultValues: {
            busCode: bus?.busCode || "",
            plate: bus?.plate || "",
            capacity: bus?.capacity || undefined,
            assignedRouteId: bus?.assignedRouteId || "",
            active: bus?.active ?? true,
        },
    });

    const onSubmit = async (data: BusFormValues) => {
        setIsSubmitting(true);
        try {
            const busData = { ...data, schoolId };
            if (isEditMode) {
                const busRef = doc(db, "buses", bus.id);
                await updateDoc(busRef, busData);
                toast({
                    title: "Success!",
                    description: "Bus has been updated.",
                    className: 'bg-accent text-accent-foreground border-0',
                });
            } else {
                await addDoc(collection(db, "buses"), busData);
                toast({
                    title: "Success!",
                    description: "New bus has been added.",
                    className: 'bg-accent text-accent-foreground border-0',
                });
            }
            form.reset();
            onComplete();
        } catch (error) {
            console.error("Error saving bus: ", error);
            toast({
                variant: "destructive",
                title: "Uh oh! Something went wrong.",
                description: "There was a problem saving the bus.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
         <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             <FormField
                control={form.control}
                name="busCode"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Bus Code</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., BUS-001" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            <FormField
                control={form.control}
                name="plate"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>License Plate (Optional)</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., XYZ-123" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
             <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Capacity (Optional)</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="e.g., 50" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            <FormField
              control={form.control}
              name="assignedRouteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign to Route (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a route" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {routes.map((route) => (
                        <SelectItem key={route.id} value={route.id}>
                          {route.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="ghost">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {isSubmitting ? "Saving..." : (isEditMode ? "Save Changes" : "Add Bus")}
                </Button>
            </DialogFooter>
          </form>
        </Form>
    );
}

function BusDialog({ children, bus, onComplete, routes, schoolId }: { children: React.ReactNode, bus?: Bus, onComplete: () => void, routes: Route[], schoolId: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{bus ? 'Edit Bus' : 'Add New Bus'}</DialogTitle>
                    <DialogDescription>
                       {bus ? 'Update the details for this bus.' : 'Fill in the details for the new bus.'}
                    </DialogDescription>
                </DialogHeader>
                <BusForm bus={bus} routes={routes} schoolId={schoolId} onComplete={() => { setIsOpen(false); onComplete(); }} />
            </DialogContent>
        </Dialog>
    );
}


function BusesList({ routes, schoolId }: { routes: Route[], schoolId: string }) {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (!schoolId) {
        setIsLoading(false);
        return;
    }
    const q = query(collection(db, "buses"), where("schoolId", "==", schoolId));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const busesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bus));
      setBuses(busesData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching buses:", error);
      toast({ variant: "destructive", title: "Error fetching buses", description: error.message });
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [schoolId, toast]);

  const handleDelete = async (bus: Bus) => {
      try {
          await deleteDoc(doc(db, "buses", bus.id));
          toast({
              title: "Bus Deleted",
              description: `Bus "${bus.busCode}" has been removed.`,
          });
      } catch (error) {
          console.error("Error deleting bus: ", error);
          toast({
              variant: "destructive",
              title: "Deletion Failed",
              description: "There was a problem deleting the bus.",
          });
      }
  };

  const filteredBuses = useMemo(() => {
      return buses.filter(bus =>
        bus.busCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bus.plate?.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [buses, searchTerm]);
  
  const getRouteName = (routeId?: string) => {
      if (!routeId) return <span className="text-muted-foreground">Not Assigned</span>;
      const route = routes.find(r => r.id === routeId);
      return route ? (
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-primary"/>
            {route.name}
          </div>
      ) : <span className="text-muted-foreground">Unknown Route</span>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>Bus Management</CardTitle>
            <CardDescription>
            Manage your fleet of buses for school {schoolId}.
            </CardDescription>
        </div>
        <BusDialog onComplete={() => {}} routes={routes} schoolId={schoolId}>
            <Button disabled={!schoolId}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Bus
            </Button>
        </BusDialog>
      </CardHeader>
      <CardContent>
         <div className="relative w-full mb-4">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Search by Bus Code or Plate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
            />
         </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bus Code</TableHead>
              <TableHead>License Plate</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Assigned Route</TableHead>
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
            ) : filteredBuses.length > 0 ? (
              filteredBuses.map((bus) => (
                <TableRow key={bus.id}>
                    <TableCell className="font-medium">{bus.busCode}</TableCell>
                    <TableCell>{bus.plate || 'N/A'}</TableCell>
                    <TableCell>{bus.capacity || 'N/A'}</TableCell>
                    <TableCell>{getRouteName(bus.assignedRouteId)}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                            <BusDialog bus={bus} onComplete={() => {}} routes={routes} schoolId={schoolId}>
                                <Button variant="ghost" size="icon">
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </BusDialog>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700">
                                       <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete bus "{bus.busCode}".
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(bus)} className="bg-destructive hover:bg-destructive/90">
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
                  No buses found. Add one to get started!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function BusesPage() {
    const { profile, loading: profileLoading, error: profileError } = useProfile();
    const [routes, setRoutes] = useState<Route[]>([]);
    
    const schoolId = profile?.schoolId;

    useEffect(() => {
        if (!schoolId) return;

        const q = query(collection(db, "routes"), where("schoolId", "==", schoolId));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const routesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route));
          setRoutes(routesData);
        }, (error) => {
          console.error("Error fetching routes:", error);
        });
        return () => unsubscribe();
      }, [schoolId]);

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
            <BusesList routes={routes} schoolId={profile.schoolId} />
        </div>
    );
}

    
    