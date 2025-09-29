/**
 * @fileoverview Export sample Firestore data for documentation and analysis.
 * 
 * This script fetches representative data from various Firestore collections
 * and outputs both raw and redacted versions for documentation purposes.
 * 
 * ## Prerequisites
 * 
 * 1. Install dependencies:
 *    ```sh
 *    npm i
 *    ```
 * 
 * 2. Set up authentication with environment variables:
 *    ```sh
 *    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *    export FIREBASE_PROJECT_ID="your-project-id"
 *    ```
 * 
 * ## How to Run
 * 
 * ```sh
 * npx ts-node scripts/export_samples.ts --SCHOOL_ID=xxx --DRIVER_UID=yyy [--SUPERVISOR_UID=...] [--PARENT_UID=...]
 * ```
 * 
 * ## Output Files
 * 
 * - docs/firestore_samples_raw.json - Exact data as returned from Firestore
 * - docs/firestore_samples_redacted.json - PII-masked version
 * - docs/firestore_samples_schema.md - Schema documentation
 */

import * as admin from 'firebase-admin';
import minimist from 'minimist';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = minimist(process.argv.slice(2));

// Configuration from environment variables
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

// Required arguments
const SCHOOL_ID = args.SCHOOL_ID;
const DRIVER_UID = args.DRIVER_UID;

// Optional arguments
const SUPERVISOR_UID = args.SUPERVISOR_UID;
const PARENT_UID = args.PARENT_UID;

interface SampleData {
  schoolConfig?: any;
  users: {
    driver?: any;
    supervisor?: any;
    parent?: any;
  };
  recentTrip?: any;
  tripPassengers?: any[];
  sampleStudent?: any;
  parentStudents?: any;
  recentNotifications?: any[];
  metadata: {
    fetchedAt: string;
    schoolId: string;
    driverUid: string;
    supervisorUid?: string;
    parentUid?: string;
  };
}

/**
 * Redact PII from data
 */
function redact(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(redact);
  }

  if (typeof data === 'object') {
    const redacted: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (key === 'name' && typeof value === 'string') {
        // name -> first initial + "****"
        redacted[key] = value.charAt(0) + '****';
      } else if (key === 'phone' && typeof value === 'string') {
        // phone -> keep last 2 digits
        const digits = value.replace(/\D/g, '');
        redacted[key] = '*'.repeat(Math.max(0, digits.length - 2)) + digits.slice(-2);
      } else if (key === 'email' && typeof value === 'string') {
        // email -> keep domain only
        const atIndex = value.indexOf('@');
        if (atIndex > 0) {
          redacted[key] = '****' + value.substring(atIndex);
        } else {
          redacted[key] = '****';
        }
      } else if (key === 'photoUrl') {
        // photoUrl -> keep as-is
        redacted[key] = value;
      } else if (key === 'address' && typeof value === 'object' && value !== null) {
        // addresses -> keep city-only if available, else remove
        if (value.city) {
          redacted[key] = { city: value.city };
        } else {
          redacted[key] = null;
        }
      } else if (key.includes('geo') || key.includes('lat') || key.includes('lng') || key.includes('coordinate')) {
        // geo fields unchanged
        redacted[key] = value;
      } else {
        redacted[key] = redact(value);
      }
    }
    
    return redacted;
  }

  return data;
}

/**
 * Generate schema documentation from data
 */
function generateSchema(data: any, path: string = ''): string[] {
  const lines: string[] = [];
  
  if (data === null || data === undefined) {
    return [`${path}: null`];
  }

  if (Array.isArray(data)) {
    lines.push(`${path}: Array[${data.length}]`);
    if (data.length > 0) {
      const sampleItem = data[0];
      const subLines = generateSchema(sampleItem, `${path}[0]`);
      lines.push(...subLines.map(line => `  ${line}`));
    }
    return lines;
  }

  if (typeof data === 'object') {
    lines.push(`${path}: Object`);
    for (const [key, value] of Object.entries(data)) {
      const subPath = path ? `${path}.${key}` : key;
      const subLines = generateSchema(value, subPath);
      lines.push(...subLines.map(line => `  ${line}`));
    }
    return lines;
  }

  const type = typeof data;
  lines.push(`${path}: ${type} (example: ${JSON.stringify(data)})`);
  return lines;
}

