"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DriverGuard } from "./DriverGuard";

export default function DriverLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The login page is public and does not require any auth checks.
  if (pathname?.startsWith('/driver/login')) {
    return <>{children}</>;
  }

  // All other routes under /driver are protected by the guard.
  return <DriverGuard>{children}</DriverGuard>;
}
