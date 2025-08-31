
"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SupervisorGuard } from "./SupervisorGuard";
import { SharedAccessGuard } from "./SharedAccessGuard";

export default function SupervisorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith('/supervisor/login')) {
    return <>{children}</>;
  }

  // The trip detail page is shared between admins and supervisors
  if (pathname?.startsWith('/supervisor/trips/')) {
    return <SharedAccessGuard>{children}</SharedAccessGuard>;
  }

  // All other routes under /supervisor are for supervisors only.
  return <SupervisorGuard>{children}</SupervisorGuard>;
}
