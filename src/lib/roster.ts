
import {
  collection, query, where, getDocs, writeBatch, doc, Timestamp, updateDoc, type DocumentData
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { scol, sdoc } from "@/lib/schoolPath";

type SeedOptions = {
    schoolId: string;
    tripId?: string;
    routeId?: string | null;
    busId?: string | null;
    mode: 'count' | 'write';
    passengerData?: { id: string; data: any; }[]; // Only for 'write' mode
};

/**
 * Seeds passengers for a trip from students assigned to the same route or bus,
 * or just counts them.
 * In 'count' mode, it returns the passenger data without writing.
 * In 'write' mode, it writes the provided passenger data to the database.
 */
export async function seedPassengersForTrip(opts: SeedOptions) {
  const { schoolId, tripId, routeId, busId, mode } = opts;

  // --- Mode: count ---
  if (mode === 'count') {
    const studentsCol = scol(schoolId, "students");
    const candidates = new Map<string, { id: string; data: DocumentData }>();

    // Query by route first
    if (routeId) {
      const qRoute = query(studentsCol, where("assignedRouteId", "==", routeId));
      const sRoute = await getDocs(qRoute);
      sRoute.forEach(d => candidates.set(d.id, { id: d.id, data: d.data() }));
    }
    
    // Then query by bus and merge results (if no route was specified or to add bus-only students)
    if (busId) {
        const qBus = query(studentsCol, where("assignedBusId", "==", busId));
        const sBus = await getDocs(qBus);
        sBus.forEach(d => {
            if (!candidates.has(d.id)) { // Avoid duplicates
                candidates.set(d.id, { id: d.id, data: d.data() });
            }
        });
    }
    
    return { passengerData: Array.from(candidates.values()) };
  }

  // --- Mode: write ---
  if (mode === 'write') {
    if (!tripId || !opts.passengerData || opts.passengerData.length === 0) {
      return { created: 0, skipped: 0 };
    }

    const passengersCol = collection(sdoc(schoolId, "trips", tripId), "passengers");
    const batch = writeBatch(db);
    let created = 0;

    for (const s of opts.passengerData) {
      const name = s.data.name || s.data.fullName || s.data.displayName ||
                   (s.data.firstName && s.data.lastName ? `${s.data.firstName} ${s.data.lastName}` : "Student");

      const passengerRef = doc(passengersCol, s.id);
      batch.set(passengerRef, {
        schoolId,
        studentId: s.id,
        studentName: name,
        status: "pending",
        boardedAt: null,
        droppedAt: null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      created++;
    }

    if (created > 0) {
      await batch.commit();
    }
    return { created, skipped: 0 };
  }

  // Should not happen
  return { created: 0, skipped: 0, passengerData: [] };
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
