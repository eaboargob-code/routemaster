
"use client";

import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export type UserRole = "admin" | "driver" | "supervisor" | "parent";

export interface UserProfile {
  displayName: string;
  email: string;
  role: UserRole;
  schoolId: string;
  active?: boolean;
  pending?: boolean;
}

interface UseProfileReturn {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
}

export function useProfile(): UseProfileReturn {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    setLoading(true);
    const profileRef = doc(db, "users", user.uid);
    const unsubscribeProfile = onSnapshot(profileRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          setProfile(null);
        }
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching user profile:", err);
        setError(err);
        setProfile(null);
        setLoading(false);
      }
    );

    return () => unsubscribeProfile();
  }, [user]);

  return { user, profile, loading, error };
}
