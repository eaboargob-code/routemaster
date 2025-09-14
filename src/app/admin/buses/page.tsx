
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
  writeBatch,
  getDoc,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { listBusesForSchool, listRoutesForSchool, listUsersForSchool, getRouteById } from "@/lib/firestoreQueries";
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
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Trash2, Pencil, Search, Route, User, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const busSchema = z.object({
  busCode: z.string().min(1, { message: "Bus code is required." }),
  plate: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  assignedRouteId: z.string().nullable().optional(),
  active: z.boolean().default(true),
});

type BusFormValues = z.infer<typeof busSchema>;

interface Bus extends DocumentData {
  id: string;
  busCode: string;
  plate?: string;
  capacity?: number;
  assignedRouteId?: string | null;
  driverId?: string | null;
  supervisorId?: string | null;
  active: boolean;
  schoolId: string;
}

interface Route {
    id: string;
    name: string;
}

interface UserInfo extends DocumentData {
    id: string;
    displayName: string;
    email: string;
}

const NONE_SENTINEL = "__none__";

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
            assignedRouteId: bus?.assignedRouteId || null,
            active: bus?.active ?? true,
        },
    });

    const onSubmit = async (data: BusFormValues) => {
        setIsSubmitting(true);
        try {
            const busData: any = {
                ...data,
            };
            
            if (data.assignedRouteId === NONE_SENTINEL || !data.assignedRouteId) {
                busData.assignedRouteId = deleteField();
            } else {
                busData.assignedRouteId = data.assignedRouteId;
            }

            if (isEditMode) {
                const busRef = sdoc(schoolId, "buses", bus.id);
                await updateDoc(busRef, busData);
                toast({
                    title: "Success!",
                    description: "Bus has been updated.",
                    className: 'bg-accent text-accent-foreground border-0',
                });
            } else {
                await addDoc(scol(schoolId, "buses"), busData);
                toast({
                    title: "Success!",
                    description: "New bus has been added.",
                    className: 'bg-accent text-accent-foreground border-0',
                });
            }
            form.reset();
            onComplete();
        } catch (error) {
            console.error("[buses save]", error);
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
                        <Input placeholder="e.g., XYZ-123" {...field} value={field.value ?? ""} />
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
                        <Input type="number" placeholder="e.g., 50" {...field} value={field.value ?? ""} />
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
                  <Select
                    value={field.value ?? NONE_SENTINEL}
                    onValueChange={(value) => field.onChange(value === NONE_SENTINEL ? null : value)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a route" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE_SENTINEL}>Not Assigned</SelectItem>
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
                  {isSubmitting ? "Saving..." : (isEditMode ? "Save Changes" : "Add Bus")}
                </Button>
            </DialogFooter>
          </form>
        </Form>
    );
}

function BusDialog({ children, bus, onComplete, routes, schoolId }: { children: React.ReactNode, bus?: Bus, onComplete: () => void, routes: Route[], schoolId: string }) {
    const [isOpen, setIsOpen] = useState(false);

    const handleComplete = () => {
        setIsOpen(false);
        onComplete();
    }

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
                <BusForm bus={bus} routes={routes} schoolId={schoolId} onComplete={handleComplete} />
            </DialogContent>
        </Dialog>
    );
}


