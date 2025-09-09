// functions/src/index.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
admin.initializeApp();
const db = admin.firestore();
/** Resolve a human student name with sensible fallbacks. */
async function getStudentName(studentId, schoolId) {
    try {
        // Note: It's better to fetch from the school-scoped collection if students are nested.
        // Assuming a `students` collection under each school doc for this example.
        const snap = await db.doc(`schools/${schoolId}/students/${studentId}`).get();
        if (!snap.exists)
            return studentId;
        const s = snap.data();
        const joined = [s.firstName, s.lastName].filter(Boolean).join(' ').trim();
        return s.name || s.fullName || s.displayName || joined || studentId;
    }
    catch (err) {
        logger.warn(`[getStudentName] failed for student ${studentId} in school ${schoolId}`, err);
        return studentId;
    }
}
/** Find all parent userIds that link to this student in the same school. */
async function getParentUserIds(studentId, schoolId) {
    const q = db
        .collection(`schools/${schoolId}/parentStudents`)
        .where('studentIds', 'array-contains', studentId);
    const snap = await q.get();
    if (snap.empty)
        return [];
    return snap.docs.map((d) => d.id); // doc id is the parent uid
}
/** Title + body for the notification. */
function buildNote(status, studentName) {
    let title = 'Update';
    if (status === 'boarded')
        title = 'On Bus 🚌';
    else if (status === 'dropped')
        title = 'Dropped Off ✅';
    else if (status === 'absent')
        title = 'Marked Absent 🚫';
    const body = `${studentName} is ${status}.`;
    return { title, body };
}
/** Send push to an array of tokens (best-effort; non-fatal). */
async function pushToTokens(tokens, title, body) {
    if (!tokens || tokens.length === 0)
        return;
    try {
        await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title, body },
            webpush: {
                headers: { Urgency: 'high' },
                notification: {
                    title,
                    body,
                    badge: '/badge.png',
                    icon: '/icon-192.png',
                },
            },
            data: { kind: 'passengerStatus' },
        });
    }
    catch (e) {
        logger.warn('[FCM] multicast send failed:', e.message);
    }
}
/**
 * Recomputes counts for a trip and sends notifications to parents on status change.
 * This is the primary trigger for passenger updates.
 */
export const onPassengerWrite = onDocumentWritten({
    region: 'us-central1',
    document: 'schools/{schoolId}/trips/{tripId}/passengers/{passengerId}',
}, async (event) => {
    const { schoolId, tripId } = event.params;
    if (!schoolId || !tripId) {
        logger.warn('Missing path params', { params: event.params });
        return;
    }
    // --- Task 1: Recompute trip counts ---
    const tripRef = db.doc(`schools/${schoolId}/trips/${tripId}`);
    try {
        const paxSnap = await tripRef.collection('passengers').get();
        let boarded = 0, dropped = 0, absent = 0, pending = 0;
        paxSnap.forEach((d) => {
            const s = d.data().status || 'pending';
            if (s === 'boarded')
                boarded++;
            else if (s === 'dropped')
                dropped++;
            else if (s === 'absent')
                absent++;
            else
                pending++;
        });
        await tripRef.update({
            counts: { boarded, dropped, absent, pending },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info('Trip counts updated', { schoolId, tripId, counts: { boarded, dropped, absent, pending } });
    }
    catch (err) {
        logger.error('Failed to recompute trip counts', { schoolId, tripId, err });
        // Don't re-throw; continue to notifications
    }
    // --- Task 2: Notify parents on status change ---
    const before = event.data?.before.exists ? event.data.before.data() : undefined;
    const after = event.data?.after.exists ? event.data.after.data() : undefined;
    if (!after)
        return; // Deleted passenger, no notification needed.
    const { status, studentId } = after;
    const meaningful = status === 'boarded' || status === 'dropped' || status === 'absent';
    const changed = before?.status !== after.status;
    if (!meaningful || !changed || !studentId)
        return;
    // Resolve student name. Use the one on the passenger doc if available, otherwise fetch.
    const studentName = after.studentName || (await getStudentName(studentId, schoolId));
    const { title, body } = buildNote(status, studentName);
    const parentUids = await getParentUserIds(studentId, schoolId);
    if (parentUids.length === 0)
        return;
    const batch = db.batch();
    for (const parentUid of parentUids) {
        // 1) Create inbox (bell) entry
        const inboxRef = db.collection('users').doc(parentUid).collection('inbox').doc();
        batch.set(inboxRef, {
            title,
            body,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            data: {
                kind: 'passengerStatus',
                status,
                studentId,
                studentName,
                tripId,
                schoolId,
            },
        });
        // 2) Optionally send push (best effort)
        try {
            const userSnap = await db.collection('users').doc(parentUid).get();
            const user = userSnap.exists ? userSnap.data() : undefined;
            await pushToTokens(user?.fcmTokens, title, body);
        }
        catch (e) {
            logger.warn(`[FCM] skipping parent ${parentUid}:`, e.message);
        }
    }
    await batch.commit();
});
