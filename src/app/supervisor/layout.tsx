
"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SupervisorGuard } from "./SupervisorGuard";

export default function SupervisorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith('/supervisor/login')) {
    return <>{children}</>;
  }

  return <SupervisorGuard>{children}</SupervisorGuard>;
}
