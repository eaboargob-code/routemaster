// lib/roster.ts
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
} from "firebase/firestore";
import { db } from "@/lib/firebase";

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
export async function seedPassengersForTrip({
  tripId,
  schoolId,
  routeId,
  busId,
}: SeedArgs): Promise<{ created: number }> {
  if (!tripId || !schoolId) {
    throw new Error("Missing required tripId or schoolId");
  }

  // 1) Collect all students in this school filtered by busId or routeId
  const studentsCol = collection(db, "students");
  const candidates: any[] = [];
  const studentIds = new Set<string>();

  const processSnaps = (snap: any) => {
    snap.docs.forEach((doc: any) => {
      if (!studentIds.has(doc.id)) {
        studentIds.add(doc.id);
        candidates.push({ id: doc.id, ...doc.data() });
      }
    });
  }

  // Query by route
  if (routeId) {
    const q = query(studentsCol, where("schoolId", "==", schoolId), where("assignedRouteId", "==", routeId));
    processSnaps(await getDocs(q));
  }
  // Query by bus
  if (busId) {
    const q = query(studentsCol, where("schoolId", "==", schoolId), where("assignedBusId", "==", busId));
    processSnaps(await getDocs(q));
  }
  
  if (candidates.length === 0) {
    return { created: 0 };
  }

  const batch = writeBatch(db);
  let created = 0;

  for (const student of candidates) {
    const passRef = doc(db, `trips/${tripId}/passengers`, student.id);
    const existing = await getDoc(passRef);
    if (!existing.exists()) {
      batch.set(passRef, {
        studentId: student.id,
        studentName: student.name || "Unknown",
        schoolId, // Ensure schoolId is always set
        status: "pending",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      created++;
    }
  }

  if (created > 0) {
    await batch.commit();
  }

  return { created };
}
