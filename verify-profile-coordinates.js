const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBKJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ",
  authDomain: "routemaster-admin-k1thy.firebaseapp.com",
  projectId: "routemaster-admin-k1thy",
  storageBucket: "routemaster-admin-k1thy.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdefghijklmnop"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function verifyProfileCoordinates() {
  try {
    console.log('Checking profile document for TRP001...');
    
    const profileRef = doc(db, 'schools/TRP001/config/profile');
    const profileSnap = await getDoc(profileRef);
    
    if (profileSnap.exists()) {
      const profile = profileSnap.data();
      console.log('Profile document found!');
      console.log('Current coordinates in profile:');
      console.log('  latitude:', profile.latitude);
      console.log('  longitude:', profile.longitude);
      console.log('  latitude type:', typeof profile.latitude);
      console.log('  longitude type:', typeof profile.longitude);
      
      // Expected coordinates
      const expectedLat = 32.889948319821656;
      const expectedLng = 13.2208389043808;
      
      console.log('\nExpected coordinates:');
      console.log('  latitude:', expectedLat);
      console.log('  longitude:', expectedLng);
      
      // Check if coordinates match
      const latMatch = Math.abs(profile.latitude - expectedLat) < 0.000001;
      const lngMatch = Math.abs(profile.longitude - expectedLng) < 0.000001;
      
      console.log('\nCoordinate verification:');
      console.log('  Latitude matches:', latMatch);
      console.log('  Longitude matches:', lngMatch);
      
      if (latMatch && lngMatch) {
        console.log('\n✅ SUCCESS: Profile coordinates match expected values!');
      } else {
        console.log('\n❌ MISMATCH: Profile coordinates do not match expected values');
        console.log('Differences:');
        console.log('  Latitude diff:', Math.abs(profile.latitude - expectedLat));
        console.log('  Longitude diff:', Math.abs(profile.longitude - expectedLng));
      }
      
    } else {
      console.log('❌ Profile document does not exist!');
    }
    
  } catch (error) {
    console.error('Error verifying profile coordinates:', error);
  }
}

verifyProfileCoordinates();