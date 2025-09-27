import { offlineCache } from './offlineCache';

// Types for supervisor mode
export interface SupervisorPermissions {
  canScanQR: boolean;
  canModifyPassengerStatus: boolean;
  canViewAuditTrail: boolean;
  canBulkOperations: boolean;
  canOverrideTimeValidation: boolean;
}

export interface AuditLogEntry {
  id: string;
  driverId: string;
  driverName: string;
  action: 'boarding' | 'dropping' | 'manual_override' | 'bulk_operation';
  studentId: string;
  studentName: string;
  timestamp: number;
  tripId?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  metadata?: {
    scanMethod: 'qr' | 'manual';
    previousStatus?: string;
    reason?: string;
    batchId?: string;
  };
}

export interface SupervisorSession {
  driverId: string;
  driverName: string;
  sessionId: string;
  startTime: number;
  permissions: SupervisorPermissions;
  isActive: boolean;
}

class SupervisorModeService {
  private currentSession: SupervisorSession | null = null;
  private auditLog: AuditLogEntry[] = [];
  private readonly STORAGE_KEY = 'supervisor_session';
  private readonly AUDIT_LOG_KEY = 'audit_log';

  // Initialize supervisor mode
  async initializeSupervisorMode(): Promise<void> {
    try {
      // Load existing session from localStorage
      const savedSession = localStorage.getItem(this.STORAGE_KEY);
      if (savedSession) {
        const session = JSON.parse(savedSession) as SupervisorSession;
        // Check if session is still valid (within 8 hours)
        if (Date.now() - session.startTime < 8 * 60 * 60 * 1000) {
          this.currentSession = session;
        } else {
          this.endSupervisorSession();
        }
      }

      // Load audit log
      const savedAuditLog = localStorage.getItem(this.AUDIT_LOG_KEY);
      if (savedAuditLog) {
        this.auditLog = JSON.parse(savedAuditLog);
      }
    } catch (error) {
      console.error('Failed to initialize supervisor mode:', error);
    }
  }

