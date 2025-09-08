
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";

import { AdminHeader } from "./dashboard/header";
import { DebugBanner } from "./components/DebugBanner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";

function LoadingScreen() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-muted-foreground">Authenticating...</p>
            </div>
        </div>
    );
}

function AccessDenied() {
    const { profile } = useProfile();
    const router = useRouter();

    const handleRedirect = () => {
        if (!profile || !profile.role) {
            router.push('/login');
            return;
        }
        switch(profile.role) {
            case 'driver':
                router.push('/driver');
                break;
            case 'supervisor':
                router.push('/supervisor');
                break;
            default:
                router.push('/login');
        }
    }

    return (
         <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4 text-center p-4 max-w-md mx-auto">
                <ShieldAlert className="h-12 w-12 text-destructive" />
                <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
                <p className="text-muted-foreground">
                    Your role is currently set to <span className="font-bold">{profile?.role || 'N/A'}</span>. You must be an administrator to access this page.
                </p>
                <div className="flex gap-4 mt-4">
                     <button onClick={handleRedirect} className="text-primary underline">Go to your portal</button>
                </div>
            </div>
        </div>
    )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, profile, loading } = useProfile();

  useEffect(() => {
    if (!loading && !user) {
        router.replace("/login");
    }
  }, [user, loading, router]);
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (!user) {
    return null; // Redirecting
  }
  
  if (!profile) {
      // Profile is still loading or doesn't exist.
      // useProfile handles the error state for this.
      return <LoadingScreen />;
  }
  
  if (profile.role !== 'admin') {
      return <AccessDenied />;
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <AdminHeader />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8 mb-16">
        {children}
      </main>
      <DebugBanner user={user} profile={profile} loading={loading} />
    </div>
  );
}
