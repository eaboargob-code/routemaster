// functions/index.ts
import * as admin from 'firebase-admin';
import { onDocumentWritten } from "firebase-functions/v2/firestore";
admin.initializeApp();


// --- Types for clarity ---

type Passenger = {
  status?: "pending" | "boarded" | "dropped" | "absent";
  studentId?: string;
  studentName?: string;
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


// --- Helper Functions ---

/**
 * Resolves a student's name from the student document with sensible fallbacks.
 * @param db The Firestore instance.
 * @param studentId The ID of the student to look up.
 * @returns A promise that resolves to the student's name or the ID as a fallback.
 */
async function getStudentName(db: admin.firestore.Firestore, studentId: string): Promise<string> {
  try {
    const snap = await db.collection("students").doc(studentId).get();
    if (!snap.exists) return studentId;

    const s = snap.data() as StudentDoc;
    const joined = [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
    return s.name || s.fullName || s.displayName || joined || studentId;
  } catch (e) {
    console.warn(`[getStudentName] Error fetching student ${studentId}:`, e);
    return studentId; // Fallback to ID on error
  }
}

/**
 * Finds all parent user IDs linked to a specific student in a given school.
 * @param db The Firestore instance.
 * @param studentId The ID of the student.
 * @param schoolId The ID of the school.
 * @returns A promise that resolves to an array of parent user IDs.
 */
async function getParentUserIds(
  db: admin.firestore.Firestore,
  studentId: string,
  schoolId: string
): Promise<string[]> {
  try {
    const q = db
      .collection("parentStudents")
      .where("schoolId", "==", schoolId)
      .where("studentIds", "array-contains", studentId);

    const snap = await q.get();
    if (snap.empty) return [];
    return snap.docs.map((d) => d.id);
  } catch(e) {
    console.error(`[getParentUserIds] Error fetching parents for student ${studentId} in school ${schoolId}:`, e);
    return [];
  }
}

/**
 * Constructs the notification title and body based on the passenger's status.
 * @param status The passenger's new status.
 * @param studentName The resolved name of the student.
 * @returns An object containing the notification title and body.
 */
function buildNotificationPayload(status: Passenger["status"], studentName: string) {
  let title = "Update";
  let body = `${studentName} status is now ${status}.`;

  switch (status) {
    case "boarded":
      title = "On Bus 🚌";
      body = `${studentName} is on the bus.`;
      break;
    case "dropped":
      title = "Dropped Off ✅";
      body = `${studentName} has been dropped off.`;
      break;
    case "absent":
      title = "Marked Absent 🚫";
      body = `${studentName} has been marked absent.`;
      break;
  }
  return { title, body };
}


// --- Main Cloud Function Trigger ---

export const onPassengerStatusChange = onDocumentWritten(
  {
    region: "us-central1", // Specify region for consistency
    document: "trips/{tripId}/passengers/{studentId}",
  },
  async (event) => {
    const db = admin.firestore();
    const before = event.data?.before.exists ? (event.data.before.data() as Passenger) : undefined;
    const after = event.data?.after.exists ? (event.data.after.data() as Passenger) : undefined;

    // --- Pre-computation checks ---
    if (!after?.status || after.status === before?.status) {
      // Exit if doc deleted, no status, or status hasn't changed.
      return; 
    }

    const { status, studentId, schoolId } = after;
    if (!studentId || !schoolId) {
      console.log(`Exiting: missing studentId or schoolId on passenger doc ${event.params.tripId}/${event.params.studentId}.`);
      return;
    }

    // --- Data fetching and resolution ---
    const resolvedStudentName = after.studentName || (await getStudentName(db, studentId));
    const parentUids = await getParentUserIds(db, studentId, schoolId);

    if (parentUids.length === 0) {
      console.log(`No parents found for student ${studentId} in school ${schoolId}.`);
      return;
    }

    // --- Prepare and execute writes ---
    const { title, body } = buildNotificationPayload(status, resolvedStudentName);
    const batch = db.batch();

    parentUids.forEach((parentUid) => {
      const inboxRef = db.collection("users").doc(parentUid).collection("inbox").doc();
      batch.set(inboxRef, {
        title,
        body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        data: {
          kind: "passengerStatus",
          status,
          studentId,
          studentName: resolvedStudentName,
          tripId: event.params.tripId,
          schoolId,
        },
      });
    });

    try {
        await batch.commit();
        console.log(`Sent notifications to ${parentUids.length} parent(s) for student ${studentId}.`);
    } catch(e) {
        console.error(`[batch.commit] Failed to write inbox notifications for student ${studentId}:`, e);
    }
  }
);
