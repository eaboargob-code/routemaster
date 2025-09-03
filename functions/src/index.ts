
// functions/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
admin.initializeApp();

export const onPassengerStatusChange = functions.firestore
  .document('trips/{tripId}/passengers/{studentId}')
  .onWrite(async (change, ctx) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;

    if (!after) return;
    if (before?.status === after.status) return; // no real change

    const { tripId, studentId } = ctx.params;
    const schoolId = after.schoolId || null;

    // 🔹 Try passenger row for name
    let studentName: string | null = after.studentName || null;

    // 🔹 If not in passenger row, fallback to student doc
    if (!studentName) {
      const studentSnap = await admin.firestore().doc(`students/${studentId}`).get();
      if (studentSnap.exists) {
        const s = studentSnap.data()!;
        studentName =
          (s.name as string) ||
          (s.displayName as string) ||
          ([s.firstName, s.lastName].filter(Boolean).join(' ')) ||
          null;
      }
    }

    // 🔹 Last fallback = just show UID
    if (!studentName) studentName = studentId;

    // Find linked parents
    const parents = await admin.firestore()
      .collection('parentStudents')
      .where('studentIds', 'array-contains', studentId)
      .get();
    if (parents.empty) return;

    const titleMap: Record<string, string> = {
      boarded: "On Bus 🚌",
      dropped: "Dropped Off ✅",
      absent: "Marked Absent 🚫",
      pending: "Awaiting Check-in 🕓",
    };
    const title = titleMap[after.status] || "Update";

    const body = `Student ${studentName} is ${after.status}.`;

    const batch = admin.firestore().batch();
    parents.forEach(p => {
      const inboxRef = admin.firestore()
        .collection("users")
        .doc(p.id)
        .collection("inbox")
        .doc();
      batch.set(inboxRef, {
        title,
        body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        data: {
          kind: "passengerStatus",
          schoolId,
          tripId,
          studentId,
          studentName, // ✅ now always stored
          status: after.status,
        },
      });
    });

    await batch.commit();
  });
