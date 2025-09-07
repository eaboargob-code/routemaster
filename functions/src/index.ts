
// functions/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
admin.initializeApp();

export const onPassengerStatusChange = functions.firestore
  .document('trips/{tripId}/passengers/{studentId}')
  .onWrite(async (change, ctx) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;

    // 1. Exit early if this is not a meaningful status change
    if (!after || after.status === before?.status) {
      return;
    }

    const { tripId, studentId } = ctx.params;
    const schoolId = after.schoolId || null;
    const status = after.status;

    const meaningful = status === "boarded" || status === "dropped" || status === "absent";
    if (!meaningful) return;
    
    // 2. Resolve student name with robust fallbacks
    let studentName: string | null = null;
    try {
        const studentSnap = await admin.firestore().doc(`students/${studentId}`).get();
        if (studentSnap.exists) {
            const s = studentSnap.data()!;
            // Use the first available name field
            studentName = (s.name as string) || 
                          (s.displayName as string) || 
                          ([s.firstName, s.lastName].filter(Boolean).join(' ')) || 
                          null;
        }
    } catch (e) {
        console.error(`Error fetching student doc for ${studentId}:`, e);
    }
    // Final fallback to the student's ID if no name is found
    if (!studentName) studentName = studentId;

    // 3. Find all linked parents for this student
    const parents = await admin.firestore()
      .collection('parentStudents')
      .where('studentIds', 'array-contains', studentId)
      .get();
    
    if (parents.empty) {
      return; // No parents to notify
    }

    // 4. Build notification content
    const titleMap: Record<string, string> = {
      boarded: "On Bus 🚌",
      dropped: "Dropped Off ✅",
      absent: "Marked Absent 🚫",
    };
    const title = titleMap[status] || "Update";
    const body = `${studentName} is ${status}.`;

    // 5. Create inbox notifications for all linked parents in a batch
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
          studentName,
          status,
        },
      });
    });

    await batch.commit();
  });

    