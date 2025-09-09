

"use client";

import * as React from "react";
import { useEffect, useState, type ReactNode, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldAlert, HeartHandshake, Bell } from "lucide-react";
import { DebugBanner } from "@/app/admin/components/DebugBanner";
import { onForegroundNotification, logBell, registerFcmToken } from "@/lib/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { collection, onSnapshot, query, orderBy, limit, Timestamp, writeBatch, doc, getDoc, where, getDocs, serverTimestamp } from "firebase/firestore";
import { scol, sdoc } from "@/lib/schoolPath";
import { formatRelative } from "@/lib/utils";

interface Notification {
    id: string;
    title: string;
    body: string;
    createdAt: Timestamp;
    read: boolean;
    data?: {
      studentName?: string;
      studentId?: string;
      status?: string;
    }
}

interface Student {
  id: string;
  name: string;
  assignedRouteId?: string;
  assignedBusId?: string;
  routeName?: string;
  busCode?: string;
  schoolId: string;
}

// --- useInbox Hook ---
function useInbox() {
  const { user, profile } = useProfile();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.uid || !profile?.schoolId) return;

    const q = query(
      scol(profile.schoolId, `users/${user.uid}/inbox`),
      orderBy("createdAt", "desc"),
      limit(25)
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows: Notification[] = [];
      snap.forEach(d => rows.push({ id: d.id, ...(d.data() as any) }));
      setItems(rows);
      setUnreadCount(rows.filter(r => !r.read).length);
    }, (err) => {
      console.error("[Inbox] listener error:", err);
    });

    return () => unsub();
  }, [user?.uid, profile?.schoolId]);
  
  const handleMarkAsRead = useCallback(async () => {
    if (!user?.uid || !profile?.schoolId) return;
    const toMark = items.filter(i => !i.read).slice(0, 25);
    if (toMark.length === 0) return;

    const batch = writeBatch(db);
    toMark.forEach(n => {
        const notifRef = sdoc(profile!.schoolId, `users/${user.uid}/inbox`, n.id);
        batch.update(notifRef, { read: true, readAt: serverTimestamp() });
    });
    
    await batch.commit().catch(err => console.error("Failed to mark notifications as read", err));
  }, [user?.uid, profile?.schoolId, items]);

  return { items, unreadCount, handleMarkAsRead };
}

