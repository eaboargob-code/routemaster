// Test Firebase connection
require('dotenv').config({ path: '.env.local' });

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

console.log('Firebase Config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  hasApiKey: !!firebaseConfig.apiKey
});

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testConnection() {
  try {
    console.log('Testing Firestore connection...');
    
    // Try to read from schools collection
    const schoolsRef = collection(db, 'schools');
    const snapshot = await getDocs(schoolsRef);
    
    console.log(`Successfully connected! Found ${snapshot.size} schools.`);
    
    snapshot.forEach(doc => {
      console.log(`School: ${doc.id}`, doc.data());
    });
    
    return true;
  } catch (error) {
    console.error('Connection failed:', error);
    return false;
  }
}

testConnection().then(success => {
  if (success) {
    console.log('✅ Firebase connection test passed');
  } else {
    console.log('❌ Firebase connection test failed');
  }
  process.exit(success ? 0 : 1);
});