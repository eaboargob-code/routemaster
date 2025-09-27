"use client";

import { useProfile } from "@/lib/useProfile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Badge } from "@/components/ui/badge";

export default function DebugPage() {
  const { user, profile, loading, error } = useProfile();
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const checkPermissions = async () => {
    if (!user || !profile) return;
    
    setChecking(true);
    const info: any = {
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      },
      profile: profile,
      checks: {}
    };

    try {
      // Check usersIndex document
      const userIndexRef = doc(db, "usersIndex", user.uid);
      const userIndexDoc = await getDoc(userIndexRef);
      info.checks.usersIndex = {
        exists: userIndexDoc.exists(),
        data: userIndexDoc.exists() ? userIndexDoc.data() : null
      };

      // Check user document in school
      if (profile.schoolId) {
        const userDocRef = doc(db, "schools", profile.schoolId, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        info.checks.schoolUser = {
          exists: userDoc.exists(),
          data: userDoc.exists() ? userDoc.data() : null
        };

        // Try to read config/profile
        try {
          const configRef = doc(db, "schools", profile.schoolId, "config", "profile");
          const configDoc = await getDoc(configRef);
          info.checks.configProfile = {
            canRead: true,
            exists: configDoc.exists(),
            data: configDoc.exists() ? configDoc.data() : null
          };
        } catch (error: any) {
          info.checks.configProfile = {
            canRead: false,
            error: error.message
          };
        }
      }

    } catch (error: any) {
      info.error = error.message;
    }

    setDebugInfo(info);
    setChecking(false);
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-500">Error: {error.message}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User Debug Information</CardTitle>
          <CardDescription>
            Check your current user profile and permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Current User</h3>
            <div className="text-sm space-y-1">
              <div><strong>UID:</strong> {user?.uid}</div>
              <div><strong>Email:</strong> {user?.email}</div>
              <div><strong>Display Name:</strong> {user?.displayName || 'Not set'}</div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Current Profile</h3>
            {profile ? (
              <div className="text-sm space-y-1">
                <div><strong>Role:</strong> <Badge variant={profile.role === 'admin' ? 'default' : 'secondary'}>{profile.role}</Badge></div>
                <div><strong>School ID:</strong> {profile.schoolId}</div>
                <div><strong>School Name:</strong> {profile.schoolName || 'Not set'}</div>
                <div><strong>Active:</strong> <Badge variant={profile.active ? 'default' : 'destructive'}>{profile.active ? 'Yes' : 'No'}</Badge></div>
                <div><strong>Pending:</strong> <Badge variant={profile.pending ? 'destructive' : 'default'}>{profile.pending ? 'Yes' : 'No'}</Badge></div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No profile loaded</div>
            )}
          </div>

          <Button onClick={checkPermissions} disabled={checking || !user || !profile}>
            {checking ? 'Checking...' : 'Check Detailed Permissions'}
          </Button>

          {debugInfo && (
            <div>
              <h3 className="font-semibold mb-2">Debug Results</h3>
              <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}