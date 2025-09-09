
import * as admin from "firebase-admin";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";

admin.initializeApp();

/* ---------- Types ---------- */

type Passenger = {
  status?: "pending" | "boarded" | "dropped" | "absent";
  studentId?: string;
  updatedAt?: admin.firestore.Timestamp;
};

type StudentDoc = {
  name?: string;
  fullName?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  schoolId?: string;
};

type UserDoc = {
  fcmTokens?: string[];
  displayName?: string;
};

/* ---------- Helpers ---------- */

/** A small sleep helper. */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Resolve a human student name with sensible fallbacks. */
async function getStudentName(db: FirebaseFirestore.Firestore, schoolId: string, studentId: string): Promise<string> {
  try {
    const snap = await db.doc(`schools/${schoolId}/students/${studentId}`).get();
    if (!snap.exists) return studentId;

    const s = snap.data() as StudentDoc;
    const joined = [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
    return s.name || s.fullName || s.displayName || joined || studentId;
  } catch {
    return studentId;
  }
}

/** Find all parent userIds that link to this student in the same school. */
async function getParentUserIds(
  db: FirebaseFirestore.Firestore,
  studentId: string,
  schoolId: string
): Promise<string[]> {
  const q = db
    .collection(`schools/${schoolId}/parentStudents`)
    .where("studentIds", "array-contains", studentId);

  const snap = await q.get();
  if (snap.empty) return [];
  return snap.docs.map((d) => d.id); // doc id is the parent uid
}

/** Send push to an array of tokens (best-effort; non-fatal). */
async function pushToTokens(
  tokens: string[] | undefined,
  title: string,
  body: string,
  data?: { [key: string]: string }
) {
  if (!tokens || tokens.length === 0) return;
  try {
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: {
        headers: { Urgency: "high" },
        notification: {
          title,
          body,
          badge: "/badge.png",
          icon: "/icon-192.png",
        },
      },
      data,
    });
  } catch (e) {
    console.warn("[FCM] multicast send failed:", (e as Error).message);
  }
}

/* ---------- Triggers ---------- */

export const updateTripCounts = onDocumentWritten(
    {
        region: "us-central1",
        document: "schools/{schoolId}/trips/{tripId}/passengers/{studentId}",
    },
    async (event) => {
        const { schoolId, tripId } = event.params;
        const db = admin.firestore();

        try {
            // Get all passengers for the trip
            const passengersSnap = await db.collection(`schools/${schoolId}/trips/${tripId}/passengers`).get();
            
            // Explicitly initialize all possible statuses to 0
            const counts: Record<"pending" | "boarded" | "dropped" | "absent", number> = {
                pending: 0,
                boarded: 0,
                dropped: 0,
                absent: 0,
            };

            passengersSnap.forEach(doc => {
                const passenger = doc.data() as Passenger;
                // Default to 'pending' if status is missing or invalid.
                const status = passenger.status && ['pending', 'boarded', 'dropped', 'absent'].includes(passenger.status)
                    ? passenger.status
                    : 'pending';
                counts[status]++;
            });

            // Update the parent trip document
            const tripRef = db.doc(`schools/${schoolId}/trips/${tripId}`);
            await tripRef.update({ counts });

        } catch (error) {
            console.error(`[COUNT_UPDATE_FAILED] Trip: ${tripId}`, error);
        }
    }
);


