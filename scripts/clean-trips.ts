
/**
 * @fileoverview Script to delete all trips for a given school.
 *
 * This is a destructive operation and should be used with caution.
 * It recursively deletes all subcollections under each trip.
 *
 * ---
 *
 * ## Prerequisites
 *
 * 1.  Install dependencies:
 *     ```sh
 *     npm i
 *     ```
 *
 * 2.  Set up authentication. You need a service account key for your project.
 *     Download the JSON key from the Firebase Console:
 *     Project settings > Service accounts > Generate new private key.
 *
 *     Set the environment variable to point to your key file:
 *     ```sh
 *     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/serviceAccountKey.json"
 *     ```
 *
 * ## How to Run
 *
 * You must provide your project ID and the school ID.
 *
 * **1. Dry Run (Recommended First)**
 * To preview which trips would be deleted without actually deleting them:
 * ```sh
 * npx tsx scripts/clean-trips.ts --project YOUR_PROJECT_ID --schoolId YOUR_SCHOOL_ID --dry-run
 * ```
 *
 * **2. Execute Deletion**
 * To permanently delete the trips, you must add the `--execute` flag.
 * ```sh
 * npx tsx scripts/clean-trips.ts --project YOUR_PROJECT_ID --schoolId YOUR_SCHOOL_ID --execute
 * ```
 *
 */

import * as admin from 'firebase-admin';
import minimist from 'minimist';

async function main() {
    const args = minimist(process.argv.slice(2));
    const projectId = args.project || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    const schoolId = args.schoolId;
    const isDryRun = args['dry-run'] === true;
    const isExecute = args['execute'] === true;

    if (!projectId || !schoolId) {
        console.error(
        'Error: Missing required arguments. Please provide --project and --schoolId.'
        );
        process.exit(1);
    }

    if (!isDryRun && !isExecute) {
        console.error(
        'Error: This is a destructive script. You must specify either --dry-run (to preview) or --execute (to delete).'
        );
        process.exit(1);
    }
    
    if (isDryRun && isExecute) {
        console.error('Error: Cannot specify both --dry-run and --execute. Choose one.');
        process.exit(1);
    }

    console.log(`\n--- Firestore Trip Cleanup Script ---`);
    console.log(`Project: ${projectId}`);
    console.log(`School ID: ${schoolId}`);
    console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'EXECUTE'}`);
    console.log(`------------------------------------\n`);

    // Initialize Firebase Admin SDK
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: projectId,
    });

    const db = admin.firestore();
    const tripsRef = db.collection(`schools/${schoolId}/trips`);
    const snapshot = await tripsRef.get();

    if (snapshot.empty) {
        console.log('No trips found for this school. Nothing to do.');
        return;
    }

    console.log(`Found ${snapshot.size} trips to be deleted.`);

    if (isDryRun) {
        console.log("\n--- Trips to be deleted (Dry Run) ---");
        snapshot.docs.forEach(doc => {
            console.log(` -> ${doc.ref.path}`);
        });
        console.log("\nRe-run with the --execute flag to permanently delete these documents.");
    } else if (isExecute) {
        const bulkWriter = db.bulkWriter();
        bulkWriter.onWriteError((error) => {
            console.error(`Failed to delete doc: ${error.documentRef.path}`, error.cause);
            return false;
        });

        let deletedCount = 0;
        for (const doc of snapshot.docs) {
             // Firestore does not automatically delete subcollections.
             // We need to delete them recursively.
            await db.recursiveDelete(doc.ref, bulkWriter);
            deletedCount++;
        }
        
        await bulkWriter.close();
        console.log(`\nSuccessfully deleted ${deletedCount} trips and their subcollections.`);
    }

    console.log('\n--- Cleanup complete ---');
}

main().catch((err) => {
  console.error('\nFatal error running cleanup script:', err);
  process.exit(1);
});
