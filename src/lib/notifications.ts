
// Client-side (Next.js, Firebase Web v9+)
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { arrayUnion, arrayRemove, doc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, app } from "@/lib/firebase";

const VAPID = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export async function registerFcmToken(uid: string) {
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

    await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
    console.log("[FCM] token saved:", token.slice(0, 12) + "…");
    return token;
  } catch (e) {
    console.error("[FCM] registerFcmToken failed:", e);
    return null;
  }
}


export async function unregisterFcmToken(uid: string, token: string) {
  await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(token) });
}


// Foreground message handler
export function listenForeground(
  handler: (payload: any) => void
) {
  isSupported().then((ok) => {
    if (!ok) return;
    const messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      console.log("[FCM] onMessage foreground:", payload);
      handler(payload);
    });
  });
}

// Optional: write to a bell feed (works even without push)
export async function logBell(uid: string, n: { title: string; body: string; data?: any }) {
  await addDoc(collection(db, "users", uid, "notifications"), {
    ...n,
    createdAt: serverTimestamp(),
    read: false,
  });
}
