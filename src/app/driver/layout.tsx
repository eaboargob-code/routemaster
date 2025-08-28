
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useProfile, type UserProfile } from "@/lib/useProfile";
import { Button } from "@/components/ui/button";
import { Bus, LogOut } from "lucide-react";
import { DebugBanner } from "@/app/admin/components/DebugBanner";

function Header() {
    const router = useRouter();
    const handleLogout = async () => {
        await signOut(auth);
        router.push("/driver/login");
    };

    return (
         <header className="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 z-50">
            <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
                <a href="/driver" className="flex items-center gap-2 text-lg font-semibold md:text-base">
                    <Bus className="h-6 w-6 text-primary" />
                    <span className="font-bold">RouteMaster Driver</span>
                </a>
            </nav>
             <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
                <div className="ml-auto flex-1 sm:flex-initial" />
                <Button onClick={handleLogout} variant="outline" size="sm">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                </Button>
            </div>
        </header>
    )
}


function LoadingScreen() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-muted-foreground">Verifying access...</p>
            </div>
        </div>
    );
}

function AccessDeniedScreen() {
     const router = useRouter();
     return (
         <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4 text-center p-4">
                <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
                <p className="text-muted-foreground">You do not have the required 'driver' role to access this page.</p>
                <Button onClick={() => signOut(auth).then(() => router.push('/login'))}>Go to Admin Login</Button>
            </div>
        </div>
     )
}

export default function DriverLayout({ children }: { children: ReactNode }) {
  const { user, profile, loading, error } = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  // The login page is public and does not require any auth checks.
  if (pathname.startsWith('/driver/login')) {
    return <>{children}</>;
  }

  useEffect(() => {
    // If loading is finished and there's no user, redirect to login.
    if (!loading && !user) {
        router.replace("/driver/login");
    }
  }, [user, loading, router]);

  // While checking auth state, show a loading screen.
  if (loading) {
    return <LoadingScreen />;
  }
  
  // If auth check is done but there is no user or profile, it means the redirect is happening.
  // Return null to avoid a flash of content.
  if (!user || !profile) {
    return null;
  }
  
  // If the user has a profile but is not a driver, show access denied.
  if (profile.role !== 'driver') {
    return <AccessDeniedScreen />;
  }

  // User is an authenticated driver, render the main layout.
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8 mb-16">
        {children}
      </main>
      <DebugBanner user={user} profile={profile} loading={loading} />
    </div>
  );
}
