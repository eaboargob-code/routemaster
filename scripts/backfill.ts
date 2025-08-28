
/**
 * @fileoverview One-time backfill script to normalize Firestore data.
 * 
 * This script ensures that documents in the 'users' and 'routes' collections
 * have a consistent schema by adding missing fields with default values. It is
 * idempotent and can be run in "dry-run" mode to preview changes.
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
 * The `package.json` file contains a helper script to compile and run the backfill.
 *
 * **1. Dry Run (Recommended First)**
 * To preview changes without writing to Firestore, use the `--dry-run` flag.
 * ```sh
 * npm run backfill -- --project routemaster-admin-k1thy --dry-run
 * ```
 * 
 * **2. Execute Backfill**
 * To execute the backfill and apply the changes to your Firestore database:
 * ```sh
 * npm run backfill -- --project routemaster-admin-k1thy
 * ```
 * 
 * *Note: The `--` after `npm run backfill` is important. It separates the arguments
 * for the npm command from the arguments for the script itself.*
 * 
 */

import * as admin from 'firebase-admin';
import minimist from 'minimist';

const SCHOOL_ID_TO_BACKFILL = 'TRP001';

interface Counters {
  scanned: number;
  updated: number;
}

// --- Main Execution ---

async function main() {
  const args = minimist(process.argv.slice(2));
  const projectId = args.project || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const isDryRun = args['dry-run'] === true;

  if (!projectId) {
    console.error(
      'Error: Project ID is not specified. ' +
      'Please set it with the --project flag or GCLOUD_PROJECT env var.'
    );
    process.exit(1);
  }

  console.log(`\n--- Firestore Backfill Script ---`);
  console.log(`Project: ${projectId}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no writes will be performed)' : 'EXECUTE (writes will be performed)'}`);
  console.log(`---------------------------------\n`);

  // Initialize Firebase Admin SDK
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: projectId,
  });

  const db = admin.firestore();
  const bulkWriter = db.bulkWriter();
  bulkWriter.onWriteError((error) => {
    console.error(`Failed to write doc: ${error.documentRef.path}`, error.cause);
    return false; // Don't retry failed writes
  });

  try {
    const usersCounters = await backfillUsers(db, bulkWriter, isDryRun);
    const routesCounters = await backfillRoutes(db, bulkWriter, isDryRun);

    if (!isDryRun && (usersCounters.updated > 0 || routesCounters.updated > 0)) {
        await bulkWriter.close();
        console.log('\nAll batched writes have been committed.');
    } else if (!isDryRun) {
        console.log('\nNo documents needed updates.');
    }

    console.log('\n--- Summary ---');
    console.log(`Users:  ${usersCounters.scanned} scanned, ${usersCounters.updated} ${isDryRun ? 'would be updated' : 'updated'}.`);
    console.log(`Routes: ${routesCounters.scanned} scanned, ${routesCounters.updated} ${isDryRun ? 'would be updated' : 'updated'}.`);
    console.log('----------------\n');
  } catch (error) {
    console.error('An unexpected error occurred during the backfill process:', error);
    process.exit(1);
  }
}

// --- Collection Backfill Logic ---

/**
 * Backfills the 'users' collection.
 */
async function backfillUsers(
  db: admin.firestore.Firestore,
  writer: admin.firestore.BulkWriter,
  isDryRun: boolean
): Promise<Counters> {
  console.log('Starting backfill for "users" collection...');
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  const counters: Counters = { scanned: 0, updated: 0 };

  for (const doc of snapshot.docs) {
    counters.scanned++;
    const data = doc.data();
    const updates: { [key: string]: any } = {};

    // 0. Rename 'schoolid' to 'schoolId'
    if (data.schoolid !== undefined) {
      updates.schoolId = data.schoolid;
      updates.schoolid = admin.firestore.FieldValue.delete();
    }

    // 1. Set default for 'displayName' if missing
    if (data.displayName === undefined) {
      updates.displayName = 'Invited User';
    }

    // 2. Set default for 'email' if missing
    if (data.email === undefined) {
        updates.email = '<unknown>';
    }

    // 3. Set default for 'role' if missing, and normalize to lowercase
    if (data.role === undefined) {
      updates.role = 'driver';
    } else if (typeof data.role === 'string' && data.role !== data.role.toLowerCase()) {
      updates.role = data.role.toLowerCase();
    }
    
    // 4. Set default for 'schoolId' if missing
    if (data.schoolId === undefined && data.schoolid === undefined) {
      updates.schoolId = SCHOOL_ID_TO_BACKFILL;
    }
    
    // 5. Set default for 'active' if missing
    if (data.active === undefined) {
      updates.active = true;
    }
    
    // 6. Set default for 'pending' if missing
    if (data.pending === undefined) {
      updates.pending = false;
    }

    if (Object.keys(updates).length > 0) {
      counters.updated++;
      console.log(` -> [users/${doc.id}] ${isDryRun ? 'Needs update:' : 'Updating...'}`, updates);
      if (!isDryRun) {
        writer.update(doc.ref, updates);
      }
    }
  }

  console.log(`"users" collection scan complete.`);
  return counters;
}

/**
 * Backfills the 'routes' collection.
 */
async function backfillRoutes(
  db: admin.firestore.Firestore,
  writer: admin.firestore.BulkWriter,
  isDryRun: boolean
): Promise<Counters> {
  console.log('\nStarting backfill for "routes" collection...');
  const routesRef = db.collection('routes');
  const snapshot = await routesRef.get();
  const counters: Counters = { scanned: 0, updated: 0 };

  for (const doc of snapshot.docs) {
    counters.scanned++;
    const data = doc.data();
    const updates: { [key: string]: any } = {};

    // 0. Rename 'schoolid' to 'schoolId'
    if (data.schoolid !== undefined) {
      updates.schoolId = data.schoolid;
      updates.schoolid = admin.firestore.FieldValue.delete();
    }
    
    // 1. Set default for 'schoolId' if missing
    if (data.schoolId === undefined && data.schoolid === undefined) {
      updates.schoolId = SCHOOL_ID_TO_BACKFILL;
    }
    
    // 2. Set default for 'active' if missing
    if (data.active === undefined) {
      updates.active = true;
    }
    
    // 3. Set default for 'name' if missing
    if (data.name === undefined) {
        updates.name = 'Unnamed Route';
    }

    if (Object.keys(updates).length > 0) {
        counters.updated++;
        console.log(` -> [routes/${doc.id}] ${isDryRun ? 'Needs update:' : 'Updating...'}`, updates);
        if (!isDryRun) {
            writer.update(doc.ref, updates);
        }
    }
  }

  console.log(`"routes" collection scan complete.`);
  return counters;
}

// --- Script Entry Point ---

main().catch((err) => {
  console.error('Fatal error running backfill script:', err);
  process.exit(1);
});
