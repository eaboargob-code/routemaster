import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { StudentQRData } from '@/components/QRScanner';

// Database schema
interface OfflineCacheDB extends DBSchema {
  students: {
    key: string;
    value: StudentQRData & {
      lastUpdated: number;
      routeId?: string;
      busId?: string;
    };
    indexes: { 'by-school': string; 'by-route': string };
  };
  scanHistory: {
    key: string;
    value: {
      id: string;
      studentId: string;
      studentName: string;
      action: 'boarding' | 'dropping';
      timestamp: number;
      tripId?: string;
      synced: boolean;
    };
    indexes: { 'by-student': string; 'by-trip': string; 'by-synced': boolean };
  };
  metadata: {
    key: string;
    value: {
      lastSync: number;
      version: number;
      schoolId: string;
    };
  };
}

class OfflineCache {
  private db: IDBPDatabase<OfflineCacheDB> | null = null;
  private readonly DB_NAME = 'RoutemasterOfflineCache';
  private readonly DB_VERSION = 1;

  // Initialize database
  async init(): Promise<void> {
    try {
      this.db = await openDB<OfflineCacheDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          // Students store
          const studentsStore = db.createObjectStore('students', { keyPath: 'studentId' });
          studentsStore.createIndex('by-school', 'schoolId');
          studentsStore.createIndex('by-route', 'routeId');

          // Scan history store
          const scanHistoryStore = db.createObjectStore('scanHistory', { keyPath: 'id' });
          scanHistoryStore.createIndex('by-student', 'studentId');
          scanHistoryStore.createIndex('by-trip', 'tripId');
          scanHistoryStore.createIndex('by-synced', 'synced');

          // Metadata store
          db.createObjectStore('metadata', { keyPath: 'key' });
        },
      });
    } catch (error) {
      console.error('Failed to initialize offline cache:', error);
      throw error;
    }
  }

  // Ensure database is initialized
  private async ensureDB(): Promise<IDBPDatabase<OfflineCacheDB>> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  // Cache student data
  async cacheStudents(students: StudentQRData[], schoolId: string, routeId?: string): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction(['students', 'metadata'], 'readwrite');
    
    try {
      // Cache students
      for (const student of students) {
        await tx.objectStore('students').put({
          ...student,
          lastUpdated: Date.now(),
          routeId,
        });
      }

      // Update metadata
      await tx.objectStore('metadata').put({
        lastSync: Date.now(),
        version: this.DB_VERSION,
        schoolId,
      }, 'lastSync');

      await tx.done;
    } catch (error) {
      console.error('Failed to cache students:', error);
      throw error;
    }
  }

  // Get cached students
  async getCachedStudents(schoolId?: string, routeId?: string): Promise<StudentQRData[]> {
    const db = await this.ensureDB();
    
    try {
      let students;
      
      if (routeId) {
        students = await db.getAllFromIndex('students', 'by-route', routeId);
      } else if (schoolId) {
        students = await db.getAllFromIndex('students', 'by-school', schoolId);
      } else {
        students = await db.getAll('students');
      }

      return students.map(student => ({
        studentId: student.studentId,
        studentName: student.studentName,
        schoolId: student.schoolId,
        timestamp: student.timestamp,
        signature: student.signature,
      }));
    } catch (error) {
      console.error('Failed to get cached students:', error);
      return [];
    }
  }

  // Get specific student
  async getStudent(studentId: string): Promise<StudentQRData | null> {
    const db = await this.ensureDB();
    
    try {
      const student = await db.get('students', studentId);
      if (!student) return null;

      return {
        studentId: student.studentId,
        studentName: student.studentName,
        schoolId: student.schoolId,
        timestamp: student.timestamp,
        signature: student.signature,
      };
    } catch (error) {
      console.error('Failed to get student:', error);
      return null;
    }
  }

  // Cache scan result
  async cacheScanResult(
    studentId: string,
    studentName: string,
    action: 'boarding' | 'dropping',
    tripId?: string
  ): Promise<string> {
    const db = await this.ensureDB();
    const scanId = `${studentId}-${Date.now()}`;
    
    try {
      await db.put('scanHistory', {
        id: scanId,
        studentId,
        studentName,
        action,
        timestamp: Date.now(),
        tripId,
        synced: false,
      });

      return scanId;
    } catch (error) {
      console.error('Failed to cache scan result:', error);
      throw error;
    }
  }

  // Get unsynced scan results
  async getUnsyncedScans(): Promise<Array<{
    id: string;
    studentId: string;
    studentName: string;
    action: 'boarding' | 'dropping';
    timestamp: number;
    tripId?: string;
  }>> {
    const db = await this.ensureDB();
    
    try {
      return await db.getAllFromIndex('scanHistory', 'by-synced', false);
    } catch (error) {
      console.error('Failed to get unsynced scans:', error);
      return [];
    }
  }

  // Mark scans as synced
  async markScansAsSynced(scanIds: string[]): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction('scanHistory', 'readwrite');
    
    try {
      for (const scanId of scanIds) {
        const scan = await tx.store.get(scanId);
        if (scan) {
          await tx.store.put({ ...scan, synced: true });
        }
      }
      await tx.done;
    } catch (error) {
      console.error('Failed to mark scans as synced:', error);
      throw error;
    }
  }

  // Get scan history for a student
  async getStudentScanHistory(studentId: string): Promise<Array<{
    id: string;
    action: 'boarding' | 'dropping';
    timestamp: number;
    tripId?: string;
    synced: boolean;
  }>> {
    const db = await this.ensureDB();
    
    try {
      return await db.getAllFromIndex('scanHistory', 'by-student', studentId);
    } catch (error) {
      console.error('Failed to get student scan history:', error);
      return [];
    }
  }

  // Clear cache
  async clearCache(): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction(['students', 'scanHistory', 'metadata'], 'readwrite');
    
    try {
      await tx.objectStore('students').clear();
      await tx.objectStore('scanHistory').clear();
      await tx.objectStore('metadata').clear();
      await tx.done;
    } catch (error) {
      console.error('Failed to clear cache:', error);
      throw error;
    }
  }

  // Get cache statistics
  async getCacheStats(): Promise<{
    studentCount: number;
    unsyncedScans: number;
    lastSync: number | null;
    cacheSize: number;
  }> {
    const db = await this.ensureDB();
    
    try {
      const [studentCount, unsyncedScans, metadata] = await Promise.all([
        db.count('students'),
        db.countFromIndex('scanHistory', 'by-synced', false),
        db.get('metadata', 'lastSync'),
      ]);

      // Estimate cache size (rough calculation)
      const students = await db.getAll('students');
      const scans = await db.getAll('scanHistory');
      const cacheSize = JSON.stringify(students).length + JSON.stringify(scans).length;

      return {
        studentCount,
        unsyncedScans,
        lastSync: metadata?.lastSync || null,
        cacheSize,
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return {
        studentCount: 0,
        unsyncedScans: 0,
        lastSync: null,
        cacheSize: 0,
      };
    }
  }

  // Check if offline mode is available
  async isOfflineModeAvailable(): Promise<boolean> {
    try {
      const stats = await this.getCacheStats();
      return stats.studentCount > 0;
    } catch (error) {
      return false;
    }
  }

  // Sync with server (placeholder for actual implementation)
  async syncWithServer(
    uploadScans: (scans: any[]) => Promise<void>,
    downloadStudents: () => Promise<StudentQRData[]>
  ): Promise<{ uploaded: number; downloaded: number }> {
    try {
      // Upload unsynced scans
      const unsyncedScans = await this.getUnsyncedScans();
      if (unsyncedScans.length > 0) {
        await uploadScans(unsyncedScans);
        await this.markScansAsSynced(unsyncedScans.map(scan => scan.id));
      }

      // Download latest student data
      const students = await downloadStudents();
      if (students.length > 0) {
        // Assuming all students belong to the same school
        const schoolId = students[0].schoolId;
        await this.cacheStudents(students, schoolId);
      }

      return {
        uploaded: unsyncedScans.length,
        downloaded: students.length,
      };
    } catch (error) {
      console.error('Failed to sync with server:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const offlineCache = new OfflineCache();

// Utility functions
export const initializeOfflineCache = async (): Promise<void> => {
  await offlineCache.init();
};

export const cacheStudentsForOffline = async (
  students: StudentQRData[],
  schoolId: string,
  routeId?: string
): Promise<void> => {
  await offlineCache.cacheStudents(students, schoolId, routeId);
};

export const getCachedStudentsForScanning = async (
  schoolId?: string,
  routeId?: string
): Promise<StudentQRData[]> => {
  return await offlineCache.getCachedStudents(schoolId, routeId);
};

export const cacheScanForSync = async (
  studentId: string,
  studentName: string,
  action: 'boarding' | 'dropping',
  tripId?: string
): Promise<string> => {
  return await offlineCache.cacheScanResult(studentId, studentName, action, tripId);
};