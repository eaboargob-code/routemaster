// node migrate.js
// Usage: set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON.

const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

async function copyCollectionToSchools(coll, alsoCopySub = false) {
  const snap = await db.collection(coll).get();
  console.log(`Migrating ${coll} (${snap.size})`);
  for (const d of snap.docs) {
    const data = d.data();
    const schoolId = data.schoolId;
    if (!schoolId) {
      console.warn(`[SKIP] ${coll}/${d.id} has no schoolId`);
      continue;
    }
    const dest = db.doc(`schools/${schoolId}/${coll}/${d.id}`);
    await dest.set(data, { merge: true });

    if (alsoCopySub && coll === "trips") {
      // copy trips/{tripId}/passengers/*
      const passSnap = await db.collection(`${coll}/${d.id}/passengers`).get();
      for (const p of passSnap.docs) {
        await db
          .doc(`schools/${schoolId}/trips/${d.id}/passengers/${p.id}`)
          .set(p.data(), { merge: true });
      }
    }
  }
}

async function copyParentStudents() {
  const snap = await db.collection("parentStudents").get();
  console.log(`Migrating parentStudents (${snap.size})`);
  for (const d of snap.docs) {
    const data = d.data();
    const schoolId = data.schoolId;
    if (!schoolId) {
      console.warn(`[SKIP] parentStudents/${d.id} has no schoolId`);
      continue;
    }
    await db
      .doc(`schools/${schoolId}/parentStudents/${d.id}`)
      .set(data, { merge: true });
  }
}

/**
 * Try to infer a user's schoolId when it's missing on the user doc.
 * - If driver: read their bus or trips
 * - If supervisor: read trips where supervisorId == uid
 * - If parent: read parentStudents link
 */
async function inferSchoolIdForUser(uid, role) {
  // from bus (driver)
  if (role === "driver") {
    const buses = await db.collection("buses").where("driverId", "==", uid).limit(1).get();
    if (!buses.empty) return buses.docs[0].data().schoolId;
    const trips = await db.collection("trips").where("driverId", "==", uid).limit(1).get();
    if (!trips.empty) return trips.docs[0].data().schoolId;
  }
  // from trips (supervisor)
  if (role === "supervisor") {
    const trips = await db.collection("trips").where("supervisorId", "==", uid).limit(1).get();
    if (!trips.empty) return trips.docs[0].data().schoolId;
  }
  // from parentStudents
  if (role === "parent") {
    const ps = await db.collection("parentStudents").doc(uid).get();
    if (ps.exists) return ps.data().schoolId;
  }
  return null;
}

async function copyUsersWithSubcollections() {
  const snap = await db.collection("users").get();
  console.log(`Migrating users (${snap.size})`);
  for (const d of snap.docs) {
    const data = d.data();
    let { schoolId, role } = data;

    if (!schoolId) {
      schoolId = await inferSchoolIdForUser(d.id, role);
      if (!schoolId) {
        console.warn(`[SKIP] users/${d.id} has no schoolId and could not infer`);
        continue;
      } else {
        console.log(`[INFO] inferred schoolId=${schoolId} for users/${d.id}`);
      }
    }

    // Write the user doc under the school
    await db.doc(`schools/${schoolId}/users/${d.id}`).set(data, { merge: true });

    // Copy subcollections: inbox, notifications (if present)
    for (const subName of ["inbox", "notifications"]) {
      const subSnap = await db.collection(`users/${d.id}/${subName}`).get().catch(() => null);
      if (!subSnap || subSnap.empty) continue;

      for (const s of subSnap.docs) {
        await db
          .doc(`schools/${schoolId}/users/${d.id}/${subName}/${s.id}`)
          .set(s.data(), { merge: true });
      }
    }
  }
}

(async () => {
  try {
    // Core collections
    await copyCollectionToSchools("routes");
    await copyCollectionToSchools("buses");
    await copyCollectionToSchools("students");
    await copyCollectionToSchools("trips", true); // includes passengers/*
    await copyParentStudents();
    // Users + their subcollections
    await copyUsersWithSubcollections();

    console.log("=== Migration complete ===");
    console.log("Verify the data under /schools/* then remove old root data when ready.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
