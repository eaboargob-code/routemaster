

"use client";

import { useEffect, useMemo, useState } from "react";
import { useProfile } from "@/lib/useProfile";
import {
  query,
  where,
  getDocs,
  getDoc,
  type DocumentData,
} from "firebase/firestore";
import { scol, sdoc } from "@/lib/schoolPath";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Users,
  Frown,
  Bus,
  Route as RouteIcon,
  UserX,
  ArrowDownCircle,
  Clock,
} from "lucide-react";
import type { Notification } from "./layout";
import { Badge } from "@/components/ui/badge";

/* ---------------- types ---------------- */

type Student = {
  id: string;
  name: string;
  schoolId: string;
  busCode?: string;
  routeName?: string;
};

/* --------------- child card --------------- */

function StudentCard({ student, notifications }: { student: Student, notifications: Notification[] }) {
    const latestStatusNotification = useMemo(() => {
        return notifications
            .filter(n => n.data?.kind === 'passengerStatus' && n.data?.studentId === student.id)
            .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
            [0];
    }, [notifications, student.id]);

    const status = latestStatusNotification?.data?.status || 'pending';
    const statusText = latestStatusNotification?.body || `Awaiting check-in for ${student.name}.`;

    const getStatusBadge = () => {
        const badgeContent: Record<string, React.ReactNode> = {
            pending: <><Clock className="h-3 w-3 mr-1.5" />Awaiting Check-in</>,
            boarded: <><Bus className="h-3 w-3 mr-1.5" />On Bus</>,
            dropped: <><ArrowDownCircle className="h-3 w-3 mr-1.5" />Dropped Off</>,
            absent: <><UserX className="h-3 w-3 mr-1.5" />Marked Absent</>,
        };

        return (
            <Badge
                variant={
                    status === 'boarded'
                    ? 'default'
                    : status === 'dropped'
                    ? 'secondary'
                    : status === 'absent'
                    ? 'destructive'
                    : 'outline'
                }
                className="capitalize"
            >
                {badgeContent[status] || status}
            </Badge>
        );
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle>{student.name}</CardTitle>
                    <CardDescription className="flex flex-col gap-1 mt-2">
                    {student.busCode ? (
                        <span className="flex items-center gap-2">
                        <Bus className="h-4 w-4" /> {student.busCode}
                        </span>
                    ) : (
                        <span className="flex items-center gap-2 text-muted-foreground">
                        <Bus className="h-4 w-4" /> No bus assigned
                        </span>
                    )}
                    {student.routeName ? (
                        <span className="flex items-center gap-2">
                        <RouteIcon className="h-4 w-4" /> {student.routeName}
                        </span>
                    ) : (
                        <span className="flex items-center gap-2 text-muted-foreground">
                        <RouteIcon className="h-4 w-4" /> No route assigned
                        </span>
                    )}
                    </CardDescription>
                </div>
                {getStatusBadge()}
                </div>
            </CardHeader>
             <CardContent>
                <p className="text-sm text-muted-foreground">{statusText}</p>
            </CardContent>
        </Card>
    );
}


/* --------------- page --------------- */

export default function ParentDashboardPage({ notifications = [] }: { notifications?: Notification[] }) {
  const { user, profile, loading: profileLoading } = useProfile();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChildrenData = async () => {
      if (!user || !profile?.schoolId) return;
      setLoading(true);
      setError(null);

      try {
        const linkRef = sdoc(profile.schoolId, "parentStudents", user.uid);
        const linkSnap = await getDoc(linkRef);
        const studentIds: string[] =
          (linkSnap.exists() && linkSnap.data().studentIds) || [];

        if (studentIds.length === 0) {
          setStudents([]);
          setLoading(false);
          return;
        }

        const studentsQ = query(
          scol(profile.schoolId, "students"),
          where("__name__", "in", studentIds.slice(0, 30))
        );
        const studentsSnap = await getDocs(studentsQ);
        const rows = studentsSnap.docs.map(
          (d) =>
            ({
              id: d.id,
              ...d.data(),
              schoolId: profile.schoolId,
            } as Student)
        );
        setStudents(rows);
      } catch (e: any) {
        console.error("Failed to fetch parent data:", e);
        setError(e.message || "An unknown error occurred.");
      } finally {
        setLoading(false);
      }
    };

    if (!profileLoading && profile) fetchChildrenData();
  }, [user, profile, profileLoading]);

  if (loading || profileLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-1/2 mb-4" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Parent Dashboard</CardTitle>
          <CardDescription>
            Welcome, {profile?.displayName || "Parent"}. Real-time status for
            your children will appear as notifications.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            My Children
          </h2>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!error && students.length === 0 && (
            <div className="mt-4 border rounded-lg p-8 text-center text-muted-foreground">
              <Frown className="mx-auto h-12 w-12" />
              <p className="mt-4 font-semibold">No Children Found</p>
              <p>
                No students are currently linked to your account. Please contact
                the school administrator.
              </p>
            </div>
          )}

          {students.map((s) => (
            <StudentCard key={s.id} student={s} notifications={notifications} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
