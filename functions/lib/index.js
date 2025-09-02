const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.onPassengerStatusChange = functions.firestore
  .document('trips/{tripId}/passengers/{studentId}')
  .onWrite(async (change, ctx) => {
    const before = change.before.exists ? change.before.data() : null;
    const after  = change.after.exists  ? change.after.data()  : null;

    const oldStatus = before?.status;
    const newStatus = after?.status;
    if (!after || oldStatus === newStatus) return;

    const { tripId, studentId } = ctx.params;

    const tripSnap = await db.doc(`trips/${tripId}`).get();
    if (!tripSnap.exists) return;
    const trip = tripSnap.data() || {};
    const schoolId = trip.schoolId || '';

    // Find parents linked to this student in the same school
    const parentsQ = await db.collection('parentStudents')
      .where('schoolId', '==', schoolId)
      .where('studentIds', 'array-contains', studentId)
      .get();

    if (parentsQ.empty) return;

    // Collect tokens
    const parentUids = parentsQ.docs.map(d => d.id);
    const userSnaps = await db.getAll(...parentUids.map(uid => db.doc(`users/${uid}`)));
    const tokens = [];
    userSnaps.forEach(s => { (s.data()?.fcmTokens || []).forEach(t => tokens.push(t)); });
    if (tokens.length === 0) return;

    const title =
      newStatus === 'boarded' ? 'On Bus 🚌' :
      newStatus === 'dropped' ? 'Dropped Off ✅' :
      newStatus === 'absent'  ? 'Marked Absent ⚠️' :
      'Status Updated';
    const body = `Student ${studentId} is ${newStatus}${trip.routeName ? ` on ${trip.routeName}` : ''}`;

    const message = {
      tokens,
      notification: { title, body },
      data: {
        kind: 'passengerStatus',
        studentId,
        status: String(newStatus),
        tripId,
        schoolId
      },
      android: { priority: 'high' },
      webpush: { fcmOptions: { link: '/parent' } }
    };

    const res = await admin.messaging().sendEachForMulticast(message);

    // Optional: write bell item so you can see it even if push blocked
    await Promise.all(parentUids.map(uid =>
      db.collection('users').doc(uid).collection('notifications').add({
        title, body, data: message.data, createdAt: admin.firestore.FieldValue.serverTimestamp(), read: false
      })
    ));

    console.log('Push sent:', res.successCount, 'ok /', res.failureCount, 'fail');
  });
