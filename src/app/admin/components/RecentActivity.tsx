
"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableHead,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from 'date-fns';
import { getUsersByIds } from "@/lib/firestoreQueries";
import type { DocumentData, Timestamp } from "firebase/firestore";
import { AlertCircle, FileText } from "lucide-react";
import { collectionGroup, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Event extends DocumentData {
    action: 'boarded' | 'dropped' | 'absent';
    studentId: string;
    studentName?: string;
    ts: Timestamp;
    who: string;
    tripId: string;
}

interface RecentActivityProps {
    schoolId: string;
}

export function RecentActivity({ schoolId }: RecentActivityProps) {
    const [events, setEvents] = useState<Event[]>([]);
    const [users, setUsers] = useState<Record<string, DocumentData>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const fetchRecentActivity = async () => {
        if (!schoolId) {
          setLoading(false);
          return;
        }
        setLoading(true);

        try {
          // Use a collectionGroup query to get events across all trips for the school
          const eventsQuery = query(
            collectionGroup(db, 'events'),
            where('schoolId', '==', schoolId),
            orderBy('ts', 'desc'),
            limit(10)
          );

          const eventsSnapshot = await getDocs(eventsQuery);
          const fetchedEvents = eventsSnapshot.docs.map(doc => doc.data() as Event);
          setEvents(fetchedEvents);

          const uids = [...new Set(fetchedEvents.map(e => e.who).filter(Boolean))];
          if (uids.length > 0) {
              getUsersByIds(uids).then(userMap => {
                  setUsers(userMap);
              });
          }
        } catch (error) {
          console.error("Error fetching recent activity:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchRecentActivity();
    }, [schoolId]);


    const renderAction = (event: Event) => {
        const user = users[event.who] || { displayName: 'Unknown User' };
        const timeAgo = formatDistanceToNow(event.ts.toDate(), { addSuffix: true });
        
        switch (event.action) {
            case 'boarded':
                return `Student ${event.studentName || event.studentId} was boarded by ${user.displayName}.`;
            case 'dropped':
                return `Student ${event.studentName || event.studentId} was dropped off by ${user.displayName}.`;
            case 'absent':
                return `Student ${event.studentName || event.studentId} was marked absent by ${user.displayName}.`;
            default:
                return `An unknown action was performed.`
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>A log of recent student status changes across all trips.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? <RecentActivityLoading/> :
                events.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Activity</TableHead>
                                <TableHead className="text-right">Time</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {events.map((event, index) => (
                                <TableRow key={index}>
                                    <TableCell>{renderAction(event)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{formatDistanceToNow(event.ts.toDate(), { addSuffix: true })}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                 ) : (
                    <div className="flex flex-col items-center justify-center h-[200px] text-center">
                        <FileText className="h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-lg font-semibold">No Recent Activity</p>
                        <p className="text-muted-foreground">There have been no student status updates recently.</p>
                    </div>
                 )}
            </CardContent>
        </Card>
    );
}

export function RecentActivityLoading() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="space-y-2 pt-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
            </div>
        </div>
    )
}
