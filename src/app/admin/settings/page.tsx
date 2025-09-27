

"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Settings, AlertTriangle } from "lucide-react";
import { LocationPicker } from "@/components/LocationPicker";
import { useProfile } from "@/lib/useProfile";
import { getTransportConfig, updateTransportConfig, getSchoolProfile, updateSchoolProfile, updateSchoolLocation } from "@/lib/firestoreQueries";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
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
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteTrips } from "@/ai/flows/delete-trips-flow";

const schoolProfileSchema = z.object({
  name: z.string().min(1, "School name is required"),
  address: z.string().min(1, "School address is required"),
  city: z.string().min(1, "City is required"),
  country: z.string().min(1, "Country is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const settingsSchema = z.object({
  allowDriverAsSupervisor: z.boolean(),
  driverSupervisionDefaultLocked: z.boolean(),
  locationMinDistanceM: z.coerce.number().int().positive(),
  locationMinSeconds: z.coerce.number().int().positive(),
});

type SchoolProfileFormValues = z.infer<typeof schoolProfileSchema>;
type SettingsFormValues = z.infer<typeof settingsSchema>;


function SchoolProfile({ schoolId, profileLoading, userProfile }: { schoolId: string, profileLoading: boolean, userProfile: any }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  const form = useForm<SchoolProfileFormValues>({
    resolver: zodResolver(schoolProfileSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      country: "",
      phone: "",
      email: "",
      latitude: undefined,
      longitude: undefined,
    }
  });

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    getSchoolProfile(schoolId).then(profile => {
      if (profile) {
        form.reset(profile);
      }
    }).finally(() => setLoading(false));
  }, [schoolId, form]);

  const onSubmit = async (values: SchoolProfileFormValues) => {
    if (!schoolId) return;
    
    // Wait for profile to load before attempting save
    if (profileLoading || !userProfile) {
      toast({ 
        variant: "destructive", 
        title: "Please wait", 
        description: "Profile is still loading. Please try again in a moment." 
      });
      return;
    }

    // Check admin role before saving
    if (userProfile.role !== 'admin') {
      toast({ 
        variant: "destructive", 
        title: "Access Denied", 
        description: "Only administrators can save school profile settings." 
      });
      return;
    }

    console.log("🔍 Save operation starting with:", {
      schoolId,
      userProfile: {
        uid: userProfile.uid,
        email: userProfile.email,
        role: userProfile.role,
        schoolId: userProfile.schoolId,
        active: userProfile.active
      },
      profileLoading,
      formValues: values
    });

    // Show current user authentication state
    if (auth.currentUser) {
      console.log("🔍 Current Firebase Auth user:", {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        emailVerified: auth.currentUser.emailVerified
      });
    }

    setLoading(true);
    try {
      await updateSchoolProfile(schoolId, values);
      toast({ title: "School profile updated successfully!" });
      console.log("✅ Save completed successfully");
    } catch (error: any) {
      console.error("❌ Save failed:", error.message);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
        name: error.name,
        ...error
      });
      toast({ 
        variant: "destructive", 
        title: "Failed to update school profile", 
        description: error.message 
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-96 w-full" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings />
          School Profile
        </CardTitle>
        <CardDescription>
          Manage your school's basic information and contact details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>School Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter school name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter street address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter city" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter country" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter phone number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter email address" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Location Picker */}
            <div className="space-y-4">
              <LocationPicker
                latitude={form.watch("latitude")}
                longitude={form.watch("longitude")}
                onLocationChange={(lat, lng) => {
                  form.setValue("latitude", lat);
                  form.setValue("longitude", lng);
                }}
                className="w-full"
              />
            </div>
            
            <Button 
              type="submit" 
              disabled={profileLoading || !userProfile || userProfile.role !== 'admin'}
            >
              {profileLoading ? "Loading..." : "Save School Profile"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function DangerZone({ schoolId }: { schoolId: string }) {
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmation, setConfirmation] = useState("");

    const handleDeleteTrips = async () => {
        if (confirmation !== 'DELETE') {
            toast({ variant: "destructive", title: "Confirmation Mismatch", description: "You must type DELETE to confirm." });
            return;
        }

        setIsDeleting(true);
        try {
            const result = await deleteTrips({ schoolId, confirmation: 'DELETE' });
            if (result.success) {
                toast({ title: "Success!", description: result.message, className: 'bg-accent text-accent-foreground border-0' });
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error("[Delete Trips Error]", error);
            toast({ variant: "destructive", title: "Deletion Failed", description: (error as Error).message });
        } finally {
            setIsDeleting(false);
            setConfirmation("");
        }
    };

    return (
        <Card className="border-destructive">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle />
                    Danger Zone
                </CardTitle>
                <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold">Delete All Trip History</h3>
                        <p className="text-sm text-muted-foreground">This will permanently delete all trips, passenger lists, and telemetry data for this school.</p>
                    </div>
                     <AlertDialog onOpenChange={(open) => !open && setConfirmation('')}>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={isDeleting}>Delete Trip History</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action is irreversible. All trip data for school <strong>{schoolId}</strong> will be lost. To proceed, type <strong>DELETE</strong> in the box below.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <Input
                                value={confirmation}
                                onChange={(e) => setConfirmation(e.target.value)}
                                placeholder="Type DELETE to confirm"
                                className="my-4"
                            />
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDeleteTrips}
                                    disabled={confirmation !== 'DELETE' || isDeleting}
                                >
                                    {isDeleting ? "Deleting..." : "I understand, delete all trips"}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
    );
}


export default function SettingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const schoolId = profile?.schoolId || "TRP001";

  // Monitor Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      console.log("Settings page - Firebase auth user:", user);
    });
    return unsubscribe;
  }, []);

  // Debug authentication state
  useEffect(() => {
    console.log("Settings page - Current user:", currentUser);
    console.log("Settings page - Profile loading:", profileLoading);
    console.log("Settings page - Profile data:", profile);
    console.log("Settings page - School ID:", schoolId);
    console.log("Settings page - User role:", profile?.role);
    console.log("Settings page - User active:", profile?.active);
  }, [currentUser, profile, profileLoading, schoolId]);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      allowDriverAsSupervisor: false,
      driverSupervisionDefaultLocked: false,
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
    <div className="space-y-8">
        {schoolId && <SchoolProfile schoolId={schoolId} profileLoading={profileLoading} userProfile={profile} />}
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
                <Button type="submit">Save Settings</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
        
        {schoolId && <DangerZone schoolId={schoolId} />}
    </div>
  );
}
