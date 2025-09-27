// Script to set a user's role to admin
// Usage: node scripts/set-admin-role.js --email=your-email@example.com --schoolId=TRP001

const admin = require("firebase-admin");
const minimist = require("minimist");

async function main() {
  const args = minimist(process.argv.slice(2));
  const email = args.email;
  const schoolId = args.schoolId || "TRP001"; // Default school ID
  
  if (!email) {
    console.error("Error: Please provide --email=your-email@example.com");
    process.exit(1);
  }

  console.log(`\n--- Set Admin Role Script ---`);
  console.log(`Email: ${email}`);
  console.log(`School ID: ${schoolId}`);
  console.log(`---------------------------\n`);

  // Initialize Firebase Admin SDK
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log("Firebase Admin SDK initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Firebase Admin SDK:", error.message);
    console.log("\nTo fix this, you need to:");
    console.log("1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install");
    console.log("2. Run: gcloud auth application-default login");
    console.log("3. Run: gcloud config set project routemaster-admin-k1thy");
    process.exit(1);
  }

  const db = admin.firestore();

  try {
    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;
    
    console.log(`Found user: ${email} (UID: ${uid})`);

    // Check if user document exists in the school
    const userDocRef = db.doc(`schools/${schoolId}/users/${uid}`);
    const userDoc = await userDocRef.get();

    if (userDoc.exists()) {
      // Update existing user document
      await userDocRef.update({
        role: "admin",
        active: true,
        pending: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Updated existing user role to admin`);
    } else {
      // Create new user document
      await userDocRef.set({
        email: email,
        displayName: userRecord.displayName || email.split('@')[0],
        role: "admin",
        schoolId: schoolId,
        active: true,
        pending: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Created new user document with admin role`);
    }

    // Also create/update the usersIndex document for login
    const userIndexRef = db.doc(`usersIndex/${uid}`);
    await userIndexRef.set({
      schoolId: schoolId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`✅ Updated usersIndex for login`);

    console.log(`\n🎉 Success! User ${email} now has admin role for school ${schoolId}`);
    console.log(`You can now log in and access admin settings.`);

  } catch (error) {
    console.error("Error setting admin role:", error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.log(`\n❌ User with email ${email} not found in Firebase Auth.`);
      console.log("Please make sure you've created an account by signing up first.");
    }
  }
}

main().catch(console.error);