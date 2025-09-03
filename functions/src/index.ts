
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

    const { studentId } = ctx.params as any;
    const tripId = ctx.params.tripId as string;

    // Grab data we need
    const schoolId = after.schoolId as string | undefined;
    const studentSnap = await admin.firestore().doc(`students/${studentId}`).get();
    const student = studentSnap.exists ? studentSnap.data() : {};
    const studentName = (after.studentName || student?.name || 'Student') as string;

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
          studentName,
          status: afterStatus,
        },
      }, { merge: true });
    });

    await batch.commit();
  });
