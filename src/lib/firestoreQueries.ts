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

  const CHUNK = 30;
  for (let i = 0; i < uids.length; i += CHUNK) {
    const unique = [...new Set(uids.slice(i, i + CHUNK))];
    if (!unique.length) continue;
    const q = query(
      collection(db, "schools", schoolId, "users"),
      where("__name__", "in", unique)
    );
    (await getDocs(q)).forEach(d => (byId[d.id] = d.data()));
  }
  return byId;
}
