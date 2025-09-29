
// Client-side (Next.js, Firebase Web v9+)
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { arrayUnion, arrayRemove, doc, updateDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, app } from "@/lib/firebase";

const VAPID = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export async function registerFcmToken(uid: string, schoolId: string) {
  if (!VAPID) {
    console.warn("[FCM] Missing VAPID key env");
    return null;
  }
  if (!(await isSupported())) {
    console.warn("[FCM] Not supported in this browser/context");
    return null;
  }

  try {
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID });
    if (!token) return null;

    // Build proper school-based path
    const ref = doc(db, "schools", schoolId, "users", uid);
    console.log("[FCM] Writing to path:", `schools/${schoolId}/users/${uid}`);
    
    // Create or update the doc, ensuring fcmTokens array exists
    await setDoc(ref, { fcmTokens: [] }, { merge: true });
    
    // Add the token using arrayUnion to only write fcmTokens field
    await updateDoc(ref, { fcmTokens: arrayUnion(token) });

    console.log("[FCM] token saved:", token.slice(0, 12) + "…");
    return token;
  } catch (e: any) {
    if (e.code === 'messaging/permission-blocked') {
        // This is a common case when the user denies notification permission.
        // It's not a developer error, so we can fail silently.
    } else {
        console.error("[FCM] registerFcmToken failed:", e);
    }
    return null;
  }
}


export async function unregisterFcmToken(uid: string, schoolId: string, token: string) {
  const ref = doc(db, "schools", schoolId, "users", uid);
  await updateDoc(ref, { fcmTokens: arrayRemove(token) });
}


// Foreground message handler
export function onForegroundNotification(
  handler: (payload: { title?: string; body?: string; data?: any }) => void
) {
  isSupported().then((ok) => {
    if (!ok) return;
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      console.log("[FCM] onMessage foreground:", payload);
      const n = payload.notification || {};
      handler({ title: n.title, body: n.body, data: payload.data });
    });
  });
}

// Optional: write to a bell feed (works even without push)
export async function logBell(uid: string, n: { title: string; body: string; data?: any }) {
  await addDoc(collection(db, "users", uid, "inbox"), {
    ...n,
    createdAt: serverTimestamp(),
    read: false,
  });
}
