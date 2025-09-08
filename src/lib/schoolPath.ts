
import { db } from "@/lib/firebase";
import { collection, doc } from "firebase/firestore";

// use after you read profile.schoolId from /users/{uid}
export const scol = (schoolId: string, ...path: string[]) =>
  collection(db, "schools", schoolId, ...path);

export const sdoc = (schoolId: string, ...path: string[]) =>
  doc(db, "schools", schoolId, ...path);
