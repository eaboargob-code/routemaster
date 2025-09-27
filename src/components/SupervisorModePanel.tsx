'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Shield, 
  ShieldCheck, 
  ShieldX, 
  Eye, 
  Download, 
  Clock, 
  User, 
  MapPin,
  QrCode,
  Users,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import {
  supervisorModeService,
  SupervisorSession,
  SupervisorPermissions,
  AuditLogEntry,
  initializeSupervisorMode,
  startDriverSupervisorSession,
  endDriverSupervisorSession,
  isDriverSupervisorActive
} from '@/lib/supervisorMode';

interface SupervisorModePanelProps {
  driverId: string;
  driverName: string;
  onModeChange?: (isActive: boolean) => void;
  className?: string;
}

export const SupervisorModePanel: React.FC<SupervisorModePanelProps> = ({
  driverId,
  driverName,
  onModeChange,
  className = '',
}) => {
  const [isActive, setIsActive] = useState(false);
  const [currentSession, setCurrentSession] = useState<SupervisorSession | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [permissions, setPermissions] = useState<SupervisorPermissions>({
    canScanQR: true,
    canModifyPassengerStatus: true,
    canViewAuditTrail: true,
    canBulkOperations: true,
    canOverrideTimeValidation: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize supervisor mode on component mount
  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeSupervisorMode();
        const active = isDriverSupervisorActive();
        setIsActive(active);
        
        if (active) {
          const session = supervisorModeService.getCurrentSession();
          setCurrentSession(session);
          if (session) {
            setPermissions(session.permissions);
          }
        }
        
        // Load audit log
        const log = supervisorModeService.getAuditLog({ limit: 50 });
        setAuditLog(log);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize supervisor mode');
      }
    };

    initialize();
  }, []);

  // Handle supervisor mode toggle
  const handleModeToggle = async () => {
    setLoading(true);
    setError(null);

    try {
      if (isActive) {
        await endDriverSupervisorSession();
        setIsActive(false);
        setCurrentSession(null);
      } else {
        const session = await startDriverSupervisorSession(driverId, driverName, permissions);
        setIsActive(true);
        setCurrentSession(session);
      }
      
      // Refresh audit log
      const log = supervisorModeService.getAuditLog({ limit: 50 });
      setAuditLog(log);
      
      onModeChange?.(isActive);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle supervisor mode');
    } finally {
      setLoading(false);
    }
  };

  // Handle permission change
  const handlePermissionChange = async (permission: keyof SupervisorPermissions, value: boolean) => {
    const newPermissions = { ...permissions, [permission]: value };
    setPermissions(newPermissions);

    // If supervisor mode is active, restart session with new permissions
    if (isActive) {
      try {
        await endDriverSupervisorSession();
        const session = await startDriverSupervisorSession(driverId, driverName, newPermissions);
        setCurrentSession(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update permissions');
      }
    }
  };

  // Export audit log
  const handleExportAuditLog = () => {
    const csvData = supervisorModeService.exportAuditLog('csv');
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Format timestamp
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Get action icon
  const getActionIcon = (action: string) => {
    switch (action) {
      case 'boarding':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'dropping':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'bulk_operation':
        return <Users className="h-4 w-4 text-blue-500" />;
      case 'manual_override':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <QrCode className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isActive ? (
            <ShieldCheck className="h-5 w-5 text-green-500" />
          ) : (
            <Shield className="h-5 w-5 text-gray-500" />
          )}
          Supervisor Mode
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {isActive ? 'Active' : 'Inactive'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="control" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="control">Control</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          </TabsList>

          <TabsContent value="control" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Supervisor Mode</h3>
                <p className="text-sm text-muted-foreground">
                  Enable QR scanning and passenger management
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={handleModeToggle}
                disabled={loading}
              />
            </div>

            {currentSession && (
              <div className="space-y-2 p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span className="font-medium">{currentSession.driverName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">
                    Started: {formatTimestamp(currentSession.startTime)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm">Session ID: {currentSession.sessionId}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted rounded-lg text-center">
                <QrCode className="h-6 w-6 mx-auto mb-1" />
                <p className="text-sm font-medium">QR Scanning</p>
                <p className="text-xs text-muted-foreground">
                  {permissions.canScanQR ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <Users className="h-6 w-6 mx-auto mb-1" />
                <p className="text-sm font-medium">Bulk Operations</p>
                <p className="text-xs text-muted-foreground">
                  {permissions.canBulkOperations ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">QR Code Scanning</p>
                  <p className="text-sm text-muted-foreground">
                    Allow scanning student QR codes
                  </p>
                </div>
                <Switch
                  checked={permissions.canScanQR}
                  onCheckedChange={(value) => handlePermissionChange('canScanQR', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Modify Passenger Status</p>
                  <p className="text-sm text-muted-foreground">
                    Change boarding/dropping status
                  </p>
                </div>
                <Switch
                  checked={permissions.canModifyPassengerStatus}
                  onCheckedChange={(value) => handlePermissionChange('canModifyPassengerStatus', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">View Audit Trail</p>
                  <p className="text-sm text-muted-foreground">
                    Access scan history and logs
                  </p>
                </div>
                <Switch
                  checked={permissions.canViewAuditTrail}
                  onCheckedChange={(value) => handlePermissionChange('canViewAuditTrail', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Bulk Operations</p>
                  <p className="text-sm text-muted-foreground">
                    Scan multiple students at once
                  </p>
                </div>
                <Switch
                  checked={permissions.canBulkOperations}
                  onCheckedChange={(value) => handlePermissionChange('canBulkOperations', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Override Time Validation</p>
                  <p className="text-sm text-muted-foreground">
                    Bypass 30-second scan cooldown
                  </p>
                </div>
                <Switch
                  checked={permissions.canOverrideTimeValidation}
                  onCheckedChange={(value) => handlePermissionChange('canOverrideTimeValidation', value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Audit Trail</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportAuditLog}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>

            <ScrollArea className="h-[400px] w-full">
              <div className="space-y-2">
                {auditLog.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No audit entries found
                  </p>
                ) : (
                  auditLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 border rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getActionIcon(entry.action)}
                          <span className="font-medium">{entry.studentName}</span>
                          <Badge variant="outline" className="text-xs">
                            {entry.action}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        <p>Driver: {entry.driverName}</p>
                        {entry.tripId && <p>Trip: {entry.tripId}</p>}
                        {entry.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>
                              {entry.location.latitude.toFixed(6)}, {entry.location.longitude.toFixed(6)}
                            </span>
                          </div>
                        )}
                        {entry.metadata?.reason && (
                          <p className="italic">Reason: {entry.metadata.reason}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SupervisorModePanel;