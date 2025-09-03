
"use client";

import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, collection, query, orderBy, limit, type Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { listenWithPath } from './firestore-helpers';

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
    
    const meRef = doc(db, "users", user.uid);
    const unsubscribe = listenWithPath(meRef, `users/${user.uid}`, (snap) => {
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      } else {
        setProfile(null);
        setError(new Error("User profile does not exist."));
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  return { user, profile, loading, error };
}
