"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProfile } from "@/lib/useProfile";

export default function ParentDashboardPage() {
    const { profile } = useProfile();
    return (
        <div className="grid gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Parent Dashboard</CardTitle>
                    <CardDescription>Welcome, {profile?.displayName || 'Parent'}.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p>My Children:</p>
                    <div className="mt-4 border rounded-lg p-8 text-center text-muted-foreground">
                        [Placeholder for list of children and their status]
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
