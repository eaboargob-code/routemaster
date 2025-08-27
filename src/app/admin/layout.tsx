"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { AdminHeader } from "./components/header";
import { DebugBanner, type UserProfile } from "./components/DebugBanner";

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

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        setProfile(null);
        setUser(null);
        router.replace("/login");
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!user) {
        setProfile(null);
        return;
    }

    setLoading(true);
    const profileRef = doc(db, "users", user.uid);
    const unsubscribeProfile = onSnapshot(profileRef, (doc) => {
        if (doc.exists()) {
            setProfile(doc.data() as UserProfile);
        } else {
            setProfile(null);
        }
        setLoading(false);
    }, (error) => {
        console.error("Error fetching user profile:", error);
        setProfile(null);
        setLoading(false);
    });

    return () => unsubscribeProfile();

  }, [user]);

  if (loading && !user) {
    return <LoadingScreen />;
  }
  
  if (!user) {
    return null;
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
