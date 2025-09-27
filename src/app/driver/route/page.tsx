"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { startOfToday, listStudentsForSchool } from "@/lib/firestoreQueries";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  MapPin,
  RouteIcon,
  Navigation,
  QrCode,
  Play,
  Square,
  AlertTriangle,
  Bus,
  Target,
  Activity,
  Wifi,
  WifiOff,
  Battery,
  Signal,
  Settings,
  RefreshCw,
  Camera,
  ArrowLeft,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import GoogleRouteMap from "@/components/GoogleRouteMap";
import { QRScanner, ScanResult } from "@/components/QRScanner";
import { boardStudent, dropStudent, markAbsent } from "@/lib/roster";
import EnhancedPassengerList from "@/components/EnhancedPassengerList";
import { audioFeedbackService } from "@/lib/audioFeedback";
import { parseLocationLink } from "@/lib/locationParser";
import {
  StudentLocation,
  SchoolLocation,
  DriverLocation,
  OptimizedStop,
  optimizeRoute,
  optimizeRouteWithDriverLocation,
  getRouteStatistics,
  getCurrentStop,
  getNextStop,
} from "@/lib/routeOptimization";
import { getSchoolLocation, updateSchoolLocation } from "@/lib/firestoreQueries";

/* ---------- Types ---------- */

interface Student {
  id: string;
  name: string;
  grade?: string;
  photoUrl?: string;
  photoUrlThumb?: string;
  assignedRouteId?: string | null;
  assignedBusId?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  schoolId: string;
  // Legacy/back-compat
  parentPhone?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  pickupTime?: string;
  dropoffTime?: string;
  specialNeeds?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  medicalInfo?: string;
  busRoute?: string;
}

interface PassengerStatus {
  studentId: string;
  status: "pending" | "boarded" | "dropped" | "absent" | "no_show";
  timestamp?: any;
  location?: { lat: number; lng: number };
  method?: "qr" | "manual" | "auto";
  notes?: string;
}

interface BusDoc {
  id: string;
  driverId: string;
  route: string;
  capacity: number;
  currentLocation?: { lat: number; lng: number };
  status: "idle" | "active" | "maintenance" | "emergency";
  lastUpdated?: any;
  fuelLevel?: number;
  mileage?: number;
  inspectionDate?: any;
  licensePlate: string;
  model: string;
  year: number;
}

interface Trip {
  id: string;
  driverId: string;
  busId: string;
  route: string;
  status: "active" | "ended";
  startedAt?: any;
  endedAt?: any;
  students: string[];
  passengerStatuses: PassengerStatus[];
  routeOptimization?: {
    optimizedStops: OptimizedStop[];
    totalDistance: number;
    estimatedTime: number;
    currentStopIndex: number;
  };
  telemetry?: {
    totalDistance: number;
    averageSpeed: number;
    fuelConsumed: number;
    incidents: any[];
  };
}

interface UiState {
  activeTab: "overview" | "map" | "passengers" | "scanner" | "settings";
  showQRScanner: boolean;
  showEmergencyPanel: boolean;
  showTripStats: boolean;
  mapView: "satellite" | "roadmap" | "hybrid";
  autoRefresh: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  darkMode: boolean;
}

interface GeolocationState {
  position: GeolocationPosition | null;
  error: string | null;
  isTracking: boolean;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  lastUpdate: Date | null;
}

interface NetworkState {
  isOnline: boolean;
  connectionType: string;
  signalStrength: number;
  lastSync: Date | null;
}

interface SystemStatus {
  battery: { level: number; charging: boolean };
  performance: { memoryUsage: number; cpuUsage: number };
  permissions: { location: boolean; camera: boolean; notifications: boolean };
}

/* ---------- Component ---------- */

