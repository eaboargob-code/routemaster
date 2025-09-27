// Script to create a test trip for debugging
// Usage: node scripts/create-test-trip.js --email=driver1@hemo.com

const admin = require("firebase-admin");
const minimist = require("minimist");

async function main() {
  const args = minimist(process.argv.slice(2));
  const email = args.email;
  
  if (!email) {
    console.error("Error: Please provide --email=driver-email@example.com");
    process.exit(1);
  }

  console.log(`\n--- Creating Test Trip ---`);
  console.log(`Driver Email: ${email}`);
  console.log(`-------------------------\n`);

  // Initialize Firebase Admin SDK
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log("✅ Firebase Admin SDK initialized");
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Admin SDK:", error.message);
    process.exit(1);
  }

  const db = admin.firestore();

  try {
    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;
    
    console.log(`✅ Found driver in Firebase Auth:`);
    console.log(`   UID: ${uid}`);
    console.log(`   Email: ${userRecord.email}`);

    // Check usersIndex to get school ID
    const userIndexRef = db.doc(`usersIndex/${uid}`);
    const userIndexDoc = await userIndexRef.get();
    
    if (!userIndexDoc.exists()) {
      console.log(`❌ usersIndex document not found for UID ${uid}`);
      return;
    }

    const indexData = userIndexDoc.data();
    const schoolId = indexData.schoolId;
    console.log(`✅ Found school ID: ${schoolId}`);

    // Check if driver has an active trip
    const tripsRef = db.collection(`schools/${schoolId}/trips`);
    const activeTripsQuery = tripsRef
      .where('driverId', '==', uid)
      .where('status', 'in', ['scheduled', 'active']);
    
    const activeTripsSnapshot = await activeTripsQuery.get();
    
    if (!activeTripsSnapshot.empty) {
      console.log(`✅ Driver already has ${activeTripsSnapshot.size} active/scheduled trip(s):`);
      activeTripsSnapshot.docs.forEach(doc => {
        const trip = doc.data();
        console.log(`   Trip ID: ${doc.id}`);
        console.log(`   Status: ${trip.status}`);
        console.log(`   Route: ${trip.route || 'Not set'}`);
        console.log(`   Bus ID: ${trip.busId || 'Not set'}`);
      });
      return;
    }

    console.log(`❌ No active trips found for driver. Creating test trip...`);

    // Get available buses
    const busesRef = db.collection(`schools/${schoolId}/buses`);
    const busesSnapshot = await busesRef.limit(1).get();
    
    let busId = 'test-bus-001';
    if (!busesSnapshot.empty) {
      busId = busesSnapshot.docs[0].id;
      console.log(`✅ Using existing bus: ${busId}`);
    } else {
      // Create a test bus
      await db.doc(`schools/${schoolId}/buses/${busId}`).set({
        busCode: 'TEST-001',
        capacity: 30,
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Created test bus: ${busId}`);
    }

    // Create test trip
    const tripId = `test-trip-${Date.now()}`;
    const tripData = {
      driverId: uid,
      busId: busId,
      route: 'Test Route A',
      routeId: null,
      status: 'active',
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      students: [],
      passengerStatuses: [],
      schoolId: schoolId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.doc(`schools/${schoolId}/trips/${tripId}`).set(tripData);
    
    console.log(`✅ Created test trip:`);
    console.log(`   Trip ID: ${tripId}`);
    console.log(`   Status: active`);
    console.log(`   Route: Test Route A`);
    console.log(`   Bus ID: ${busId}`);
    console.log(`\n🎉 Test trip created successfully! The driver should now see an active trip.`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.log(`\n❌ User with email ${email} not found in Firebase Auth.`);
    }
  }
}

main().catch(console.error);