"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPassengerStatusChange = void 0;
// functions/index.ts
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
exports.onPassengerStatusChange = functions.firestore
    .document('trips/{tripId}/passengers/{studentId}')
    .onWrite(async (change, ctx) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    // 1. Exit early if this is not a meaningful status change
    if (!after || after.status === before?.status) {
        return;
    }
    const { tripId, studentId } = ctx.params;
    const schoolId = after.schoolId || null;
    const status = after.status;
    const meaningful = status === "boarded" || status === "dropped" || status === "absent";
    if (!meaningful)
        return;
    // 2. Resolve student name with robust fallbacks
    let studentName = null;
    try {
        const studentSnap = await admin.firestore().doc(`students/${studentId}`).get();
        if (studentSnap.exists) {
            const s = studentSnap.data();
            // Use the first available name field
            studentName = s.name ||
                s.displayName ||
                ([s.firstName, s.lastName].filter(Boolean).join(' ')) ||
                null;
        }
    }
    catch (e) {
        console.error(`Error fetching student doc for ${studentId}:`, e);
    }
    // Final fallback to the student's ID if no name is found
    if (!studentName)
        studentName = studentId;
    // 3. Find all linked parents for this student
    const parents = await admin.firestore()
        .collection('parentStudents')
        .where('studentIds', 'array-contains', studentId)
        .get();
    if (parents.empty) {
        return; // No parents to notify
    }
    // 4. Build notification content
    const titleMap = {
        boarded: "On Bus 🚌",
        dropped: "Dropped Off ✅",
        absent: "Marked Absent 🚫",
    };
    const title = titleMap[status] || "Update";
    const body = `${studentName} is ${status}.`;
    // 5. Create inbox notifications for all linked parents in a batch
    const batch = admin.firestore().batch();
    parents.forEach(p => {
        const inboxRef = admin.firestore()
            .collection("users")
            .doc(p.id)
            .collection("inbox")
            .doc();
        batch.set(inboxRef, {
            title,
            body,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            data: {
                kind: "passengerStatus",
                schoolId,
                tripId,
                studentId,
                studentName,
                status,
            },
        });
    });
    await batch.commit();
});
