"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/lib/useProfile";
import Link from "next/link";

type Props = {
  section?: "admin" | "driver" | "supervisor" | "parent";
  children: React.ReactNode;
};

export default function ClientShell({ section, children }: Props) {
  const { user, profile, loading, error, refresh } = useProfile();
  const [waitedMs, setWaitedMs] = useState(0);

  // Small timer so we can show “still waiting…” hints and avoid blank UI.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setWaitedMs((m) => m + 500), 500);
    return () => clearInterval(id);
  }, [loading]);

  // Gate by section/role (soft-gate; still show a helpful message)
  const role = profile?.role;

  const roleAllowed =
    !section ||
    (section === "admin" && role === "admin") ||
    (section === "driver" && role === "driver") ||
    (section === "supervisor" && role === "supervisor") ||
    (section === "parent" && role === "parent");

  // 1) Always render a visible loading state
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          <p className="text-sm text-muted-foreground">
            Authenticating{waitedMs > 4000 ? "… still waiting (check network & rules)" : "…"}
          </p>
        </div>
      </div>
    );
  }

  // 2) If hook surfaced an error, show it
  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-lg w-full rounded-lg border p-6 bg-background">
          <h2 className="text-lg font-semibold mb-1">Authentication Error</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {error.message || "Missing or insufficient permissions."}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => refresh?.()}
              className="px-3 py-2 rounded-md border hover:bg-muted"
            >
              Try again
            </button>
            <Link href="/login" className="px-3 py-2 rounded-md border hover:bg-muted">
              Go to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3) If not logged in (user is null) show login link
  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-lg w-full rounded-lg border p-6 bg-background">
          <h2 className="text-lg font-semibold mb-1">Not signed in</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Please sign in to continue.
          </p>
          <Link href="/login" className="px-3 py-2 rounded-md border hover:bg-muted">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  // 4) If profile exists but role doesn’t match the section we’re in
  if (!roleAllowed) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-lg w-full rounded-lg border p-6 bg-background">
          <h2 className="text-lg font-semibold mb-1">Access denied</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Your role (<code>{role ?? "unknown"}</code>) is not allowed to view this area.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="px-3 py-2 rounded-md border hover:bg-muted">
              Home
            </Link>
            <button onClick={() => refresh?.()} className="px-3 py-2 rounded-md border hover:bg-muted">
              Re-check profile
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5) All good — render app
  return <>{children}</>;
}
