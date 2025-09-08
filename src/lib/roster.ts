// src/lib/roster.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sdoc, scol } from "@/lib/schoolPath";

/**
 * Seeds passengers for a trip from students that match either:
 *  - assignedRouteId == routeId  OR
 *  - assignedBusId   == busId
 *
 * All docs are scoped under: schools/{schoolId}/...
 */
export async function seedPassengersForTrip(opts: {
  tripId: string;
  schoolId: string;
  routeId?: string;
  busId?: string;
}) {
  const { tripId, schoolId, routeId, busId } = opts;

  // 0) Sanity: ensure the trip exists and belongs to this school
  const tripSnap = await getDoc(sdoc(schoolId, "trips", tripId));
  if (!tripSnap.exists()) {
    return { created: 0, reason: "trip-not-found" as const };
  }

  // 1) Fetch students by route and/or bus (OR done client-side)
  const qBase = (field: "assignedRouteId" | "assignedBusId", value: string) =>
    query(
      collection(db, "schools", schoolId, "students"),
      where("schoolId", "==", schoolId),
      where(field, "==", value)
    );

  const queries = [];
  if (routeId) queries.push(getDocs(qBase("assignedRouteId", routeId)));
  if (busId)   queries.push(getDocs(qBase("assignedBusId",   busId)));

  const snapshots = await Promise.all(queries);
  const students: Array<{ id: string; data: DocumentData }> = [];

  const seen = new Set<string>();
  for (const snap of snapshots) {
    snap.forEach(d => {
      if (!seen.has(d.id)) {
        students.push({ id: d.id, data: d.data() });
        seen.add(d.id);
      }
    });
  }

  // 2) If nothing matched, bail early
  if (students.length === 0) {
    return { created: 0, reason: "no-matching-students" as const };
  }

  // 3) Avoid duplicates: find any passengers already created for this trip
  const existingSnap = await getDocs(
    collection(db, "schools", schoolId, "trips", tripId, "passengers")
  );
  const existingIds = new Set<string>(existingSnap.docs.map(d => d.id));

  // 4) Seed pending passengers
  const batch = writeBatch(db);
  let created = 0;

  for (const s of students) {
    if (existingIds.has(s.id)) continue;

    const pRef = doc(db, "schools", schoolId, "trips", tripId, "passengers", s.id);
    batch.set(pRef, {
      studentId: s.id,
      schoolId,
      tripId,
      status: "pending",           // allowed by rules
      boardedAt: null,
      droppedAt: null,
      createdAt: Timestamp.now(),
      // optional denormalized fields for faster UIs:
      name: s.data.name ?? s.data.displayName ?? null,
      grade: s.data.grade ?? null,
      routeId: routeId ?? null,
      busId: busId ?? null,
    });

    created++;
  }

  if (created > 0) {
    await batch.commit();
  }

  return { created };
}
