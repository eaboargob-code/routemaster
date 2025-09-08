import type { ReactNode } from "react";
import ClientShell from "../ClientShell";
import { AdminHeader } from "./components/header";

// ⬇️ This file stays a SERVER component. No "use client" here.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ClientShell section="admin">
      <div className="flex min-h-screen w-full flex-col">
        <AdminHeader />
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
          {children}
        </main>
      </div>
    </ClientShell>
  );
}