function Header({ notifications, unreadCount, onMarkAsRead, childNameMap }: { notifications: Notification[], unreadCount: number, onMarkAsRead: () => void, childNameMap: Map<string, string> }) {
    const router = useRouter();
    const handleLogout = async () => {
        await signOut(auth);
        router.push("/parent/login");
    };

    return (
         <header className="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 z-50">
            <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
                <a href="/parent" className="flex items-center gap-2 text-lg font-semibold md:text-base">
                    <HeartHandshake className="h-6 w-6 text-primary" />
                    <span className="font-bold">RouteMaster Parent</span>
                </a>
            </nav>
             <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
                <div className="ml-auto flex-1 sm:flex-initial" />
                 <DropdownMenu onOpenChange={(open) => { if (open) onMarkAsRead() }}>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5" />
                            {unreadCount > 0 && (
                                <Badge className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-full p-1 text-xs">
                                    {unreadCount}
                                </Badge>
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {notifications.length > 0 ? (
                            <>
                                {notifications.map(n => {
                                     const name = n.data?.studentName || childNameMap.get(n.data?.studentId || '') || 'Student';
                                     const statusText = n.data?.status === 'boarded' ? 'is boarded' : n.data?.status === 'dropped' ? 'is dropped' : n.body ?? '';
                                     return (
                                     <DropdownMenuItem key={n.id} className="flex-col items-start gap-1 whitespace-normal">
                                        <div className={`font-semibold ${!n.read ? '' : 'text-muted-foreground'}`}>{n.title}</div>
                                        <div className={`text-sm ${!n.read ? 'text-muted-foreground' : 'text-muted-foreground/80'}`}>
                                            {n.body || `${name} ${statusText}`}
                                        </div>
                                        <div className="text-xs text-muted-foreground/80 mt-1">{formatRelative(n.createdAt)}</div>
                                    </DropdownMenuItem>
                                     )
                                })}
                            </>
                        ) : (
                            <DropdownMenuItem disabled>No new notifications</DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={handleLogout} variant="outline" size="sm">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                </Button>
            </div>
        </header>
    )
}

function LoadingScreen() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-muted-foreground">Verifying access...</p>
            </div>
        </div>
    );
}

function AccessDeniedScreen({ message, details }: { message: string, details?: string }) {
     const router = useRouter();
     return (
         <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4 text-center p-4 max-w-md mx-auto">
                <ShieldAlert className="h-12 w-12 text-destructive" />
                <h1 className="text-2xl font-bold text-destructive">{message}</h1>
                <p className="text-muted-foreground">
                    {details || "Please contact your administrator if you believe this is an error."}
                </p>
                <div className="flex gap-4 mt-4">
                    <Button onClick={() => signOut(auth).then(() => router.push('/parent/login'))}>Parent Login</Button>
                    <Button variant="outline" onClick={() => signOut(auth).then(() => router.push('/login'))}>Admin Login</Button>
                </div>
            </div>
        </div>
     )
}

export function ParentGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, profile, loading: profileLoading, error } = useProfile();
  const { toast } = useToast();
  const { items: notifications, unreadCount, handleMarkAsRead } = useInbox();
  
  // --- Data fetching for children, now in the layout ---
  const [childrenList, setChildrenList] = useState<Student[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
      (async () => {
        await registerFcmToken(user.uid);
      })();
    }
  }, [user?.uid]);
  
  useEffect(() => {
    if (!profileLoading && !user) {
        router.replace("/parent/login");
    }
  }, [user, profileLoading, router]);

  useEffect(() => {
    const fetchChildrenData = async () => {
      if (!user || !profile?.schoolId) return;
      setChildrenLoading(true);
      setChildrenError(null);

      try {
        const parentLinkRef = sdoc(profile.schoolId, "parentStudents", user.uid);
        const linkDocSnap = await getDoc(parentLinkRef);
        const studentIds: string[] = (linkDocSnap.exists() && linkDocSnap.data().studentIds) || [];

        if (studentIds.length === 0) {
          setChildrenList([]);
          setChildrenLoading(false);
          return;
        }

        const studentsQuery = query(
            scol(profile.schoolId, "students"), 
            where("__name__", "in", studentIds.slice(0, 30))
        );
        
        const studentsSnapshot = await getDocs(studentsQuery);
        const studentData = studentsSnapshot.docs.map((d) => ({ id: d.id, ...d.data(), schoolId: profile.schoolId } as Student));
        setChildrenList(studentData);

      } catch (e: any) {
        console.error("Failed to fetch parent data:", e);
        setChildrenError(e.message || "An unknown error occurred.");
      } finally {
        setChildrenLoading(false);
      }
    };

    if (!profileLoading && profile) {
        fetchChildrenData();
    }
  }, [user, profile, profileLoading]);
  
  const childNameMap = useMemo(() => new Map(childrenList.map(s => [s.id, s.name])), [childrenList]);
  
  // --- End data fetching ---

  useEffect(() => {
    if (!user?.uid || !profile?.schoolId) return;

    const unsubscribe = onForegroundNotification((notification) => {
        toast({
            title: notification.title,
            description: notification.body,
        });
        logBell(user.uid, profile!.schoolId, {
            title: notification.title || "New Notification",
            body: notification.body || "",
            data: notification.data,
        });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
  }, [user, profile, toast]);

  if (profileLoading || childrenLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return null;
  }
  
  if (error) {
    return <AccessDeniedScreen message="Profile Error" details={error.message} />;
  }
  
  if (!profile) {
    return <AccessDeniedScreen message="Profile Not Found" details="Your user profile could not be found." />;
  }
  
  if (profile.role !== 'parent') {
    return <AccessDeniedScreen message="Access Denied" details={`Your role is '${profile.role}'. You must have the 'parent' role to access this page.`} />;
  }

  // Clone the children and pass them down
  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      // @ts-ignore
      return React.cloneElement(child, { 
         profile: profile,
         childrenData: {
            students: childrenList,
            loading: childrenLoading,
            error: childrenError,
         }
      });
    }
    return child;
  });

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header 
        notifications={notifications} 
        unreadCount={unreadCount} 
        onMarkAsRead={handleMarkAsRead}
        childNameMap={childNameMap}
      />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8 mb-16">
        {childrenWithProps}
      </main>
      {user && <DebugBanner user={user} profile={profile} loading={profileLoading} />}
    </div>
  );
}

export default function ProtectedParentLayout({ children }: { children: ReactNode }) {
    return <ParentGuard>{children}</ParentGuard>
}
