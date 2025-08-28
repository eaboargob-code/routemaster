
"use client";

import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { useToast } from "@/hooks/use-toast";

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
import { PlusCircle, Trash2, Edit, X, Check, ArrowUpDown, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type RouteDoc = {
  id: string;
  name: string;
  schoolId: string;
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
    try {
      await addDoc(collection(db, "routes"), { ...values, schoolId });
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

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    setErr(null);
    try {
      const q = query(
        collection(db, "routes"),
        where("schoolId", "==", schoolId)
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          const rows: RouteDoc[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<RouteDoc, "id">),
          }));
          setRoutes(rows);
          setLoading(false);
        },
        (e) => {
          console.error("routes/onSnapshot error:", e);
          setErr(e.message ?? String(e));
          toast({ variant: "destructive", title: "Error fetching data", description: e.message });
          setLoading(false);
        }
      );
      return () => unsub();
    } catch (e: any) {
      console.error("routes/query init error:", e);
      setErr(e.message ?? String(e));
      toast({ variant: "destructive", title: "Error initializing query", description: e.message });
      setLoading(false);
    }
  }, [schoolId, toast]);

  const sortedAndFilteredRoutes = useMemo(() => {
    return routes
      .filter((route) =>
        route.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
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
    if (!editingName.trim()) {
        toast({ variant: "destructive", title: "Route name cannot be empty" });
        return;
    }
    try {
      await updateDoc(doc(db, "routes", id), { name: editingName.trim() });
      toast({ title: "Route updated successfully" });
      handleCancelEdit();
    } catch (e: any) {
      console.error("update name error:", e);
      toast({ variant: "destructive", title: "Failed to update route", description: e.message });
    }
  };

  async function toggleActive(id: string, next: boolean) {
    try {
      await updateDoc(doc(db, "routes", id), { active: next });
      toast({ title: `Route ${next ? 'activated' : 'deactivated'}` });
    } catch (e: any) {
      console.error("toggleActive error:", e);
      toast({ variant: "destructive", title: "Failed to update status", description: e.message });
    }
  }

  async function removeRoute(id: string) {
    try {
      await deleteDoc(doc(db, "routes", id));
      toast({ title: "Route deleted successfully" });
    } catch (e: any) {
      console.error("deleteRoute error:", e);
      toast({ variant: "destructive", title: "Failed to delete route", description: e.message });
    }
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
      return <div className="text-red-500">Error loading profile: {profileError.message}</div>
  }

  if (!profile) {
      return <div>No user profile found. Access denied.</div>
  }


  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Route Management</CardTitle>
            <CardDescription>
              Manage routes for school{" "}
              <span className="font-mono">{profile.schoolId}</span>.
            </CardDescription>
          </div>
          <Dialog open={isAddModalOpen} onOpenChange={setAddModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Route
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Route</DialogTitle>
                <DialogDescription>
                  Create a new route for your school.
                </DialogDescription>
              </DialogHeader>
              <AddRouteForm schoolId={profile.schoolId} onComplete={() => {
                  setAddModalOpen(false);
                  // Manually re-fetch routes after adding a new one
                  if (schoolId) {
                      setLoading(true);
                      const q = query(collection(db, "routes"), where("schoolId", "==", schoolId));
                      onSnapshot(q, (snap) => {
                          const rows: RouteDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RouteDoc, 'id'>) }));
                          setRoutes(rows);
                          setLoading(false);
                      });
                  }
              }} />
            </DialogContent>
          </Dialog>
        </div>
        <div className="mt-4 flex items-center gap-2">
            <div className="relative w-full">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search routes by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                />
            </div>
             <Button variant="outline" onClick={handleToggleSortOrder}>
                Name
                <ArrowUpDown className="ml-2 h-4 w-4" />
             </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-muted-foreground">Loading routes…</div>
        ) : err ? (
          <div className="text-center text-red-600">Error: {err}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAndFilteredRoutes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    No routes found. Add one to get started!
                  </TableCell>
                </TableRow>
              ) : (
                sortedAndFilteredRoutes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {editingId === r.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="h-8"
                          />
                           <Button variant="ghost" size="icon" onClick={() => handleSaveName(r.id)}><Check className="h-4 w-4 text-green-600"/></Button>
                           <Button variant="ghost" size="icon" onClick={handleCancelEdit}><X className="h-4 w-4 text-red-600"/></Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                            {r.name}
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(r)}>
                                <Edit className="h-4 w-4" />
                            </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={r.active}
                        onCheckedChange={(val) => toggleActive(r.id, val)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                       <AlertDialog>
                          <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the route "{r.name}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeRoute(r.id)} className="bg-destructive hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                          </AlertDialogContent>
                       </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
