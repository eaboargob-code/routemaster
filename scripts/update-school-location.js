const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDoc } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateSchoolLocation() {
  try {
    // Default school ID - you can modify this or pass as argument
    const schoolId = 'default-school';
    
    // Tripoli, Libya coordinates
    const tripoliCoordinates = {
      latitude: 32.8872,
      longitude: 13.1913,
      address: 'Tripoli, Libya',
      updatedAt: new Date().toISOString(),
      updatedBy: 'script'
    };

    console.log('🔄 Updating school location coordinates...');
    console.log('📍 New coordinates:', tripoliCoordinates);

    // Update config/location
    const locationRef = doc(db, `schools/${schoolId}/config/location`);
    await setDoc(locationRef, tripoliCoordinates, { merge: true });
    console.log('✅ Updated config/location');

    // Also update config/profile if it exists
    const profileRef = doc(db, `schools/${schoolId}/config/profile`);
    const profileDoc = await getDoc(profileRef);
    
    if (profileDoc.exists()) {
      await setDoc(profileRef, {
        latitude: tripoliCoordinates.latitude,
        longitude: tripoliCoordinates.longitude,
        updatedAt: tripoliCoordinates.updatedAt
      }, { merge: true });
      console.log('✅ Updated config/profile');
    }

    console.log('🎉 School location successfully updated to Tripoli, Libya!');
    console.log('📱 Please refresh your driver route page to see the changes.');
    
  } catch (error) {
    console.error('❌ Error updating school location:', error);
    
    if (error.code === 'permission-denied') {
      console.log('💡 This script needs admin permissions. Make sure you have admin role in the database.');
    }
  }
}

// Run the update
updateSchoolLocation();