/**
 * Initialize Firebase Admin
 */
function initializeFirebase() {
  if (!GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is required');
  }

  if (!FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID environment variable is required');
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: FIREBASE_PROJECT_ID,
    });
  }

  return admin.firestore();
}

/**
 * Fetch sample data from Firestore
 */
async function fetchSampleData(db: admin.firestore.Firestore): Promise<SampleData> {
  const sampleData: SampleData = {
    users: {},
    metadata: {
      fetchedAt: new Date().toISOString(),
      schoolId: SCHOOL_ID,
      driverUid: DRIVER_UID,
      supervisorUid: SUPERVISOR_UID,
      parentUid: PARENT_UID,
    },
  };

  try {
    // 1. Fetch school config
    console.log('Fetching school config...');
    const schoolConfigRef = db.doc(`schools/${SCHOOL_ID}/config/profile`);
    const schoolConfigSnap = await schoolConfigRef.get();
    sampleData.schoolConfig = schoolConfigSnap.exists ? schoolConfigSnap.data() : 'missing';

    // 2. Fetch users
    console.log('Fetching users...');
    
    // Driver
    const driverRef = db.doc(`schools/${SCHOOL_ID}/users/${DRIVER_UID}`);
    const driverSnap = await driverRef.get();
    sampleData.users.driver = driverSnap.exists ? driverSnap.data() : 'missing';

    // Supervisor (if provided)
    if (SUPERVISOR_UID) {
      const supervisorRef = db.doc(`schools/${SCHOOL_ID}/users/${SUPERVISOR_UID}`);
      const supervisorSnap = await supervisorRef.get();
      sampleData.users.supervisor = supervisorSnap.exists ? supervisorSnap.data() : 'missing';
    }

    // Parent (if provided)
    if (PARENT_UID) {
      const parentRef = db.doc(`schools/${SCHOOL_ID}/users/${PARENT_UID}`);
      const parentSnap = await parentRef.get();
      sampleData.users.parent = parentSnap.exists ? parentSnap.data() : 'missing';
    }

    // 3. Fetch most recent trip for driver
    console.log('Fetching recent trip...');
    const tripsQuery = db.collection(`schools/${SCHOOL_ID}/trips`)
      .where('driverId', '==', DRIVER_UID)
      .orderBy('startedAt', 'desc')
      .limit(1);
    
    const tripsSnap = await tripsQuery.get();
    if (!tripsSnap.empty) {
      const tripDoc = tripsSnap.docs[0];
      sampleData.recentTrip = {
        id: tripDoc.id,
        ...tripDoc.data(),
      };

      // 4. Fetch passengers for that trip
      console.log('Fetching trip passengers...');
      const passengersQuery = db.collection(`trips/${tripDoc.id}/passengers`);
      const passengersSnap = await passengersQuery.get();
      sampleData.tripPassengers = passengersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 5. Fetch one referenced student
      if (sampleData.tripPassengers && sampleData.tripPassengers.length > 0) {
        const firstPassenger = sampleData.tripPassengers[0];
        if (firstPassenger.studentId) {
          console.log('Fetching sample student...');
          const studentRef = db.doc(`schools/${SCHOOL_ID}/students/${firstPassenger.studentId}`);
          const studentSnap = await studentRef.get();
          sampleData.sampleStudent = studentSnap.exists ? studentSnap.data() : 'missing';
        }
      }
    } else {
      sampleData.recentTrip = 'missing';
    }

    // 6. Fetch parentStudents (if parent provided)
    if (PARENT_UID) {
      console.log('Fetching parent-student relationships...');
      const parentStudentsRef = db.doc(`schools/${SCHOOL_ID}/parentStudents/${PARENT_UID}`);
      const parentStudentsSnap = await parentStudentsRef.get();
      sampleData.parentStudents = parentStudentsSnap.exists ? parentStudentsSnap.data() : 'missing';
    }

    // 7. Fetch recent notifications
    console.log('Fetching recent notifications...');
    try {
      const notificationsQuery = db.collection(`schools/${SCHOOL_ID}/notifications`)
        .orderBy('createdAt', 'desc')
        .limit(5);
      
      const notificationsSnap = await notificationsQuery.get();
      sampleData.recentNotifications = notificationsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.log('Notifications collection may not exist or lack index:', error);
      sampleData.recentNotifications = [];
    }

  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }

  return sampleData;
}

