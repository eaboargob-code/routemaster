"use client";

import { useProfile } from "@/lib/useProfile";
import { Loader2 } from "lucide-react";

export default function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, profile, error } = useProfile();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Authenticating…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center">
          <p className="font-semibold">Authentication Error</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <a href="/login" className="text-primary underline mt-3 inline-block">
            Go to login
          </a>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center">
          <p className="font-semibold">Not signed in</p>
          <a href="/login" className="text-primary underline mt-3 inline-block">
            Go to login
          </a>
        </div>
      </div>
    );
  }

  if (profile.role !== "admin") {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center">
          <p className="font-semibold">Access denied</p>
          <p className="text-sm text-muted-foreground">Admin role required.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
