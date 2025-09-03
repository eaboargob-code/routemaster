import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNowStrict } from "date-fns";
import type { Timestamp } from "firebase/firestore";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelative(ts?: Timestamp | null) {
  const d = ts?.toDate?.() as Date | undefined;
  if (!d) return "";
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}
