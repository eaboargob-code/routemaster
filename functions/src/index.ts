
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();

/**
 * When a passenger's status changes, notify all parents
 * whose parentStudents doc contains this studentId.
 */
export const onPassengerStatusChange = functions.firestore
  .document("trips/{tripId}/passengers/{studentId}")
  .onWrite(async (change, ctx) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    if (!after) return; // deleted

    // Only fire on meaningful status changes
    const statusNow: string | undefined = after.status;
    const statusBefore: string | undefined = before?.status;
    if (!statusNow || statusNow === statusBefore) return;

    const { tripId, studentId } = ctx.params as { tripId: string; studentId: string };
    const schoolId: string = after.schoolId;

    // 1) Get student name
    let studentName = studentId;
    try {
      const studentSnap = await db.doc(`students/${studentId}`).get();
      if (studentSnap.exists) {
        const s = studentSnap.data()!;
        if (typeof s.name === "string" && s.name.trim().length > 0) {
          studentName = s.name.trim();
        }
      }
    } catch (e) {
      console.error("Failed to fetch student name:", e);
    }

    // 2) Find all parents that have this student linked (Option A shape)
    const parentsSnap = await db
      .collection("parentStudents")
      .where("studentIds", "array-contains", studentId)
      .get();

    if (parentsSnap.empty) return;

    // 3) Prepare common payload
    const title =
      statusNow === "boarded"
        ? "On Bus 🚌"
        : statusNow === "dropped"
        ? "Dropped Off ✅"
        : statusNow === "absent"
        ? "Marked Absent ⚠️"
        : "Passenger Update";

    const body = `${studentName} is ${statusNow}.`;

    // 4) Write inbox doc + (optional) FCM fan-out
    const writes: Promise<any>[] = [];

    for (const pDoc of parentsSnap.docs) {
      const parentUid = pDoc.id;

      // 4a) Inbox document (this powers the bell dropdown)
      const inboxRef = db.collection("users").doc(parentUid).collection("inbox").doc();
      writes.push(
        inboxRef.set({
          title,
          body,
          studentId,
          studentName,               // <-- the field we were missing
          tripId,
          schoolId,
          status: statusNow,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          data: {
            kind: "passengerStatus",
            schoolId,
            studentId,
            tripId,
            status: statusNow,
          },
        })
      );

      // 4b) (Optional) Web push via FCM
      // If you already send pushes elsewhere, keep that. Otherwise:
      writes.push(
        (async () => {
          try {
            const userSnap = await db.doc(`users/${parentUid}`).get();
            const tokens: string[] = (userSnap.data()?.fcmTokens ?? []).filter(Boolean);
            if (!tokens.length) return;

            await admin.messaging().sendEachForMulticast({
              tokens,
              notification: { title, body },
              data: {
                kind: "passengerStatus",
                schoolId,
                studentId,
                tripId,
                status: statusNow,
              },
            });
          } catch (e) {
            console.error("FCM fan-out failed for", parentUid, e);
          }
        })()
      );
    }

    await Promise.all(writes);
  });
