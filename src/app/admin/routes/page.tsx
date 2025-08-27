"use client";

import { useEffect, useState, useCallback, useMemo, useTransition } from "react";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Trash2, Pencil, Check, X, Search, ArrowDownAZ, ArrowUpZA } from "lucide-react";

const routeSchema = z.object({
  name: z.string().min(1, { message: "Route name is required." }),
  active: z.boolean().default(true),
});

type RouteFormValues = z.infer<typeof routeSchema>;

interface Route {
  id: string;
  name: string;
  active: boolean;
  schoolId: string;
}

function AddRouteForm({ onRouteAdded }: { onRouteAdded: () => void }) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: {
      name: "",
      active: true,
    },
  });

  const onSubmit = async (data: RouteFormValues) => {
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "routes"), {
        ...data,
        schoolId: "TRP001",
      });
      toast({
        title: "Success!",
        description: `Route "${data.name}" has been created.`,
        className: 'bg-accent text-accent-foreground border-0',
      });
      form.reset();
      onRouteAdded();
    } catch (error) {
      console.error("Error adding route: ", error);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: "There was a problem creating the route.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add New Route</CardTitle>
        <CardDescription>Create a new bus route for your school.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Route Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Morning Route A" {...field} />
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
                    <FormLabel>Active Status</FormLabel>
                    <FormDescription>
                      Inactive routes will not be visible to others.
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
            <Button type="submit" disabled={isSubmitting}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {isSubmitting ? "Adding..." : "Add Route"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function EditableRouteRow({ route }: { route: Route }) {
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(route.name);
    const [isPending, startTransition] = useTransition();

    const handleUpdate = async (field: 'name' | 'active', value: string | boolean) => {
        const routeRef = doc(db, "routes", route.id);
        try {
            await updateDoc(routeRef, { [field]: value });
            toast({
                title: "Success!",
                description: `Route has been updated.`,
                className: 'bg-accent text-accent-foreground border-0',
            });
            if (field === 'name') {
                setIsEditing(false);
            }
        } catch (error) {
            console.error("Error updating route: ", error);
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: "There was a problem updating the route.",
            });
             if (field === 'name') {
                setName(route.name); // revert on failure
             }
        }
    };
    
    const handleDelete = async () => {
        startTransition(async () => {
            try {
                await deleteDoc(doc(db, "routes", route.id));
                toast({
                    title: "Route Deleted",
                    description: `Route "${route.name}" has been removed.`,
                });
            } catch (error) {
                console.error("Error deleting route: ", error);
                toast({
                    variant: "destructive",
                    title: "Deletion Failed",
                    description: "There was a problem deleting the route.",
                });
            }
        });
    };

    const onNameSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim() && name.trim() !== route.name) {
            handleUpdate('name', name.trim());
        } else {
            setName(route.name);
            setIsEditing(false);
        }
    }

    return (
        <TableRow key={route.id}>
            <TableCell className="font-medium">
                {isEditing ? (
                    <form onSubmit={onNameSubmit} className="flex items-center gap-2">
                        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" autoFocus />
                        <Button type="submit" size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700">
                            <Check className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => { setIsEditing(false); setName(route.name); }}>
                            <X className="h-4 w-4" />
                        </Button>
                    </form>
                ) : (
                    <div className="flex items-center gap-2">
                       {route.name}
                       <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground opacity-50 hover:opacity-100" onClick={() => setIsEditing(true)}>
                           <Pencil className="h-4 w-4" />
                       </Button>
                    </div>
                )}
            </TableCell>
            <TableCell>
                <Switch
                    checked={route.active}
                    onCheckedChange={(value) => handleUpdate('active', value)}
                    aria-label="Toggle Active Status"
                />
            </TableCell>
            <TableCell className="text-right">
                <Badge variant={route.active ? "default" : "secondary"}>
                    {route.active ? "Active" : "Inactive"}
                </Badge>
            </TableCell>
            <TableCell className="text-right">
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" disabled={isPending}>
                           <Trash2 className="h-4 w-4" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the route
                            "{route.name}".
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </TableCell>
        </TableRow>
    );
}

function RoutesList() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "routes"),
      where("schoolId", "==", "TRP001")
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const routesData = querySnapshot.docs.map(
        (doc: QueryDocumentSnapshot<DocumentData>) => ({
          id: doc.id,
          ...(doc.data() as Omit<Route, 'id'>),
        })
      );
      setRoutes(routesData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching routes:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  const filteredAndSortedRoutes = useMemo(() => {
      return routes
        .filter(route => route.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            if (sortAsc) {
                return a.name.localeCompare(b.name);
            } else {
                return b.name.localeCompare(a.name);
            }
        });
  }, [routes, searchTerm, sortAsc]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Route Management</CardTitle>
        <CardDescription>
          Here is a list of all routes for school TRP001.
        </CardDescription>
      </CardHeader>
      <CardContent>
         <div className="flex items-center gap-2 mb-4">
             <div className="relative w-full">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                />
             </div>
             <Button variant="outline" onClick={() => setSortAsc(!sortAsc)}>
                {sortAsc ? <ArrowDownAZ className="mr-2 h-4 w-4" /> : <ArrowUpZA className="mr-2 h-4 w-4" />}
                Sort
             </Button>
         </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route Name</TableHead>
              <TableHead>Toggle Status</TableHead>
              <TableHead>Current Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  Loading routes...
                </TableCell>
              </TableRow>
            ) : filteredAndSortedRoutes.length > 0 ? (
              filteredAndSortedRoutes.map((route) => (
                <EditableRouteRow key={route.id} route={route} />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No routes found. Add one to get started!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function RoutesPage() {
    // This key is used to force a re-render of the list, but with onSnapshot, it's not strictly necessary.
    // However, it can be useful for other types of refreshes. We'll leave it for now.
    const [key, setKey] = useState(0);
    const forceRerender = useCallback(() => setKey(k => k + 1), []);

    return (
        <div className="grid gap-8 md:grid-cols-5">
            <div className="md:col-span-3">
                <RoutesList key={key} />
            </div>
            <div className="md:col-span-2">
                <AddRouteForm onRouteAdded={forceRerender} />
            </div>
        </div>
    );
}