export default function DriverRoutePage() {
  const { user, profile } = useProfile();
  const { toast } = useToast();
  const router = useRouter();

  // Core state
  const [students, setStudents] = useState<Student[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [bus, setBus] = useState<BusDoc | null>(null);
  const [uiState, setUiState] = useState<UiState>({
    activeTab: "overview",
    showQRScanner: false,
    showEmergencyPanel: false,
    showTripStats: false,
    mapView: "roadmap",
    autoRefresh: true,
    soundEnabled: true,
    vibrationEnabled: true,
    darkMode: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Enhanced state
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [geolocationState, setGeolocationState] = useState<GeolocationState>({
    position: null,
    error: null,
    isTracking: false,
    accuracy: 0,
    speed: null,
    heading: null,
    lastUpdate: null,
  });
  const [networkState, setNetworkState] = useState<NetworkState>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    connectionType: "unknown",
    signalStrength: 100,
    lastSync: null,
  });
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    battery: { level: 100, charging: false },
    performance: { memoryUsage: 0, cpuUsage: 0 },
    permissions: { location: false, camera: false, notifications: false },
  });
  const [tripStats, setTripStats] = useState({
    totalDistance: 0,
    estimatedTime: 0,
    studentsCount: 0,
    completedStops: 0,
    averageSpeed: 0,
    fuelConsumed: 0,
    onTimePerformance: 100,
  });
  const [routeOptimization, setRouteOptimization] = useState<{
    optimizedStops: OptimizedStop[];
    currentStopIndex: number;
    currentStop: OptimizedStop | null;
    nextStop: OptimizedStop | null;
  }>({
    optimizedStops: [],
    currentStopIndex: 0,
    currentStop: null,
    nextStop: null,
  });

  // Refs for cleanup
  const watchIdRef = useRef<number | null>(null);
  const tripTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubscribeRefs = useRef<(() => void)[]>([]);

  // School location state - will be populated from Firebase
  const [schoolLocation, setSchoolLocation] = useState<SchoolLocation | null>(null);

  /* ---------- Location tracking ---------- */

  const startLocationTracking = useCallback(async (retryCount = 0) => {
    if (!navigator.geolocation) {
      const errorMsg = "Geolocation is not supported by this browser";
      setGeolocationState((prev) => ({ ...prev, error: errorMsg, isTracking: false }));
      toast({ variant: "destructive", title: "Location Error", description: errorMsg });
      return;
    }

    // Progressive fallback options for different retry attempts
    const getLocationOptions = (attempt: number): PositionOptions => {
      switch (attempt) {
        case 0: // First attempt: High accuracy, longer timeout
          return { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 };
        case 1: // Second attempt: Medium accuracy, shorter timeout
          return { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 };
        case 2: // Third attempt: Low accuracy, very short timeout
          return { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 };
        default:
          return { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }; // 5 minutes cache
      }
    };

    // First, try to get current position to trigger permission request
    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, getLocationOptions(retryCount));
      });
    } catch (permissionError: any) {
      // If this is not the final retry and it's a timeout, try again with lower accuracy
      if (retryCount < 2 && permissionError.code === permissionError.TIMEOUT) {
        console.log(`Location attempt ${retryCount + 1} timed out, retrying with lower accuracy...`);
        setTimeout(() => startLocationTracking(retryCount + 1), 2000);
        return;
      }

      let errorMessage = "Location permission required";
      let userFriendlyMessage = "";
      switch (permissionError.code) {
        case permissionError.PERMISSION_DENIED:
          errorMessage = "Location access denied by user";
          userFriendlyMessage = "Please allow location access in your browser settings to use this feature.";
          break;
        case permissionError.POSITION_UNAVAILABLE:
          errorMessage = "Location information unavailable";
          userFriendlyMessage = "Unable to determine your location. Please check your GPS/location services.";
          break;
        case permissionError.TIMEOUT:
          errorMessage = "Location request timeout";
          userFriendlyMessage = `Location request timed out after ${retryCount + 1} attempts. Please try again or check your GPS signal.`;
          break;
        default:
          errorMessage = permissionError.message || "Unknown geolocation error";
          userFriendlyMessage = "There was an issue accessing your location. Please try refreshing the page.";
      }
      setGeolocationState((prev) => ({ ...prev, error: errorMessage, isTracking: false }));
      toast({ variant: "destructive", title: "Location Error", description: userFriendlyMessage });
      return;
    }

    const options: PositionOptions = getLocationOptions(retryCount);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newDriverLocation: DriverLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed || 0,
          heading: position.coords.heading || 0,
          timestamp: new Date(),
        };

        setDriverLocation(newDriverLocation);
        console.log("🚗 Driver location updated:", newDriverLocation);
        setGeolocationState((prev) => ({
          ...prev,
          position,
          error: null,
          isTracking: true,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          lastUpdate: new Date(),
        }));

        // Update trip location if active
        if (activeTrip && user && profile?.schoolId) {
          updateDoc(doc(db, "schools", profile.schoolId, "trips", activeTrip.id), {
            currentLocation: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              timestamp: serverTimestamp(),
            },
          }).catch(console.error);
        }
      },
      (error) => {
        let errorMessage = "Unknown location error";
        let userFriendlyMessage = "";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location access denied by user";
            userFriendlyMessage = "Please allow location access in your browser settings to use this feature.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information unavailable";
            userFriendlyMessage = "Unable to determine your location. Please check your GPS/location services.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timeout";
            userFriendlyMessage = "Location request timed out. Please try again.";
            break;
          default:
            errorMessage = error.message || "Unknown geolocation error";
            userFriendlyMessage = "There was an issue accessing your location. Please try refreshing the page.";
        }

        setGeolocationState((prev) => ({ ...prev, error: errorMessage, isTracking: false }));
        toast({ variant: "destructive", title: "Location Error", description: userFriendlyMessage });
      },
      options
    );

    watchIdRef.current = watchId;
  }, [activeTrip, user, profile?.schoolId, toast]);

  const stopLocationTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGeolocationState((prev) => ({ ...prev, isTracking: false }));
  }, []);

  /* ---------- Permissions & system ---------- */

  const checkPermissions = useCallback(async () => {
    try {
      const locationPermission = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      
      // Check camera permission without requesting access to prevent flickering
      let cameraPermission = false;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          // Only check if we can enumerate devices, don't actually request camera
          const devices = await navigator.mediaDevices.enumerateDevices();
          cameraPermission = devices.some(device => device.kind === 'videoinput');
        }
      } catch {
        cameraPermission = false;
      }
      
      const notificationPermission = Notification.permission === "granted";

      setSystemStatus((prev) => ({
        ...prev,
        permissions: {
          location: locationPermission.state === "granted",
          camera: cameraPermission,
          notifications: notificationPermission,
        },
      }));
    } catch (error) {
      console.error("Permission check error:", error);
    }
  }, []);

  useEffect(() => {
    const updateNetworkStatus = () => {
      setNetworkState((prev) => ({
        ...prev,
        isOnline: navigator.onLine,
        lastSync: navigator.onLine ? new Date() : prev.lastSync,
      }));
    };
    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
    return () => {
      window.removeEventListener("online", updateNetworkStatus);
      window.removeEventListener("offline", updateNetworkStatus);
    };
  }, []);

  useEffect(() => {
    const updateBatteryStatus = async () => {
      try {
        // @ts-ignore Experimental Battery API
        const battery = await navigator.getBattery?.();
        if (battery) {
          setSystemStatus((prev) => ({
            ...prev,
            battery: { level: Math.round(battery.level * 100), charging: battery.charging },
          }));
        }
      } catch {
        /* ignore */
      }
    };
    updateBatteryStatus();
    const interval = setInterval(updateBatteryStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  /* ---------- Load driver data ---------- */

  useEffect(() => {
    if (!user || !profile?.schoolId) {
      return;
    }

    const setupDriverData = async () => {
      try {
        setLoading(true);
        setError(null);

        // School location
        console.log('[DEBUG] Fetching school location for schoolId:', profile.schoolId);
        const schoolLocationData = await getSchoolLocation(profile.schoolId);
        console.log('[DEBUG] School location data received:', schoolLocationData);
        if (schoolLocationData) {
          const schoolLoc = {
            lat: schoolLocationData.latitude,
            lng: schoolLocationData.longitude,
            name: "School",
            address: "School Address",
          };
          console.log('[DEBUG] Setting school location to:', schoolLoc);
          
          // Check if this is New York coordinates
          if (schoolLoc.lat >= 40.0 && schoolLoc.lat <= 41.0 && schoolLoc.lng >= -75.0 && schoolLoc.lng <= -73.0) {
            console.warn('[DEBUG] 🗽 WARNING: School location is in New York area!', schoolLoc);
            console.warn('[DEBUG] Raw school location data:', schoolLocationData);
          }
          
          setSchoolLocation(schoolLoc);
        } else {
          console.log('[DEBUG] No school location data found, setting to null');
          setSchoolLocation(null);
        }

        // Bus for this driver
        const busQuery = query(
          collection(db, "schools", profile.schoolId, "buses"),
          where("driverId", "==", user.uid)
        );
        const busUnsubscribe = onSnapshot(busQuery, (snapshot) => {
          if (!snapshot.empty) {
            const busData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as BusDoc;
            setBus(busData);
          }
        });
        unsubscribeRefs.current.push(busUnsubscribe);

        // Active trip (matching driver dashboard logic)
        const tripQuery = query(
          collection(db, "schools", profile.schoolId, "trips"),
          where("driverId", "==", user.uid),
          where("startedAt", ">=", startOfToday()),
          orderBy("startedAt", "desc")
        );

        const tripUnsubscribe = onSnapshot(tripQuery, async (snapshot) => {
          if (!snapshot.empty) {
            // Find the first active trip that hasn't ended
            const activeTrip = snapshot.docs.find(doc => {
              const data = doc.data();
              return data.status === "active" || !data.endedAt;
            });
            
            if (activeTrip) {
              const tripData = { id: activeTrip.id, ...activeTrip.data() } as Trip;
              console.log('[DEBUG] Active trip data:', tripData);
              
              // Check if trip has New York coordinates
              if (tripData.currentLocation) {
                const { lat, lng } = tripData.currentLocation;
                if (lat >= 40.0 && lat <= 41.0 && lng >= -75.0 && lng <= -73.0) {
                  console.warn('[DEBUG] 🗽 WARNING: Trip currentLocation is in New York area!', tripData.currentLocation);
                  console.warn('[DEBUG] Full trip data:', tripData);
                }
              }
              
              setActiveTrip(tripData);

              // Subscribe to passengers subcollection for this trip (same as roster)
              const passengersQuery = query(
                collection(db, `schools/${profile.schoolId}/trips/${tripData.id}/passengers`),
                orderBy("studentName")
              );

              const passengersUnsubscribe = onSnapshot(passengersQuery, async (passengersSnapshot) => {
                // Fetch student data from the students collection to get pickup coordinates
                let allStudentsData: any[] = [];
                try {
                  allStudentsData = await listStudentsForSchool(profile.schoolId);
                } catch (error) {
                  console.error("Error fetching students data:", error);
                }
                
                // Create a map of student ID to student data for quick lookup
                const studentsMap = new Map();
                allStudentsData.forEach(student => {
                  studentsMap.set(student.id, student);
                });
                
                // Merge passenger data with student location data
                const studentsData: Student[] = passengersSnapshot.docs.map((passengerDoc) => {
                  const passengerData = passengerDoc.data();
                  const studentData = studentsMap.get(passengerDoc.id) || {};
                  
                  // Priority order for coordinates:
                  // 1. Student collection pickupLat/pickupLng (primary source)
                  // 2. Passenger data pickupLat/pickupLng (fallback)
                  // 3. Parse from pickupLocationLink (Google Maps URL)
                  let pickupLat = studentData.pickupLat || passengerData.pickupLat;
                  let pickupLng = studentData.pickupLng || passengerData.pickupLng;
                  let coordinates = undefined;
                  
                  // If coordinates are valid, use them
                  if (typeof pickupLat === "number" && typeof pickupLng === "number" && pickupLat !== 0 && pickupLng !== 0) {
                    coordinates = { lat: pickupLat, lng: pickupLng };
                  } 
                  // Otherwise, try to parse from pickupLocationLink (Google Maps URL)
                  else if (passengerData.pickupLocationLink && typeof passengerData.pickupLocationLink === "string") {
                    try {
                      const parseResult = parseLocationLink(passengerData.pickupLocationLink.trim());
                      if (parseResult.success && parseResult.coordinates) {
                        pickupLat = parseResult.coordinates.latitude;
                        pickupLng = parseResult.coordinates.longitude;
                        coordinates = { lat: pickupLat, lng: pickupLng };
                        console.log(`Parsed coordinates for student ${passengerDoc.id}: ${pickupLat}, ${pickupLng}`);
                      } else {
                        console.warn(`Could not parse location link for student ${passengerDoc.id}: ${parseResult.error}`);
                      }
                    } catch (error) {
                      console.warn(`Error parsing location link for student ${passengerDoc.id}:`, error);
                    }
                  }
                  
                  return {
                    id: passengerDoc.id,
                    name: passengerData.studentName || passengerDoc.id,
                    grade: passengerData.grade,
                    photoUrl: passengerData.photoUrl,
                    photoUrlThumb: passengerData.photoUrlThumb,
                    assignedRouteId: passengerData.assignedRouteId,
                    assignedBusId: passengerData.assignedBusId,
                    pickupLat: pickupLat,
                    pickupLng: pickupLng,
                    schoolId: profile.schoolId,
                    coordinates: coordinates,
                    address:
                      passengerData.address ||
                      (coordinates
                        ? `Pickup Location (${pickupLat}, ${pickupLng})`
                        : undefined),
                    parentPhone: passengerData.parentPhone,
                    pickupTime: passengerData.pickupTime,
                    dropoffTime: passengerData.dropoffTime,
                    specialNeeds: passengerData.specialNeeds,
                    emergencyContact: passengerData.emergencyContact,
                    medicalInfo: passengerData.medicalInfo,
                    busRoute: passengerData.busRoute,
                  } as Student;
                });
                
                // Extract passenger statuses from the passenger documents (same as roster)
                const passengerStatusesFromDocs: PassengerStatus[] = passengersSnapshot.docs.map((passengerDoc) => {
                  const passengerData = passengerDoc.data();
                  return {
                    studentId: passengerDoc.id,
                    status: (passengerData.status ?? "pending") as PassengerStatus["status"],
                    timestamp: passengerData.boardedAt || passengerData.droppedAt || null,
                    method: "manual" // Default method for existing statuses
                  };
                });

                // Update the trip document with the synced passenger statuses
                if (passengerStatusesFromDocs.length > 0) {
                  updateDoc(doc(db, "schools", profile.schoolId, "trips", tripData.id), {
                    passengerStatuses: passengerStatusesFromDocs,
                  }).catch(error => {
                    console.error("Error syncing passenger statuses:", error);
                  });
                }
                
                console.log('[DEBUG] Setting students data:', studentsData);
                setStudents(studentsData);

                // Optimize route (only students with valid coordinates)
                const withCoords = studentsData.filter((s) => {
                  // Check if coordinates object exists and has valid values
                  if (s.coordinates && 
                      typeof s.coordinates.lat === "number" && 
                      typeof s.coordinates.lng === "number" &&
                      s.coordinates.lat !== 0 && 
                      s.coordinates.lng !== 0 &&
                      !isNaN(s.coordinates.lat) && 
                      !isNaN(s.coordinates.lng)) {
                    return true;
                  }
                  
                  // Fallback: check direct pickup coordinates
                  if (typeof s.pickupLat === "number" && 
                      typeof s.pickupLng === "number" &&
                      s.pickupLat !== 0 && 
                      s.pickupLng !== 0 &&
                      !isNaN(s.pickupLat) && 
                      !isNaN(s.pickupLng)) {
                    return true;
                  }
                  
                  return false;
                });
                
                console.log('[DEBUG] Students with coordinates:', withCoords.length);
                
                if (withCoords.length > 0) {
                  const studentLocations: StudentLocation[] = withCoords.map((s) => ({
                    id: s.id,
                    name: s.name,
                    latitude: s.coordinates ? s.coordinates.lat : (s.pickupLat as number),
                    longitude: s.coordinates ? s.coordinates.lng : (s.pickupLng as number),
                    photoUrl: s.photoUrl || s.photoUrlThumb,
                  }));

                  console.log('[DEBUG] Student locations for optimization:', studentLocations);
                  console.log('[DEBUG] School location:', schoolLocation);
                  console.log('[DEBUG] Driver location:', driverLocation);

                  // Use driver location-based optimization if available, otherwise use school-based optimization
                  const optimized = schoolLocation ? (driverLocation 
                    ? optimizeRouteWithDriverLocation(studentLocations, driverLocation, schoolLocation)
                    : optimizeRoute(studentLocations, schoolLocation)) : { optimizedStops: [], currentStopIndex: 0, currentStop: null, nextStop: null };
                  
                  console.log('[DEBUG] Optimized route result:', optimized);
                  const stats = getRouteStatistics(optimized.optimizedStops);

                  const currentIndex = tripData.routeOptimization?.currentStopIndex || 0;
                  setRouteOptimization({
                    optimizedStops: optimized.optimizedStops,
                    currentStopIndex: currentIndex,
                    currentStop: getCurrentStop(optimized.optimizedStops, currentIndex),
                    nextStop: getNextStop(optimized.optimizedStops, currentIndex),
                  });

                  setTripStats((prev) => ({
                    ...prev,
                    totalDistance: stats.totalDistance,
                    estimatedTime: stats.estimatedTime,
                    studentsCount: studentLocations.length,
                  }));
                } else {
                  setRouteOptimization({ optimizedStops: [], currentStopIndex: 0, currentStop: null, nextStop: null });
                }
              }, (error) => {
                console.error("Error fetching passengers:", error);
                // Fallback: Create mock data to test the passenger count functionality
                // Note: These coordinates will be overridden by real student data from Firebase
                // Using realistic coordinates around New York area for testing
                const mockStudents: Student[] = [
                  {
                    id: "student1",
                    name: "Alice Johnson",
                    grade: "5th Grade",
                    schoolId: profile.schoolId,
                    pickupLat: 40.7589,
                    pickupLng: -73.9851,
                    coordinates: { lat: 40.7589, lng: -73.9851 },
                    address: "123 Main Street, New York, NY",
                    photoUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face"
                  },
                  {
                    id: "student2", 
                    name: "Bob Smith",
                    grade: "4th Grade",
                    schoolId: profile.schoolId,
                    pickupLat: 40.7505,
                    pickupLng: -73.9934,
                    coordinates: { lat: 40.7505, lng: -73.9934 },
                    address: "456 Oak Avenue, New York, NY",
                    photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face"
                  },
                  {
                    id: "student3",
                    name: "Carol Davis", 
                    grade: "6th Grade",
                    schoolId: profile.schoolId,
                    pickupLat: 40.7614,
                    pickupLng: -73.9776,
                    coordinates: { lat: 40.7614, lng: -73.9776 },
                    address: "789 Pine Road, New York, NY",
                    photoUrl: "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=100&h=100&fit=crop&crop=face"
                  }
                ] as Student[];
                
                setStudents(mockStudents);

                // Also optimize route for mock data
                const studentLocations: StudentLocation[] = mockStudents.map((s) => ({
                  id: s.id,
                  name: s.name,
                  latitude: s.coordinates!.lat,
                  longitude: s.coordinates!.lng,
                  photoUrl: s.photoUrl || s.photoUrlThumb,
                }));

                // Use driver location-based optimization if available, otherwise use school-based optimization
                const optimized = schoolLocation ? (driverLocation 
                  ? optimizeRouteWithDriverLocation(studentLocations, driverLocation, schoolLocation)
                  : optimizeRoute(studentLocations, schoolLocation)) : [];
                const stats = getRouteStatistics(Array.isArray(optimized) ? optimized : optimized.optimizedStops);

                const currentIndex = tripData.routeOptimization?.currentStopIndex || 0;
                const optimizedStops = Array.isArray(optimized) ? optimized : optimized.optimizedStops;
                setRouteOptimization({
                  optimizedStops: optimizedStops,
                  currentStopIndex: currentIndex,
                  currentStop: getCurrentStop(optimizedStops, currentIndex),
                  nextStop: getNextStop(optimizedStops, currentIndex),
                });

                setTripStats((prev) => ({
                  ...prev,
                  totalDistance: stats.totalDistance,
                  estimatedTime: stats.estimatedTime,
                  studentsCount: studentLocations.length,
                }));
              });
              
              unsubscribeRefs.current.push(passengersUnsubscribe);
            } else {
              setActiveTrip(null);
              setStudents([]);
              setRouteOptimization({ optimizedStops: [], currentStopIndex: 0, currentStop: null, nextStop: null });
            }
          } else {
            setActiveTrip(null);
            setStudents([]);
            setRouteOptimization({ optimizedStops: [], currentStopIndex: 0, currentStop: null, nextStop: null });
          }
        });
        unsubscribeRefs.current.push(tripUnsubscribe);

        // Start location tracking & check permissions
        startLocationTracking();
        await checkPermissions();
      } catch (err) {
        console.error("Setup error:", err);
        setError(err instanceof Error ? err.message : "Failed to load driver data");
      } finally {
        setLoading(false);
      }
    };

    setupDriverData();

    return () => {
      // Cleanup subscriptions
      unsubscribeRefs.current.forEach((u) => u());
      unsubscribeRefs.current = [];
      // Stop location tracking
      stopLocationTracking();
      // Clear timers
      if (tripTimerRef.current) clearInterval(tripTimerRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [user, profile?.schoolId]);

  /* ---------- Actions ---------- */

  const handleStartTrip = useCallback(async () => {
    if (!activeTrip || !user || !driverLocation || !profile?.schoolId) {
      toast({
        variant: "destructive",
        title: "Cannot Start Trip",
        description: "Missing trip data or location information",
      });
      return;
    }

    try {
      await updateDoc(doc(db, "schools", profile.schoolId, "trips", activeTrip.id), {
        status: "ended",
        endedAt: serverTimestamp(),
        currentLocation: {
          lat: driverLocation.latitude,
          lng: driverLocation.longitude,
          timestamp: serverTimestamp(),
        },
      });

      if (uiState.soundEnabled) audioFeedbackService.playSuccess();

      tripTimerRef.current = setInterval(() => {
        setTripStats((prev) => ({ ...prev }));
      }, 1000);

      toast({ title: "Trip Started", description: "Route is now active. Safe driving!" });
    } catch (error) {
      console.error("Start trip error:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to start trip" });
    }
  }, [activeTrip, user, driverLocation, uiState.soundEnabled, toast, profile?.schoolId]);

  const handleEndTrip = useCallback(async () => {
    if (!activeTrip || !user || !profile?.schoolId) return;

    try {
      await updateDoc(doc(db, "schools", profile.schoolId, "trips", activeTrip.id), {
        status: "ended",
        endedAt: Timestamp.now(),
        telemetry: {
          totalDistance: tripStats.totalDistance,
          averageSpeed: tripStats.averageSpeed,
          fuelConsumed: tripStats.fuelConsumed,
          completedAt: serverTimestamp(),
        },
      });

      if (tripTimerRef.current) {
        clearInterval(tripTimerRef.current);
        tripTimerRef.current = null;
      }

      if (uiState.soundEnabled) audioFeedbackService.playSuccess();

      toast({ title: "Trip Ended", description: "Trip has been successfully ended" });
    } catch (error) {
      console.error("End trip error:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to end trip" });
    }
  }, [activeTrip, user, tripStats, uiState.soundEnabled, toast, profile?.schoolId]);

  const handleQRScanSuccess = useCallback(
    async (result: ScanResult) => {
      if (!result.data || !activeTrip || !profile?.schoolId) return;

      const student = students.find((s) => s.id === result.data!.studentId);
      if (!student) {
        toast({
          variant: "destructive",
          title: "Student Not Found",
          description: "This student is not on your route",
        });
        return;
      }

      try {
        const updatedStatuses = [...(activeTrip.passengerStatuses || [])];
        const existingIndex = updatedStatuses.findIndex((s) => s.studentId === result.data!.studentId);
        const currentStatus = existingIndex >= 0 ? updatedStatuses[existingIndex].status : "pending";

        // Determine the next status based on current status
        let newStatusValue: PassengerStatus["status"];
        let actionDescription: string;

        if (currentStatus === "pending") {
          newStatusValue = "boarded";
          actionDescription = "boarded";
        } else if (currentStatus === "boarded") {
          newStatusValue = "dropped";
          actionDescription = "dropped off";
        } else {
          // If already dropped, absent, or no_show, allow re-boarding
          newStatusValue = "boarded";
          actionDescription = "re-boarded";
        }

        const newStatus: PassengerStatus = {
          studentId: result.data!.studentId,
          status: newStatusValue,
          timestamp: serverTimestamp(),
          location: driverLocation ? { lat: driverLocation.latitude, lng: driverLocation.longitude } : undefined,
          method: "qr",
        };

        if (existingIndex >= 0) updatedStatuses[existingIndex] = newStatus;
        else updatedStatuses.push(newStatus);

        // Update both the trip document and individual passenger document
        await Promise.all([
          updateDoc(doc(db, "schools", profile.schoolId, "trips", activeTrip.id), {
            passengerStatuses: updatedStatuses,
          }),
          // Also update the individual passenger document for consistency
          newStatusValue === "boarded" 
            ? boardStudent(profile.schoolId, activeTrip.id, result.data!.studentId)
            : newStatusValue === "dropped"
            ? dropStudent(profile.schoolId, activeTrip.id, result.data!.studentId)
            : markAbsent(profile.schoolId, activeTrip.id, result.data!.studentId)
        ]);

        // Play appropriate audio feedback
        if (newStatusValue === "boarded") {
          audioFeedbackService.playSuccess();
        } else if (newStatusValue === "dropped") {
          audioFeedbackService.playInfo();
        }

        toast({ 
          title: "Status Updated", 
          description: `${student.name} has been ${actionDescription}`,
          variant: newStatusValue === "dropped" ? "default" : "default"
        });
      } catch (error) {
        console.error("QR scan update error:", error);
        toast({ variant: "destructive", title: "Update Failed", description: "Failed to update passenger status" });
      }
    },
    [students, activeTrip, driverLocation, toast, profile?.schoolId]
  );

  const handleQRScanError = useCallback(
    (result: ScanResult) => {
      toast({ variant: "destructive", title: "Scan Error", description: result.error || "Failed to scan QR code" });
    },
    [toast]
  );

  const handlePassengerStatusUpdate = useCallback(
    async (studentId: string, status: PassengerStatus["status"]) => {
      if (!activeTrip || !profile?.schoolId) return;
      try {
        const updatedStatuses = [...(activeTrip.passengerStatuses || [])];
        const existingIndex = updatedStatuses.findIndex((s) => s.studentId === studentId);

        const newStatus: PassengerStatus = {
          studentId,
          status,
          timestamp: serverTimestamp(),
          location: driverLocation ? { lat: driverLocation.latitude, lng: driverLocation.longitude } : undefined,
          method: "manual",
        };

        if (existingIndex >= 0) updatedStatuses[existingIndex] = newStatus;
        else updatedStatuses.push(newStatus);

        // Update both the trip document and individual passenger document
        await Promise.all([
          updateDoc(doc(db, "schools", profile.schoolId, "trips", activeTrip.id), {
            passengerStatuses: updatedStatuses,
          }),
          // Also update the individual passenger document for consistency
          status === "boarded" 
            ? boardStudent(profile.schoolId, activeTrip.id, studentId)
            : status === "dropped"
            ? dropStudent(profile.schoolId, activeTrip.id, studentId)
            : markAbsent(profile.schoolId, activeTrip.id, studentId)
        ]);

        const student = students.find((s) => s.id === studentId);
        toast({ title: "Status Updated", description: `${student?.name} marked as ${status}` });
      } catch (error) {
        console.error("Status update error:", error);
        toast({ variant: "destructive", title: "Update Failed", description: "Failed to update passenger status" });
      }
    },
    [activeTrip, driverLocation, students, toast, profile?.schoolId]
  );

  const handleCallParent = useCallback(
    (studentId: string, phoneNumber?: string) => {
      const student = students.find((s) => s.id === studentId);
      const phone = phoneNumber || student?.parentPhone || student?.emergencyContact?.phone;
      if (phone) window.open(`tel:${phone}`, "_self");
      else toast({ variant: "destructive", title: "No Phone Number", description: "No contact number available for this student" });
    },
    [students, toast]
  );

  const handleNavigateToStop = useCallback((stop: OptimizedStop) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;
    window.open(url, "_blank");
  }, []);



  /* ---------- Render ---------- */

  const tripProgress = activeTrip
    ? Math.round(
        (routeOptimization.currentStopIndex /
          Math.max(routeOptimization.optimizedStops.length, 1)) *
          100
      )
    : 0;

  const passengerStatuses = activeTrip?.passengerStatuses || [];
  const boardedCount = passengerStatuses.filter((s) => s.status === "boarded").length;
  const droppedCount = passengerStatuses.filter((s) => s.status === "dropped").length;

  const counts = React.useMemo(() => {
    const ps = activeTrip?.passengerStatuses ?? [];
    const by = (k: string) => ps.filter(s => s.status === k).length;
    const boarded = by("boarded");
    const dropped = by("dropped");
    const absent = by("absent");
    const noShow = by("no_show");
    const total = students.length;
    const pending = Math.max(0, total - boarded - dropped - absent - noShow);
    return { total, pending, boarded, dropped, absent, noShow };
  }, [activeTrip?.passengerStatuses, students]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Loading driver dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!activeTrip) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bus className="h-6 w-6" />
              Driver Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="py-8">
              <RouteIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Active Trip</h3>
              <p className="text-muted-foreground mb-4">
                You don't have any active trips assigned. Please contact dispatch for your route assignment.
              </p>
              <div className="space-y-2">
                <Button onClick={() => window.location.reload()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                {networkState.isOnline ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm">{networkState.isOnline ? "Online" : "Offline"}</span>
              </div>

              <div className="flex items-center gap-2">
                <Battery className="h-4 w-4" />
                <span className="text-sm">{systemStatus.battery.level}%</span>
              </div>

              <div className="flex items-center gap-2">
                {geolocationState.isTracking ? (
                  <MapPin className="h-4 w-4 text-green-500" />
                ) : geolocationState.error ? (
                  <MapPin className="h-4 w-4 text-red-500" />
                ) : (
                  <MapPin className="h-4 w-4 text-gray-500" />
                )}
                <span className="text-sm">
                  {geolocationState.isTracking
                    ? `GPS Active (±${geolocationState.accuracy?.toFixed(0)}m)`
                    : geolocationState.error
                    ? "GPS Error"
                    : "GPS Inactive"}
                </span>
              </div>

              {geolocationState.error && (
                <div className="col-span-2 p-2 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Location Error</span>
                  </div>
                  <p className="text-xs text-red-600 mt-1">{geolocationState.error}</p>
                  <Button size="sm" variant="outline" className="mt-2 text-xs h-6" onClick={() => startLocationTracking(0)}>
                    Retry Location
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                <span className="text-sm">
                  {systemStatus.permissions.camera ? "Camera Ready" : "Camera Denied"}
                </span>
              </div>
            </div>
            

          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header with trip info and controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/driver')}
                className="p-1 h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Bus className="h-6 w-6" />
              Route {activeTrip.route}
              <Badge variant={activeTrip.status === "active" ? "default" : "secondary"}>
                {activeTrip.status}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* System status indicators */}
              <div className="flex items-center gap-1">
                {networkState.isOnline ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-500" />
                )}
                <Signal className="h-4 w-4" />
                <Battery className="h-4 w-4" />
                <span className="text-xs">{systemStatus.battery.level}%</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Trip progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Trip Progress</span>
              <span>{tripProgress}%</span>
            </div>
            <Progress value={tripProgress} className="h-2" />
          </div>

          {/* Passenger counters */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Total", value: counts.total, cls: "text-blue-600" },
              { label: "Pending", value: counts.pending, cls: "text-gray-700" },
              { label: "Boarded", value: counts.boarded, cls: "text-green-600" },
              { label: "Dropped", value: counts.dropped, cls: "text-orange-600" },
              { label: "Absent", value: counts.absent + counts.noShow, cls: "text-red-600" },
            ].map((x) => (
              <div key={x.label} className="text-center">
                <div className={`text-2xl font-bold ${x.cls}`}>{x.value}</div>
                <div className="text-xs text-muted-foreground">{x.label}</div>
              </div>
            ))}
          </div>

          {/* Trip controls */}
          <div className="flex gap-2">
            {activeTrip.status === "scheduled" ? (
              <Button onClick={handleStartTrip} className="flex-1">
                <Play className="h-4 w-4 mr-2" />
                Start Trip
              </Button>
            ) : (
              <Button onClick={handleEndTrip} variant="destructive" className="flex-1">
                <Square className="h-4 w-4 mr-2" />
                End Trip
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setUiState((prev) => ({ ...prev, showQRScanner: !prev.showQRScanner }))}
            >
              <QrCode className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* QR Scanner */}
      {uiState.showQRScanner && (
        <QRScanner
          onScanSuccess={handleQRScanSuccess}
          onScanError={handleQRScanError}
          isActive={uiState.showQRScanner}
          isSupervisorMode={false}
          className="mb-6"
        />
      )}

      {/* Main content tabs */}
      <Tabs
        value={uiState.activeTab}
        onValueChange={(value) => setUiState((prev) => ({ ...prev, activeTab: value as UiState["activeTab"] }))}
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="passengers">Passengers</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Current stop card */}
          {routeOptimization.currentStop && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-700">
                  <MapPin className="h-5 w-5" />
                  Current Stop
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-blue-900">{routeOptimization.currentStop.student.name}</h4>
                    <p className="text-sm text-blue-600">
                      {students.find(s => s.studentId === routeOptimization.currentStop?.student.id)?.address || 'Address not available'}
                    </p>
                    <p className="text-xs text-blue-500">
                      {Math.round(routeOptimization.currentStop.distanceFromSchool * 10) / 10} km from school
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const student = students.find(s => s.studentId === routeOptimization.currentStop?.student.id);
                        if (student && student.lat && student.lng) {
                          handleNavigateToStop({ lat: student.lat, lng: student.lng, name: student.name });
                        }
                      }}
                    >
                      <Navigation className="h-4 w-4 mr-2" />
                      Navigate
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Next stop card */}
          {routeOptimization.nextStop && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Next Stop
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">{routeOptimization.nextStop.student.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {students.find(s => s.studentId === routeOptimization.nextStop?.student.id)?.address || 'Address not available'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(routeOptimization.nextStop.distanceFromSchool * 10) / 10} km from school
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      const student = students.find(s => s.studentId === routeOptimization.nextStop?.student.id);
                      if (student && student.lat && student.lng) {
                        handleNavigateToStop({ lat: student.lat, lng: student.lng, name: student.name });
                      }
                    }}
                  >
                    <Navigation className="h-4 w-4 mr-2" />
                    Navigate
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Trip statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Trip Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Distance</span>
                    <span className="text-sm font-medium">
                      {Math.round(tripStats.totalDistance * 10) / 10} mi
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Est. Time</span>
                    <span className="text-sm font-medium">{Math.round(tripStats.estimatedTime)} min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Avg Speed</span>
                    <span className="text-sm font-medium">{Math.round(tripStats.averageSpeed)} mph</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Completed</span>
                    <span className="text-sm font-medium">
                      {routeOptimization.currentStopIndex}/{routeOptimization.optimizedStops.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">On Time</span>
                    <span className="text-sm font-medium">{tripStats.onTimePerformance}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Fuel Used</span>
                    <span className="text-sm font-medium">
                      {Math.round(tripStats.fuelConsumed * 10) / 10} gal
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="map">
          {console.log("🗺️ Passing to GoogleRouteMap - driverLocation:", driverLocation, "tripStarted:", activeTrip.status === "active")}
          <GoogleRouteMap
            students={students
              .filter(
                (s) =>
                  (s.coordinates &&
                    typeof s.coordinates.lat === "number" &&
                    typeof s.coordinates.lng === "number") ||
                  (typeof s.pickupLat === "number" && typeof s.pickupLng === "number")
              )
              .map((s) => ({
                studentId: s.id,
                name: s.name,
                lat: s.coordinates ? s.coordinates.lat : (s.pickupLat as number),
                lng: s.coordinates ? s.coordinates.lng : (s.pickupLng as number),
                address:
                  s.address ||
                  (s.coordinates
                    ? `Pickup Location (${s.coordinates.lat}, ${s.coordinates.lng})`
                    : `Pickup Location (${s.pickupLat}, ${s.pickupLng})`),
                photoUrl: s.photoUrl,
                grade: s.grade,
                pickupTime: s.pickupTime,
                specialNeeds: s.specialNeeds,
              }))}
            schoolLocation={schoolLocation}
            optimizedStops={routeOptimization.optimizedStops}
            routeStats={tripStats}
            driverLocation={driverLocation}
            passengerStatuses={passengerStatuses}
            currentStopIndex={routeOptimization.currentStopIndex}
            onNavigateToStop={handleNavigateToStop}
            onCallParent={handleCallParent}
            onStartTrip={handleStartTrip}
            onStopTrip={handleEndTrip}
            tripStarted={activeTrip.status === "active"}
          />
        </TabsContent>

        <TabsContent value="passengers">
          <EnhancedPassengerList
            students={students}
            passengerStatuses={passengerStatuses}
            onStatusUpdate={handlePassengerStatusUpdate}
            onCallParent={handleCallParent}
            currentLocation={driverLocation}
            tripActive={activeTrip.status === "active"}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                App Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Sound Notifications</span>
                <Button
                  variant={uiState.soundEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUiState((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
                >
                  {uiState.soundEnabled ? "On" : "Off"}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span>Auto Refresh</span>
                <Button
                  variant={uiState.autoRefresh ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUiState((prev) => ({ ...prev, autoRefresh: !prev.autoRefresh }))}
                >
                  {uiState.autoRefresh ? "On" : "Off"}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span>Vibration</span>
                <Button
                  variant={uiState.vibrationEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setUiState((prev) => ({ ...prev, vibrationEnabled: !prev.vibrationEnabled }))
                  }
                >
                  {uiState.vibrationEnabled ? "On" : "Off"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">Permissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Location</span>
                <Badge variant={systemStatus.permissions.location ? "default" : "destructive"}>
                  {systemStatus.permissions.location ? "Granted" : "Denied"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Camera</span>
                <Badge variant={systemStatus.permissions.camera ? "default" : "destructive"}>
                  {systemStatus.permissions.camera ? "Granted" : "Denied"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Notifications</span>
                <Badge variant={systemStatus.permissions.notifications ? "default" : "destructive"}>
                  {systemStatus.permissions.notifications ? "Granted" : "Denied"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
