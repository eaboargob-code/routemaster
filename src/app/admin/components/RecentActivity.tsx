"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  UserPlus,
  Bus,
  Route,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  type: "user_created" | "trip_started" | "trip_ended" | "route_created" | "bus_added" | "alert";
  title: string;
  description: string;
  timestamp: Date;
  user?: string;
  status?: "success" | "warning" | "error";
}

interface RecentActivityProps {
  activities: ActivityItem[];
  loading?: boolean;
}

export function RecentActivity({ activities, loading = false }: RecentActivityProps) {
  const getActivityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "user_created":
        return <UserPlus className="h-4 w-4 text-blue-600" />;
      case "trip_started":
        return <Activity className="h-4 w-4 text-green-600" />;
      case "trip_ended":
        return <CheckCircle className="h-4 w-4 text-gray-600" />;
      case "route_created":
        return <Route className="h-4 w-4 text-purple-600" />;
      case "bus_added":
        return <Bus className="h-4 w-4 text-orange-600" />;
      case "alert":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status?: ActivityItem["status"]) => {
    if (!status) return null;
    
    const variants = {
      success: "bg-green-100 text-green-800",
      warning: "bg-yellow-100 text-yellow-800",
      error: "bg-red-100 text-red-800",
    };

    return (
      <Badge variant="secondary" className={variants[status]}>
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent activity</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-shrink-0 p-2 bg-gray-100 rounded-full">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {activity.title}
                      </h4>
                      {getStatusBadge(activity.status)}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>
                        {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                      </span>
                      {activity.user && (
                        <>
                          <span>•</span>
                          <span>by {activity.user}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export function RecentActivityLoading() {
  return <RecentActivity activities={[]} loading={true} />;
}