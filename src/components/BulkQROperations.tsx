'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  Users, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Download,
  Upload,
  QrCode
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supervisorModeService, isDriverSupervisorActive } from '@/lib/supervisorMode';
import { getCachedStudentsForScanning } from '@/lib/offlineCache';
import { audioFeedbackService } from '@/lib/audioFeedback';
import { StudentQRData } from './QRScanner';

interface BulkOperation {
  id: string;
  studentId: string;
  studentName: string;
  action: 'boarding' | 'dropping';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  timestamp?: number;
}

interface BulkQROperationsProps {
  tripId?: string;
  onOperationComplete?: (results: {
    processed: number;
    failed: number;
    batchId: string;
  }) => void;
  className?: string;
}

export const BulkQROperations: React.FC<BulkQROperationsProps> = ({
  tripId,
  onOperationComplete,
  className = '',
}) => {
  const [operations, setOperations] = useState<BulkOperation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [newStudentId, setNewStudentId] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newAction, setNewAction] = useState<'boarding' | 'dropping'>('boarding');
  const [cachedStudents, setCachedStudents] = useState<StudentQRData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Load cached students on component mount
  useEffect(() => {
    const loadCachedStudents = async () => {
      try {
        const students = await getCachedStudentsForScanning();
        setCachedStudents(students);
      } catch (err) {
        console.error('Failed to load cached students:', err);
      }
    };

    loadCachedStudents();
  }, []);

  // Check if supervisor mode allows bulk operations
  const canPerformBulkOperations = (): boolean => {
    return isDriverSupervisorActive() && supervisorModeService.hasPermission('canBulkOperations');
  };

  // Add operation to the list
  const addOperation = () => {
    if (!newStudentId.trim() || !newStudentName.trim()) {
      toast({
        title: 'Invalid Input',
        description: 'Please enter both student ID and name',
        variant: 'destructive',
      });
      return;
    }

    // Check if student already exists in the list
    const existingOperation = operations.find(op => op.studentId === newStudentId.trim());
    if (existingOperation) {
      toast({
        title: 'Duplicate Student',
        description: 'This student is already in the operation list',
        variant: 'destructive',
      });
      return;
    }

    const operation: BulkOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      studentId: newStudentId.trim(),
      studentName: newStudentName.trim(),
      action: newAction,
      status: 'pending',
    };

    setOperations(prev => [...prev, operation]);
    setNewStudentId('');
    setNewStudentName('');
  };

  // Add student from cached list
  const addFromCachedList = (student: StudentQRData, action: 'boarding' | 'dropping') => {
    // Check if student already exists in the list
    const existingOperation = operations.find(op => op.studentId === student.studentId);
    if (existingOperation) {
      toast({
        title: 'Duplicate Student',
        description: 'This student is already in the operation list',
        variant: 'destructive',
      });
      return;
    }

    const operation: BulkOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      studentId: student.studentId,
      studentName: student.studentName,
      action,
      status: 'pending',
    };

    setOperations(prev => [...prev, operation]);
  };

  // Remove operation from the list
  const removeOperation = (operationId: string) => {
    setOperations(prev => prev.filter(op => op.id !== operationId));
  };

  // Clear all operations
  const clearAllOperations = () => {
    setOperations([]);
    setProgress(0);
    setError(null);
  };

  // Process all operations
  const processAllOperations = async () => {
    if (!canPerformBulkOperations()) {
      setError('Bulk operations require supervisor mode with appropriate permissions');
      return;
    }

    if (operations.length === 0) {
      toast({
        title: 'No Operations',
        description: 'Please add students to the operation list',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress(0);

    try {
      // Prepare operations for supervisor service
      const operationsData = operations.map(op => ({
        studentId: op.studentId,
        studentName: op.studentName,
        action: op.action,
      }));

      // Process through supervisor service
      const result = await supervisorModeService.performBulkOperation(
        operationsData,
        tripId,
        undefined // Location can be added here if available
      );

      // Update operation statuses based on results
      const updatedOperations = operations.map((op, index) => {
        if (index < result.processed) {
          return { ...op, status: 'completed' as const, timestamp: Date.now() };
        } else {
          const errorIndex = index - result.processed;
          const errorMessage = result.errors?.[errorIndex] || 'Unknown error';
          return { ...op, status: 'failed' as const, error: errorMessage };
        }
      });

      setOperations(updatedOperations);
      setProgress(100);

      // Play audio feedback based on results
      if (result.failed === 0) {
        await audioFeedbackService.playSuccessSound();
      } else if (result.processed > 0) {
        // Mixed results - play a neutral sound
        await audioFeedbackService.playSuccessSound();
      } else {
        await audioFeedbackService.playErrorSound();
      }

      // Show results
      toast({
        title: 'Bulk Operation Complete',
        description: `Processed: ${result.processed}, Failed: ${result.failed}`,
        variant: result.failed === 0 ? 'default' : 'destructive',
      });

      // Call completion callback
      onOperationComplete?.({
        processed: result.processed,
        failed: result.failed,
        batchId: result.batchId || '',
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      
      // Play error sound for complete failure
      try {
        await audioFeedbackService.playErrorSound();
      } catch (audioError) {
        console.warn('Audio feedback failed:', audioError);
      }
      
      // Mark all operations as failed
      setOperations(prev => prev.map(op => ({
        ...op,
        status: 'failed' as const,
        error: errorMessage,
      })));

      toast({
        title: 'Bulk Operation Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Export operations list
  const exportOperations = () => {
    const csvData = [
      ['Student ID', 'Student Name', 'Action', 'Status', 'Error', 'Timestamp'],
      ...operations.map(op => [
        op.studentId,
        op.studentName,
        op.action,
        op.status,
        op.error || '',
        op.timestamp ? new Date(op.timestamp).toISOString() : '',
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_operations_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Get status icon
  const getStatusIcon = (status: BulkOperation['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'processing':
        return <QrCode className="h-4 w-4 text-blue-500 animate-pulse" />;
      default:
        return <QrCode className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Bulk QR Operations
          <Badge variant="outline">
            {operations.length} students
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!canPerformBulkOperations() && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Bulk operations require supervisor mode with appropriate permissions
            </AlertDescription>
          </Alert>
        )}

        {/* Add Operation Form */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h3 className="font-medium">Add Student</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="studentId">Student ID</Label>
              <Input
                id="studentId"
                value={newStudentId}
                onChange={(e) => setNewStudentId(e.target.value)}
                placeholder="Enter student ID"
              />
            </div>
            <div>
              <Label htmlFor="studentName">Student Name</Label>
              <Input
                id="studentName"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="Enter student name"
              />
            </div>
            <div>
              <Label htmlFor="action">Action</Label>
              <select
                id="action"
                value={newAction}
                onChange={(e) => setNewAction(e.target.value as 'boarding' | 'dropping')}
                className="w-full p-2 border rounded-md"
              >
                <option value="boarding">Boarding</option>
                <option value="dropping">Dropping</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={addOperation}
                disabled={isProcessing}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Cached Students Quick Add */}
        {cachedStudents.length > 0 && (
          <div className="space-y-4 p-4 border rounded-lg">
            <h3 className="font-medium">Quick Add from Cached Students</h3>
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {cachedStudents.slice(0, 10).map((student) => (
                  <div key={student.studentId} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-sm">{student.studentName} ({student.studentId})</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addFromCachedList(student, 'boarding')}
                        disabled={isProcessing}
                      >
                        Board
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addFromCachedList(student, 'dropping')}
                        disabled={isProcessing}
                      >
                        Drop
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Operations List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Operations Queue</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportOperations}
                disabled={operations.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllOperations}
                disabled={isProcessing || operations.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
          </div>

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Processing operations...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          <ScrollArea className="h-64 border rounded-lg">
            <div className="p-4 space-y-2">
              {operations.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No operations added yet
                </p>
              ) : (
                operations.map((operation) => (
                  <div
                    key={operation.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(operation.status)}
                      <div>
                        <p className="font-medium">{operation.studentName}</p>
                        <p className="text-sm text-muted-foreground">
                          {operation.studentId} • {operation.action}
                        </p>
                        {operation.error && (
                          <p className="text-xs text-red-500">{operation.error}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        operation.status === 'completed' ? 'default' :
                        operation.status === 'failed' ? 'destructive' :
                        operation.status === 'processing' ? 'secondary' : 'outline'
                      }>
                        {operation.status}
                      </Badge>
                      {operation.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOperation(operation.id)}
                          disabled={isProcessing}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Process Button */}
        <div className="flex justify-center">
          <Button
            onClick={processAllOperations}
            disabled={isProcessing || operations.length === 0 || !canPerformBulkOperations()}
            size="lg"
            className="w-full md:w-auto"
          >
            {isProcessing ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Process All Operations
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BulkQROperations;