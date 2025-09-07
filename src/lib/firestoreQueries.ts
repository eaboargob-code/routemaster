
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
  Timestamp,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";

/* ----------------------------- time helpers ----------------------------- */

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

/* ------------------------------ users lookup ----------------------------- */

export async function getUsersByIds(
  uids: string[]
): Promise<Record<string, DocumentData>> {
  const byId: Record<string, any> = {};
  if (!uids || uids.length === 0) return byId;

  // Firestore "in" is limited to 30 ids — chunk it.
  const CHUNK_SIZE = 30;
  for (let i = 0; i < uids.length; i += CHUNK_SIZE) {
    const uniqueIds = Array.from(new Set(uids.slice(i, i + CHUNK_SIZE)));
    if (uniqueIds.length === 0) continue;

    const qUsers = query(
      collection(db, "users"),
      where("__name__", "in", uniqueIds)
    );
    const snap = await getDocs(qUsers);
    snap.forEach((d) => (byId[d.id] = d.data()));
  }
  return byId;
}

/* --------------------------- simple list helpers ------------------------- */

export async function listUsersForSchool(
  schoolId: string,
  role?: "admin" | "driver" | "supervisor" | "parent"
) {
  const cons: QueryConstraint[] = [where("schoolId", "==", schoolId)];
  if (role) cons.push(where("role", "==", role));
  const qRef = query(collection(db, "users"), ...cons);
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listBusesForSchool(schoolId: string) {
  const qRef = query(collection(db, "buses"), where("schoolId", "==", schoolId));
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listRoutesForSchool(schoolId: string) {
  const qRef = query(collection(db, "routes"), where("schoolId", "==", schoolId));
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listStudentsForSchool(schoolId: string) {
  const qRef = query(
    collection(db, "students"),
    where("schoolId", "==", schoolId)
  );
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ------------------------------ trips: school ---------------------------- */

export async function listTodaysTripsForSchool(
  schoolId: string,
  filters: { status?: "active" | "ended" | "all" } = {}
) {
  const cons: QueryConstraint[] = [
    where("schoolId", "==", schoolId),
    where("startedAt", ">=", startOfToday()),
    orderBy("startedAt", "desc"),
  ];

  const qRef = query(collection(db, "trips"), ...cons);
  const snap = await getDocs(qRef);

  let rows = snap.docs;
  if (filters.status && filters.status !== "all") {
    rows = rows.filter((d) => d.data().status === filters.status);
  }
  return rows.map((d) => ({ id: d.id, ...d.data() }));
}

/* -------------------------- driver: assignment --------------------------- */

export async function getAssignedBusForDriver(
  schoolId: string,
  driverUid: string
) {
  const qRef = query(
    collection(db, "buses"),
    where("schoolId", "==", schoolId),
    where("driverId", "==", driverUid),
    limit(1)
  );
  const snap = await getDocs(qRef);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getRouteById(routeId?: string | null) {
  if (!routeId) return null;
  const s = await getDoc(doc(db, "routes", routeId));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function getActiveOrTodayTripsForDriver(
  schoolId: string,
  driverUid: string
) {
  const qRef = query(
    collection(db, "trips"),
    where("schoolId", "==", schoolId),
    where("driverId", "==", driverUid),
    where("startedAt", ">=", startOfToday()),
    orderBy("startedAt", "desc")
  );
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ------------------------ supervisor: today’s trips ---------------------- */
/**
 * Fetches trips for a supervisor. This includes trips where they are
 * explicitly assigned. This query is designed to be compliant with
 * Firestore rules that scope access to a user's own data.
 */
export async function getSupervisorTrips(schoolId: string, supervisorUid: string) {
  const tripsRef = collection(db, "trips");

  // Query for trips where the supervisor is directly assigned.
  // This is a secure and efficient query.
  const qAssigned = query(
    tripsRef,
    where("schoolId", "==", schoolId),
    where("supervisorId", "==", supervisorUid),
    where("startedAt", ">=", startOfToday()),
    orderBy("startedAt", "desc"),
    limit(50)
  );

  const assignedSnap = await getDocs(qAssigned);
  const trips = assignedSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return trips;
}


/* ------------------------------- trip detail ----------------------------- */

export async function getTripDetails(tripId: string, schoolId: string) {
  const tripRef = doc(db, "trips", tripId);
  const tripSnap = await getDoc(tripRef);

  if (!tripSnap.exists() || tripSnap.data().schoolId !== schoolId) return null;

  const tripData = { id: tripSnap.id, ...tripSnap.data() };

  const busSnap = await getDoc(doc(db, "buses", tripData.busId));
  const bus = busSnap.exists() ? busSnap.data() : null;

  const routeSnap = tripData.routeId
    ? await getDoc(doc(db, "routes", tripData.routeId))
    : null;
  const route = routeSnap && routeSnap.exists() ? routeSnap.data() : null;

  return { trip: tripData, bus, route };
}

/* ---------------------- parent: latest trip for student ------------------ */
/**
 * Returns the latest trip (today) that includes the given student.
 * Requires a composite index when combined with orderBy:
 *   trips: schoolId ==, passengers array_contains, startedAt desc
 */
export async function getLatestTripForStudent(
  schoolId: string,
  studentId: string
) {
  const qRef = query(
    collection(db, "trips"),
    where("schoolId", "==", schoolId),
    where("passengers", "array-contains", studentId),
    where("startedAt", ">=", startOfToday()),
    orderBy("startedAt", "desc"),
    limit(1)
  );
  const snap = await getDocs(qRef);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}
