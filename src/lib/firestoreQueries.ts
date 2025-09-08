import { db } from "@/lib/firebase";
import {
  collection, query, where, orderBy, limit, getDocs, doc, getDoc,
  Timestamp, type DocumentData
} from "firebase/firestore";
import { scol, sdoc } from "@/lib/schoolPath";

export const startOfToday = () => {
  const d = new Date(); d.setHours(0,0,0,0);
  return Timestamp.fromDate(d);
};
export const endOfToday = () => {
  const d = new Date(); d.setHours(23,59,59,999);
  return Timestamp.fromDate(d);
};

export async function getUsersByIds(uids: string[]): Promise<Record<string, DocumentData>> {
  const byId: Record<string, any> = {};
  if (!uids || uids.length === 0) return byId;

  const CHUNK = 30;
  for (let i = 0; i < uids.length; i += CHUNK) {
    const unique = [...new Set(uids.slice(i, i + CHUNK))];
    if (!unique.length) continue;
    const q = query(collection(db, "users"), where("__name__", "in", unique));
    (await getDocs(q)).forEach(d => (byId[d.id] = d.data()));
  }
  return byId;
}

// School-scoped lookups
export async function listBusesForSchool(schoolId: string) {
  return (await getDocs(scol(schoolId, "buses"))).docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function listRoutesForSchool(schoolId: string) {
  return (await getDocs(scol(schoolId, "routes"))).docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function listStudentsForSchool(schoolId: string) {
  return (await getDocs(scol(schoolId, "students"))).docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listUsersForSchool(schoolId: string, role?: 'driver' | 'supervisor') {
  const constraints = [];
  if (role) {
    constraints.push(where("role", "==", role));
  }
  const q = query(scol(schoolId, "users"), ...constraints);
  return (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listTodaysTripsForSchool(schoolId: string, filters: { status?: "active"|"ended"|"all" } = {}) {
  const constraints = [
    where("startedAt", ">=", startOfToday()),
    orderBy("startedAt", "desc"),
  ];
  const qTrips = query(scol(schoolId, "trips"), ...constraints);
  let docs = (await getDocs(qTrips)).docs;
  if (filters.status && filters.status !== "all") {
    docs = docs.filter(d => d.data().status === filters.status);
  }
  return docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getAssignedBusForDriver(schoolId: string, driverUid: string) {
  const qBus = query(
    scol(schoolId, "buses"),
    where("driverId", "==", driverUid),
    limit(1)
  );
  const snap = await getDocs(qBus);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getRouteById(schoolId: string, routeId?: string|null) {
  if (!routeId) return null;
  const snap = await getDoc(sdoc(schoolId, "routes", routeId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getActiveOrTodayTripsForDriver(schoolId: string, driverUid: string) {
  const qTrips = query(
    scol(schoolId, "trips"),
    where("driverId", "==", driverUid),
    where("startedAt", ">=", startOfToday()),
    orderBy("startedAt", "desc")
  );
  const s = await getDocs(qTrips);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getSupervisorTrips(schoolId: string, supervisorUid: string) {
  const base = scol(schoolId, "trips");
  const qMine = query(base, where("supervisorId", "==", supervisorUid), where("startedAt", ">=", startOfToday()), orderBy("startedAt","desc"));
  const qDriverAsSup = query(base, where("allowDriverAsSupervisor","==",true), where("startedAt", ">=", startOfToday()), orderBy("startedAt","desc"));

  const [a, b] = await Promise.all([getDocs(qMine), getDocs(qDriverAsSup)]);
  const seen = new Set<string>();
  const docs = [...a.docs, ...b.docs].filter(d => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  return docs.map(d => ({ id: d.id, ...d.data() }))
             .sort((x:any,y:any)=> (y.startedAt as Timestamp).toMillis() - (x.startedAt as Timestamp).toMillis());
}

export async function getTripDetails(tripId: string, schoolId: string) {
  const tripSnap = await getDoc(sdoc(schoolId, "trips", tripId));
  if (!tripSnap.exists()) return null;
  const trip = { id: tripSnap.id, ...tripSnap.data() };

  const busSnap = await getDoc(sdoc(schoolId, "buses", (trip as any).busId));
  const routeSnap = (trip as any).routeId ? await getDoc(sdoc(schoolId, "routes", (trip as any).routeId)) : null;

  return {
    trip,
    bus: busSnap.exists() ? busSnap.data() : null,
    route: routeSnap && routeSnap.exists() ? routeSnap.data() : null,
  };
}
