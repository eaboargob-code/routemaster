const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
  });
}

const db = admin.firestore();

async function fixSchoolLocation() {
  console.log('🔧 Fixing school location to use Riyadh coordinates...');
  
  try {
    const schoolId = 'default';
    
    // The getSchoolLocation function checks the dedicated location document FIRST
    // So we need to either delete it or update it with the correct coordinates
    
    console.log(`📍 Checking if dedicated location document exists...`);
    const locationRef = db.doc(`schools/${schoolId}/config/location`);
    const locationDoc = await locationRef.get();
    
    if (locationDoc.exists) {
      const locationData = locationDoc.data();
      console.log('Found existing location document:', locationData);
      
      // Check if it has New York coordinates
      if (locationData.latitude >= 40.0 && locationData.latitude <= 41.0 && locationData.longitude >= -75.0 && locationData.longitude <= -73.0) {
        console.log('🗽 Found New York coordinates in location document!');
        console.log('🔧 Updating with Riyadh coordinates...');
        
        // Update with Riyadh coordinates
        await locationRef.set({
          latitude: 24.7136,
          longitude: 46.6753,
          address: "Riyadh, Saudi Arabia",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: "fix-script"
        });
        
        console.log('✅ Location document updated with Riyadh coordinates!');
      } else {
        console.log('Location document does not contain New York coordinates');
      }
    } else {
      console.log('No dedicated location document found');
      console.log('🔧 Creating location document with Riyadh coordinates...');
      
      // Create the location document with Riyadh coordinates
      await locationRef.set({
        latitude: 24.7136,
        longitude: 46.6753,
        address: "Riyadh, Saudi Arabia",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: "fix-script"
      });
      
      console.log('✅ Location document created with Riyadh coordinates!');
    }
    
    // Also check and update the profile document to be consistent
    console.log(`\n📍 Checking profile document...`);
    const profileRef = db.doc(`schools/${schoolId}/config/profile`);
    const profileDoc = await profileRef.get();
    
    if (profileDoc.exists) {
      const profileData = profileDoc.data();
      
      // Update the profile to also have Riyadh coordinates for consistency
      await profileRef.update({
        latitude: 24.7136,
        longitude: 46.6753,
        location: {
          latitude: 24.7136,
          longitude: 46.6753
        },
        address: "Riyadh, Saudi Arabia",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('✅ Profile document also updated with Riyadh coordinates!');
    }
    
    console.log('\n🎉 School location fix complete!');
    console.log('📍 All location documents now point to Riyadh (24.7136, 46.6753)');
    console.log('🔄 Please refresh the driver route page to see the changes');
    
  } catch (error) {
    console.error('❌ Error fixing school location:', error);
  }
}

fixSchoolLocation().catch(console.error);