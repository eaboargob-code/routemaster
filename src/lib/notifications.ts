
// Client-side (Next.js, Firebase Web v9+)
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { arrayUnion, arrayRemove, doc, updateDoc } from "firebase/firestore";
import { db, app } from "@/lib/firebase";

export async function registerFcmToken(uid: string) {
  try {
    if (!(await isSupported())) {
      console.warn("[FCM] Not supported in this browser/context");
      return null;
    }

    // Make sure we are NOT inside Firebase Studio iframe; SW must be registered on your app origin
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
    console.log("[FCM] SW registered:", !!swReg);

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    console.log("[FCM] VAPID present?", !!vapidKey);

    const perm = await Notification.requestPermission();
    console.log("[FCM] Permission:", perm);
    if (perm !== "granted") return null;

    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
    console.log("[FCM] getToken ->", token);
    if (!token) return null;

    await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
    console.log("[FCM] Saved token to users/%s.fcmTokens[]", uid);
    return token;
  } catch (err) {
    console.error("[FCM] registerFcmToken failed:", err);
    return null;
  }
}

export async function unregisterFcmToken(uid: string, token: string) {
  await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(token) });
}

export function listenForeground(cb: (payload: any) => void) {
  const m = getMessaging(app);
  return onMessage(m, (p) => {
    console.log("[FCM] onMessage foreground:", p);
    cb(p);
  });
}
