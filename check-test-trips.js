const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'routemaster-admin-k1thy'
    });
  } catch (error) {
    console.log('Service account key not found, using default credentials...');
    admin.initializeApp({
      projectId: 'routemaster-admin-k1thy'
    });
  }
}

const db = admin.firestore();

async function checkTestTrips() {
  try {
    console.log('🔍 Checking for test trips with New York coordinates...');
    
    const schoolId = 'default-school';
    const tripsRef = db.collection('schools').doc(schoolId).collection('trips');
    const tripsSnapshot = await tripsRef.get();
    
    console.log(`Found ${tripsSnapshot.size} trips in the database`);
    
    let foundNYTrips = false;
    
    tripsSnapshot.forEach(doc => {
      const tripData = doc.data();
      const tripId = doc.id;
      
      // Check for New York coordinates in currentLocation
      if (tripData.currentLocation) {
        const lat = tripData.currentLocation.lat;
        const lng = tripData.currentLocation.lng;
        
        if ((lat >= 40.0 && lat <= 41.0) && (lng >= -75.0 && lng <= -73.0)) {
          console.log(`🗽 FOUND NY COORDINATES in trip ${tripId}:`);
          console.log(`   Current Location: ${lat}, ${lng}`);
          console.log(`   Trip Data:`, JSON.stringify(tripData, null, 2));
          foundNYTrips = true;
        }
      }
      
      // Check for New York coordinates in students array
      if (tripData.students && Array.isArray(tripData.students)) {
        tripData.students.forEach((student, index) => {
          if (student.lat && student.lng) {
            const lat = student.lat;
            const lng = student.lng;
            
            if ((lat >= 40.0 && lat <= 41.0) && (lng >= -75.0 && lng <= -73.0)) {
              console.log(`🗽 FOUND NY COORDINATES in trip ${tripId}, student ${index}:`);
              console.log(`   Student Location: ${lat}, ${lng}`);
              foundNYTrips = true;
            }
          }
        });
      }
    });
    
    if (!foundNYTrips) {
      console.log('✅ No trips with New York coordinates found');
    }
    
  } catch (error) {
    console.error('❌ Error checking test trips:', error);
  } finally {
    process.exit(0);
  }
}

checkTestTrips();