import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineString } from "firebase-functions/params";

admin.initializeApp();

/* ---------- Helpers ---------- */

type Passenger = {
  status?: "pending" | "boarded" | "dropped" | "absent";
  studentId?: string;
  schoolId?: string;
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

/** Resolve a human student name with sensible fallbacks. */
async function getStudentName(db: FirebaseFirestore.Firestore, studentId: string): Promise<string> {
  try {
    const snap = await db.collection("students").doc(studentId).get();
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
    .collection("parentStudents")
    .where("schoolId", "==", schoolId)
    .where("studentIds", "array-contains", studentId);

  const snap = await q.get();
  if (snap.empty) return [];
  return snap.docs.map((d) => d.id); // doc id is the parent uid (per your schema)
}

/** Title + body for the notification. */
function buildNote(status: Passenger["status"], studentName: string) {
  let title = "Update";
  if (status === "boarded") title = "On Bus 🚌";
  else if (status === "dropped") title = "Dropped Off ✅";
  else if (status === "absent") title = "Marked Absent 🚫";

  // IMPORTANT: only the name, no “Student ” prefix.
  const body = `${studentName} is ${status}.`;
  return { title, body };
}

/** Send push to an array of tokens (best-effort; non-fatal). */
async function pushToTokens(
  tokens: string[] | undefined,
  title: string,
  body: string
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
      data: { kind: "passengerStatus" },
    });
  } catch (e) {
    console.warn("[FCM] multicast send failed:", (e as Error).message);
  }
}

/* ---------- Trigger ---------- */

export const onPassengerStatusChange = onDocumentWritten(
  {
    region: "us-central1",
    document: "trips/{tripId}/passengers/{studentId}",
    // increase retries if you like:
    // retry: true,
  },
  async (event) => {
    const db = admin.firestore();

    const before = event.data?.before.exists ? (event.data!.before.data() as Passenger) : undefined;
    const after = event.data?.after.exists ? (event.data!.after.data() as Passenger) : undefined;

    if (!after) {
      // deleted → nothing to notify
      return;
    }

    const { status, studentId, schoolId } = after;
    const tripId = event.params.tripId as string;

    // Only notify when status becomes boarded/dropped/absent, and only if it changed
    const meaningful = status === "boarded" || status === "dropped" || status === "absent";
    const changed = before?.status !== after.status;
    if (!meaningful || !changed || !studentId || !schoolId) return;

    // Resolve student name
    const studentName = await getStudentName(db, studentId);
    const { title, body } = buildNote(status, studentName);

    // Find parents
    const parentUids = await getParentUserIds(db, studentId, schoolId);
    if (parentUids.length === 0) return;

    // Prepare write batch for bell items
    const batch = db.batch();

    for (const parentUid of parentUids) {
      // 1) Create inbox (bell) entry
      const inboxRef = db.collection("users").doc(parentUid).collection("inbox").doc();
      batch.set(inboxRef, {
        title,
        body, // e.g. "Ali is boarded."
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        data: {
          kind: "passengerStatus",
          status,
          studentId,
          studentName,
          tripId,
          schoolId,
        },
      });

      // 2) Optionally send push (best effort)
      try {
        const userSnap = await db.collection("users").doc(parentUid).get();
        const user = userSnap.exists ? (userSnap.data() as UserDoc) : undefined;
        await pushToTokens(user?.fcmTokens, title, body);
      } catch (e) {
        console.warn(`[FCM] skipping parent ${parentUid}:`, (e as Error).message);
      }
    }

    await batch.commit();
  }
);
