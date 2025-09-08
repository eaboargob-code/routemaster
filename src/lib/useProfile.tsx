
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

async function resolveSchoolId(u: FirebaseUser): Promise<string | null> {
  // 1) try custom claims
  try {
    const token = await getIdTokenResult(u, true);
    const schoolIdFromClaims = (token.claims as any)?.schoolId as string | undefined;
    if (schoolIdFromClaims) return schoolIdFromClaims;
  } catch {
    /* keep going */
  }

  // 2) fallback to usersIndex/{uid}
  try {
    const idxSnap = await getDoc(doc(db, "usersIndex", u.uid));
    if (idxSnap.exists()) {
      const si = (idxSnap.data() as any)?.schoolId as string | undefined;
      if (si) return si;
    }
  } catch {
    /* keep going */
  }

  return null;
}

export async function fetchProfile(u: FirebaseUser): Promise<UserProfile | null> {
  const schoolId = await resolveSchoolId(u);
  if (!schoolId) {
    throw new Error("No schoolId in user claims or usersIndex.");
  }

  const userRef = doc(db, "schools", schoolId, "users", u.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    throw new Error("User document not found in school.");
  }

  const data = snap.data() as DocumentData;

  // normalize into the shape your app expects
  const profile: UserProfile = {
    uid: u.uid,
    email: u.email,
    displayName: data.displayName ?? u.displayName ?? null ?? undefined,
    role: data.role as UserRole,
    schoolId: schoolId,
    active: data.active,
    pending: data.pending,
    // include any other fields you rely on
  };

  return profile;
}

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
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const p = await fetchProfile(u);
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
    await auth.currentUser?.getIdToken(true);
    await load(auth.currentUser);
  }, [load]);

  return useMemo(() => ({
    user: state.user,
    profile: state.profile,
    loading: state.loading,
    error: state.error,
    refresh,
  }), [state, refresh]);
}
