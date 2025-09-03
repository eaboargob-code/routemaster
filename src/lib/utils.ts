import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { relativeFrom } from "./datetime";
import type { Timestamp } from "firebase/firestore";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelative(ts?: Timestamp | null) {
  return relativeFrom(ts);
}
