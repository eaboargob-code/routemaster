"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Wifi,
  Database,
  Server,
  Users,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthCheck {
  id: string;
  name: string;
  status: "healthy" | "warning" | "error";
  message: string;
  lastChecked: Date;
}

interface SystemAlert {
  id: string;
  type: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}

interface SystemHealthProps {
  healthChecks: HealthCheck[];
  alerts: SystemAlert[];
  loading?: boolean;
}

export function SystemHealth({ healthChecks, alerts, loading = false }: SystemHealthProps) {
  const getStatusIcon = (status: HealthCheck["status"]) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusBadge = (status: HealthCheck["status"]) => {
    const variants = {
      healthy: "bg-green-100 text-green-800 border-green-200",
      warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
      error: "bg-red-100 text-red-800 border-red-200",
    };

    return (
      <Badge variant="outline" className={variants[status]}>
        {status}
      </Badge>
    );
  };

  const getAlertVariant = (type: SystemAlert["type"]) => {
    switch (type) {
      case "error":
        return "destructive";
      case "warning":
        return "default";
      default:
        return "default";
    }
  };

  const overallHealth = healthChecks.every(check => check.status === "healthy") 
    ? "healthy" 
    : healthChecks.some(check => check.status === "error") 
    ? "error" 
    : "warning";

  return (
    <div className="space-y-4">
      {/* System Health Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            System Health
            {getStatusBadge(overallHealth)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {healthChecks.map((check) => (
              <div
                key={check.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  check.status === "healthy" && "bg-green-50 border-green-200",
                  check.status === "warning" && "bg-yellow-50 border-yellow-200",
                  check.status === "error" && "bg-red-50 border-red-200"
                )}
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(check.status)}
                  <div>
                    <h4 className="text-sm font-medium">{check.name}</h4>
                    <p className="text-xs text-muted-foreground">{check.message}</p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {check.lastChecked.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* System Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              System Alerts
              <Badge variant="outline">{alerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <Alert key={alert.id} variant={getAlertVariant(alert.type)}>
                  <AlertTriangle className="h-4 w-4" />
                  <div className="flex-1">
                    <h4 className="font-medium">{alert.title}</h4>
                    <AlertDescription className="mt-1">
                      {alert.message}
                    </AlertDescription>
                  </div>
                  {alert.actionLabel && alert.actionHref && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={alert.actionHref} className="flex items-center gap-1">
                        {alert.actionLabel}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Default health checks for demo purposes
export const defaultHealthChecks: HealthCheck[] = [
  {
    id: "database",
    name: "Database Connection",
    status: "healthy",
    message: "All database connections are stable",
    lastChecked: new Date(),
  },
  {
    id: "firebase",
    name: "Firebase Services",
    status: "healthy",
    message: "Authentication and Firestore are operational",
    lastChecked: new Date(),
  },
  {
    id: "api",
    name: "API Endpoints",
    status: "healthy",
    message: "All API endpoints responding normally",
    lastChecked: new Date(),
  },
  {
    id: "storage",
    name: "File Storage",
    status: "healthy",
    message: "File uploads and downloads working",
    lastChecked: new Date(),
  },
];

export const defaultAlerts: SystemAlert[] = [];