import type { ReactNode } from "react";
import ClientShell from "../ClientShell";

// ⬇️ This file stays a SERVER component. No "use client" here.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <ClientShell section="admin">{children}</ClientShell>;
}
