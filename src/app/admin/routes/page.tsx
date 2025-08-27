"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  collection,
  addDoc,
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
import { useToast } from "@/hooks/use-toast";
import { PlusCircle } from "lucide-react";

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

function RoutesList() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Route Management</CardTitle>
        <CardDescription>
          Here is a list of all routes for school TRP001.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route Name</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={2} className="h-24 text-center">
                  Loading routes...
                </TableCell>
              </TableRow>
            ) : routes.length > 0 ? (
              routes.map((route) => (
                <TableRow key={route.id}>
                  <TableCell className="font-medium">{route.name}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={route.active ? "default" : "secondary"}>
                      {route.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} className="h-24 text-center">
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
