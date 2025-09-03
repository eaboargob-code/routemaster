import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNowStrict } from "date-fns";
import type { Timestamp } from "firebase/firestore";
import { relativeFrom } from "./datetime";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelative(ts?: Timestamp | null) {
  return relativeFrom(ts);
}
