"use client";

import { useProfile } from "@/lib/useProfile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { User } from "lucide-react";

export default function SupervisorProfilePage() {
  const { profile, loading: profileLoading } = useProfile();

  if (profileLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You don't have permission to access this page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">My Profile</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supervisor Profile</CardTitle>
          <CardDescription>
            Your profile information is managed by the school administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Photo Section */}
          <div className="space-y-4">
            <Label>Profile Photo</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage 
                  src={profile.photoUrl} 
                  alt={profile.displayName || "Profile"} 
                />
                <AvatarFallback>
                  <User className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
            </div>
          </div>

          {/* Profile Information */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <p className="text-sm py-2 px-3 bg-muted rounded-md">
                {profile.displayName || "Not set"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <p className="text-sm py-2 px-3 bg-muted rounded-md">
                {profile.email}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Phone Number</Label>
              <p className="text-sm py-2 px-3 bg-muted rounded-md">
                {profile.phoneNumber || "Not set"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <p className="text-sm py-2 px-3 bg-muted rounded-md capitalize">
                {profile.role}
              </p>
            </div>
          </div>

          <Alert>
            <AlertTitle>Note</AlertTitle>
            <AlertDescription>
              To update your profile information or photo, please contact your school administrator.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}