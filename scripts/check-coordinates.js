import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDNJqhgbzJvUhYKGJGqOQJqOQJqOQJqOQJ",
  authDomain: "routemaster-dev.firebaseapp.com",
  projectId: "routemaster-dev",
  storageBucket: "routemaster-dev.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdefghijklmnop"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkCoordinates() {
  try {
    console.log('Checking school coordinates...');
    
    // Check config/location document
    const locationDoc = await getDoc(doc(db, 'config', 'location'));
    if (locationDoc.exists()) {
      console.log('Location config:', locationDoc.data());
    } else {
      console.log('No location config found');
    }
    
    // Check schools/default-school document
    const schoolDoc = await getDoc(doc(db, 'schools', 'default-school'));
    if (schoolDoc.exists()) {
      const schoolData = schoolDoc.data();
      console.log('School data:', {
        location: schoolData.location,
        profile: schoolData.profile
      });
    } else {
      console.log('No school document found');
    }
    
  } catch (error) {
    console.error('Error checking coordinates:', error);
  }
}

checkCoordinates();