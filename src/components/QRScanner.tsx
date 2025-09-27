'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Camera, CameraOff, QrCode, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { audioFeedbackService } from '@/lib/audioFeedback';

// Types and interfaces
export interface StudentQRData {
  studentId: string;
  studentName: string;
  schoolId: string;
  signature: string;
  grade?: string;
  busRoute?: string;
  photoUrl?: string;
}

export interface ScanResult {
  success: boolean;
  data?: StudentQRData;
  error?: string;
  timestamp: Date;
  scanMethod: 'qr' | 'manual';
}

export interface QRScannerProps {
  onScanSuccess: (result: ScanResult) => void;
  onScanError: (result: ScanResult) => void;
  isActive?: boolean;
  isSupervisorMode?: boolean;
  cachedStudents?: StudentQRData[];
  className?: string;
  autoStart?: boolean;
}

export function QRScanner({
  onScanSuccess,
  onScanError,
  isActive = true,
  isSupervisorMode = false,
  cachedStudents,
  className = '',
  autoStart = true
}: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<number>(0);
  const { toast } = useToast();
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize camera
  const initializeCamera = useCallback(async () => {
    try {
      setError(null);
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported in this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setHasPermission(true);
        
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play();
          }
        };
      }
    } catch (err) {
      console.error('Camera initialization error:', err);
      setHasPermission(false);
      setError(err instanceof Error ? err.message : 'Failed to access camera');
      
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
      });
    }
  }, [toast]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  // Start scanning
  const startScanning = useCallback(() => {
    if (!isActive || isScanning) return;
    
    setIsScanning(true);
    
    // Simple QR code detection simulation (in real implementation, use a QR library like jsQR)
    scanIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) return;
      
      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // In a real implementation, you would use jsQR or similar library here
      // For now, this is a placeholder that would detect QR codes
      
    }, 100); // Scan every 100ms
  }, [isActive, isScanning]);

  // Stop scanning
  const stopScanning = useCallback(() => {
    setIsScanning(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }, []);

  // Process QR code data
  const processQRData = useCallback((qrText: string) => {
    try {
      // Prevent duplicate scans within 2 seconds
      const now = Date.now();
      if (now - lastScanTime < 2000) return;
      setLastScanTime(now);

      // Parse QR code data
      const qrData: StudentQRData = JSON.parse(qrText);
      
      // Validate required fields
      if (!qrData.studentId || !qrData.studentName || !qrData.schoolId) {
        throw new Error('Invalid QR code format');
      }

      // Create success result
      const result: ScanResult = {
        success: true,
        data: qrData,
        timestamp: new Date(),
        scanMethod: 'qr'
      };

      // Play success sound
      audioFeedbackService.playSuccess();
      
      // Call success handler
      onScanSuccess(result);
      
      toast({
        title: "Student Scanned",
        description: `Successfully scanned ${qrData.studentName}`,
      });

    } catch (err) {
      console.error('QR processing error:', err);
      
      const result: ScanResult = {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid QR code',
        timestamp: new Date(),
        scanMethod: 'qr'
      };

      // Play error sound
      audioFeedbackService.playError();
      
      // Call error handler
      onScanError(result);
      
      toast({
        variant: "destructive",
        title: "Scan Error",
        description: result.error,
      });
    }
  }, [lastScanTime, onScanSuccess, onScanError, toast]);

  // Initialize on mount
  useEffect(() => {
    if (autoStart && isActive) {
      initializeCamera();
    }
    
    return () => {
      stopCamera();
      stopScanning();
    };
  }, [autoStart, isActive, initializeCamera, stopCamera, stopScanning]);

  // Start/stop scanning based on isActive
  useEffect(() => {
    if (isActive && hasPermission) {
      startScanning();
    } else {
      stopScanning();
    }
  }, [isActive, hasPermission, startScanning, stopScanning]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          QR Scanner
          {isSupervisorMode && (
            <Badge variant="secondary">Supervisor Mode</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {hasPermission === false && (
          <Alert>
            <Camera className="h-4 w-4" />
            <AlertDescription>
              Camera permission is required for QR scanning. Please allow camera access and try again.
            </AlertDescription>
          </Alert>
        )}

        <div className="relative">
          {/* Video element for camera feed */}
          <video
            ref={videoRef}
            className="w-full h-64 bg-black rounded-lg object-cover"
            playsInline
            muted
          />
          
          {/* Hidden canvas for QR processing */}
          <canvas
            ref={canvasRef}
            className="hidden"
          />
          
          {/* Scanning overlay */}
          {isScanning && (
            <div className="absolute inset-0 border-2 border-primary rounded-lg">
              <div className="absolute inset-4 border border-primary/50 rounded">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary"></div>
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary"></div>
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary"></div>
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary"></div>
              </div>
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
                <Badge variant="default" className="animate-pulse">
                  Scanning...
                </Badge>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {!isScanning ? (
            <Button 
              onClick={initializeCamera}
              className="flex items-center gap-2"
              disabled={!isActive}
            >
              <Camera className="h-4 w-4" />
              Start Camera
            </Button>
          ) : (
            <Button 
              onClick={stopScanning}
              variant="outline"
              className="flex items-center gap-2"
            >
              <CameraOff className="h-4 w-4" />
              Stop Scanning
            </Button>
          )}
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            {hasPermission === true ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : hasPermission === false ? (
              <XCircle className="h-4 w-4 text-red-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            )}
            <span>Camera: {hasPermission === true ? 'Ready' : hasPermission === false ? 'Denied' : 'Checking...'}</span>
          </div>
          
          <div className="flex items-center gap-1">
            {isScanning ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-gray-500" />
            )}
            <span>Scanner: {isScanning ? 'Active' : 'Inactive'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default QRScanner;