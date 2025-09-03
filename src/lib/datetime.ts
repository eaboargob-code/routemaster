import { Timestamp } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';

export function fromAnyTs(v?: Timestamp | { toMillis: () => number } | Date | number | null) {
  if (!v) return null;
  if (v instanceof Date) return v;
  // Firestore Timestamp or anything with toMillis
  if (typeof (v as any)?.toMillis === 'function') {
    return new Date((v as any).toMillis());
  }
  if (typeof v === 'number') return new Date(v);
  return null;
}

export function relativeFrom(v?: Timestamp | { toMillis: () => number } | Date | number | null) {
  const d = fromAnyTs(v);
  if (!d) return '';
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  return formatDistanceToNow(d, { addSuffix: true });
}
