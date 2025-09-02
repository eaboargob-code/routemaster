
// Client-side (Next.js, Firebase Web v9+)
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { arrayUnion, arrayRemove, doc, updateDoc } from "firebase/firestore";
import { db, app } from "@/lib/firebase";

// Call on page mount for Parent / Driver / Supervisor
export async function registerFcmToken(uid: string) {
  if (!(await isSupported())) return null; // Safari macOS ok, iOS PWA no web push
  
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn("[FCM] VAPID key is missing in environment variables. Push notifications will not work.");
    return null;
  }
  
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return null;

  const messaging = getMessaging(app);
  
  try {
    const token = await getToken(messaging, { vapidKey });
    if (!token) return null;

    await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
    return token;
  } catch (error) {
      console.error("[FCM] Error getting token. Is your VAPID key correct?", error);
      return null;
  }
}

export async function unregisterFcmToken(uid: string, token: string) {
  await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(token) });
}

export function onForegroundNotification(cb: (payload: any) => void) {
  const messaging = getMessaging(app);
  return onMessage(messaging, cb);
}
