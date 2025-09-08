
// src/lib/roster.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  increment,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { scol } from "./schoolPath";

interface SeedArgs {
  tripId: string;
  schoolId: string;
  routeId?: string | null;
  busId?: string | null;
}

/**
 * Seed passenger roster for a trip.
 * Idempotent: safe to call multiple times.
 */
export async function seedPassengersForTrip(opts: {
  tripId: string;
  schoolId: string;
  routeId: string;
  busId: string;
}): Promise<{ created: number }> {
  const { tripId, schoolId, routeId, busId } = opts;

  const studentsRef = scol(schoolId, 'students');
  const queries = [];
  if (routeId) {
    queries.push(query(studentsRef, where('assignedRouteId', '==', routeId)));
  }
  if (busId) {
    queries.push(query(studentsRef, where('assignedBusId', '==', busId)));
  }

  const snaps = await Promise.all(queries.map(q => getDocs(q)));
  const merged = new Map<string, any>();
  for (const s of snaps) {
    for (const d of s.docs) merged.set(d.id, { id: d.id, ...d.data() });
  }
  const students = [...merged.values()];

  if (students.length === 0) return { created: 0 };

  const batch = writeBatch(db);
  const tripRef = doc(db, 'trips', tripId);
  let created = 0;

  for (const s of students) {
    const passengerRef = doc(db, 'trips', tripId, 'passengers', s.id);
    const data = s as any;

    const exists = await getDoc(passengerRef);
    if (!exists.exists()) {
       // Set with merge so it’s safe to re-run
        batch.set(passengerRef, {
            studentId: s.id,
            studentName: data?.name ?? '',
            status: 'pending',
            boardedAt: null,
            droppedAt: null,
            updatedAt: serverTimestamp(),
        }, { merge: true });

        // Keep passengers array for parent query
        batch.update(tripRef, { passengers: arrayUnion(s.id) });

        created++;
    }
  }

  if (created > 0) {
    await batch.commit();
  }
  
  return { created };
}