/**
 * Main execution function
 */
async function main() {
  // Validate required arguments
  if (!SCHOOL_ID || !DRIVER_UID) {
    console.error('Usage: npx ts-node scripts/export_samples.ts --SCHOOL_ID=xxx --DRIVER_UID=yyy [--SUPERVISOR_UID=...] [--PARENT_UID=...]');
    process.exit(1);
  }

  console.log('Starting Firestore sample export...');
  console.log(`School ID: ${SCHOOL_ID}`);
  console.log(`Driver UID: ${DRIVER_UID}`);
  if (SUPERVISOR_UID) console.log(`Supervisor UID: ${SUPERVISOR_UID}`);
  if (PARENT_UID) console.log(`Parent UID: ${PARENT_UID}`);

  try {
    // Initialize Firebase
    const db = initializeFirebase();
    console.log('Firebase initialized successfully');

    // Fetch sample data
    const sampleData = await fetchSampleData(db);

    // Ensure docs directory exists
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Write raw data
    const rawPath = path.join(docsDir, 'firestore_samples_raw.json');
    fs.writeFileSync(rawPath, JSON.stringify(sampleData, null, 2));
    console.log(`Raw data written to: ${rawPath}`);

    // Write redacted data
    const redactedData = redact(sampleData);
    const redactedPath = path.join(docsDir, 'firestore_samples_redacted.json');
    fs.writeFileSync(redactedPath, JSON.stringify(redactedData, null, 2));
    console.log(`Redacted data written to: ${redactedPath}`);

    // Generate and write schema documentation
    const schemaLines = [
      '# Firestore Samples Schema',
      '',
      'This document describes the structure of the exported Firestore sample data.',
      '',
      '## How to Run the Export Script',
      '',
      '```bash',
      'npx ts-node scripts/export_samples.ts --SCHOOL_ID=xxx --DRIVER_UID=yyy [--SUPERVISOR_UID=...] [--PARENT_UID=...]',
      '```',
      '',
      '## Environment Variables Required',
      '',
      '- `GOOGLE_APPLICATION_CREDENTIALS`: Path to Firebase service account key',
      '- `FIREBASE_PROJECT_ID`: Firebase project ID',
      '',
      '## Data Structure',
      '',
      ...generateSchema(sampleData),
      '',
      '## Collections and Paths Accessed',
      '',
      '- `schools/{schoolId}/config/profile` - School configuration',
      '- `schools/{schoolId}/users/{userId}` - User profiles (driver, supervisor, parent)',
      '- `schools/{schoolId}/trips` - Trip records (filtered by driverId)',
      '- `trips/{tripId}/passengers` - Passenger records for specific trip',
      '- `schools/{schoolId}/students/{studentId}` - Student profiles',
      '- `schools/{schoolId}/parentStudents/{parentId}` - Parent-student relationships',
      '- `schools/{schoolId}/notifications` - Recent notifications',
      '',
      '## PII Redaction Rules',
      '',
      '- `name` fields: First initial + "****"',
      '- `phone` fields: Mask all but last 2 digits',
      '- `email` fields: Keep domain only (****@domain.com)',
      '- `photoUrl` fields: Keep as-is',
      '- `address` objects: Keep city only, remove other fields',
      '- Geo fields: Unchanged (lat, lng, coordinates, etc.)',
      '',
      `Generated on: ${new Date().toISOString()}`,
    ];

    const schemaPath = path.join(docsDir, 'firestore_samples_schema.md');
    fs.writeFileSync(schemaPath, schemaLines.join('\n'));
    console.log(`Schema documentation written to: ${schemaPath}`);

    console.log('\nExport completed successfully!');
    console.log(`\nGenerated files:`);
    console.log(`- ${path.resolve(rawPath)}`);
    console.log(`- ${path.resolve(redactedPath)}`);
    console.log(`- ${path.resolve(schemaPath)}`);

  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}