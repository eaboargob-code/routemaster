
// src/lib/useProfile.ts
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { onAuthStateChanged, getIdTokenResult, User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  DocumentData,
} from "firebase/firestore";

export type UserRole = "admin" | "driver" | "supervisor" | "parent";

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName?: string;
  role: UserRole;
  schoolId: string;
  active?: boolean;
  pending?: boolean;
  // add other fields you store in users docs (fcmTokens, etc.)
}

type UseProfileState = {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
};

export async function fetchProfile(u: FirebaseUser): Promise<UserProfile | null> {
    // 1) try custom claims first
    try {
        const token = await getIdTokenResult(u, true);
        const schoolId = (token.claims as any)?.schoolId as string | undefined;
        if (schoolId) {
            const userRef = doc(db, "schools", schoolId, "users", u.uid);
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const data = snap.data() as DocumentData;
                 return {
                    uid: u.uid,
                    email: u.email,
                    displayName: data.displayName ?? u.displayName ?? undefined,
                    role: data.role as UserRole,
                    schoolId: schoolId,
                    active: data.active,
                    pending: data.pending,
                };
            }
        }
    } catch { /* continue */ }
    
    // 2) fallback to usersIndex
    try {
        const idxSnap = await getDoc(doc(db, "usersIndex", u.uid));
        if (idxSnap.exists()) {
            const schoolId = (idxSnap.data() as any)?.schoolId as string | undefined;
            if (schoolId) {
                 const userRef = doc(db, "schools", schoolId, "users", u.uid);
                 const snap = await getDoc(userRef);
                 if (snap.exists()) {
                     const data = snap.data() as DocumentData;
                     return {
                        uid: u.uid,
                        email: u.email,
                        displayName: data.displayName ?? u.displayName ?? undefined,
                        role: data.role as UserRole,
                        schoolId: schoolId,
                        active: data.active,
                        pending: data.pending,
                    };
                 }
            }
        }
    } catch { /* continue */ }

    throw new Error("Could not resolve user profile or schoolId.");
}

const profileCache = new Map<string, UserProfile>();

export function useProfile() {
  const [state, setState] = useState<UseProfileState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });

  const load = useCallback(async (u: FirebaseUser | null) => {
    if (!u) {
      setState({ user: null, profile: null, loading: false, error: null });
      return;
    }
    // Return from cache if available to prevent re-fetching on every HMR
    if (profileCache.has(u.uid)) {
        setState({ user: u, profile: profileCache.get(u.uid)!, loading: false, error: null });
        return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const p = await fetchProfile(u);
      if(p) profileCache.set(u.uid, p);
      setState({ user: u, profile: p, loading: false, error: null });
    } catch (err: any) {
      setState({ user: u, profile: null, loading: false, error: err });
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      void load(u);
    });
    return () => unsub();
  }, [load]);

  const refresh = useCallback(async () => {
    profileCache.delete(auth.currentUser?.uid || '');
    await auth.currentUser?.getIdToken(true);
    await load(auth.currentUser);
  }, [load]);
  
  const setProfile = useCallback((profile: UserProfile) => {
    if (state.user) {
        profileCache.set(state.user.uid, profile);
        setState(prev => ({...prev, profile}));
    }
  }, [state.user]);


  return useMemo(() => ({
    user: state.user,
    profile: state.profile,
    loading: state.loading,
    error: state.error,
    refresh,
    setProfile, // used by SharedAccessGuard
  }), [state, refresh, setProfile]);
}
