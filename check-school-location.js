// Script to check school location data
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

async function checkSchoolLocation() {
  console.log('🔍 Checking school location data...');
  
  try {
    // Check school profile
    const schoolDoc = await db.collection('schools').doc('default-school').get();
    
    if (schoolDoc.exists) {
      const schoolData = schoolDoc.data();
      console.log('📍 School profile data:', JSON.stringify(schoolData, null, 2));
      
      if (schoolData.location) {
        console.log('✅ School location found:', schoolData.location);
        
        // Check if coordinates are valid
        const { latitude, longitude } = schoolData.location;
        if (typeof latitude === 'number' && typeof longitude === 'number' && 
            !isNaN(latitude) && !isNaN(longitude)) {
          console.log('✅ Coordinates are valid numbers');
          
          // Check if they're in New York area
          if (latitude >= 40.0 && latitude <= 41.0 && longitude >= -75.0 && longitude <= -73.0) {
            console.log('🗽 WARNING: School location is in New York area!');
          } else {
            console.log('✅ Coordinates are not in New York area');
          }
        } else {
          console.log('❌ Invalid coordinates:', { latitude, longitude });
        }
      } else {
        console.log('❌ No location field in school profile');
      }
    } else {
      console.log('❌ School profile document does not exist');
    }
    
    // Check location subcollection
    console.log('\n📍 Checking location subcollection...');
    const locationSnapshot = await db.collection('schools').doc('default-school').collection('location').get();
    
    if (!locationSnapshot.empty) {
      locationSnapshot.forEach(doc => {
        console.log(`Location document ${doc.id}:`, JSON.stringify(doc.data(), null, 2));
      });
    } else {
      console.log('❌ No documents in location subcollection');
    }
    
  } catch (error) {
    console.error('❌ Error checking school location:', error);
  }
  
  process.exit(0);
}

checkSchoolLocation();