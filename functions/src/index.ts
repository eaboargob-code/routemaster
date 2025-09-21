// functions/src/index.ts
import { onDocumentWritten, Change } from "firebase-functions/v2/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as logger from "firebase-functions/logger";

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
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
const messaging = getMessaging();

const THUMB_WIDTH = 128;
const THUMB_HEIGHT = 128;

/* ------------------------------------------------------------------ */
/*                         Passenger Updates                          */
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

/**
 * Sends a push notification to all linked parents of a student.
 */
async function sendNotificationsToParents(schoolId: string, studentId: string, studentName: string, status: string) {
    if (!studentId || !schoolId) return;

    logger.info(`Sending notifications for ${studentName} (${studentId}) with status ${status}`);

    try {
        // 1. Find all parents linked to this student
        const parentLinksQuery = db.collection(`schools/${schoolId}/parentStudents`).where('studentIds', 'array-contains', studentId);
        const parentLinksSnap = await parentLinksQuery.get();

        if (parentLinksSnap.empty) {
            logger.log(`No parents linked to student ${studentId}.`);
            return;
        }

        const parentIds = parentLinksSnap.docs.map(doc => doc.id);
        
        // 2. Get FCM tokens for each parent
        const parentDocs = await db.getAll(...parentIds.map(id => db.doc(`schools/${schoolId}/users/${id}`)));
        
        const allTokens: string[] = [];
        parentDocs.forEach(doc => {
            const tokens = doc.data()?.fcmTokens;
            if (Array.isArray(tokens)) {
                allTokens.push(...tokens);
            }
        });
        
        if (allTokens.length === 0) {
            logger.log(`No FCM tokens found for parents of student ${studentId}.`);
            return;
        }
        
        // 3. Construct and send the message
        const message = {
            notification: {
                title: `Bus Status Update for ${studentName}`,
                body: `${studentName} has been marked as '${status}'.`,
            },
            data: {
                studentId: studentId,
                studentName: studentName,
                status: status,
                kind: 'passengerStatus',
            },
            tokens: allTokens,
        };

        const response = await messaging.sendEachForMulticast(message);
        logger.info(`Successfully sent ${response.successCount} messages for student ${studentId}.`);
        if (response.failureCount > 0) {
            // Basic error logging, can be expanded to handle token cleanup
            logger.warn(`Failed to send ${response.failureCount} messages for student ${studentId}.`);
        }

    } catch (error) {
        logger.error(`Error sending notifications for student ${studentId}:`, error);
    }
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
    
    // --- Recompute Counts ---
    try {
      await recomputeTripCounts(schoolId, tripId);
    } catch (err) {
      logger.error("recomputeTripCounts failed", { schoolId, tripId, err });
      // We don't re-throw because we still want to attempt notifications
    }

    // --- Send Notifications ---
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    // Check if the status has actually changed to avoid sending notifications on other updates.
    if (afterData && beforeData?.status !== afterData?.status) {
        const studentId = afterData.studentId;
        const studentName = afterData.studentName || 'Your child';
        const newStatus = afterData.status;

        // Don't send for 'pending' or on initial document creation
        if (newStatus && newStatus !== 'pending') {
            await sendNotificationsToParents(schoolId, studentId, studentName, newStatus);
        }
    }
  }
);


/* ------------------------------------------------------------------ */
/*                       Profile Photo Thumbnailing                     */
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
