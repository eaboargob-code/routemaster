import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";

admin.initializeApp();
const db = admin.firestore();

export const notifyPassengerStatus = onDocumentWritten(
  "trips/{tripId}/passengers/{studentId}",
  async (event) => {
    const before = event.data?.before.data() as any | undefined;
    const after = event.data?.after.data() as any | undefined;
    if (!after) return; // deleted
    const prev = before?.status;
    const curr = after?.status;
    if (!curr || prev === curr) return;

    const tripId = event.params.tripId as string;
    const studentId = event.params.studentId as string;

    const tripSnap = await db.doc(`trips/${tripId}`).get();
    if (!tripSnap.exists) return;
    const trip = tripSnap.data() as any;
    const schoolId = trip.schoolId;

    // Find all parents linked to this student in the same school
    const parentsSnap = await db.collection("parentStudents")
      .where("schoolId", "==", schoolId)
      .where("studentIds", "array-contains", studentId)
      .get();

    if (parentsSnap.empty) return;

    // Load tokens
    const tokens: string[] = [];
    const parentUids: string[] = [];
    for (const d of parentsSnap.docs) {
      parentUids.push(d.id);
    }
    
    if (parentUids.length === 0) return;

    const userDocs = await db.getAll(...parentUids.map(u => db.doc(`users/${u}`)));
    userDocs.forEach(u => {
      const t = (u.get("fcmTokens") as string[] | undefined) ?? [];
      tokens.push(...t);
    });
    if (tokens.length === 0) return;

    // Enrich with student name
    const studentSnap = await db.doc(`students/${studentId}`).get();
    const childName = (studentSnap.get("name") as string) || "Your child";

    const titleByStatus: Record<string, string> = {
      boarded: `${childName} boarded the bus`,
      dropped: `${childName} arrived at destination`,
      absent: `${childName} marked absent`,
      pending: `${childName} status updated`,
    };
    const title = titleByStatus[curr] ?? `${childName} status updated`;
    const body = trip.routeName
      ? `Route ${trip.routeName} • ${new Date().toLocaleTimeString()}`
      : new Date().toLocaleTimeString();

    const message = {
      notification: { title, body },
      data: {
        tripId,
        studentId,
        status: curr,
        schoolId: String(schoolId),
      },
      tokens,
    };

    const resp = await getMessaging().sendEachForMulticast(message);
    // Cleanup invalid tokens
    const invalid: string[] = [];
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const err = (r.error?.message || "").toLowerCase();
        if (err.includes("unregistered") || err.includes("invalid")) {
          invalid.push(tokens[i]);
        }
      }
    });
    if (invalid.length) {
      await Promise.all(
        parentUids.map(async (uid) =>
          db.doc(`users/${uid}`).update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalid),
          })
        )
      );
    }
  }
);
