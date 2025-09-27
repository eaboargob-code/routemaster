// Script to create school location data for testing
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

async function createSchoolLocation() {
  console.log('🏫 Creating school location data...');
  
  try {
    // Create school profile with Riyadh coordinates (not New York)
    const schoolData = {
      name: 'Test School',
      location: {
        latitude: 24.7136,
        longitude: 46.6753
      },
      address: 'Riyadh, Saudi Arabia',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('schools').doc('default-school').set(schoolData);
    console.log('✅ School profile created with location:', schoolData.location);
    
    // Also create a location document in the subcollection
    const locationData = {
      latitude: 24.7136,
      longitude: 46.6753,
      address: 'Riyadh, Saudi Arabia',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('schools').doc('default-school').collection('location').doc('main').set(locationData);
    console.log('✅ Location subcollection document created');
    
    console.log('🎉 School location data created successfully!');
    console.log('📍 Coordinates: Riyadh (24.7136, 46.6753) - NOT New York');
    
  } catch (error) {
    console.error('❌ Error creating school location:', error);
  }
  
  process.exit(0);
}

createSchoolLocation();