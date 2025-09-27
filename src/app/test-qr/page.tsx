'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QRScanner, ScanResult, StudentQRData } from '@/components/QRScanner';
import { SupervisorModePanel } from '@/components/SupervisorModePanel';
import { BulkQROperations } from '@/components/BulkQROperations';
import { QrCode, Shield, Users, TestTube } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function TestQRPage() {
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showSupervisorPanel, setShowSupervisorPanel] = useState(false);
  const [showBulkOperations, setShowBulkOperations] = useState(false);
  const [testMode, setTestMode] = useState<'normal' | 'offline' | 'supervisor'>('normal');
  const { toast } = useToast();

  // Mock student data for testing
  const mockStudents: StudentQRData[] = [
    {
      studentId: 'STU001',
      studentName: 'John Doe',
      schoolId: 'SCH001',
      signature: btoa('STU001-SCH001-default-secret'),
      grade: '5th',
      busRoute: 'Route A'
    },
    {
      studentId: 'STU002',
      studentName: 'Jane Smith',
      schoolId: 'SCH001',
      signature: btoa('STU002-SCH001-default-secret'),
      grade: '4th',
      busRoute: 'Route A'
    },
    {
      studentId: 'STU003',
      studentName: 'Mike Johnson',
      schoolId: 'SCH001',
      signature: btoa('STU003-SCH001-default-secret'),
      grade: '6th',
      busRoute: 'Route A'
    }
  ];

  const handleScanSuccess = (result: ScanResult) => {
    setScanResults(prev => [result, ...prev]);
    toast({
      title: 'Scan Successful',
      description: `${result.studentName} - ${result.action}`,
      variant: 'default',
    });
  };

  const handleScanError = (error: string) => {
    toast({
      title: 'Scan Failed',
      description: error,
      variant: 'destructive',
    });
  };

  const handleBulkComplete = (results: { processed: number; failed: number; batchId: string }) => {
    toast({
      title: 'Bulk Operation Complete',
      description: `Processed: ${results.processed}, Failed: ${results.failed}`,
      variant: results.failed === 0 ? 'default' : 'destructive',
    });
  };

  const simulateQRScan = (student: StudentQRData) => {
    const mockResult: ScanResult = {
      success: true,
      studentId: student.studentId,
      studentName: student.studentName,
      action: Math.random() > 0.5 ? 'boarding' : 'dropping',
      timestamp: Date.now(),
      auditId: `audit-${Date.now()}`
    };
    handleScanSuccess(mockResult);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-6 w-6" />
              QR Scanner Integration Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={() => setShowQRScanner(!showQRScanner)}
                className="flex items-center gap-2"
                variant={showQRScanner ? "default" : "outline"}
              >
                <QrCode className="h-4 w-4" />
                QR Scanner
              </Button>
              
              <Button
                onClick={() => setShowSupervisorPanel(!showSupervisorPanel)}
                className="flex items-center gap-2"
                variant={showSupervisorPanel ? "default" : "outline"}
              >
                <Shield className="h-4 w-4" />
                Supervisor Panel
              </Button>
              
              <Button
                onClick={() => setShowBulkOperations(!showBulkOperations)}
                className="flex items-center gap-2"
                variant={showBulkOperations ? "default" : "outline"}
              >
                <Users className="h-4 w-4" />
                Bulk Operations
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Mode Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Test Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={testMode === 'normal' ? 'default' : 'outline'}
                onClick={() => setTestMode('normal')}
              >
                Normal
              </Button>
              <Button
                size="sm"
                variant={testMode === 'offline' ? 'default' : 'outline'}
                onClick={() => setTestMode('offline')}
              >
                Offline
              </Button>
              <Button
                size="sm"
                variant={testMode === 'supervisor' ? 'default' : 'outline'}
                onClick={() => setTestMode('supervisor')}
              >
                Supervisor
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Mock Student Data for Testing */}
        <Card>
          <CardHeader>
            <CardTitle>Mock Student Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mockStudents.map((student) => (
                <div key={student.studentId} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <span className="font-medium">{student.studentName}</span>
                    <span className="text-sm text-gray-500 ml-2">({student.studentId})</span>
                    <Badge variant="outline" className="ml-2">{student.grade}</Badge>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => simulateQRScan(student)}
                  >
                    Simulate Scan
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Component Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* QR Scanner */}
          {showQRScanner && (
            <Card>
              <CardHeader>
                <CardTitle>QR Scanner</CardTitle>
              </CardHeader>
              <CardContent>
                <QRScanner
                  onScanSuccess={handleScanSuccess}
                  onScanError={handleScanError}
                  isActive={true}
                  isSupervisorMode={testMode === 'supervisor'}
                  cachedStudents={testMode === 'offline' ? mockStudents : undefined}
                  className="w-full"
                />
              </CardContent>
            </Card>
          )}

          {/* Supervisor Panel */}
          {showSupervisorPanel && (
            <Card>
              <CardHeader>
                <CardTitle>Supervisor Mode Panel</CardTitle>
              </CardHeader>
              <CardContent>
                <SupervisorModePanel />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Bulk Operations */}
        {showBulkOperations && (
          <Card>
            <CardHeader>
              <CardTitle>Bulk QR Operations</CardTitle>
            </CardHeader>
            <CardContent>
              <BulkQROperations
                tripId="test-trip-001"
                onOperationComplete={handleBulkComplete}
              />
            </CardContent>
          </Card>
        )}

        {/* Scan Results */}
        <Card>
          <CardHeader>
            <CardTitle>Scan Results ({scanResults.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {scanResults.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No scans yet. Use the simulate buttons or QR scanner to test functionality.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {scanResults.map((result, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <span className="font-medium">{result.studentName}</span>
                      <span className="text-sm text-gray-500 ml-2">({result.studentId})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={result.action === 'boarding' ? 'default' : 'secondary'}>
                        {result.action}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Test Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p><strong>1. QR Scanner:</strong> Test camera access and QR code scanning functionality</p>
              <p><strong>2. Supervisor Panel:</strong> Test supervisor mode activation and permissions</p>
              <p><strong>3. Bulk Operations:</strong> Test batch processing of multiple students</p>
              <p><strong>4. Audio Feedback:</strong> Listen for different sounds on success/error</p>
              <p><strong>5. Offline Mode:</strong> Test with cached student data when offline</p>
              <p><strong>6. Simulate Scans:</strong> Use mock data buttons to test without QR codes</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}