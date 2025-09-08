import {
  collection, query, where, getDocs, writeBatch, doc, Timestamp, updateDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { scol, sdoc } from "@/lib/schoolPath";

/**
 * Seeds passengers for a trip from students assigned to the same route or bus.
 * Idempotent: we skip creating rows that already exist.
 *
 * Requirements:
 *  - students have { schoolId, routeId?: string, busId?: string, name/displayName }
 *  - creates passenger docs with: { studentId, studentName, status: "pending", boardedAt: null, droppedAt: null, schoolId }
 */
export async function seedPassengersForTrip(opts: {
  schoolId: string;
  tripId: string;
  routeId?: string | null;
  busId?: string | null;
}) {
  const { schoolId, tripId, routeId, busId } = opts;

  // 1) Get candidates (by route OR bus)
  const studentsCol = scol(schoolId, "students");

  // Try route first; if no routeId, fall back to busId
  const wants: { id: string; data: any }[] = [];
  if (routeId) {
    const qRoute = query(studentsCol, where("assignedRouteId", "==", routeId));
    const sRoute = await getDocs(qRoute);
    sRoute.forEach(d => wants.push({ id: d.id, data: d.data() }));
  }
  if (!routeId && busId) {
    const qBus = query(studentsCol, where("assignedBusId", "==", busId));
    const sBus = await getDocs(qBus);
    sBus.forEach(d => wants.push({ id: d.id, data: d.data() }));
  }

  // Nothing to seed
  if (wants.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // 2) Load already-existing passenger rows (to skip duplicates)
  const passengersCol = collection(
    sdoc(schoolId, "trips", tripId),
    "passengers"
  );

  const existingSnap = await getDocs(passengersCol);
  const existingIds = new Set(existingSnap.docs.map(d => d.id));

  // 3) Write missing ones
  const batch = writeBatch(db);
  let created = 0;
  let skipped = 0;

  for (const s of wants) {
    if (existingIds.has(s.id)) {
      skipped++;
      continue;
    }

    const name =
      s.data.name ||
      s.data.fullName ||
      s.data.displayName ||
      (s.data.firstName && s.data.lastName
        ? `${s.data.firstName} ${s.data.lastName}`
        : "Student");

    const passengerRef = doc(passengersCol, s.id);
    batch.set(passengerRef, {
      schoolId,
      studentId: s.id,
      studentName: name,
      status: "pending",
      boardedAt: null,
      droppedAt: null,
      createdAt: Timestamp.now(),
    });
    created++;
  }

  if (created > 0) {
    await batch.commit();
  }

  return { created, skipped };
}


export async function boardStudent(schoolId: string, tripId: string, studentId: string) {
  const ref = sdoc(schoolId, `trips/${tripId}/passengers`, studentId);
  return updateDoc(ref, {
    status: "boarded",
    boardedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function dropStudent(schoolId: string, tripId: string, studentId: string) {
  const ref = sdoc(schoolId, `trips/${tripId}/passengers`, studentId);
  return updateDoc(ref, {
    status: "dropped",
    droppedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function markAbsent(schoolId: string, tripId: string, studentId: string) {
  const ref = sdoc(schoolId, `trips/${tripId}/passengers`, studentId);
  return updateDoc(ref, {
    status: "absent",
    updatedAt: Timestamp.now(),
  });
}
