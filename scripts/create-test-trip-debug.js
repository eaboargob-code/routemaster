const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'routemaster-admin-k1thy'
  });
}

const db = admin.firestore();

async function createTestTrip() {
  try {
    console.log('Creating test trip for debugging...');
    
    // First, let's check what schools exist
    const schoolsSnapshot = await db.collection('schools').get();
    console.log('Available schools:');
    schoolsSnapshot.forEach(doc => {
      console.log(`- ${doc.id}: ${doc.data().name || 'No name'}`);
    });
    
    // Use the first school or create a default one
    let schoolId = 'TRP001';
    if (!schoolsSnapshot.empty) {
      schoolId = schoolsSnapshot.docs[0].id;
    }
    
    console.log(`Using school: ${schoolId}`);
    
    // Create test students
    const testStudents = [
      {
        id: 'student1',
        name: 'Alice Johnson',
        grade: '5th Grade',
        photoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face',
        photoUrlThumb: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=50&h=50&fit=crop&crop=face',
        pickupLat: 40.7128,
        pickupLng: -74.0060,
        assignedRouteId: null,
        assignedBusId: null,
        schoolId: schoolId,
        parentPhone: '+1234567890',
        address: '123 Main St, City, State',
        pickupTime: '07:30',
        dropoffTime: '15:30',
        specialNeeds: '',
        emergencyContact: 'Parent: +1234567890',
        medicalInfo: '',
        busRoute: 'Route A'
      },
      {
        id: 'student2',
        name: 'Bob Smith',
        grade: '3rd Grade',
        photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
        photoUrlThumb: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=50&h=50&fit=crop&crop=face',
        pickupLat: 40.7589,
        pickupLng: -73.9851,
        assignedRouteId: null,
        assignedBusId: null,
        schoolId: schoolId,
        parentPhone: '+1234567891',
        address: '456 Oak Ave, City, State',
        pickupTime: '07:35',
        dropoffTime: '15:35',
        specialNeeds: '',
        emergencyContact: 'Parent: +1234567891',
        medicalInfo: '',
        busRoute: 'Route A'
      }
    ];
    
    // Create students
    for (const student of testStudents) {
      await db.collection('schools').doc(schoolId).collection('students').doc(student.id).set(student);
      console.log(`Created student: ${student.id}`);
    }
    
    // Check if there are any users in this school to use as driver
    const usersSnapshot = await db.collection('schools').doc(schoolId).collection('users').where('role', '==', 'driver').get();
    let driverId = 'test-driver-123'; // Default fallback
    
    if (!usersSnapshot.empty) {
      driverId = usersSnapshot.docs[0].id;
      console.log(`Found driver: ${driverId}`);
    } else {
      console.log(`No drivers found, using default: ${driverId}`);
    }
    
    // Create test trip
    const tripData = {
      id: 'test-trip-debug',
      driverId: driverId,
      busId: 'bus-001',
      route: 'route-a',
      status: 'active',
      students: ['student1', 'student2'],
      passengerStatuses: [
        { studentId: 'student1', status: 'pending', timestamp: new Date() },
        { studentId: 'student2', status: 'pending', timestamp: new Date() }
      ],
      schoolId: schoolId,
      startTime: new Date(),
      estimatedEndTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      currentLocation: { lat: 40.7128, lng: -74.0060 },
      nextStop: 'student1'
    };
    
    await db.collection('schools').doc(schoolId).collection('trips').doc('test-trip-debug').set(tripData);
    console.log('Test trip created successfully!');
    console.log('Trip data:', JSON.stringify(tripData, null, 2));
    
    // Verify the trip was created
    const tripDoc = await db.collection('schools').doc(schoolId).collection('trips').doc('test-trip-debug').get();
    if (tripDoc.exists) {
      console.log('✅ Trip verification successful');
    } else {
      console.log('❌ Trip verification failed');
    }
    
    // List all trips for this driver
    const tripsSnapshot = await db.collection('schools').doc(schoolId).collection('trips')
      .where('driverId', '==', driverId)
      .where('status', 'in', ['scheduled', 'active'])
      .get();
    
    console.log(`\nTrips for driver ${driverId}:`);
    tripsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`- ${doc.id}: status=${data.status}, students=${data.students?.length || 0}`);
    });
    
  } catch (error) {
    console.error('Error creating test trip:', error);
  }
}

createTestTrip().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});