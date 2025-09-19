
"use client";

import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { useProfile } from "@/lib/useProfile";
import { useToast } from "@/hooks/use-toast";
import { listRoutesForSchool } from "@/lib/firestoreQueries";
import { scol, sdoc } from "@/lib/schoolPath";
import Link from 'next/link';


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  DialogClose,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PlusCircle, Trash2, Edit, X, Check, ArrowUpDown, Search, Wrench, Pin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface RouteDoc extends DocumentData {
  id: string;
  name: string;
  schoolId?: string;
  active: boolean;
};

const routeSchema = z.object({
  name: z.string().min(1, { message: "Route name is required." }),
  active: z.boolean(),
});
type RouteFormValues = z.infer<typeof routeSchema>;

function AddRouteForm({ schoolId, onComplete }: { schoolId: string, onComplete: () => void }) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: { name: "", active: true },
  });

  async function onSubmit(values: RouteFormValues) {
    setIsSubmitting(true);
    if (!schoolId) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "School ID is missing. Cannot add route.",
        });
        setIsSubmitting(false);
        return;
    }
    try {
      await addDoc(scol(schoolId, "routes"), { ...values });
      toast({
        title: "Route Added",
        description: `Route "${values.name}" has been successfully created.`,
        className: "bg-accent text-accent-foreground",
      });
      form.reset();
      onComplete();
    } catch (e: any) {
      console.error("addRoute error:", e);
      toast({
        variant: "destructive",
        title: "Failed to add route",
        description: e.message ?? String(e),
      });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Route Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Morning A" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <FormLabel>Active</FormLabel>
                <FormDescription>
                  Inactive routes will not be available for assignment.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">Cancel</Button>
          </DialogClose>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Route"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function RoutesPage() {
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const [routes, setRoutes] = useState<RouteDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  
  const schoolId = profile?.schoolId;

  const loadRoutes = async (schId: string) => {
    setLoading(true);
    setErr(null);
    try {
        const routesData = await listRoutesForSchool(schId);
        setRoutes(routesData as RouteDoc[]);
    } catch (e: any) {
        console.error("[routes load]", e);
        const errorMessage = e.code === 'permission-denied' 
            ? "You do not have permission to view these routes."
            : e.message ?? "An unknown error occurred.";
        setErr(errorMessage);
        toast({ variant: "destructive", title: "Error fetching routes", description: errorMessage });
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    if (schoolId) {
      loadRoutes(schoolId);
    } else if (!profileLoading) {
      setLoading(false);
    }
  }, [schoolId, profileLoading]);

  const sortedAndFilteredRoutes = useMemo(() => {
    return routes
      .filter((route) =>
        (route.name || "").toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        if (nameA < nameB) return sortOrder === "asc" ? -1 : 1;
        if (nameA > nameB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [routes, searchTerm, sortOrder]);

  const handleToggleSortOrder = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  const handleEdit = (route: RouteDoc) => {
    setEditingId(route.id);
    setEditingName(route.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleSaveName = async (id: string) => {
    if (!schoolId || !editingName.trim()) {
        toast({ variant: "destructive", title: "Route name cannot be empty" });
        return;
    }
    try {
      const routeRef = sdoc(schoolId, "routes", id);
      await updateDoc(routeRef, { name: editingName.trim() });
      toast({ title: "Route updated successfully" });
      await loadRoutes(schoolId);
      handleCancelEdit();
    } catch (e: any) {
      console.error("update name error:", e);
      toast({ variant: "destructive", title: "Failed to update route", description: e.message });
    }
  };

  async function toggleActive(id: string, next: boolean) {
    if (!schoolId) return;
    try {
      const routeRef = sdoc(schoolId, "routes", id);
      await updateDoc(routeRef, { active: next });
      toast({ title: `Route ${next ? 'activated' : 'deactivated'}` });
      await loadRoutes(schoolId);
    } catch (e: any) {
      console.error("toggleActive error:", e);
      toast({ variant: "destructive", title: "Failed to update status", description: e.message });
    }
  }

  async function removeRoute(id: string) {
    if (!schoolId) return;
    try {
      await deleteDoc(sdoc(schoolId, "routes", id));
      toast({ title: "Route deleted successfully" });
      await loadRoutes(schoolId);
    } catch (e: any) {
      console.error("removeRoute error:", e);
      toast({ variant: "destructive", title: "Failed to delete route", description: e.message });
    }
  }
  
  const handleAddComplete = () => {
    setAddModalOpen(false);
    if(schoolId) loadRoutes(schoolId);
  }

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
      return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{profileError.message}</AlertDescription></Alert>
  }

  if (!profile || !schoolId) {
      return <Alert><AlertTitle>Access Denied</AlertTitle><AlertDescription>No user profile found.</AlertDescription></Alert>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle>Manage Routes</CardTitle>
                <CardDescription>
                    View, create, and manage bus routes for school {profile.schoolId}.
                </CardDescription>
            </div>
            <Dialog open={isAddModalOpen} onOpenChange={setAddModalOpen}>
                <DialogTrigger asChild>
                    <Button><PlusCircle className="mr-2 h-4 w-4" /> Add Route</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Route</DialogTitle>
                        <DialogDescription>
                            Enter the details for your new route.
                        </DialogDescription>
                    </DialogHeader>
                    <AddRouteForm schoolId={profile.schoolId} onComplete={handleAddComplete} />
                </DialogContent>
            </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
            <div className="relative w-full max-w-sm">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search routes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                />
            </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" onClick={handleToggleSortOrder}>
                  Route Name
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                    <Skeleton className="h-4 w-1/2 mx-auto" />
                </TableCell>
              </TableRow>
            ) : err ? (
                <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-red-500">
                        <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{err}</AlertDescription></Alert>
                    </TableCell>
                </TableRow>
            ) : sortedAndFilteredRoutes.length > 0 ? (
              sortedAndFilteredRoutes.map((route) => (
                <TableRow key={route.id}>
                  <TableCell>
                    {editingId === route.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8"
                        />
                        <Button variant="ghost" size="icon" onClick={() => handleSaveName(route.id)}><Check className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={handleCancelEdit}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>{route.name}</span>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(route)}><Edit className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={route.active}
                      onCheckedChange={(next) => toggleActive(route.id, next)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/routes/${route.id}/stops`}>
                                <Pin className="h-4 w-4 mr-2" />
                                Manage Stops
                            </Link>
                        </Button>
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
                                      This will permanently delete the route "{route.name}". This action cannot be undone.
                                  </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeRoute(route.id)} className="bg-destructive hover:bg-destructive/90">
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
                <TableCell colSpan={3} className="h-24 text-center">
                  No routes found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
