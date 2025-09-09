// functions/src/index.ts
import { setGlobalOptions } from "firebase-functions/v2/options";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
/* ------------------------------------------------------------------ */
/* Global config + Admin init                                          */
/* ------------------------------------------------------------------ */
setGlobalOptions({
    region: "us-central1",
    memory: "128MiB",
    timeoutSeconds: 60,
});
if (getApps().length === 0) {
    initializeApp();
}
const db = getFirestore();
/* ------------------------------------------------------------------ */
/* Helper: recompute counts for a trip                                 */
/* ------------------------------------------------------------------ */
async function recomputeTripCounts(schoolId, tripId) {
    const tripRef = db.doc(`schools/${schoolId}/trips/${tripId}`);
    const paxCol = tripRef.collection("passengers");
    const snap = await paxCol.get();
    let boarded = 0;
    let dropped = 0;
    let absent = 0;
    let pending = 0;
    snap.forEach((d) => {
        const s = d.get("status") || "pending";
        switch (s) {
            case "boarded":
                boarded++;
                break;
            case "dropped":
                dropped++;
                break;
            case "absent":
                absent++;
                break;
            default:
                pending++;
                break;
        }
    });
    await tripRef.update({
        counts: { boarded, dropped, absent, pending },
        updatedAt: FieldValue.serverTimestamp(),
    });
}
/* ------------------------------------------------------------------ */
/* Trigger: recompute on passenger write                               */
/* ------------------------------------------------------------------ */
export const onPassengerWrite = onDocumentWritten("schools/{schoolId}/trips/{tripId}/passengers/{passengerId}", 
// NOTE: do NOT hard-type the generic here; let the SDK infer.
async (event) => {
    const { schoolId, tripId } = event.params;
    if (!schoolId || !tripId) {
        console.warn("Missing path params", event.params);
        return;
    }
    try {
        await recomputeTripCounts(schoolId, tripId);
    }
    catch (err) {
        console.error("recomputeTripCounts failed", { schoolId, tripId, err });
        throw err;
    }
});
