
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
    if (!after) {
        console.log("Document deleted, skipping notification.");
        return; 
    }
    const prev = before?.status;
    const curr = after?.status;
    if (!curr || prev === curr) {
        console.log(`Status unchanged or missing ('${prev}' -> '${curr}'), skipping.`);
        return;
    }

    const tripId = event.params.tripId as string;
    const studentId = event.params.studentId as string;
    console.log(`Status changed for student ${studentId} in trip ${tripId} to ${curr}.`);

    const tripSnap = await db.doc(`trips/${tripId}`).get();
    if (!tripSnap.exists) {
        console.log(`Trip document ${tripId} not found.`);
        return;
    }
    const trip = tripSnap.data() as any;
    const schoolId = trip.schoolId;

    // Find all parents linked to this student in the same school
    const parentsSnap = await db.collection("parentStudents")
      .where("schoolId", "==", schoolId)
      .where("studentIds", "array-contains", studentId)
      .get();

    if (parentsSnap.empty) {
        console.log(`No parents found for student ${studentId} in school ${schoolId}.`);
        return;
    }

    // Load tokens
    const tokens: string[] = [];
    const parentUids: string[] = [];
    for (const d of parentsSnap.docs) {
      parentUids.push(d.id);
    }
    const parentsFound = parentUids.length;
    console.log(`Found ${parentsFound} parent(s): ${parentUids.join(', ')}`);
    
    if (parentUids.length === 0) return;

    const userDocs = await db.getAll(...parentUids.map(u => db.doc(`users/${u}`)));
    userDocs.forEach(u => {
      const t = (u.get("fcmTokens") as string[] | undefined) ?? [];
      tokens.push(...t);
    });

    const tokensCount = tokens.length;
    if (tokensCount === 0) {
        console.log("No FCM tokens found for the parent(s).");
        return;
    }
    console.log(`Found ${tokensCount} tokens to send to.`);

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

    console.log("Sending notification payload:", JSON.stringify({ notification: message.notification, data: message.data }));
    const resp = await getMessaging().sendEachForMulticast(message);
    console.log(`Successfully sent ${resp.successCount} messages, ${resp.failureCount} failed.`);
    
    // Cleanup invalid tokens
    const invalid: string[] = [];
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const err = (r.error?.message || "").toLowerCase();
        console.error(`Failed to send to token ${tokens[i]}:`, r.error);
        if (err.includes("unregistered") || err.includes("invalid")) {
          invalid.push(tokens[i]);
        }
      }
    });
    if (invalid.length) {
      console.log(`Cleaning up ${invalid.length} invalid tokens.`);
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
