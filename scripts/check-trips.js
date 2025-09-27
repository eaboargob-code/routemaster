// Simple script to check trips using Firebase client SDK
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

// Firebase config from .env.local
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBJGKJJKJKJKJKJKJKJKJKJKJKJKJKJKJK",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "routemaster-admin-k1thy.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "routemaster-admin-k1thy",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "routemaster-admin-k1thy.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abcdef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkTrips() {
  try {
    console.log('Checking trips in database...');
    
    // Check schools
    const schoolsRef = collection(db, 'schools');
    const schoolsSnapshot = await getDocs(schoolsRef);
    
    console.log('Schools found:');
    for (const schoolDoc of schoolsSnapshot.docs) {
      const schoolId = schoolDoc.id;
      const schoolData = schoolDoc.data();
      console.log(`- ${schoolId}: ${schoolData.name || 'No name'}`);
      
      // Check trips in this school
      const tripsRef = collection(db, 'schools', schoolId, 'trips');
      const tripsSnapshot = await getDocs(tripsRef);
      
      console.log(`  Trips in ${schoolId}:`);
      if (tripsSnapshot.empty) {
        console.log('    No trips found');
      } else {
        tripsSnapshot.forEach(tripDoc => {
          const tripData = tripDoc.data();
          console.log(`    - ${tripDoc.id}: status=${tripData.status}, driverId=${tripData.driverId}, students=${tripData.students?.length || 0}`);
        });
      }
      
      // Check users in this school
      const usersRef = collection(db, 'schools', schoolId, 'users');
      const usersSnapshot = await getDocs(usersRef);
      
      console.log(`  Users in ${schoolId}:`);
      if (usersSnapshot.empty) {
        console.log('    No users found');
      } else {
        usersSnapshot.forEach(userDoc => {
          const userData = userDoc.data();
          console.log(`    - ${userDoc.id}: role=${userData.role}, name=${userData.name || 'No name'}`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error checking trips:', error);
  }
}

checkTrips().then(() => {
  console.log('Check completed');
  process.exit(0);
}).catch(error => {
  console.error('Check failed:', error);
  process.exit(1);
});