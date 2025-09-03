// lib/roster.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
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
  const allStudentsSnap = await getDocs(studentsCol);
  const candidates = allStudentsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (s: any) =>
        s.schoolId === schoolId &&
        ((busId && s.assignedBusId === busId) ||
          (routeId && s.assignedRouteId === routeId))
    );

  if (candidates.length === 0) {
    return { created: 0 };
  }

  const batch = writeBatch(db);
  let created = 0;

  for (const student of candidates) {
    const passRef = doc(db, `trips/${tripId}/passengers/${student.id}`);
    const existing = await getDoc(passRef);
    if (!existing.exists()) {
      batch.set(passRef, {
        studentId: student.id,
        studentName: student.name || "Unknown", // ✅ always include a name
        schoolId,
        status: "pending",
        createdAt: Timestamp.now(),
      });
      created++;
    }
  }

  if (created > 0) {
    await batch.commit();
  }

  return { created };
}
