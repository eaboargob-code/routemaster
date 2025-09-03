
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

    // 1) Get student name (with fallback)
    let studentName = after.studentName; // Prefer name from passenger doc
    if (!studentName || typeof studentName !== 'string' || !studentName.trim()) {
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
    }
    // Final fallback to student ID
    if (!studentName) studentName = studentId;

    // 2) Get parent UIDs from the passenger document
    const parentUids: string[] = after.parentUids || [];
    if (parentUids.length === 0) {
        console.log(`No parentUids found for student ${studentId} on trip ${tripId}. Skipping notification.`);
        return;
    }

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

    // 4) Write inbox doc + (optional) FCM fan-out for each parent
    const writes: Promise<any>[] = [];
    const batch = db.batch();

    for (const parentUid of parentUids) {
      // 4a) Inbox document (this powers the bell dropdown)
      const inboxRef = db.collection("users").doc(parentUid).collection("inbox").doc();
      batch.set(inboxRef, {
          title,
          body,
          studentId,
          studentName,
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
      });

      // 4b) (Optional) Web push via FCM
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
    
    writes.push(batch.commit());
    await Promise.all(writes);
  });

