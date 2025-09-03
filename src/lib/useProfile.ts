
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
  bellItems: BellItem[];
  bellCount: number;
}

export function useProfile(): UseProfileReturn {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [bellItems, setBellItems] = useState<BellItem[]>([]);
  const [bellCount, setBellCount] = useState(0);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null);
        setBellItems([]);
        setBellCount(0);
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
    const unsubs: (()=>void)[] = [];

    const meRef = doc(db, "users", user.uid);
    unsubs.push(listenWithPath(meRef, `users/${user.uid}`, (snap) => {
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      } else {
        setProfile(null);
        setError(new Error("User profile does not exist."));
      }
      setLoading(false);
    }));

    const inboxRef = collection(db, "users", user.uid, "notifications");
    const inboxQ = query(inboxRef, orderBy("createdAt","desc"), limit(20));
    unsubs.push(listenWithPath(inboxQ, `users/${user.uid}/notifications/*`, (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as BellItem));
        setBellItems(items);
        setBellCount(items.filter(item => !item.read).length);
    }));

    return () => { unsubs.forEach(unsub => unsub()); };
  }, [user]);

  return { user, profile, loading, error, bellItems, bellCount };
}
