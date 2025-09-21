
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Pin, ArrowLeft, PlusCircle, Trash2, Edit, Check, X } from "lucide-react";
import { useProfile } from "@/lib/useProfile";
import { useState, useEffect, useMemo } from "react";
import { getRouteById, listStopsForRoute, addStopToRoute, updateStop, deleteStop } from "@/lib/firestoreQueries";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { DocumentData } from "firebase/firestore";

interface Stop extends DocumentData {
  id: string;
  name: string;
  order: number;
  lat: number;
  lng: number;
  scheduledTime?: string;
}

const stopSchema = z.object({
  name: z.string().min(1, "Name is required"),
  order: z.coerce.number().int("Order must be a whole number"),
  lat: z.coerce.number().min(-90).max(90, "Invalid latitude"),
  lng: z.coerce.number().min(-180).max(180, "Invalid longitude"),
  scheduledTime: z.string().optional(),
});

type StopFormValues = z.infer<typeof stopSchema>;

function StopForm({ routeId, schoolId, stop, onComplete }: { routeId: string, schoolId: string, stop?: Stop, onComplete: () => void }) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!stop;

  const form = useForm<StopFormValues>({
    resolver: zodResolver(stopSchema),
    defaultValues: {
      name: stop?.name || "",
      order: stop?.order || 0,
      lat: stop?.lat || 0,
      lng: stop?.lng || 0,
      scheduledTime: stop?.scheduledTime || "",
    }
  });

  const onSubmit = async (values: StopFormValues) => {
    setIsSubmitting(true);
    try {
      if (isEditMode) {
        await updateStop(schoolId, routeId, stop.id, values);
        toast({ title: "Stop updated!" });
      } else {
        await addStopToRoute(schoolId, routeId, values);
        toast({ title: "Stop added!" });
      }
      onComplete();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="order" render={({ field }) => (
          <FormItem><FormLabel>Order</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="lat" render={({ field }) => (
          <FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="lng" render={({ field }) => (
          <FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="scheduledTime" render={({ field }) => (
          <FormItem><FormLabel>Scheduled Time (Optional)</FormLabel><FormControl><Input placeholder="e.g., 07:15" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Stop"}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function RouteStopsPage({ params }: { params: { id: string } }) {
  const { profile, loading: profileLoading } = useProfile();
  const [route, setRoute] = useState<DocumentData | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isAddDialogOpen, setAddDialogOpen] = useState(false);
  const { toast } = useToast();
  const routeId = params.id;
  const schoolId = profile?.schoolId;

  useEffect(() => {
    if (!schoolId || !routeId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [routeData, stopsData] = await Promise.all([
          getRouteById(schoolId, routeId),
          listStopsForRoute(schoolId, routeId)
        ]);
        if (!routeData) throw new Error("Route not found");
        setRoute(routeData);
        setStops(stopsData as Stop[]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [schoolId, routeId, refreshKey]);

  const sortedStops = useMemo(() => stops.sort((a, b) => a.order - b.order), [stops]);

  const onActionComplete = () => {
    setAddDialogOpen(false);
    setRefreshKey(k => k + 1);
  };

  const handleDelete = async (stopId: string) => {
    if (!schoolId || !routeId) return;
    try {
      await deleteStop(schoolId, routeId, stopId);
      toast({ title: "Stop deleted" });
      onActionComplete();
    } catch(e: any) {
      toast({ variant: "destructive", title: "Delete failed", description: e.message });
    }
  }

  if (profileLoading || loading) {
    return <Skeleton className="h-96 w-full" />
  }

  if (error) {
    return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  }
  
  if (!route) {
    return <Alert><AlertTitle>Not Found</AlertTitle><AlertDescription>The requested route could not be found.</AlertDescription></Alert>
  }

  return (
    <Card>
      <CardHeader>
        <Link href="/admin/routes" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to Routes
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Pin />
              Manage Stops for "{route.name}"
            </CardTitle>
            <CardDescription>
              Add, remove, and reorder stops for this route.
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button><PlusCircle className="mr-2 h-4 w-4"/>Add Stop</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Stop</DialogTitle><DialogDescription>Fill in the details for the new stop.</DialogDescription></DialogHeader>
              <StopForm routeId={routeId} schoolId={schoolId!} onComplete={onActionComplete} />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <AlertTitle>TODO: Drag-to-Reorder</AlertTitle>
          <AlertDescription>
            The functionality to drag and drop rows to re-order stops will be implemented here.
          </AlertDescription>
        </Alert>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Latitude</TableHead>
              <TableHead>Longitude</TableHead>
              <TableHead>Scheduled Time</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStops.length > 0 ? sortedStops.map(stop => (
              <TableRow key={stop.id}>
                <TableCell>{stop.order}</TableCell>
                <TableCell className="font-medium">{stop.name}</TableCell>
                <TableCell>{stop.lat}</TableCell>
                <TableCell>{stop.lng}</TableCell>
                <TableCell>{stop.scheduledTime || "N/A"}</TableCell>
                <TableCell className="text-right flex items-center justify-end gap-2">
                  <Dialog>
                    <DialogTrigger asChild><Button variant="ghost" size="icon"><Pencil className="h-4 w-4"/></Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Edit Stop</DialogTitle></DialogHeader>
                      <StopForm routeId={routeId} schoolId={schoolId!} stop={stop} onComplete={onActionComplete} />
                    </DialogContent>
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600"><Trash2 className="h-4 w-4"/></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete this stop?</AlertDialogTitle><AlertDialogDescription>This will permanently remove "{stop.name}". This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(stop.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className="h-24 text-center">No stops found. Add one to get started.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
