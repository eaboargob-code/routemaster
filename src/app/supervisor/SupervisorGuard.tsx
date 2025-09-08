
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useProfile, fetchProfile } from "@/lib/useProfile";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldAlert, Eye } from "lucide-react";
import { DebugBanner } from "@/app/admin/components/DebugBanner";

function Header() {
    const router = useRouter();
    const handleLogout = async () => {
        await signOut(auth);
        router.push("/supervisor/login");
    };

    return (
         <header className="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 z-50">
            <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
                <a href="/supervisor" className="flex items-center gap-2 text-lg font-semibold md:text-base">
                    <Eye className="h-6 w-6 text-primary" />
                    <span className="font-bold">RouteMaster Supervisor</span>
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

function AccessDeniedScreen({ message, details }: { message: string, details?: string }) {
     const router = useRouter();
     return (
         <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4 text-center p-4 max-w-md mx-auto">
                <ShieldAlert className="h-12 w-12 text-destructive" />
                <h1 className="text-2xl font-bold text-destructive">{message}</h1>
                <p className="text-muted-foreground">
                    {details || "Please contact your administrator if you believe this is an error."}
                </p>
                <div className="flex gap-4 mt-4">
                    <Button onClick={() => signOut(auth).then(() => router.push('/supervisor/login'))}>Supervisor Login</Button>
                    <Button variant="outline" onClick={() => signOut(auth).then(() => router.push('/login'))}>Admin Login</Button>
                </div>
            </div>
        </div>
     )
}

export function SupervisorGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, profile, setProfile, loading, error, setError } = useProfile();

  useEffect(() => {
    // If loading is finished and there's no user, redirect to login.
    if (!loading && !user) {
        router.replace("/supervisor/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && !profile && !error) {
        const loadProfile = async () => {
            const fetchedProfile = await fetchProfile(user.uid);
            if (fetchedProfile) {
                setProfile(fetchedProfile);
            } else {
                setError(new Error("Profile not found."));
            }
        };
        loadProfile();
    }
  }, [user, profile, error, setProfile, setError]);

  // While checking auth state, show a loading screen.
  if (loading) {
    return <LoadingScreen />;
  }

  // If loading is finished, but there's no authenticated user,
  // the redirect is in progress. Return null to avoid content flash.
  if (!user) {
    return null;
  }
  
  // If loading is finished and we have a user, but their profile failed to load or is missing.
  if (!profile) {
    const details = error 
      ? `Error: ${error.message}. Check browser console for more details.` 
      : "Your user profile could not be found in the database.";
    return <AccessDeniedScreen message="Profile Not Found" details={details} />;
  }

  // If the user has a profile but is not a supervisor, show access denied.
  if (profile.role !== 'supervisor') {
    return <AccessDeniedScreen message="Access Denied" details="You do not have the required 'supervisor' role to access this page." />;
  }

  // User is an authenticated supervisor, render the main layout.
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8 mb-16">
        {children}
      </main>
      {user && <DebugBanner user={user} profile={profile} loading={loading} />}
    </div>
  );
}
