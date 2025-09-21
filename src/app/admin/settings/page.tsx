
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Settings } from "lucide-react";
import { useProfile } from "@/lib/useProfile";
import { getTransportConfig, updateTransportConfig } from "@/lib/firestoreQueries";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const settingsSchema = z.object({
  allowDriverAsSupervisor: z.boolean(),
  driverSupervisionDefaultLocked: z.boolean(),
  nearDistanceM: z.coerce.number().int().positive(),
  arriveDistanceM: z.coerce.number().int().positive(),
  locationMinDistanceM: z.coerce.number().int().positive(),
  locationMinSeconds: z.coerce.number().int().positive(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const schoolId = profile?.schoolId;

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      allowDriverAsSupervisor: false,
      driverSupervisionDefaultLocked: false,
      nearDistanceM: 1000,
      arriveDistanceM: 70,
      locationMinDistanceM: 100,
      locationMinSeconds: 60,
    }
  });

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    getTransportConfig(schoolId).then(config => {
      if (config) {
        form.reset(config);
      }
    }).finally(() => setLoading(false));
  }, [schoolId, form]);

  const onSubmit = async (values: SettingsFormValues) => {
    if (!schoolId) return;
    try {
      await updateTransportConfig(schoolId, values);
      toast({ title: "Settings Saved", description: "Transport settings have been updated." });
    } catch(e: any) {
      toast({ variant: "destructive", title: "Save Failed", description: e.message });
    }
  };

  if (profileLoading || loading) {
    return <Skeleton className="h-96 w-full" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Settings />
            Transport Settings
        </CardTitle>
        <CardDescription>
          Configure global settings for transport operations for your school.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
            <FormField
              control={form.control}
              name="allowDriverAsSupervisor"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Allow Driver as Supervisor</FormLabel>
                    <FormDescription>Allow drivers to manage their own rosters by default.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="driverSupervisionDefaultLocked"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Lock Driver Supervision</FormLabel>
                    <FormDescription>If true, drivers cannot turn off their own supervision mode if an admin enables it.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="nearDistanceM"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Near Distance (meters)</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                   <FormDescription>Distance (in meters) to trigger "bus is approaching" notifications.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="arriveDistanceM"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Arrival Distance (meters)</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                   <FormDescription>Distance (in meters) to trigger "bus has arrived" notifications.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">Save Settings</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
