
"use client";

import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, type Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { sdoc } from './schoolPath';

export type UserRole = "admin" | "driver" | "supervisor" | "parent";

export interface UserProfile {
  displayName: string;
  email: string;
  role: UserRole;
  schoolId: string;
  active?: boolean;
  pending?: boolean;
}

export interface BellItem {
    id: string;
    title: string;
    body: string;
    createdAt: Timestamp;
    read: boolean;
    data?: any;
}

interface UseProfileReturn {
  user: User | null;
  profile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  loading: boolean;
  error: Error | null;
  setError: (error: Error | null) => void;
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
      // We no longer fetch the profile here. It will be fetched
      // by the respective layout guards after login.
      else if (!profile) {
        // If there's a user but no profile yet, we are still in a loading state.
        setLoading(true);
      }
    });

    return () => unsubscribeAuth();
  }, [profile]);
  
  // This is a simplified hook. The profile will be loaded and set
  // from the layout components to ensure correct query scoping.
  useEffect(() => {
      if (user && profile) {
          setLoading(false);
      }
  }, [user, profile]);


  return { user, profile, setProfile, loading, error, setError };
}

// Helper function to fetch a profile securely.
// This is NOT a hook.
export async function fetchProfile(uid: string): Promise<UserProfile | null> {
    // We can't know the schoolId here, so we must fetch from the top-level user doc.
    // This requires a specific security rule.
    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        return userDocSnap.data() as UserProfile;
    }
    return null;
}
