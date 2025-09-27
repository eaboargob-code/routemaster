const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  // Try to use service account key if available, otherwise use default credentials
  try {
    const serviceAccount = require('../serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'routemaster-admin-k1thy'
    });
  } catch (error) {
    console.log('Service account key not found, using default credentials...');
    admin.initializeApp({
      projectId: 'routemaster-admin-k1thy'
    });
  }
}

const db = admin.firestore();

async function updateSchoolLocation() {
  try {
    // Default school ID
    const schoolId = 'default-school';
    
    // Tripoli, Libya coordinates
    const tripoliCoordinates = {
      latitude: 32.8872,
      longitude: 13.1913,
      address: 'Tripoli, Libya',
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin-script'
    };

    console.log('🔄 Updating school location coordinates with admin privileges...');
    console.log('📍 New coordinates:', tripoliCoordinates);

    // Update config/location
    const locationRef = db.doc(`schools/${schoolId}/config/location`);
    await locationRef.set(tripoliCoordinates, { merge: true });
    console.log('✅ Updated config/location');

    // Also update config/profile if it exists
    const profileRef = db.doc(`schools/${schoolId}/config/profile`);
    const profileDoc = await profileRef.get();
    
    if (profileDoc.exists) {
      await profileRef.set({
        latitude: tripoliCoordinates.latitude,
        longitude: tripoliCoordinates.longitude,
        address: tripoliCoordinates.address,
        updatedAt: tripoliCoordinates.updatedAt
      }, { merge: true });
      console.log('✅ Updated config/profile');
    }

    console.log('🎉 School location successfully updated to Tripoli, Libya!');
    console.log('📱 Please refresh your browser to see the changes.');
    
  } catch (error) {
    console.error('❌ Error updating school location:', error);
    console.error('Error details:', error.message);
  } finally {
    process.exit(0);
  }
}

// Run the update
updateSchoolLocation();