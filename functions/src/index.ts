
// functions/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
admin.initializeApp();

export const onPassengerStatusChange = functions.firestore
  .document('trips/{tripId}/passengers/{studentId}')
  .onWrite(async (change, ctx) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;

    // Only act on real status changes
    const beforeStatus = before?.status;
    const afterStatus  = after?.status;
    if (!after || !afterStatus || beforeStatus === afterStatus) return;

    const { tripId, studentId } = ctx.params as { tripId: string; studentId: string };
    const schoolId = (after.schoolId as string) || null;

    // 1) Read passenger row (most reliable for studentName)
    const passengerSnap = await admin.firestore()
      .doc(`trips/${tripId}/passengers/${studentId}`)
      .get();
    const passenger = passengerSnap.exists ? passengerSnap.data() : undefined;

    // 2) Read student doc (fallback fields)
    const studentSnap = await admin.firestore()
      .doc(`students/${studentId}`)
      .get();
    const student = studentSnap.exists ? studentSnap.data() : undefined;

    // 3) Resolve studentName from multiple sources
    const candidateName =
      (passenger?.studentName as string | undefined) ||
      (after.studentName as string | undefined) ||
      (student?.name as string | undefined) ||
      (student?.displayName as string | undefined) ||
      ([student?.firstName, student?.lastName].filter(Boolean).join(' ') || undefined);

    const studentName = (candidateName && candidateName.trim()) || 'Student';

    // Find parents (Option A: parentStudents/{parentUid}.studentIds contains studentId)
    const parents = await admin.firestore()
      .collection('parentStudents')
      .where('studentIds', 'array-contains', studentId)
      .get();

    if (parents.empty) return;

    const titleMap: Record<string,string> = {
      boarded: 'On Bus 🚌',
      dropped: 'Dropped Off ✅',
      absent:  'Marked Absent 🚫',
      pending: 'Awaiting Check-in 🕓',
    };
    const title = titleMap[afterStatus] || 'Update';

    // **Body now uses the resolved studentName**
    const body = `Student ${studentName} is ${afterStatus}.`;

    const batch = admin.firestore().batch();
    parents.forEach(p => {
      const parentUid = p.id;
      const inboxRef = admin.firestore().collection('users').doc(parentUid)
        .collection('inbox').doc();
      batch.set(inboxRef, {
        title,
        body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        data: {
          kind: 'passengerStatus',
          schoolId: schoolId ?? p.get('schoolId') ?? null,
          tripId,
          studentId,
          studentName,  // <-- write the resolved name for the UI
          status: afterStatus,
        },
      }, { merge: true });
    });

    await batch.commit();
  });
