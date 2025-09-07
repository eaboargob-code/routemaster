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
    if (!after)
        return;
    if (before?.status === after.status)
        return; // no real change
    const { tripId, studentId } = ctx.params;
    const schoolId = after.schoolId || null;
    // 🔹 Try passenger row for name
    let studentName = after.studentName || null;
    // 🔹 If not in passenger row, fallback to student doc
    if (!studentName) {
        const studentSnap = await admin.firestore().doc(`students/${studentId}`).get();
        if (studentSnap.exists) {
            const s = studentSnap.data();
            studentName =
                s.name ||
                    s.displayName ||
                    ([s.firstName, s.lastName].filter(Boolean).join(' ')) ||
                    null;
        }
    }
    // 🔹 Last fallback = just show UID
    if (!studentName)
        studentName = studentId;
    // Find linked parents
    const parents = await admin.firestore()
        .collection('parentStudents')
        .where('studentIds', 'array-contains', studentId)
        .get();
    if (parents.empty)
        return;
    const titleMap = {
        boarded: "On Bus 🚌",
        dropped: "Dropped Off ✅",
        absent: "Marked Absent 🚫",
        pending: "Awaiting Check-in 🕓",
    };
    const title = titleMap[after.status] || "Update";
    const body = `Student ${studentName} is ${after.status}.`;
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
                studentName, // ✅ now always stored
                status: after.status,
            },
        });
    });
    await batch.commit();
});
