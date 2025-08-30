
"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SupervisorGuard } from "./SupervisorGuard";

export default function SupervisorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith('/supervisor/login')) {
    return <>{children}</>;
  }

  // All other routes under /supervisor are protected.
  // Note: The details page will also be wrapped by this guard.
  return <SupervisorGuard>{children}</SupervisorGuard>;
}
