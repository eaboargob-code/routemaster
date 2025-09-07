
import { db } from "@/lib/firebase";
import {
  collection, query, where, orderBy, limit, getDocs, doc, getDoc,
  Timestamp, type DocumentData
} from "firebase/firestore";

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
  
  // Firestore 'in' queries are limited to 30 items. Chunk if necessary.
  const CHUNK_SIZE = 30;
  const chunks = [];
  for (let i = 0; i < uids.length; i += CHUNK_SIZE) {
      chunks.push(uids.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    const uniqueIds = [...new Set(chunk)];
    if (uniqueIds.length === 0) continue;
    
    const q = query(collection(db, "users"), where("__name__", "in", uniqueIds));
    const snapshot = await getDocs(q);
    snapshot.forEach(doc => {
      byId[doc.id] = doc.data();
    });
  }

  return byId;
}


export async function listUsersForSchool(schoolId: string, role?: "admin"|"driver"|"supervisor"|"parent") {
  const constraints = [where("schoolId", "==", schoolId)];
  if (role) {
    constraints.push(where("role", "==", role));
  }
  const q = query(collection(db, "users"), ...constraints);
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listBusesForSchool(schoolId: string) {
  const q = query(collection(db, "buses"), where("schoolId", "==", schoolId));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listRoutesForSchool(schoolId: string) {
  const q = query(collection(db, "routes"), where("schoolId", "==", schoolId));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listStudentsForSchool(schoolId: string) {
  const q = query(collection(db, "students"), where("schoolId", "==", schoolId));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listTodaysTripsForSchool(schoolId: string, filters: { status?: string } = {}) {
    const constraints = [
        where("schoolId", "==", schoolId),
        where("startedAt", ">=", startOfToday()),
    ];

    if (filters.status && filters.status !== 'all') {
        // This filter is now applied client-side to avoid index requirement
        // constraints.push(where("status", "==", filters.status));
    }
    
    constraints.push(orderBy("startedAt", "desc"));

    const q = query(collection(db, "trips"), ...constraints);
    let s = await getDocs(q);
    
    let docs = s.docs;
    
    if (filters.status && filters.status !== 'all') {
        docs = docs.filter(doc => doc.data().status === filters.status);
    }

    return docs.map(d => ({ id: d.id, ...d.data() }));
}


export async function getAssignedBusForDriver(schoolId: string, driverUid: string) {
  const q = query(
    collection(db, "buses"),
    where("schoolId","==",schoolId),
    where("driverId","==",driverUid),
    limit(1)
  );
  const s = await getDocs(q);
  if (s.empty) return null;
  return { id: s.docs[0].id, ...s.docs[0].data() };
}

export async function getRouteById(routeId?: string|null) {
  if (!routeId) return null;
  const snap = await getDoc(doc(db,"routes", routeId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getActiveOrTodayTripsForDriver(schoolId: string, driverUid: string) {
  const q = query(
    collection(db,"trips"),
    where("schoolId","==",schoolId),
    where("driverId","==",driverUid),
    where("startedAt",">=", startOfToday()),
    orderBy("startedAt","desc")
  );
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getSupervisorTrips(schoolId: string, supervisorUid: string) {
  const tripsRef = collection(db, "trips");
  const today = startOfToday();

  // Query 1: Trips where the user is the explicitly assigned supervisor.
  const assignedQuery = query(
    tripsRef,
    where("schoolId", "==", schoolId),
    where("supervisorId", "==", supervisorUid),
    where("startedAt", ">=", today)
  );

  // Query 2: Trips where the driver is allowed to act as supervisor.
  // This query needs to be scoped to the school, assuming rules allow this.
  const driverIsSupervisingQuery = query(
    tripsRef,
    where("schoolId", "==", schoolId),
    where("allowDriverAsSupervisor", "==", true),
    where("startedAt", ">=", today)
  );
  
  // Run queries in parallel
  const [assignedSnap, driverAsSupSnap] = await Promise.all([
    getDocs(assignedQuery),
    getDocs(driverIsSupervisingQuery),
  ]);

  // Merge results and remove duplicates
  const allTrips = new Map<string, DocumentData>();
  assignedSnap.docs.forEach(doc => allTrips.set(doc.id, { id: doc.id, ...doc.data() }));
  driverAsSupSnap.docs.forEach(doc => allTrips.set(doc.id, { id: doc.id, ...doc.data() }));

  // Sort by start time descending
  return Array.from(allTrips.values())
    .sort((a, b) => (b.startedAt as Timestamp).toMillis() - (a.startedAt as Timestamp).toMillis());
}

export async function getTripDetails(tripId: string, schoolId: string) {
    const tripRef = doc(db, "trips", tripId);
    const tripSnap = await getDoc(tripRef);

    if (!tripSnap.exists() || tripSnap.data().schoolId !== schoolId) {
        return null;
    }
    const tripData = { id: tripSnap.id, ...tripSnap.data() };

    const busSnap = await getDoc(doc(db, 'buses', tripData.busId));
    const bus = busSnap.exists() ? busSnap.data() : null;
    
    const routeSnap = tripData.routeId ? await getDoc(doc(db, 'routes', tripData.routeId)) : null;
    const route = routeSnap && routeSnap.exists() ? routeSnap.data() : null;

    return { trip: tripData, bus, route };
}
