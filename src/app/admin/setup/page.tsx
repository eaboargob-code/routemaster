"use client";

import { useProfile } from "@/lib/useProfile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";

export default function AdminSetupPage() {
  const { user, profile, loading } = useProfile();
  const [setupStatus, setSetupStatus] = useState<string>("");
  const [isSettingUp, setIsSettingUp] = useState(false);

  const setupAdminAccess = async () => {
    if (!user) {
      setSetupStatus("❌ No user logged in");
      return;
    }

    setIsSettingUp(true);
    setSetupStatus("🔄 Setting up admin access...");

    try {
      const schoolId = "TRP001"; // Default school ID
      const uid = user.uid;
      const email = user.email;

      // Step 1: Check if usersIndex exists, create if not
      setSetupStatus("🔄 Checking usersIndex document...");
      const userIndexRef = doc(db, `usersIndex/${uid}`);
      const indexDoc = await getDoc(userIndexRef);
      
      if (!indexDoc.exists()) {
        setSetupStatus("🔄 Creating usersIndex document...");
        await setDoc(userIndexRef, {
          schoolId: schoolId,
          updatedAt: new Date()
        });
        setSetupStatus("✅ usersIndex document created");
      } else {
        setSetupStatus("✅ usersIndex document already exists");
      }

      // Step 2: Check if user document exists, create basic version if not
      setSetupStatus("🔄 Checking user document in school...");
      const userDocRef = doc(db, `schools/${schoolId}/users/${uid}`);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        setSetupStatus("🔄 Creating basic user document...");
        // Create with minimal data that's allowed by security rules
        await setDoc(userDocRef, {
          email: email,
          displayName: user.displayName || email?.split('@')[0] || 'User',
          schoolId: schoolId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        setSetupStatus("✅ Basic user document created");
      } else {
        setSetupStatus("✅ User document already exists");
      }

      // Step 3: Try to update with admin role (this might fail due to permissions)
      setSetupStatus("🔄 Attempting to set admin role...");
      try {
        await setDoc(userDocRef, {
          role: "admin",
          active: true,
          pending: false,
          updatedAt: new Date()
        }, { merge: true });
        setSetupStatus("✅ Admin role set successfully!");
      } catch (roleError: any) {
        setSetupStatus("⚠️ Basic setup complete, but couldn't set admin role automatically. You may need manual admin assignment.");
        console.warn("Role update failed:", roleError);
      }

      // Step 4: Final verification
      setSetupStatus("🔄 Verifying final setup...");
      const finalUserDoc = await getDoc(userDocRef);
      const finalIndexDoc = await getDoc(userIndexRef);

      if (finalIndexDoc.exists() && finalUserDoc.exists()) {
        const userData = finalUserDoc.data();
        if (userData.role === "admin") {
          setSetupStatus("✅ Complete admin access setup successful!");
        } else {
          setSetupStatus("⚠️ Partial setup complete. Documents created but admin role may need manual assignment.");
        }
      } else {
        setSetupStatus("❌ Setup verification failed");
      }

    } catch (error: any) {
      console.error("Setup error:", error);
      setSetupStatus(`❌ Setup failed: ${error.message}`);
    } finally {
      setIsSettingUp(false);
    }
  };

  const testAdminAccess = async () => {
    if (!user || !profile) {
      setSetupStatus("❌ No user or profile available");
      return;
    }

    setSetupStatus("🔄 Testing admin access...");

    try {
      const schoolId = profile.schoolId || "TRP001";
      
      // Try to read the config/profile document
      const configRef = doc(db, `schools/${schoolId}/config/profile`);
      const configDoc = await getDoc(configRef);
      
      if (configDoc.exists()) {
        setSetupStatus("✅ Can read config/profile");
      } else {
        setSetupStatus("⚠️ config/profile doesn't exist");
      }

      // Test write access
      setSetupStatus("🔄 Testing config/profile write access...");
      try {
        await setDoc(configRef, {
          testWrite: new Date(),
          lastTestedBy: user.email
        }, { merge: true });
        setSetupStatus("✅ Admin access fully verified - can read AND write config/profile");
      } catch (writeError: any) {
        setSetupStatus(`❌ Can read but CANNOT write config/profile: ${writeError.message}`);
        console.error("Write test failed:", writeError);
      }
    } catch (error: any) {
      console.error("Test error:", error);
      setSetupStatus(`❌ Admin access test failed: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Loading...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Access Setup</CardTitle>
          <CardDescription>
            Set up admin access for your account to manage school settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current User Info */}
          <div className="space-y-2">
            <h3 className="font-semibold">Current User Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Email:</span> {user?.email || "Not available"}
              </div>
              <div>
                <span className="font-medium">UID:</span> {user?.uid || "Not available"}
              </div>
              <div>
                <span className="font-medium">Display Name:</span> {user?.displayName || "Not set"}
              </div>
              <div>
                <span className="font-medium">Profile Role:</span> 
                {profile ? (
                  <Badge variant={profile.role === "admin" ? "default" : "secondary"}>
                    {profile.role}
                  </Badge>
                ) : (
                  <Badge variant="outline">No profile</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Setup Actions */}
          <div className="space-y-4">
            <div className="flex gap-4">
              <Button 
                onClick={setupAdminAccess} 
                disabled={isSettingUp || !user}
                className="flex-1"
              >
                {isSettingUp ? "Setting up..." : "Setup Admin Access"}
              </Button>
              <Button 
                onClick={testAdminAccess} 
                variant="outline"
                disabled={!user || !profile}
                className="flex-1"
              >
                Test Admin Access
              </Button>
            </div>

            {/* Status Display */}
            {setupStatus && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {setupStatus}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold mb-2">Instructions:</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>Click "Setup Admin Access" to create the necessary user documents</li>
              <li>Click "Test Admin Access" to verify you can access admin features</li>
              <li>Once setup is complete, navigate to Admin Settings to manage school profile</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}