function BusesList({ routes, drivers, supervisors, schoolId, onDataNeedsRefresh }: { routes: Route[], drivers: UserInfo[], supervisors: UserInfo[], schoolId: string, onDataNeedsRefresh: () => void }) {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const fetchBuses = async () => {
        if (!schoolId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const busesData = await listBusesForSchool(schoolId);
            setBuses(busesData as Bus[]);
        } catch (error: any) {
            console.error("Error fetching buses:", error);
            setError(error.message || "Failed to fetch buses.");
        } finally {
            setIsLoading(false);
        }
    };
    fetchBuses();
  }, [schoolId, onDataNeedsRefresh]);

  const handleDelete = async (busId: string) => {
      try {
          await deleteDoc(sdoc(schoolId, "buses", busId));
          toast({
              title: "Bus Deleted",
              description: `Bus has been removed.`,
          });
          onDataNeedsRefresh();
      } catch (error) {
          console.error("[buses delete]", error);
          toast({
              variant: "destructive",
              title: "Deletion Failed",
              description: "There was a problem deleting the bus.",
          });
      }
  };
  
  const handleAssignUser = async (busId: string, field: 'driverId' | 'supervisorId', newUserId: string | null) => {
    const busRef = sdoc(schoolId, "buses", busId);

    try {
        const batch = writeBatch(db);

        // --- Handle Supervisor Assignment (simple case) ---
        if (field === 'supervisorId') {
            const updateData = newUserId ? { supervisorId: newUserId } : { supervisorId: deleteField() };
            batch.update(busRef, updateData);
            await batch.commit();
            onDataNeedsRefresh();
            toast({ title: 'Supervisor updated successfully' });
            return;
        }

        // --- Handle Driver Assignment (complex case with denormalization) ---
        
        // 1. Get current bus state to find old driver and route info
        const busSnap = await getDoc(busRef);
        if (!busSnap.exists()) throw new Error("Bus not found!");
        const busData = busSnap.data() as Bus;
        const oldDriverId = busData.driverId;
        
        // 2. Clear assignment from the old driver's user doc
        if (oldDriverId && oldDriverId !== newUserId) {
            const oldDriverRef = sdoc(schoolId, "users", oldDriverId);
            batch.update(oldDriverRef, {
                assignedBusId: deleteField(),
                assignedBusCode: deleteField(),
                assignedRouteId: deleteField(),
            });
        }
        
        // 3. Update the bus document itself
        const busUpdate = newUserId ? { driverId: newUserId } : { driverId: deleteField() };
        batch.update(busRef, busUpdate);

        // 4. Set assignment on the new driver's user doc
        if (newUserId) {
            const newDriverRef = sdoc(schoolId, "users", newUserId);
            const route = busData.assignedRouteId ? await getRouteById(schoolId, busData.assignedRouteId) : null;
            
            const userUpdate: DocumentData = {
                assignedBusId: busId,
                assignedBusCode: busData.busCode,
            };
            if (route) {
                userUpdate.assignedRouteId = route.id;
            } else {
                userUpdate.assignedRouteId = deleteField();
            }
            batch.update(newDriverRef, userUpdate);
        }

        await batch.commit();

        onDataNeedsRefresh();
        toast({ title: 'Driver updated successfully' });

    } catch(err) {
        console.error(`[bus ${field} update]`, err);
        toast({ variant: "destructive", title: "Error", description: `Failed to update ${field === 'driverId' ? 'driver' : 'supervisor'}` });
    }
  }

  const filteredBuses = useMemo(() => {
      const search = searchTerm.trim().toLowerCase();
      if (!search) return buses;
      return buses.filter(bus =>
        (bus.busCode?.toLowerCase?.() ?? "").includes(search) ||
        (bus.plate?.toLowerCase?.() ?? "").includes(search)
      );
  }, [buses, searchTerm]);
  
  const getRouteName = (routeId?: string | null) => {
      if (!routeId) return <span className="text-muted-foreground">Not Assigned</span>;
      const route = routes.find(r => r.id === routeId);
      return route ? (
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-primary"/>
            {route.name}
          </div>
      ) : <span className="text-muted-foreground">Unknown Route</span>;
  }
  
  const renderUserSelect = (bus: Bus, userType: 'driver' | 'supervisor', usersList: UserInfo[]) => {
    const currentUserId = userType === 'driver' ? bus.driverId : bus.supervisorId;
    const Icon = userType === 'driver' ? User : Eye;

    return (
      <Select
        value={currentUserId ?? NONE_SENTINEL}
        onValueChange={(value) => handleAssignUser(bus.id, `${userType}Id`, value === NONE_SENTINEL ? null : value)}
      >
        <SelectTrigger>
          <SelectValue placeholder={`Select a ${userType}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_SENTINEL}>Not Assigned</SelectItem>
          {usersList.map((user) => (
            <SelectItem key={user.id} value={user.id}>
                <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground"/>
                    {user.displayName || user.email}
                </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
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
        <BusDialog onComplete={onDataNeedsRefresh} routes={routes} schoolId={schoolId}>
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
         {error && <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bus Code</TableHead>
              <TableHead>License Plate</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Assigned Route</TableHead>
              <TableHead>Assigned Driver</TableHead>
              <TableHead>Assigned Supervisor</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Skeleton className="h-4 w-1/2 mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredBuses.length > 0 ? (
              filteredBuses.map((bus) => (
                <TableRow key={bus.id}>
                    <TableCell className="font-medium">{bus.busCode || '(no code)'}</TableCell>
                    <TableCell>{bus.plate || 'N/A'}</TableCell>
                    <TableCell>{bus.capacity || 'N/A'}</TableCell>
                    <TableCell>{getRouteName(bus.assignedRouteId)}</TableCell>
                    <TableCell>
                        {renderUserSelect(bus, 'driver', drivers)}
                    </TableCell>
                     <TableCell>
                        {renderUserSelect(bus, 'supervisor', supervisors)}
                    </TableCell>
                    <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                            <BusDialog bus={bus} onComplete={onDataNeedsRefresh} routes={routes} schoolId={schoolId}>
                                <Button variant="ghost" size="icon">
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </BusDialog>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" aria-label="Delete bus">
                                       <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this bus?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete bus "{bus.busCode}".
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(bus.id)} className="bg-destructive hover:bg-destructive/90">
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
                <TableCell colSpan={7} className="h-24 text-center">
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
    const [drivers, setDrivers] = useState<UserInfo[]>([]);
    const [supervisors, setSupervisors] = useState<UserInfo[]>([]);
    const [key, setKey] = useState(0); 
    const [isLoading, setIsLoading] = useState(true);
    const schoolId = profile?.schoolId;

    const onDataNeedsRefresh = useCallback(() => setKey(k => k+1), []);

    useEffect(() => {
        const fetchData = async () => {
            if (!schoolId) return;
            setIsLoading(true);

            try {
                const [routesData, driversData, supervisorsData] = await Promise.all([
                    listRoutesForSchool(schoolId),
                    listUsersForSchool(schoolId, 'driver'),
                    listUsersForSchool(schoolId, 'supervisor')
                ]);
                setRoutes(routesData as Route[]);
                setDrivers(driversData as UserInfo[]);
                setSupervisors(supervisorsData as UserInfo[]);
            } catch(error) {
                console.error("Error fetching related data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        if (schoolId) {
          fetchData();
        }
      }, [schoolId, key]);

    if (profileLoading || (isLoading && !profileError)) {
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
        return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{profileError.message}</AlertDescription></Alert>
    }

    if (!profile) {
        return <Alert><AlertTitle>No Profile</AlertTitle><AlertDescription>User profile not found. Access denied.</AlertDescription></Alert>
    }

    return (
        <div className="grid gap-8">
            <BusesList key={key} routes={routes} drivers={drivers} supervisors={supervisors} schoolId={profile.schoolId} onDataNeedsRefresh={onDataNeedsRefresh} />
        </div>
    );
}
