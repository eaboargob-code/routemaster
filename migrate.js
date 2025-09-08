const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

async function copyColl(coll) {
  const snap = await db.collection(coll).get();
  console.log(`Migrating ${coll} (${snap.size})`);
  for (const d of snap.docs) {
    const data = d.data();
    const schoolId = data.schoolId;
    if (!schoolId) { console.log(`skip ${coll}/${d.id} (no schoolId)`); continue; }

    await db.doc(`schools/${schoolId}/${coll}/${d.id}`).set(data, { merge: true });

    if (coll === "trips") {
      const pass = await db.collection(`${coll}/${d.id}/passengers`).get();
      for (const p of pass.docs) {
        await db.doc(`schools/${schoolId}/trips/${d.id}/passengers/${p.id}`).set(p.data(), { merge: true });
      }
    }
  }
}

(async () => {
  await copyColl("routes");
  await copyColl("buses");
  await copyColl("students");
  await copyColl("trips");
  // parentStudents at root → schools/{id}/parentStudents
  const ps = await db.collection("parentStudents").get();
  for (const d of ps.docs) {
    const data = d.data();
    const schoolId = data.schoolId;
    if (schoolId) await db.doc(`schools/${schoolId}/parentStudents/${d.id}`).set(data, { merge: true });
  }
  console.log("Done.");
})();
