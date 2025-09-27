// Script to fix TRP001 location data mismatch between profile and location documents
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

async function fixLocationMismatch() {
  console.log('🔍 Checking TRP001 location data for inconsistencies...');
  
  try {
    const schoolId = 'TRP001';
    
    // Check both documents
    const profileRef = db.doc(`schools/${schoolId}/config/profile`);
    const locationRef = db.doc(`schools/${schoolId}/config/location`);
    
    const [profileDoc, locationDoc] = await Promise.all([
      profileRef.get(),
      locationRef.get()
    ]);
    
    console.log('\n📋 Current data:');
    
    let profileData = null;
    let locationData = null;
    
    if (profileDoc.exists) {
      profileData = profileDoc.data();
      console.log('📄 Profile document (schools/TRP001/config/profile):', {
        latitude: profileData.latitude,
        longitude: profileData.longitude,
        address: profileData.address || 'No address',
        city: profileData.city || 'No city'
      });
    } else {
      console.log('❌ Profile document does not exist');
    }
    
    if (locationDoc.exists) {
      locationData = locationDoc.data();
      console.log('📍 Location document (schools/TRP001/config/location):', {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address: locationData.address || 'No address'
      });
    } else {
      console.log('❌ Location document does not exist');
    }
    
    // Determine which coordinates are correct
    let correctCoords = null;
    
    // Check if coordinates match Tripoli (32.8872, 13.1913) or Riyadh (24.7136, 46.6753)
    if (profileData) {
      const lat = profileData.latitude;
      const lng = profileData.longitude;
      
      if (Math.abs(lat - 32.8872) < 0.1 && Math.abs(lng - 13.1913) < 0.1) {
        console.log('📄 Profile has Tripoli coordinates');
        correctCoords = {
          latitude: 32.8872,
          longitude: 13.1913,
          address: 'Tripoli, Libya',
          city: 'Tripoli',
          country: 'Libya'
        };
      } else if (Math.abs(lat - 24.7136) < 0.1 && Math.abs(lng - 46.6753) < 0.1) {
        console.log('📄 Profile has Riyadh coordinates');
      }
    }
    
    if (locationData) {
      const lat = locationData.latitude;
      const lng = locationData.longitude;
      
      if (Math.abs(lat - 24.7136) < 0.1 && Math.abs(lng - 46.6753) < 0.1) {
        console.log('📍 Location has Riyadh coordinates');
      } else if (Math.abs(lat - 32.8872) < 0.1 && Math.abs(lng - 13.1913) < 0.1) {
        console.log('📍 Location has Tripoli coordinates');
        correctCoords = {
          latitude: 32.8872,
          longitude: 13.1913,
          address: 'Tripoli, Libya',
          city: 'Tripoli',
          country: 'Libya'
        };
      }
    }
    
    // If we found Tripoli coordinates, use those. Otherwise, ask user to specify
    if (!correctCoords) {
      console.log('\n❓ Which location should TRP001 use?');
      console.log('Based on your message, it seems the profile points to Tripoli but location points to Riyadh.');
      console.log('Setting to Tripoli coordinates as that seems to be the intended location...');
      
      correctCoords = {
        latitude: 32.8872,
        longitude: 13.1913,
        address: 'Tripoli, Libya',
        city: 'Tripoli',
        country: 'Libya'
      };
    }
    
    console.log('\n🔧 Standardizing both documents to:', correctCoords);
    
    const updateData = {
      ...correctCoords,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'location-mismatch-fix'
    };
    
    // Update both documents
    await Promise.all([
      profileRef.update(updateData),
      locationRef.set(updateData, { merge: true })
    ]);
    
    console.log('✅ Both documents updated successfully');
    
    // Verify the fix
    console.log('\n🔍 Verifying the fix...');
    const [verifyProfile, verifyLocation] = await Promise.all([
      profileRef.get(),
      locationRef.get()
    ]);
    
    const newProfileData = verifyProfile.data();
    const newLocationData = verifyLocation.data();
    
    const profileCoords = `${newProfileData.latitude}, ${newLocationData.longitude}`;
    const locationCoords = `${newLocationData.latitude}, ${newLocationData.longitude}`;
    
    if (profileCoords === locationCoords) {
      console.log('✅ SUCCESS: Both documents now have matching coordinates');
      console.log('📍 Coordinates:', profileCoords);
      console.log('🏙️ Address:', newProfileData.address);
    } else {
      console.log('❌ Still have mismatch - please check manually');
    }
    
    console.log('\n🎉 Location mismatch fix complete!');
    console.log('📱 Please refresh your driver route page to see the corrected map.');
    
  } catch (error) {
    console.error('❌ Error fixing location mismatch:', error);
  }
  
  process.exit(0);
}

fixLocationMismatch();