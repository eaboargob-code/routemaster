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
    const before = event.data?.before?.data() || null;
    const after  = event.data?.after?.data()  || null;

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

    // Fetch trip for context/schoolId
    const tripSnap = await admin.firestore().doc(`trips/${tripId}`).get();
    if (!tripSnap.exists) {
      logger.warn("Trip not found; skipping.", { tripId });
      return;
    }
    const trip = tripSnap.data() as any;
    const schoolId = trip.schoolId;

    // Find parent links that contain this student
    const linksSnap = await admin.firestore()
      .collection("parentStudents")
      .where("studentIds", "array-contains", studentId)
      .where("schoolId", "==", schoolId)
      .get();

    if (linksSnap.empty) {
      logger.info("No parent links for student; skipping.", { studentId, schoolId });
      return;
    }

    // Gather tokens from each parent user doc
    const parentIds = linksSnap.docs.map((d) => d.id);
    const parentDocs = await admin.firestore().getAll(
      ...parentIds.map((id) => admin.firestore().doc(`users/${id}`))
    );

    const tokens: string[] = [];
    parentDocs.forEach((snap) => {
      const d = snap.data() as any;
      if (d?.fcmTokens?.length) {
        d.fcmTokens.forEach((t: string) => typeof t === "string" && tokens.push(t));
      }
    });

    if (tokens.length === 0) {
      logger.info("No tokens found for parents; skipping.", { parentIds });
      return;
    }
    
    // Enrich with student name
    const studentSnap = await admin.firestore().doc(`students/${studentId}`).get();
    const childName = (studentSnap.get("name") as string) || "Your child";

    const titleByStatus: Record<string, string> = {
      boarded: `${childName} boarded the bus`,
      dropped: `${childName} arrived at destination`,
      absent: `${childName} marked absent`,
      pending: `${childName} status updated`,
    };
    const title = titleByStatus[newStatus] ?? `${childName} status updated`;
    const body = trip.routeName
      ? `Route ${trip.routeName} • ${new Date().toLocaleTimeString()}`
      : new Date().toLocaleTimeString();


    logger.info("Sending push", {
      tripId, studentId, newStatus, tokensCount: tokens.length,
    });

    const res = await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      data: {
        tripId,
        studentId,
        status: String(newStatus),
        schoolId: String(schoolId ?? ""),
      },
      tokens,
    });

    logger.info("Push result", {
      successCount: res.successCount,
      failureCount: res.failureCount,
    });

    // Clean up invalid tokens
    const invalidTokens = res.responses
      .map((r, i) => (r.success ? null : tokens[i]))
      .filter((t): t is string => !!t);

    if (invalidTokens.length) {
      logger.warn("Removing invalid tokens", { invalidTokensCount: invalidTokens.length });
      // remove from all parent docs (simple fan-out)
      await Promise.all(
        parentIds.map((id) =>
          admin
            .firestore()
            .doc(`users/${id}`)
            .update({
              fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
            })
            .catch((e) => logger.error("Failed to remove invalid token", { id, e }))
        )
      );
    }
  }
);
