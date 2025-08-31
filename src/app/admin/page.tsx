
"use client";

import { useProfile } from "@/lib/useProfile";
import { Dashboard } from "./components/Dashboard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPage() {
    const { profile, loading, error } = useProfile();

    if (loading) {
        return (
            <div className="grid gap-4 md:gap-8">
                 <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-1/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-40 w-full" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (error) {
        return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;
    }

    if (!profile) {
        return <Alert><AlertTitle>Profile Not Found</AlertTitle><AlertDescription>Admin profile could not be loaded.</AlertDescription></Alert>;
    }

    return <Dashboard schoolId={profile.schoolId} />;
}