  // Start supervisor session
  async startSupervisorSession(
    driverId: string,
    driverName: string,
    permissions: Partial<SupervisorPermissions> = {}
  ): Promise<SupervisorSession> {
    const defaultPermissions: SupervisorPermissions = {
      canScanQR: true,
      canModifyPassengerStatus: true,
      canViewAuditTrail: true,
      canBulkOperations: true,
      canOverrideTimeValidation: false,
      ...permissions,
    };

    const session: SupervisorSession = {
      driverId,
      driverName,
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: Date.now(),
      permissions: defaultPermissions,
      isActive: true,
    };

    this.currentSession = session;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));

    // Log session start
    await this.logAuditEntry({
      action: 'manual_override',
      studentId: 'system',
      studentName: 'System',
      metadata: {
        scanMethod: 'manual',
        reason: 'Supervisor session started',
      },
    });

    return session;
  }

  // End supervisor session
  async endSupervisorSession(): Promise<void> {
    if (this.currentSession) {
      // Log session end
      await this.logAuditEntry({
        action: 'manual_override',
        studentId: 'system',
        studentName: 'System',
        metadata: {
          scanMethod: 'manual',
          reason: 'Supervisor session ended',
        },
      });

      this.currentSession = null;
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  // Check if supervisor mode is active
  isSupervisorModeActive(): boolean {
    return this.currentSession?.isActive || false;
  }

  // Get current session
  getCurrentSession(): SupervisorSession | null {
    return this.currentSession;
  }

  // Check specific permission
  hasPermission(permission: keyof SupervisorPermissions): boolean {
    if (!this.currentSession?.isActive) return false;
    return this.currentSession.permissions[permission];
  }

  // Log audit entry
  async logAuditEntry(entry: Omit<AuditLogEntry, 'id' | 'driverId' | 'driverName' | 'timestamp'>): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active supervisor session');
    }

    const auditEntry: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      driverId: this.currentSession.driverId,
      driverName: this.currentSession.driverName,
      timestamp: Date.now(),
      ...entry,
    };

    this.auditLog.push(auditEntry);
    
    // Keep only last 1000 entries to prevent storage bloat
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    // Save to localStorage
    localStorage.setItem(this.AUDIT_LOG_KEY, JSON.stringify(this.auditLog));

    // Also cache in offline storage for sync
    try {
      await offlineCache.cacheScanResult(
        entry.studentId,
        entry.studentName,
        entry.action === 'boarding' || entry.action === 'dropping' ? entry.action : 'boarding',
        entry.tripId
      );
    } catch (error) {
      console.warn('Failed to cache audit entry for sync:', error);
    }

    return auditEntry.id;
  }

  // Get audit log
  getAuditLog(filters?: {
    studentId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): AuditLogEntry[] {
    let filteredLog = [...this.auditLog];

    if (filters) {
      if (filters.studentId) {
        filteredLog = filteredLog.filter(entry => entry.studentId === filters.studentId);
      }
      if (filters.action) {
        filteredLog = filteredLog.filter(entry => entry.action === filters.action);
      }
      if (filters.startDate) {
        filteredLog = filteredLog.filter(entry => entry.timestamp >= filters.startDate!.getTime());
      }
      if (filters.endDate) {
        filteredLog = filteredLog.filter(entry => entry.timestamp <= filters.endDate!.getTime());
      }
      if (filters.limit) {
        filteredLog = filteredLog.slice(-filters.limit);
      }
    }

    return filteredLog.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Validate QR scan permission
  async validateQRScanPermission(studentId: string): Promise<{
    allowed: boolean;
    reason?: string;
    requiresOverride?: boolean;
  }> {
    if (!this.isSupervisorModeActive()) {
      return {
        allowed: false,
        reason: 'Supervisor mode not active',
      };
    }

    if (!this.hasPermission('canScanQR')) {
      return {
        allowed: false,
        reason: 'No QR scanning permission',
      };
    }

    // Check for recent scans (time validation)
    const recentScans = this.auditLog.filter(
      entry => 
        entry.studentId === studentId && 
        Date.now() - entry.timestamp < 30000 // 30 seconds
    );

    if (recentScans.length > 0 && !this.hasPermission('canOverrideTimeValidation')) {
      return {
        allowed: false,
        reason: 'Recent scan detected (within 30 seconds)',
        requiresOverride: true,
      };
    }

    return { allowed: true };
  }

  // Perform supervised QR scan
  async performSupervisedScan(
    studentId: string,
    studentName: string,
    action: 'boarding' | 'dropping',
    tripId?: string,
    location?: { latitude: number; longitude: number },
    override?: boolean
  ): Promise<{
    success: boolean;
    auditId?: string;
    error?: string;
  }> {
    try {
      // Validate permission
      const validation = await this.validateQRScanPermission(studentId);
      if (!validation.allowed && !override) {
        return {
          success: false,
          error: validation.reason,
        };
      }

      // Log the scan
      const auditId = await this.logAuditEntry({
        action,
        studentId,
        studentName,
        tripId,
        location,
        metadata: {
          scanMethod: 'qr',
          reason: override ? 'Manual override applied' : undefined,
        },
      });

      return {
        success: true,
        auditId,
      };
    } catch (error) {
      console.error('Failed to perform supervised scan:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Bulk operation support
  async performBulkOperation(
    operations: Array<{
      studentId: string;
      studentName: string;
      action: 'boarding' | 'dropping';
    }>,
    tripId?: string,
    location?: { latitude: number; longitude: number }
  ): Promise<{
    success: boolean;
    processed: number;
    failed: number;
    batchId?: string;
    errors?: string[];
  }> {
    if (!this.hasPermission('canBulkOperations')) {
      return {
        success: false,
        processed: 0,
        failed: operations.length,
        errors: ['No bulk operations permission'],
      };
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const operation of operations) {
      try {
        await this.logAuditEntry({
          action: 'bulk_operation',
          studentId: operation.studentId,
          studentName: operation.studentName,
          tripId,
          location,
          metadata: {
            scanMethod: 'manual',
            batchId,
            reason: `Bulk ${operation.action}`,
          },
        });
        processed++;
      } catch (error) {
        failed++;
        errors.push(`${operation.studentName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: failed === 0,
      processed,
      failed,
      batchId,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // Export audit log for reporting
  exportAuditLog(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = [
        'ID',
        'Driver ID',
        'Driver Name',
        'Action',
        'Student ID',
        'Student Name',
        'Timestamp',
        'Trip ID',
        'Location',
        'Scan Method',
        'Reason',
      ];

      const rows = this.auditLog.map(entry => [
        entry.id,
        entry.driverId,
        entry.driverName,
        entry.action,
        entry.studentId,
        entry.studentName,
        new Date(entry.timestamp).toISOString(),
        entry.tripId || '',
        entry.location ? `${entry.location.latitude},${entry.location.longitude}` : '',
        entry.metadata?.scanMethod || '',
        entry.metadata?.reason || '',
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify(this.auditLog, null, 2);
  }

  // Clear audit log (admin function)
  clearAuditLog(): void {
    this.auditLog = [];
    localStorage.removeItem(this.AUDIT_LOG_KEY);
  }
}

// Export singleton instance
export const supervisorModeService = new SupervisorModeService();

// Utility functions
export const initializeSupervisorMode = async (): Promise<void> => {
  await supervisorModeService.initializeSupervisorMode();
};

export const startDriverSupervisorSession = async (
  driverId: string,
  driverName: string,
  permissions?: Partial<SupervisorPermissions>
): Promise<SupervisorSession> => {
  return await supervisorModeService.startSupervisorSession(driverId, driverName, permissions);
};

export const endDriverSupervisorSession = async (): Promise<void> => {
  await supervisorModeService.endSupervisorSession();
};

export const isDriverSupervisorActive = (): boolean => {
  return supervisorModeService.isSupervisorModeActive();
};

export const performDriverQRScan = async (
  studentId: string,
  studentName: string,
  action: 'boarding' | 'dropping',
  tripId?: string,
  location?: { latitude: number; longitude: number },
  override?: boolean
): Promise<{ success: boolean; auditId?: string; error?: string }> => {
  return await supervisorModeService.performSupervisedScan(
    studentId,
    studentName,
    action,
    tripId,
    location,
    override
  );
};