// Browser console script to check for New York coordinates in Firestore
// Run this in the browser console on the driver route page

console.log('🔍 Starting database coordinate check...');

// Function to check if coordinates are in New York area
function isNewYorkCoords(lat, lng) {
  return lat >= 40.0 && lat <= 41.0 && lng >= -75.0 && lng <= -73.0;
}

// Check if Firebase is available
if (typeof firebase !== 'undefined' || typeof window.firebase !== 'undefined') {
  console.log('✅ Firebase is available');
  
  // Try to access Firestore
  const db = firebase.firestore ? firebase.firestore() : 
             (window.firebase && window.firebase.firestore ? window.firebase.firestore() : null);
  
  if (db) {
    console.log('✅ Firestore is available');
    
    // Check school location
    console.log('\n📍 Checking school location...');
    db.collection('schools').doc('default-school').collection('location').get()
      .then(snapshot => {
        if (!snapshot.empty) {
          snapshot.forEach(doc => {
            const data = doc.data();
            console.log('School location document:', data);
            if (data.latitude && data.longitude && isNewYorkCoords(data.latitude, data.longitude)) {
              console.warn('🗽 WARNING: School location is in New York!', data);
            }
          });
        } else {
          console.log('No school location documents found');
        }
      })
      .catch(err => console.error('Error checking school location:', err));
    
    // Check school profile
    console.log('\n🏫 Checking school profile...');
    db.collection('schools').doc('default-school').get()
      .then(doc => {
        if (doc.exists) {
          const data = doc.data();
          console.log('School profile:', data);
          if (data.location && data.location.latitude && data.location.longitude && 
              isNewYorkCoords(data.location.latitude, data.location.longitude)) {
            console.warn('🗽 WARNING: School profile location is in New York!', data.location);
          }
        } else {
          console.log('No school profile found');
        }
      })
      .catch(err => console.error('Error checking school profile:', err));
    
    // Check trips
    console.log('\n🚌 Checking trips...');
    db.collection('schools').doc('default-school').collection('trips').get()
      .then(snapshot => {
        console.log(`Found ${snapshot.size} trips`);
        snapshot.forEach(doc => {
          const data = doc.data();
          console.log(`Trip ${doc.id}:`, data);
          
          // Check currentLocation
          if (data.currentLocation && isNewYorkCoords(data.currentLocation.lat, data.currentLocation.lng)) {
            console.warn(`🗽 WARNING: Trip ${doc.id} currentLocation is in New York!`, data.currentLocation);
          }
          
          // Check lastLocation
          if (data.lastLocation && isNewYorkCoords(data.lastLocation.lat, data.lastLocation.lng)) {
            console.warn(`🗽 WARNING: Trip ${doc.id} lastLocation is in New York!`, data.lastLocation);
          }
        });
      })
      .catch(err => console.error('Error checking trips:', err));
      
  } else {
    console.error('❌ Firestore not available');
  }
} else {
  console.error('❌ Firebase not available');
  console.log('Available global objects:', Object.keys(window).filter(key => key.toLowerCase().includes('fire')));
}

// Also check React state if available
console.log('\n⚛️ Checking React state...');
if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  console.log('React detected - manually inspect component state for schoolLocation');
} else {
  console.log('React not detected in global scope');
}

// Check for any global variables that might contain coordinates
console.log('\n🌐 Checking global variables...');
const globalVars = Object.keys(window);
globalVars.forEach(key => {
  try {
    const value = window[key];
    if (value && typeof value === 'object') {
      const str = JSON.stringify(value);
      if (str.includes('40.7') || str.includes('-74.')) {
        console.log(`Found potential NY coords in window.${key}:`, value);
      }
    }
  } catch (e) {
    // Ignore errors from accessing certain global objects
  }
});

console.log('\n✅ Database coordinate check complete!');
console.log('Check the output above for any New York coordinates found in the database.');