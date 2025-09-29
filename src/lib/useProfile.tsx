// src/lib/useProfile.ts
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { onAuthStateChanged, getIdTokenResult, User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  DocumentData,
} from "firebase/firestore";
import { getSchoolProfile } from "./firestoreQueries";

export type UserRole = "admin" | "driver" | "supervisor" | "parent";

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName?: string;
  role: UserRole;
  schoolId: string;
  schoolName?: string;
  schoolLocation?: string;
  active?: boolean;
  pending?: boolean;
  photoUrl?: string;
  phoneNumber?: string;
  supervisorMode?: boolean;
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
    const token = await getIdTokenResult(u, true); // Force refresh
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
  
  // 3) Fallback: read from /users/{uid} (for older data structures)
  try {
    const userSnap = await getDoc(doc(db, "users", u.uid));
    if (userSnap.exists()) {
        const schoolIdFromUserDoc = (userSnap.data() as any)?.schoolId as string | undefined;
        if(schoolIdFromUserDoc) return schoolIdFromUserDoc;
    }
  } catch {
      /* nothing to do */
  }

  return null;
}


export async function fetchProfile(u: FirebaseUser): Promise<UserProfile | null> {
  const schoolId = await resolveSchoolId(u);
  if (!schoolId) {
    // This is not an error, but it means we can't find a profile in a school context.
    // For a multi-school setup, this is expected if the user isn't linked yet.
    // However, for this app, we assume one school, so this implies a problem.
    throw new Error(`Could not resolve a schoolId for user ${u.uid}.`);
  }

  // Fetch school information
  let schoolName: string | undefined;
  let schoolLocation: string | undefined;
  try {
    const schoolProfile = await getSchoolProfile(schoolId);
    if (schoolProfile) {
      schoolName = schoolProfile.name;
      schoolLocation = schoolProfile.city;
    }
  } catch (error) {
    // School profile not found or error fetching, continue without school info
    console.warn(`Could not fetch school profile for schoolId ${schoolId}:`, error);
  }

  // Look for the user's profile within the school's subcollection first.
  const schoolUserRef = doc(db, "schools", schoolId, "users", u.uid);
  const schoolUserSnap = await getDoc(schoolUserRef);
  if (schoolUserSnap.exists()) {
      const data = schoolUserSnap.data() as DocumentData;
      return {
        uid: u.uid,
        email: u.email,
        displayName: data.displayName ?? u.displayName ?? undefined,
        role: data.role as UserRole,
        schoolId: schoolId,
        schoolName,
        schoolLocation,
        active: data.active,
        pending: data.pending,
        photoUrl: data.photoUrl,
        phoneNumber: data.phoneNumber,
        supervisorMode: data.supervisorMode,
      };
  }
  
  // Fallback to the root users collection
  const rootUserRef = doc(db, "users", u.uid);
  const rootUserSnap = await getDoc(rootUserRef);
  if (rootUserSnap.exists()) {
      const data = rootUserSnap.data() as DocumentData;
       return {
        uid: u.uid,
        email: u.email,
        displayName: data.displayName ?? u.displayName ?? undefined,
        role: data.role as UserRole,
        schoolId: schoolId,
        schoolName,
        schoolLocation,
        active: data.active,
        pending: data.pending,
        photoUrl: data.photoUrl,
        phoneNumber: data.phoneNumber,
        supervisorMode: data.supervisorMode,
      };
  }

  throw new Error(`User document not found for uid ${u.uid} in school ${schoolId} or at the root.`);
}

const profileCache = new Map<string, UserProfile>();

export function useProfile() {
  const [state, setState] = useState<UseProfileState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (u) => {
      // Clean up previous profile subscription
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (!u) {
        setState({ user: null, profile: null, loading: false, error: null });
        return;
      }

      setState(prev => ({ ...prev, user: u, loading: true, error: null }));

      try {
        // Resolve schoolId first
        const schoolId = await resolveSchoolId(u);
        if (!schoolId) {
          throw new Error(`Could not resolve a schoolId for user ${u.uid}.`);
        }

        // Fetch school information once
        let schoolName: string | undefined;
        let schoolLocation: string | undefined;
        try {
          const schoolProfile = await getSchoolProfile(schoolId);
          if (schoolProfile) {
            schoolName = schoolProfile.name;
            schoolLocation = schoolProfile.city;
          }
        } catch (error) {
          console.warn(`Could not fetch school profile for schoolId ${schoolId}:`, error);
        }

        // Subscribe to the school-scoped user document
        const schoolUserRef = doc(db, "schools", schoolId, "users", u.uid);
        profileUnsubscribe = onSnapshot(
          schoolUserRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as DocumentData;
              const profile: UserProfile = {
                uid: u.uid,
                email: u.email,
                displayName: data.displayName ?? u.displayName ?? undefined,
                role: data.role as UserRole,
                schoolId: schoolId,
                schoolName,
                schoolLocation,
                active: data.active,
                pending: data.pending,
                photoUrl: data.photoUrl,
                phoneNumber: data.phoneNumber,
                supervisorMode: data.supervisorMode,
              };
              profileCache.set(u.uid, profile);
              setState(prev => ({ ...prev, profile, loading: false, error: null }));
            } else {
              // Document doesn't exist, try fallback to root users collection
              const rootUserRef = doc(db, "users", u.uid);
              getDoc(rootUserRef).then((rootUserSnap) => {
                if (rootUserSnap.exists()) {
                  const data = rootUserSnap.data() as DocumentData;
                  const profile: UserProfile = {
                    uid: u.uid,
                    email: u.email,
                    displayName: data.displayName ?? u.displayName ?? undefined,
                    role: data.role as UserRole,
                    schoolId: schoolId,
                    schoolName,
                    schoolLocation,
                    active: data.active,
                    pending: data.pending,
                    photoUrl: data.photoUrl,
                    phoneNumber: data.phoneNumber,
                    supervisorMode: data.supervisorMode,
                  };
                  profileCache.set(u.uid, profile);
                  setState(prev => ({ ...prev, profile, loading: false, error: null }));
                } else {
                  const error = new Error(`User document not found for uid ${u.uid} in school ${schoolId} or at the root.`);
                  setState(prev => ({ ...prev, profile: null, loading: false, error }));
                }
              }).catch((err) => {
                setState(prev => ({ ...prev, profile: null, loading: false, error: err }));
              });
            }
          },
          (error) => {
            setState(prev => ({ ...prev, profile: null, loading: false, error }));
          }
        );
      } catch (err: any) {
        setState(prev => ({ ...prev, profile: null, loading: false, error: err }));
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) {
        profileUnsubscribe();
      }
    };
  }, []);

  const refresh = useCallback(async () => {
    profileCache.delete(auth.currentUser?.uid || '');
    await auth.currentUser?.getIdToken(true); // Force refresh token to get new claims
    // The onSnapshot subscription will automatically pick up any changes
  }, []);
  
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