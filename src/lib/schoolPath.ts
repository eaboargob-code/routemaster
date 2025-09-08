// src/lib/schoolPath.ts
import { collection, doc, type Firestore } from "firebase/firestore";
import { db } from "./firebase";

/** school collection path, e.g. schools/TRP001/trips */
export function scol(schoolId: string, coll: string) {
  return collection(db, "schools", schoolId, coll);
}

/** school doc path, e.g. schools/TRP001/trips/abc */
export function sdoc(schoolId: string, coll: string, id: string) {
  return doc(db, "schools", schoolId, coll, id);
}
