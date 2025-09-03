
import { onSnapshot, type DocumentReference, type Query } from "firebase/firestore";

/**
 * A wrapper for onSnapshot that provides more informative error logging.
 * @param ref - The document reference or query to listen to.
 * @param label - A descriptive label for the listener for logging purposes.
 * @param onData - The callback function to handle successful snapshots.
 * @returns An unsubscribe function.
 */
export function listenWithPath(
    ref: DocumentReference | Query,
    label: string,
    onData: (snap: any) => void
) {
  try {
    return onSnapshot(ref, onData, (err) => {
      console.error(`[FIRESTORE-LISTEN ERROR] ${label}:`, err);
    });
  } catch (e) {
    console.error(`[FIRESTORE-START ERROR] ${label}:`, e);
    return () => {};
  }
}
