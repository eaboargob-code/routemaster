// functions/src/index.ts
import { onDocumentWritten, Change } from "firebase-functions/v2/firestore";
import type { FirestoreEvent } from "firebase-functions/v2/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

/**
 * Recompute counts for a trip by scanning its passengers subcollection.
 */
async function recomputeTripCounts(schoolId: string, tripId: string): Promise<void> {
  const tripRef = db
    .collection("schools")
    .doc(schoolId)
    .collection("trips")
    .doc(tripId);

  const paxSnap = await tripRef.collection("passengers").get();

  let boarded = 0;
  let dropped = 0;
  let absent = 0;
  let pending = 0;

  paxSnap.forEach((d) => {
    const s = (d.data().status as string) || "pending";
    if (s === "boarded") boarded++;
    else if (s === "dropped") dropped++;
    else if (s === "absent") absent++;
    else pending++;
  });

  await tripRef.update({
    counts: { boarded, dropped, absent, pending },
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info("Trip counts updated", {
    schoolId,
    tripId,
    counts: { boarded, dropped, absent, pending },
  });
}

/**
 * v2 Firestore trigger:
 * Fires when a passenger doc is created/updated/deleted.
 */
export const onPassengerWrite = onDocumentWritten(
  "schools/{schoolId}/trips/{tripId}/passengers/{passengerId}",
  {
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "128MiB",
  },
  async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined>) => {
    const { schoolId, tripId } = event.params;

    if (!schoolId || !tripId) {
      logger.warn("Missing path params", { params: event.params });
      return;
    }

    try {
      await recomputeTripCounts(schoolId, tripId);
    } catch (err) {
      logger.error("Failed to recompute trip counts", { schoolId, tripId, err });
      throw err;
    }
  }
);
