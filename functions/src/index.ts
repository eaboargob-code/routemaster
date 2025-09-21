// functions/src/index.ts
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as logger from "firebase-functions/logger";

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import sharp from "sharp";

/* ------------------------------------------------------------------ */
/* Global config + Admin init                                         */
/* ------------------------------------------------------------------ */

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
const storage = getStorage();

const THUMB_WIDTH = 128;
const THUMB_HEIGHT = 128;

/* ------------------------------------------------------------------ */
/* Trigger: onPassengerWrite                                          */
/* ------------------------------------------------------------------ */

/**
 * Recompute counts for a trip by scanning its passengers subcollection.
 */
async function recomputeTripCounts(schoolId: string, tripId: string): Promise<void> {
  const tripRef = db.doc(`schools/${schoolId}/trips/${tripId}`);
  const paxCol = tripRef.collection("passengers");

  const snap = await paxCol.get();

  let boarded = 0;
  let dropped = 0;
  let absent = 0;
  let pending = 0;

  snap.forEach((d) => {
    const s = (d.get("status") as string) || "pending";
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

export const onPassengerWrite = onDocumentWritten(
  "schools/{schoolId}/trips/{tripId}/passengers/{passengerId}",
  {
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "128MiB",
  },
  async (event) => {
    const { schoolId, tripId } = event.params as { schoolId: string; tripId: string };

    if (!schoolId || !tripId) {
      logger.warn("Missing path params", event.params);
      return;
    }

    try {
      await recomputeTripCounts(schoolId, tripId);
    } catch (err) {
      logger.error("recomputeTripCounts failed", { schoolId, tripId, err });
      throw err;
    }
  }
);


/* ------------------------------------------------------------------ */
/* Trigger: onProfilePhotoUpload                                      */
/* ------------------------------------------------------------------ */

export const onProfilePhotoUpload = onObjectFinalized(
  {
    region: "us-central1",
    bucket: "routemaster-admin-k1thy.appspot.com",
    cpu: 1,
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const filePath = event.data.name; // e.g., schools/TRP001/students/student123/profile.jpg
    const bucket = storage.bucket(event.data.bucket);
    
    // 1. Path and context validation
    const pathParts = filePath.split("/");
    if (pathParts.length !== 5 || pathParts[0] !== "schools" || pathParts[2] !== "students") {
      logger.log(`Skipping file that is not a student profile photo: ${filePath}`);
      return;
    }
    
    const fileName = path.basename(filePath);
    if (fileName.includes(`_${THUMB_WIDTH}.`)) {
        logger.log(`Skipping already-a-thumbnail file: ${fileName}`);
        return;
    }

    const schoolId = pathParts[1];
    const studentId = pathParts[3];
    logger.info(`Processing profile photo for student ${studentId} in school ${schoolId}`);

    // 2. Download original file to a temporary location
    const tempFilePath = path.join(os.tmpdir(), fileName);
    await bucket.file(filePath).download({ destination: tempFilePath });
    logger.info(`Downloaded original file to ${tempFilePath}`);
    
    // 3. Generate thumbnail using sharp
    const thumbFileName = `${path.parse(fileName).name}_${THUMB_WIDTH}${path.parse(fileName).ext}`;
    const thumbFilePath = path.join(os.tmpdir(), thumbFileName);
    
    await sharp(tempFilePath)
        .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
        .toFile(thumbFilePath);
    
    // 4. Upload thumbnail
    const thumbUploadPath = path.join(path.dirname(filePath), thumbFileName);
    const [uploadedFile] = await bucket.upload(thumbFilePath, {
      destination: thumbUploadPath,
      metadata: { contentType: event.data.contentType },
    });
    
    fs.unlinkSync(tempFilePath);
    fs.unlinkSync(thumbFilePath);
    logger.info(`Uploaded thumbnail to ${thumbUploadPath}`);

    // 5. Get public URL and update Firestore
    const thumbUrl = uploadedFile.publicUrl();
    const studentRef = db.doc(`schools/${schoolId}/students/${studentId}`);

    try {
      await studentRef.update({
        photoUrlThumb: thumbUrl,
        updatedAt: FieldValue.serverTimestamp(),
      });
      logger.info(`Successfully updated Firestore for student ${studentId} with thumbnail URL.`);
    } catch(err) {
      logger.error(`Failed to update Firestore for student ${studentId}:`, err);
      // Depending on policy, you might want to delete the thumbnail if the DB update fails.
    }
  }
);
