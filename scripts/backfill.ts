

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
    const passengersCounters = await backfillPassengers(db, bulkWriter, isDryRun);
    const studentsCounters = await backfillStudents(db, bulkWriter, isDryRun);
    const inboxCounters = await backfillInboxItems(db, bulkWriter, isDryRun);

    const totalUpdated = usersCounters.updated + routesCounters.updated + passengersCounters.updated + studentsCounters.updated + inboxCounters.updated;

    if (!isDryRun && totalUpdated > 0) {
        await bulkWriter.close();
        console.log('\nAll batched writes have been committed.');
    } else if (totalUpdated === 0) {
        console.log('\nNo documents needed updates.');
    } else {
        console.log(`\nDry run complete. ${totalUpdated} documents would be updated.`);
    }

    console.log('\n--- Summary ---');
    console.log(`Users:      ${usersCounters.scanned} scanned, ${usersCounters.updated} ${isDryRun ? 'would be updated' : 'updated'}.`);
    console.log(`Routes:     ${routesCounters.scanned} scanned, ${routesCounters.updated} ${isDryRun ? 'would be updated' : 'updated'}.`);
    console.log(`Passengers: ${passengersCounters.scanned} scanned, ${passengersCounters.updated} ${isDryRun ? 'would be updated' : 'updated'}.`);
    console.log(`Students:   ${studentsCounters.scanned} scanned, ${studentsCounters.updated} ${isDryRun ? 'would be updated' : 'updated'}.`);
    console.log(`Inbox Items: ${inboxCounters.scanned} scanned, ${inboxCounters.updated} ${isDryRun ? 'would be updated' : 'updated'}.`);
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

    if (data.schoolId === undefined && data.schoolid === undefined) {
      updates.schoolId = SCHOOL_ID_TO_BACKFILL;
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
    
    if (data.schoolId === undefined && data.schoolid === undefined) {
      updates.schoolId = SCHOOL_ID_TO_BACKFILL;
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


/**
 * Backfills the 'passengers' subcollection for recent trips.
 */
async function backfillPassengers(
  db: admin.firestore.Firestore,
  writer: admin.firestore.BulkWriter,
  isDryRun: boolean
): Promise<Counters> {
  console.log('\nStarting backfill for "passengers" subcollections...');
  const counters: Counters = { scanned: 0, updated: 0 };

  const tripsSnapshot = await db.collection('trips')
      .where('schoolId', '==', SCHOOL_ID_TO_BACKFILL)
      .get();
      
  console.log(`Found ${tripsSnapshot.docs.length} trips for school ${SCHOOL_ID_TO_BACKFILL}. Checking passenger subcollections...`);

  for (const tripDoc of tripsSnapshot.docs) {
    const tripData = tripDoc.data();
    if (!tripData.schoolId) continue;

    const passengersSnapshot = await tripDoc.ref.collection('passengers').get();
    
    for (const passengerDoc of passengersSnapshot.docs) {
      counters.scanned++;
      const passengerData = passengerDoc.data();
      
      if (passengerData.schoolId === undefined) {
        const updates = { schoolId: tripData.schoolId };
        counters.updated++;
        console.log(` -> [${passengerDoc.ref.path}] ${isDryRun ? 'Needs update:' : 'Updating...'}`, updates);
        if (!isDryRun) {
          writer.update(passengerDoc.ref, updates);
        }
      }
    }
  }

  console.log(`"passengers" subcollection scan complete.`);
  return counters;
}

/**
 * Backfills the 'students' collection to denormalize routeName and busCode.
 */
async function backfillStudents(
  db: admin.firestore.Firestore,
  writer: admin.firestore.BulkWriter,
  isDryRun: boolean
): Promise<Counters> {
  console.log('\nStarting backfill for "students" collection...');
  const counters: Counters = { scanned: 0, updated: 0 };
  const schoolId = SCHOOL_ID_TO_BACKFILL;

  // 1. Cache all routes and buses for the school
  const routesCache = new Map<string, string>();
  const busesCache = new Map<string, string>();

  const routesSnap = await db.collection('routes').where('schoolId', '==', schoolId).get();
  routesSnap.forEach(doc => routesCache.set(doc.id, doc.data().name));
  console.log(`Cached ${routesCache.size} routes.`);

  const busesSnap = await db.collection('buses').where('schoolId', '==', schoolId).get();
  busesSnap.forEach(doc => busesCache.set(doc.id, doc.data().busCode));
  console.log(`Cached ${busesCache.size} buses.`);

  // 2. Iterate through students
  const studentsSnap = await db.collection('students').where('schoolId', '==', schoolId).get();
  console.log(`Scanning ${studentsSnap.size} students...`);

  for (const studentDoc of studentsSnap.docs) {
    counters.scanned++;
    const studentData = studentDoc.data();
    const updates: { [key: string]: any } = {};

    // Check and update routeName
    if (studentData.assignedRouteId && routesCache.has(studentData.assignedRouteId)) {
      const expectedRouteName = routesCache.get(studentData.assignedRouteId);
      if (studentData.routeName !== expectedRouteName) {
        updates.routeName = expectedRouteName;
      }
    } else if (studentData.routeName) {
      // If route is unassigned but field exists, remove it.
      updates.routeName = admin.firestore.FieldValue.delete();
    }
    
    // Check and update busCode
    if (studentData.assignedBusId && busesCache.has(studentData.assignedBusId)) {
      const expectedBusCode = busesCache.get(studentData.assignedBusId);
      if (studentData.busCode !== expectedBusCode) {
        updates.busCode = expectedBusCode;
      }
    } else if (studentData.busCode) {
      // If bus is unassigned but field exists, remove it.
      updates.busCode = admin.firestore.FieldValue.delete();
    }

    if (Object.keys(updates).length > 0) {
      counters.updated++;
      console.log(` -> [students/${studentDoc.id}] ${isDryRun ? 'Needs update:' : 'Updating...'}`, updates);
      if (!isDryRun) {
        writer.update(studentDoc.ref, updates);
      }
    }
  }

  console.log(`"students" collection scan complete.`);
  return counters;
}

/**
 * Backfills parent inbox items to ensure they have a valid studentName.
 */
async function backfillInboxItems(
  db: admin.firestore.Firestore,
  writer: admin.firestore.BulkWriter,
  isDryRun: boolean
): Promise<Counters> {
    console.log('\nStarting backfill for parent "inbox" subcollections...');
    const counters: Counters = { scanned: 0, updated: 0 };
    const schoolId = SCHOOL_ID_TO_BACKFILL;

    // 1. Cache all student names for the school
    const studentNamesCache = new Map<string, string>();
    const studentsSnap = await db.collection('students').where('schoolId', '==', schoolId).get();
    studentsSnap.forEach(doc => {
        const name = doc.data().name;
        if (typeof name === 'string' && name.trim()) {
            studentNamesCache.set(doc.id, name.trim());
        }
    });
    console.log(`Cached ${studentNamesCache.size} student names.`);
    
    // 2. Iterate through all parents of the school
    const parentsSnap = await db.collection('users').where('schoolId', '==', schoolId).where('role', '==', 'parent').get();
    console.log(`Scanning inboxes for ${parentsSnap.size} parents...`);

    for (const parentDoc of parentsSnap.docs) {
        const inboxSnap = await parentDoc.ref.collection('inbox').get();
        if (inboxSnap.empty) continue;

        for (const inboxDoc of inboxSnap.docs) {
            counters.scanned++;
            const inboxData = inboxDoc.data();
            
            // Check if studentName needs to be fixed
            if (inboxData.studentId && (typeof inboxData.studentName !== 'string' || !inboxData.studentName.trim())) {
                const studentId = inboxData.studentId;
                const studentName = studentNamesCache.get(studentId) || studentId; // Use ID as fallback

                const updates = { studentName };
                counters.updated++;
                console.log(` -> [${inboxDoc.ref.path}] ${isDryRun ? 'Needs update:' : 'Updating...'}`, updates);
                if (!isDryRun) {
                    writer.update(inboxDoc.ref, updates);
                }
            }
        }
    }

    console.log(`"inbox" subcollection scan complete.`);
    return counters;
}


// --- Script Entry Point ---

main().catch((err) => {
  console.error('Fatal error running backfill script:', err);
  process.exit(1);
});

    
