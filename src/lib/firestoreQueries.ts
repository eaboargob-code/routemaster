

// src/lib/firestoreQueries.ts
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  documentId,
  Timestamp,
  type DocumentData,
  type QueryConstraint,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { scol, sdoc } from "@/lib/schoolPath";

/* ---------------------- Time helpers ---------------------- */
export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
};
export const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return Timestamp.fromDate(d);
};

/* ---------------------- Small utilities ---------------------- */
const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/* ============================================================
   USERS (school-scoped)
   ============================================================ */

/** Fetch a small set of users by uid from schools/{schoolId}/users */
export async function getUsersByIds(
  schoolId: string,
  uids: string[]
): Promise<Record<string, DocumentData>> {
  const byId: Record<string, any> = {};
  if (!uids || uids.length === 0) return byId;

  // Use per-document GETs so it passes rules (supervisors/drivers have allow get, not list)
  await Promise.all(
    [...new Set(uids)].map(async (uid) => {
      const snap = await getDoc(sdoc(schoolId, "users", uid));
      if (snap.exists()) byId[uid] = snap.data();
    })
  );

  return byId;
}

/** Optional: list users for a role inside a school */
export async function listUsersForSchool(
  schoolId: string,
  role?: "admin" | "driver" | "supervisor" | "parent"
) {
  const constraints: QueryConstraint[] = [];
  if (role) constraints.push(where("role", "==", role));
  const qUsers = query(scol(schoolId, "users"), ...constraints);
  const s = await getDocs(qUsers);
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Update a user's phone number */
export async function updateUserPhone(schoolId: string, userId: string, phoneNumber: string | null) {
    const userRef = sdoc(schoolId, "users", userId);
    return await updateDoc(userRef, { phoneNumber });
}

/* ============================================================
   PARENT-STUDENT LINKING
   ============================================================ */

/** Atomically links a parent to a student. */
export async function linkParentToStudent(schoolId: string, parentId: string, studentId: string) {
    const parentLinkRef = sdoc(schoolId, "parentStudents", parentId);
    // Use set with merge to create if not exists, or update if it does.
    return await updateDoc(parentLinkRef, {
        studentIds: arrayUnion(studentId)
    });
}

/** Atomically unlinks a parent from a student, optionally clearing the primary parent field. */
export async function unlinkParentFromStudent(schoolId: string, parentId: string, studentId: string, wasPrimary: boolean) {
    const batch = writeBatch(db);
    const parentLinkRef = sdoc(schoolId, "parentStudents", parentId);
    const studentRef = sdoc(schoolId, "students", studentId);

    // 1. Remove studentId from parent's list
    batch.update(parentLinkRef, {
        studentIds: arrayRemove(studentId)
    });

    // 2. If this parent was the primary, clear the field on the student doc
    if (wasPrimary) {
        batch.update(studentRef, { primaryParentId: null });
    }

    return await batch.commit();
}

/** Sets or unsets the primary parent for a student. */
export async function setPrimaryParent(schoolId: string, studentId: string, parentId: string | null) {
    const studentRef = sdoc(schoolId, "students", studentId);
    return await updateDoc(studentRef, { primaryParentId: parentId });
}


/* ============================================================
   REFERENCE LOOKUPS (school-scoped)
   ============================================================ */

export async function listBusesForSchool(schoolId: string) {
  const s = await getDocs(scol(schoolId, "buses"));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listRoutesForSchool(schoolId: string) {
  const s = await getDocs(scol(schoolId, "routes"));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listStudentsForSchool(schoolId: string) {
  const s = await getDocs(scol(schoolId, "students"));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getRouteById(schoolId: string, routeId?: string | null) {
  if (!routeId) return null;
  const snap = await getDoc(sdoc(schoolId, "routes", routeId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* ============================================================
   STOPS (new)
   ============================================================ */
export async function listStopsForRoute(schoolId: string, routeId: string) {
    const q = query(collection(db, `schools/${schoolId}/routes/${routeId}/stops`), orderBy("order"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addStopToRoute(schoolId: string, routeId: string, data: any) {
    const coll = collection(db, `schools/${schoolId}/routes/${routeId}/stops`);
    return await addDoc(coll, data);
}

export async function updateStop(schoolId: string, routeId: string, stopId: string, data: any) {
    const ref = doc(db, `schools/${schoolId}/routes/${routeId}/stops`, stopId);
    return await updateDoc(ref, data);
}

export async function deleteStop(schoolId: string, routeId: string, stopId: string) {
    const ref = doc(db, `schools/${schoolId}/routes/${routeId}/stops`, stopId);
    return await deleteDoc(ref);
}

/* ============================================================
   CONFIG (new)
   ============================================================ */
export async function getTransportConfig(schoolId: string) {
    const ref = doc(db, `schools/${schoolId}/config/transport`);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
}

export async function updateTransportConfig(schoolId: string, data: any) {
    const ref = doc(db, `schools/${schoolId}/config/transport`);
    return await updateDoc(ref, data);
}

/* ============================================================
   DRIVER HELPERS
   ============================================================ */

export async function getAssignedBusForDriver(
  schoolId: string,
  driverUid: string
) {
  const qBus = query(
    scol(schoolId, "buses"),
    where("driverId", "==", driverUid),
    limit(1)
  );
  const s = await getDocs(qBus);
  return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
}

export async function getActiveOrTodayTripsForDriver(
  schoolId: string,
  driverUid: string
) {
  const qTrips = query(
    scol(schoolId, "trips"),
    where("driverId", "==", driverUid),
    where("startedAt", ">=", startOfToday()),
    orderBy("startedAt", "desc")
  );
  const s = await getDocs(qTrips);
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ============================================================
   SUPERVISOR HELPERS
   ============================================================ */

export async function getSupervisorTrips(
  schoolId: string,
  supervisorUid: string
) {
  const base = scol(schoolId, "trips");

  const qMine = query(
    base,
    where("supervisorId", "==", supervisorUid),
    where("startedAt", ">=", startOfToday()),
    orderBy("startedAt", "desc")
  );

  const qDriverAsSup = query(
    base,
    where("allowDriverAsSupervisor", "==", true),
    where("startedAt", ">=", startOfToday()),
    orderBy("startedAt", "desc")
  );

  const [a, b] = await Promise.all([getDocs(qMine), getDocs(qDriverAsSup)]);

  // de-dup + sort desc by startedAt
  const seen = new Set<string>();
  const docs = [...a.docs, ...b.docs].filter((d) =>
    seen.has(d.id) ? false : (seen.add(d.id), true)
  );

  return docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort(
      (x: any, y: any) =>
        (y.startedAt as Timestamp).toMillis() -
        (x.startedAt as Timestamp).toMillis()
    );
}

/* ============================================================
   TRIPS (school-scoped)
   ============================================================ */

export async function listTodaysTripsForSchool(
  schoolId: string,
  filters: { status?: "active" | "ended" | "all" } = {}
) {
  const qTrips = query(
    scol(schoolId, "trips"),
    where("startedAt", ">=", startOfToday()),
    orderBy("startedAt", "desc")
  );

  let docs = (await getDocs(qTrips)).docs;
  if (filters.status && filters.status !== "all") {
    docs = docs.filter((d) => d.data().status === filters.status);
  }
  return docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTripDetails(tripId: string, schoolId: string) {
  const tripSnap = await getDoc(sdoc(schoolId, "trips", tripId));
  if (!tripSnap.exists()) return null;

  const trip = { id: tripSnap.id, ...tripSnap.data() } as any;

  const busSnap = await getDoc(sdoc(schoolId, "buses", trip.busId));
  const routeSnap = trip.routeId
    ? await getDoc(sdoc(schoolId, "routes", trip.routeId))
    : null;

  return {
    trip,
    bus: busSnap.exists() ? busSnap.data() : null,
    route: routeSnap && routeSnap.exists() ? routeSnap.data() : null,
  };
}

export async function getSchoolUsersByIds(
  schoolId: string,
  uids: string[]
): Promise<Record<string, DocumentData>> {
  const byId: Record<string, DocumentData> = {};
  if (!uids?.length) return byId;

  const unique = [...new Set(uids)].filter(Boolean);

  await Promise.all(
    unique.map(async (uid) => {
      const snap = await getDoc(sdoc(schoolId, "users", uid));
      if (snap.exists()) byId[uid] = snap.data();
    })
  );

  return byId;
}

export async function listAllTripsForSchool(schoolId: string) {
    const q = query(scol(schoolId, "trips"));
    const snapshot = await getDocs(q);
    return snapshot.docs;
}

/* ============================================================
   SCHOOL PROFILE
   ============================================================ */

export interface SchoolProfile {
  name: string;
  address: string;
  city: string;
  country: string;
  phone?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
}

export async function getSchoolProfile(schoolId: string): Promise<SchoolProfile | null> {
  const ref = doc(db, `schools/${schoolId}/config/profile`);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as SchoolProfile) : null;
}

export async function updateSchoolProfile(schoolId: string, data: Partial<SchoolProfile>) {
  const ref = doc(db, `schools/${schoolId}/config/profile`);
  return await setDoc(ref, data, { merge: true });
}

export async function createSchoolProfile(schoolId: string, data: SchoolProfile) {
  const ref = doc(db, `schools/${schoolId}/config/profile`);
  return await setDoc(ref, data);
}

/* ============================================================
   SCHOOL LOCATION (Driver-accessible)
   ============================================================ */

export interface SchoolLocation {
  latitude: number;
  longitude: number;
}

export async function getSchoolLocation(schoolId: string): Promise<SchoolLocation | null> {
  console.log(`[getSchoolLocation] Starting for schoolId: ${schoolId}`);
  
  // Read location data from school profile document
  try {
    console.log(`[getSchoolLocation] Reading from profile document`);
    const profileRef = doc(db, `schools/${schoolId}/config/profile`);
    const profileSnap = await getDoc(profileRef);
    
    console.log(`[getSchoolLocation] Profile document exists: ${profileSnap.exists()}`);
    if (profileSnap.exists()) {
      const profile = profileSnap.data() as SchoolProfile;
      console.log(`[getSchoolLocation] Profile data:`, {
        latitude: profile.latitude,
        longitude: profile.longitude,
        hasLatitude: profile.latitude !== undefined,
        hasLongitude: profile.longitude !== undefined
      });
      
      if (profile.latitude !== undefined && profile.longitude !== undefined) {
        const locationData = {
          latitude: profile.latitude,
          longitude: profile.longitude
        };
        console.log(`[getSchoolLocation] Returning location from profile:`, locationData);
        return locationData;
      }
    }
  } catch (profileError: any) {
    console.log(`[getSchoolLocation] Profile document access failed:`, profileError.code || profileError.message);
  }
  
  console.log(`[getSchoolLocation] No location data found`);
  return null;
}

export async function updateSchoolLocation(schoolId: string, data: SchoolLocation) {
  const ref = doc(db, `schools/${schoolId}/config/location`);
  return await setDoc(ref, data, { merge: true });
}
