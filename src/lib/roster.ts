import { db } from "@/lib/firebase";
import {
  collection, query, where, getDocs, doc, getDoc, writeBatch, serverTimestamp, updateDoc
} from "firebase/firestore";

export async function seedPassengersForTrip(opts: {
  tripId: string;
  schoolId: string;
  routeId?: string | null;
  busId?: string | null;
}) {
  const { tripId, schoolId, routeId, busId } = opts;
  const parentStudentsCol = collection(db, "parentStudents");


  // 1) gather students by route OR bus (both queries, then merge)
  const studentsRef = collection(db, "students");
  const queries = [];
  if (routeId) {
    queries.push(query(studentsRef, where("schoolId", "==", schoolId), where("assignedRouteId", "==", routeId)));
  }
  if (busId) {
    queries.push(query(studentsRef, where("schoolId", "==", schoolId), where("assignedBusId", "==", busId)));
  }

  if (queries.length === 0) {
    console.debug("[ROSTER] No route or bus ID on trip. Cannot seed passengers.");
    return { created: 0 };
  }

  const snaps = await Promise.all(queries.map(q => getDocs(q)));
  const studentMap = new Map<string, any>();
  for (const s of snaps) {
    for (const d of s.docs) studentMap.set(d.id, { id: d.id, ...d.data() });
  }
  const students = [...studentMap.values()].sort((a,b)=>a.name.localeCompare(b.name));

  console.debug('[ROSTER] trip', tripId, routeId, busId);
  console.debug('[ROSTER] merged students', students.length);
  
  if (students.length === 0) {
      return { created: 0 };
  }

  // 2) Find all parent links for these students in a single query
  const studentIds = Array.from(studentMap.keys());
  const parentLinksByStudent = new Map<string, string[]>();

  const CHUNK_SIZE = 10;
  for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
    const chunk = studentIds.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;

    const parentQuery = query(parentStudentsCol, where('schoolId', '==', schoolId), where('studentIds', 'array-contains-any', chunk));
    const parentLinksSnap = await getDocs(parentQuery);
    parentLinksSnap.forEach(doc => {
        const parentId = doc.id;
        const data = doc.data();
        data.studentIds.forEach((studentId: string) => {
            if (studentMap.has(studentId)) {
                if (!parentLinksByStudent.has(studentId)) {
                    parentLinksByStudent.set(studentId, []);
                }
                parentLinksByStudent.get(studentId)!.push(parentId);
            }
        });
    });
  }

  // 3) create missing passenger docs, idempotent
  const batch = writeBatch(db);
  const passengerRefs = students.map(s => doc(db, `trips/${tripId}/passengers`, s.id));
  const existingDocs = await Promise.all(passengerRefs.map(ref => getDoc(ref)));

  let createdCount = 0;
  students.forEach((s, index) => {
      if (!existingDocs[index].exists()) {
          createdCount++;
          batch.set(passengerRefs[index], {
              schoolId,
              studentId: s.id,
              studentName: s.name ?? null,
              parentUids: parentLinksByStudent.get(s.id) || [],
              status: "pending",
              boardedAt: null,
              droppedAt: null,
              updatedAt: serverTimestamp(),
          }, { merge: true });
      }
  });

  if (createdCount > 0) {
    await batch.commit();
  }

  // 4) After seeding, update the trip's metadata
  if (students.length > 0) {
      await updateDoc(doc(db, 'trips', tripId), {
          'counts.pending': students.length,
          'passengers': Array.from(studentMap.keys()),
      });
  }

  return { created: students.length };
}