export const onTripCreate = onDocumentCreated(
    {
      region: "us-central1",
      document: "schools/{schoolId}/trips/{tripId}",
    },
    async (event) => {
        const db = admin.firestore();
        const tripData = event.data?.data();
        if (!tripData) return;

        const { schoolId, tripId } = event.params;
        const { routeId } = tripData;
        
        // The passenger list is populated just after trip creation.
        // A small delay ensures the data is available.
        await sleep(1500);
        const tripDoc = await db.doc(`schools/${schoolId}/trips/${tripId}`).get();
        const passengers: string[] = tripDoc.data()?.passengers || [];

        if (passengers.length === 0) {
            console.log(`Trip ${tripId} created with no passengers, no notifications sent.`);
            return;
        }

        const routeName = await (async () => {
            if (!routeId) return "A trip";
            try {
                const routeSnap = await db.doc(`schools/${schoolId}/routes/${routeId}`).get();
                return routeSnap.exists() ? `The trip for ${routeSnap.data()?.name}` : 'A trip';
            } catch {
                return 'A trip';
            }
        })();

        const title = "Trip Started 🚌";
        const body = `${routeName} has begun.`;
        
        const allParentUids = new Set<string>();
        for (const studentId of passengers) {
            const parentUids = await getParentUserIds(db, studentId, schoolId);
            parentUids.forEach(uid => allParentUids.add(uid));
        }

        const batch = db.batch();

        for (const parentUid of Array.from(allParentUids)) {
             // 1) Create inbox (bell) entry
            const inboxRef = db.doc(`schools/${schoolId}/users/${parentUid}/inbox/${tripId}-start`);
            batch.set(inboxRef, {
                title,
                body,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                data: {
                    kind: "tripStatus",
                    status: "started",
                    tripId,
                    schoolId,
                },
            });

            // 2) Optionally send push (best effort)
            try {
                const userSnap = await db.doc(`users/${parentUid}`).get();
                const user = userSnap.exists ? (userSnap.data() as UserDoc) : undefined;
                await pushToTokens(user?.fcmTokens, title, body, { kind: "tripStatus", tripId });
            } catch (e) {
                console.warn(`[FCM] skipping parent ${parentUid}:`, (e as Error).message);
            }
        }
        
        await batch.commit();
    }
);


export const onPassengerStatusChange = onDocumentWritten(
  {
    region: "us-central1",
    document: "schools/{schoolId}/trips/{tripId}/passengers/{studentId}",
  },
  async (event) => {
    const db = admin.firestore();

    const before = event.data?.before.exists ? (event.data!.before.data() as Passenger) : undefined;
    const after = event.data?.after.exists ? (event.data!.after.data() as Passenger) : undefined;

    if (!after) {
      // deleted → nothing to notify
      return;
    }

    const { schoolId, tripId, studentId: eventStudentId } = event.params;
    let { status, studentId } = after;
    
    // Ensure studentId from event params is used if not present in data
    studentId = studentId || eventStudentId;

    if (before?.status === 'dropped' && after.status !== 'dropped') {
        // This logic prevents re-notification spam if an admin reverts a dropped-off student.
        // Once a student is marked as "dropped", we consider their journey over for the day.
        status = 'dropped';
    }
    
    // Only notify when status becomes boarded/dropped/absent, and only if it truly changed
    const meaningful = status === "boarded" || status === "dropped" || status === "absent";
    const changed = before?.status !== after.status;
    if (!meaningful || !changed || !studentId) return;

    // Resolve student name
    const studentName = await getStudentName(db, schoolId, studentId);
    
    const titleMap: Record<string, string> = {
      boarded: "On Bus 🚌",
      dropped: "Dropped Off ✅",
      absent: "Marked Absent 🚫",
    };
    const title = titleMap[status] || "Update";
    const body = `${studentName} is ${status}.`;


    // Find parents
    const parentUids = await getParentUserIds(db, studentId, schoolId);
    if (parentUids.length === 0) return;

    // Prepare write batch for bell items
    const batch = db.batch();

    for (const parentUid of parentUids) {
      // 1) Create inbox (bell) entry
      const inboxRef = db.doc(`schools/${schoolId}/users/${parentUid}/inbox/${tripId}-${studentId}`);
      batch.set(inboxRef, {
        title,
        body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        data: {
          kind: "passengerStatus",
          status,
          studentId,
          studentName, // now included!
          tripId,
          schoolId,
        },
      }, { merge: true });

      // 2) Optionally send push (best effort)
      try {
        const userSnap = await db.doc(`users/${parentUid}`).get();
        const user = userSnap.exists ? (userSnap.data() as UserDoc) : undefined;
        await pushToTokens(user?.fcmTokens, title, body, { kind: "passengerStatus", studentId, tripId });
      } catch (e) {
        console.warn(`[FCM] skipping parent ${parentUid}:`, (e as Error).message);
      }
    }

    await batch.commit();
  }
);
