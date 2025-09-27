// Script to create location data for TRP001 school
const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin
const serviceAccount = {
  type: "service_account",
  project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();

async function createTRP001Location() {
  console.log('🏫 Creating location data for TRP001 school...');
  
  try {
    const schoolId = 'TRP001';
    
    // Riyadh, Saudi Arabia coordinates (good default for TRP001)
    const locationData = {
      latitude: 24.7136,
      longitude: 46.6753,
      address: "Riyadh, Saudi Arabia",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: "admin-script",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    console.log('📍 Setting location coordinates:', {
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      address: locationData.address
    });
    
    // Create the location document in schools/TRP001/config/location
    const locationRef = db.collection('schools').doc(schoolId).collection('config').doc('location');
    await locationRef.set(locationData);
    
    console.log('✅ Location document created successfully!');
    
    // Also update the profile document to include location data for consistency
    console.log('📝 Updating school profile with location data...');
    
    const profileRef = db.collection('schools').doc(schoolId).collection('config').doc('profile');
    const profileDoc = await profileRef.get();
    
    if (profileDoc.exists) {
      // Update existing profile
      await profileRef.update({
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address: locationData.address,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✅ School profile updated with location data');
    } else {
      // Create new profile with location
      await profileRef.set({
        name: 'TRP001 School',
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address: locationData.address,
        city: 'Riyadh',
        country: 'Saudi Arabia',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✅ School profile created with location data');
    }
    
    // Verify the data was created correctly
    console.log('\n🔍 Verifying location data...');
    
    const verifyLocationDoc = await locationRef.get();
    if (verifyLocationDoc.exists) {
      const verifyData = verifyLocationDoc.data();
      console.log('✅ Location verification successful:', {
        latitude: verifyData.latitude,
        longitude: verifyData.longitude,
        address: verifyData.address
      });
    } else {
      console.log('❌ Location verification failed - document not found');
    }
    
    console.log('\n🎉 TRP001 school location setup complete!');
    console.log('📱 Please refresh the driver route page to see the map');
    console.log('📍 School location: Riyadh, Saudi Arabia (24.7136, 46.6753)');
    
  } catch (error) {
    console.error('❌ Error creating TRP001 location:', error);
    
    if (error.code === 'permission-denied') {
      console.log('💡 This script needs admin permissions. Make sure you have admin role in the database.');
    }
  }
  
  process.exit(0);
}

createTRP001Location();