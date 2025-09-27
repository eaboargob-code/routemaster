const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, getDocs } = require('firebase/firestore');
require('dotenv').config({ path: '.env.local' });

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkAllLocationDocuments() {
  console.log('🔍 Checking all possible location documents...');
  
  // We need to find the schoolId first
  const schoolId = 'default'; // This seems to be the schoolId based on our previous scripts
  
  console.log(`\n📍 Checking for schoolId: ${schoolId}`);
  
  // Check 1: schools/{schoolId}/config/location
  try {
    const locationRef = doc(db, `schools/${schoolId}/config/location`);
    const locationSnap = await getDoc(locationRef);
    
    console.log(`\n1️⃣ Location document (schools/${schoolId}/config/location):`);
    console.log(`   Exists: ${locationSnap.exists()}`);
    if (locationSnap.exists()) {
      const data = locationSnap.data();
      console.log(`   Data:`, data);
      
      // Check if this is New York coordinates
      if (data.latitude >= 40.0 && data.latitude <= 41.0 && data.longitude >= -75.0 && data.longitude <= -73.0) {
        console.log(`   🗽 WARNING: This contains New York coordinates!`);
      }
    }
  } catch (error) {
    console.log(`   Error:`, error.message);
  }
  
  // Check 2: schools/{schoolId}/config/profile
  try {
    const profileRef = doc(db, `schools/${schoolId}/config/profile`);
    const profileSnap = await getDoc(profileRef);
    
    console.log(`\n2️⃣ Profile document (schools/${schoolId}/config/profile):`);
    console.log(`   Exists: ${profileSnap.exists()}`);
    if (profileSnap.exists()) {
      const data = profileSnap.data();
      console.log(`   Data:`, {
        latitude: data.latitude,
        longitude: data.longitude,
        location: data.location,
        name: data.name,
        address: data.address
      });
      
      // Check if this is New York coordinates
      if (data.latitude >= 40.0 && data.latitude <= 41.0 && data.longitude >= -75.0 && data.longitude <= -73.0) {
        console.log(`   🗽 WARNING: This contains New York coordinates!`);
      }
      if (data.location && data.location.latitude >= 40.0 && data.location.latitude <= 41.0 && data.location.longitude >= -75.0 && data.location.longitude <= -73.0) {
        console.log(`   🗽 WARNING: location field contains New York coordinates!`);
      }
    }
  } catch (error) {
    console.log(`   Error:`, error.message);
  }
  
  // Check 3: Look for any other documents that might contain location data
  try {
    console.log(`\n3️⃣ Checking config collection for other documents:`);
    const configRef = collection(db, `schools/${schoolId}/config`);
    const configSnap = await getDocs(configRef);
    
    configSnap.forEach((doc) => {
      console.log(`   Document: ${doc.id}`);
      const data = doc.data();
      
      // Look for any latitude/longitude fields
      if (data.latitude !== undefined || data.longitude !== undefined) {
        console.log(`     Has coordinates: lat=${data.latitude}, lng=${data.longitude}`);
        
        if (data.latitude >= 40.0 && data.latitude <= 41.0 && data.longitude >= -75.0 && data.longitude <= -73.0) {
          console.log(`     🗽 WARNING: Contains New York coordinates!`);
        }
      }
      
      // Look for nested location objects
      if (data.location && (data.location.latitude !== undefined || data.location.longitude !== undefined)) {
        console.log(`     Has location object: lat=${data.location.latitude}, lng=${data.location.longitude}`);
        
        if (data.location.latitude >= 40.0 && data.location.latitude <= 41.0 && data.location.longitude >= -75.0 && data.location.longitude <= -73.0) {
          console.log(`     🗽 WARNING: Location object contains New York coordinates!`);
        }
      }
    });
  } catch (error) {
    console.log(`   Error:`, error.message);
  }
  
  console.log('\n✅ Location document check complete!');
}

checkAllLocationDocuments().catch(console.error);