
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

import { Button } from "@/components/ui/button";
import { Bus, LayoutDashboard, LogOut, Route, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };
  
  const navItems = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/routes", label: "Routes", icon: Route },
    { href: "/admin/buses", label: "Buses", icon: Bus },
    { href: "/admin/users", label: "Users", icon: Users },
  ];

  return (
    <header className="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 z-50">
      <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-lg font-semibold md:text-base"
        >
          <Bus className="h-6 w-6 text-primary" />
          <span className="font-bold">RouteMaster</span>
        </Link>
        {navItems.map((item) => (
           <Link
             key={item.href}
             href={item.href}
             className={cn(
               "transition-colors hover:text-foreground",
               pathname === item.href ? "text-foreground font-semibold" : "text-muted-foreground"
             )}
           >
             {item.label}
           </Link>
        ))}
      </nav>
      <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
        <div className="ml-auto flex-1 sm:flex-initial" />
        <Button onClick={handleLogout} variant="outline" size="sm">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
        </Button>
      </div>
    </header>
  );
}
