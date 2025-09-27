// Script to check driver's schoolId and debug the issue
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

async function checkDriverSchoolId() {
  console.log('🔍 Checking driver schoolId configuration...');
  
  try {
    // 1. Check usersIndex collection for any users
    console.log('\n1️⃣ Checking usersIndex collection:');
    const usersIndexSnapshot = await db.collection('usersIndex').get();
    
    if (usersIndexSnapshot.empty) {
      console.log('❌ No documents in usersIndex collection');
    } else {
      console.log(`✅ Found ${usersIndexSnapshot.size} documents in usersIndex:`);
      usersIndexSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   - ${doc.id}: schoolId = ${data.schoolId}, role = ${data.role}`);
      });
    }
    
    // 2. Check root users collection
    console.log('\n2️⃣ Checking root users collection:');
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('❌ No documents in root users collection');
    } else {
      console.log(`✅ Found ${usersSnapshot.size} documents in root users:`);
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   - ${doc.id}: schoolId = ${data.schoolId}, role = ${data.role}, email = ${data.email}`);
      });
    }
    
    // 3. Check schools collection to see what schools exist
    console.log('\n3️⃣ Checking schools collection:');
    const schoolsSnapshot = await db.collection('schools').get();
    
    if (schoolsSnapshot.empty) {
      console.log('❌ No schools found');
    } else {
      console.log(`✅ Found ${schoolsSnapshot.size} schools:`);
      for (const schoolDoc of schoolsSnapshot.docs) {
        console.log(`\n   📍 School: ${schoolDoc.id}`);
        
        // Check config/location
        try {
          const locationDoc = await schoolDoc.ref.collection('config').doc('location').get();
          if (locationDoc.exists()) {
            const locationData = locationDoc.data();
            console.log(`      Location: lat=${locationData.latitude}, lng=${locationData.longitude}`);
          } else {
            console.log(`      ❌ No location config found`);
          }
        } catch (error) {
          console.log(`      ❌ Error checking location: ${error.message}`);
        }
        
        // Check users in this school
        try {
          const schoolUsersSnapshot = await schoolDoc.ref.collection('users').get();
          if (!schoolUsersSnapshot.empty) {
            console.log(`      Users (${schoolUsersSnapshot.size}):`);
            schoolUsersSnapshot.forEach(userDoc => {
              const userData = userDoc.data();
              console.log(`        - ${userDoc.id}: role=${userData.role}, email=${userData.email}`);
            });
          } else {
            console.log(`      ❌ No users in this school`);
          }
        } catch (error) {
          console.log(`      ❌ Error checking school users: ${error.message}`);
        }
      }
    }
    
    // 4. Check for any hardcoded "default" references
    console.log('\n4️⃣ Summary and Recommendations:');
    
    const hasDefaultSchool = schoolsSnapshot.docs.some(doc => doc.id === 'default');
    const hasTRP001School = schoolsSnapshot.docs.some(doc => doc.id === 'TRP001');
    
    if (hasDefaultSchool && !hasTRP001School) {
      console.log('🔧 ISSUE FOUND: School "default" exists but "TRP001" does not');
      console.log('💡 SOLUTION: Rename school "default" to "TRP001" or create TRP001 school');
    } else if (!hasDefaultSchool && hasTRP001School) {
      console.log('✅ Good: TRP001 school exists, default does not');
      console.log('💡 Check: Make sure driver users have schoolId = "TRP001"');
    } else if (hasDefaultSchool && hasTRP001School) {
      console.log('⚠️ WARNING: Both "default" and "TRP001" schools exist');
      console.log('💡 SOLUTION: Consolidate to use only "TRP001"');
    } else {
      console.log('❌ PROBLEM: Neither "default" nor "TRP001" school exists');
      console.log('💡 SOLUTION: Create TRP001 school with proper location data');
    }
    
  } catch (error) {
    console.error('❌ Error checking driver schoolId:', error);
  }
  
  process.exit(0);
}

checkDriverSchoolId();