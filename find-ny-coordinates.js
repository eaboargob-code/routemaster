const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
  });
}

const db = admin.firestore();

async function findNewYorkCoordinates() {
  console.log('🔍 Searching for New York coordinates in the database...');
  
  try {
    // Check the school profile document we know exists
    const schoolId = 'default';
    console.log(`\n📍 Checking school profile for schoolId: ${schoolId}`);
    
    const profileRef = db.doc(`schools/${schoolId}/config/profile`);
    const profileDoc = await profileRef.get();
    
    if (profileDoc.exists) {
      const profileData = profileDoc.data();
      console.log('Profile document data:', profileData);
      
      // Check direct latitude/longitude fields
      if (profileData.latitude && profileData.longitude) {
        console.log(`Direct coordinates: lat=${profileData.latitude}, lng=${profileData.longitude}`);
        if (profileData.latitude >= 40.0 && profileData.latitude <= 41.0 && profileData.longitude >= -75.0 && profileData.longitude <= -73.0) {
          console.log('🗽 WARNING: Direct coordinates are in New York!');
        }
      }
      
      // Check location object
      if (profileData.location && profileData.location.latitude && profileData.location.longitude) {
        console.log(`Location object: lat=${profileData.location.latitude}, lng=${profileData.location.longitude}`);
        if (profileData.location.latitude >= 40.0 && profileData.location.latitude <= 41.0 && profileData.location.longitude >= -75.0 && profileData.location.longitude <= -73.0) {
          console.log('🗽 WARNING: Location object coordinates are in New York!');
        }
      }
    }
    
    // Check the dedicated location document
    console.log(`\n📍 Checking dedicated location document...`);
    const locationRef = db.doc(`schools/${schoolId}/config/location`);
    const locationDoc = await locationRef.get();
    
    if (locationDoc.exists) {
      const locationData = locationDoc.data();
      console.log('Location document data:', locationData);
      
      if (locationData.latitude && locationData.longitude) {
        console.log(`Location coordinates: lat=${locationData.latitude}, lng=${locationData.longitude}`);
        if (locationData.latitude >= 40.0 && locationData.latitude <= 41.0 && locationData.longitude >= -75.0 && locationData.longitude <= -73.0) {
          console.log('🗽 WARNING: Location document coordinates are in New York!');
          console.log('🔧 This is likely the source of the New York coordinates!');
        }
      }
    } else {
      console.log('No dedicated location document found');
    }
    
    // List all documents in the config collection
    console.log(`\n📍 Listing all config documents...`);
    const configRef = db.collection(`schools/${schoolId}/config`);
    const configSnapshot = await configRef.get();
    
    configSnapshot.forEach((doc) => {
      console.log(`Document: ${doc.id}`);
      const data = doc.data();
      
      // Look for any coordinate fields
      Object.keys(data).forEach(key => {
        if (key.toLowerCase().includes('lat') || key.toLowerCase().includes('lng') || key.toLowerCase().includes('location')) {
          console.log(`  ${key}:`, data[key]);
        }
      });
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  console.log('\n✅ Search complete!');
}

findNewYorkCoordinates().catch(console.error);