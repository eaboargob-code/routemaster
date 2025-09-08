"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type AppRole = "admin" | "driver" | "supervisor" | "parent";

export type UserProfile = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role: AppRole;
  active?: boolean;
  schoolId: string; // redundantly stored on the user doc
  // add other fields you store on the user doc
};

type UseProfileState =
  | { status: "idle"; user: null; profile: null; schoolId: null; error: null }
  | { status: "loading"; user: User | null; profile: UserProfile | null; schoolId: string | null; error: null }
  | { status: "ready"; user: User; profile: UserProfile; schoolId: string; error: null }
  | { status: "error"; user: User | null; profile: UserProfile | null; schoolId: string | null; error: Error };

export function useProfile() {
  const [state, setState] = useState<UseProfileState>({
    status: "idle",
    user: null,
    profile: null,
    schoolId: null,
    error: null,
  });

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ status: "idle", user: null, profile: null, schoolId: null, error: null });
        return;
      }

      setState((s) => ({ ...s, status: "loading", user: firebaseUser }));

      try {
        // 1) find the user’s schoolId via usersIndex/{uid}
        const idxSnap = await getDoc(doc(db, "usersIndex", firebaseUser.uid));
        if (!idxSnap.exists()) {
          throw new Error("No schoolId in usersIndex for current user.");
        }
        const { schoolId } = idxSnap.data() as { schoolId: string };

        // 2) live-subscribe to schools/{schoolId}/users/{uid}
        const userDocRef = doc(db, "schools", schoolId, "users", firebaseUser.uid);
        const unsubProfile = onSnapshot(
          userDocRef,
          (snap) => {
            if (!snap.exists()) {
              setState({
                status: "error",
                user: firebaseUser,
                profile: null,
                schoolId,
                error: new Error("User document not found in school"),
              });
              return;
            }
            const data = snap.data() as DocumentData;
            const profile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: data.displayName ?? firebaseUser.displayName ?? null,
              role: data.role,
              active: data.active ?? true,
              schoolId,
            };
            setState({ status: "ready", user: firebaseUser, profile, schoolId, error: null });
          },
          (err) => {
            setState({ status: "error", user: firebaseUser, profile: null, schoolId, error: err });
          }
        );

        return () => unsubProfile(); // cleanup when auth changes
      } catch (err: any) {
        setState({ status: "error", user: firebaseUser, profile: null, schoolId: null, error: err });
      }
    });

    return () => unsubAuth();
  }, []);

  const loading = state.status === "loading" || state.status === "idle";
  const error = state.status === "error" ? state.error : null;

  return useMemo(
    () => ({
      user: state.user,
      profile: state.profile,
      schoolId: state.schoolId,
      loading,
      error,
    }),
    [state.user, state.profile, state.schoolId, loading, error]
  );
}
