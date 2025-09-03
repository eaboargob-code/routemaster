
import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";

admin.initializeApp();

export const onPassengerStatusChange = onDocumentWritten(
  {
    document: "trips/{tripId}/passengers/{studentId}",
    region: "us-central1", // keep consistent across your functions
  },
  async (event) => {
    const after = event.data?.after?.data() || null;
    const before  = event.data?.before?.data()  || null;

    if (!after) {
      logger.info("Deleted passenger doc; skipping.");
      return;
    }

    // Only when status actually changes
    const oldStatus = before?.status ?? null;
    const newStatus = after?.status ?? null;
    if (!newStatus || oldStatus === newStatus) {
      logger.info("No status change; skipping.", { oldStatus, newStatus });
      return;
    }

    const { tripId, studentId } = event.params as { tripId: string; studentId: string };
    const schoolId = after.schoolId;
    if (!schoolId) {
        logger.warn("Passenger doc is missing schoolId; skipping.", { tripId, studentId });
        return;
    }
    
    const db = admin.firestore();

    // 🔹 fetch the student's name
    const studentSnap = await db.collection("students").doc(studentId).get();
    const studentName =
      (studentSnap.exists && typeof studentSnap.data()?.name === "string" && studentSnap.data()!.name.trim())
        ? (studentSnap.data()!.name as string)
        : studentId; // <-- fallback so it's never undefined

    // Fetch trip for context/routeName
    const tripSnap = await db.doc(`trips/${tripId}`).get();
    const routeName = tripSnap.exists() ? (tripSnap.data()?.routeName as string) : "";

    // 🔹 find parents
    const parentsSnap = await db
      .collection("parentStudents")
      .where("studentIds", "array-contains", studentId)
      .where("schoolId", "==", schoolId)
      .get();

    if (parentsSnap.empty) {
      logger.info("No parent links for student; skipping.", { studentId, schoolId });
      return;
    }

    // --- Prepare Notifications ---
    const parentUids = parentsSnap.docs.map((d) => d.id);
    const parentDocs = await admin.firestore().getAll(
        ...parentUids.map((id) => db.doc(`users/${id}`))
    );

    const titleByStatus: Record<string, string> = {
      boarded: `${studentName} boarded the bus`,
      dropped: `${studentName} arrived at destination`,
      absent: `${studentName} marked absent`,
      pending: `${studentName} status updated`,
    };
    const title = titleByStatus[newStatus] ?? `${studentName} status updated`;
    const body = routeName
      ? `Route ${routeName} • ${new Date().toLocaleTimeString()}`
      : new Date().toLocaleTimeString();
    
    const messageData = {
        tripId,
        studentId,
        status: String(newStatus),
        schoolId: String(schoolId),
        kind: "passengerStatus",
        studentName, // include student name
    };

    // --- Send Push Notifications ---
    const tokens: string[] = [];
    parentDocs.forEach((snap) => {
        if (!snap.exists) return;
        const d = snap.data() as any;
        if (d?.fcmTokens?.length) {
            d.fcmTokens.forEach((t: string) => typeof t === "string" && tokens.push(t));
        }
    });

    if (tokens.length > 0) {
        logger.info("Sending push", {
          tripId, studentId, newStatus, tokensCount: tokens.length,
        });

        const message: admin.messaging.MulticastMessage = {
          notification: { title, body },
          data: messageData,
          tokens,
          android: { priority: "high" },
          webpush: {
            fcmOptions: { link: "/parent" },
          },
        };

        const res = await admin.messaging().sendEachForMulticast(message);
        logger.info("Push result", { successCount: res.successCount, failureCount: res.failureCount });

        // Clean up invalid tokens
        const invalidTokens = res.responses
          .map((r, i) => (r.success ? null : tokens[i]))
          .filter((t): t is string => !!t);

        if (invalidTokens.length > 0) {
          logger.warn("Removing invalid tokens", { invalidTokensCount: invalidTokens.length });
          const batch = db.batch();
          parentDocs.forEach((snap) => {
              if (!snap.exists) return;
              batch.update(snap.ref, { fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens) });
          });
          await batch.commit().catch(e => logger.error("Failed to remove invalid tokens", { e }));
        }
    } else {
         logger.info("No tokens found for parents; skipping push.", { parentUids });
    }
    
    // --- Write to Inbox ---
    const inboxBatch = db.batch();
    const payload = {
        title,
        studentId,
        studentName,
        tripId,
        schoolId: schoolId,
        type: newStatus,
        body: `${studentName} is ${newStatus}.`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
    };
      
    parentDocs.forEach(parentDoc => {
        if (!parentDoc.exists) return;
        const inboxRef = parentDoc.ref.collection("inbox").doc();
        inboxBatch.set(inboxRef, payload);
    });
    await inboxBatch.commit();
    logger.info(`Wrote ${parentDocs.length} inbox item(s)`);
  }
);
