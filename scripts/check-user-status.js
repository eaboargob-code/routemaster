// Script to check user status and permissions
// Usage: node scripts/check-user-status.js --email=your-email@example.com

const admin = require("firebase-admin");
const minimist = require("minimist");

async function main() {
  const args = minimist(process.argv.slice(2));
  const email = args.email;
  
  if (!email) {
    console.error("Error: Please provide --email=your-email@example.com");
    process.exit(1);
  }

  console.log(`\n--- User Status Check ---`);
  console.log(`Email: ${email}`);
  console.log(`------------------------\n`);

  // Initialize Firebase Admin SDK
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log("✅ Firebase Admin SDK initialized");
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Admin SDK:", error.message);
    process.exit(1);
  }

  const db = admin.firestore();

  try {
    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;
    
    console.log(`✅ Found user in Firebase Auth:`);
    console.log(`   UID: ${uid}`);
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   Display Name: ${userRecord.displayName || 'Not set'}`);

    // Check usersIndex
    const userIndexRef = db.doc(`usersIndex/${uid}`);
    const userIndexDoc = await userIndexRef.get();
    
    if (userIndexDoc.exists()) {
      const indexData = userIndexDoc.data();
      console.log(`\n✅ Found usersIndex document:`);
      console.log(`   School ID: ${indexData.schoolId}`);
      
      // Check user document in the school
      const schoolId = indexData.schoolId;
      const userDocRef = db.doc(`schools/${schoolId}/users/${uid}`);
      const userDoc = await userDocRef.get();
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log(`\n✅ Found user document in school ${schoolId}:`);
        console.log(`   Role: ${userData.role}`);
        console.log(`   Active: ${userData.active}`);
        console.log(`   Pending: ${userData.pending}`);
        console.log(`   School ID: ${userData.schoolId}`);
        
        // Check if user can access config/profile
        if (userData.role === 'admin' && userData.active) {
          console.log(`\n✅ User should have admin access to config/profile`);
          
          // Try to read the config/profile document
          const configRef = db.doc(`schools/${schoolId}/config/profile`);
          try {
            const configDoc = await configRef.get();
            console.log(`✅ Can read config/profile: ${configDoc.exists() ? 'exists' : 'does not exist'}`);
            
            // Try to write to config/profile (test write)
            await configRef.set({ testWrite: true, timestamp: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            console.log(`✅ Can write to config/profile`);
            
            // Clean up test write
            await configRef.update({ testWrite: admin.firestore.FieldValue.delete() });
            console.log(`✅ Test write cleaned up`);
            
          } catch (error) {
            console.log(`❌ Cannot access config/profile: ${error.message}`);
          }
        } else {
          console.log(`\n❌ User does not have admin access:`);
          console.log(`   Role: ${userData.role} (should be 'admin')`);
          console.log(`   Active: ${userData.active} (should be true)`);
        }
      } else {
        console.log(`\n❌ User document not found in school ${schoolId}`);
      }
    } else {
      console.log(`\n❌ usersIndex document not found for UID ${uid}`);
    }

  } catch (error) {
    console.error("❌ Error checking user status:", error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.log(`\n❌ User with email ${email} not found in Firebase Auth.`);
    }
  }
}

main().catch(console.error);