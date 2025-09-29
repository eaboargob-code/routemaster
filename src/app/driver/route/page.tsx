"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 🔧 Adjust these two imports to match your project (e.g. "@/hooks/useAuth", "@/lib/useProfile")
import { useProfile } from "@/lib/useProfile";

// Firebase
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase"; // 🔧 adjust if your firebase export path differs

// UI (shadcn-like; adjust if you use other components)
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast"; // 🔧 adjust if your toast hook differs

// Icons (lucide-react)
import {
  Play,
  Square,
  Users,
  QrCode,
  Phone,
  Navigation,
  MapPin,
  School,
  Route,
  RotateCcw,
  Sun,
  Moon,
  Target,
  Settings,
} from "lucide-react";

// Google Maps
import {
  GoogleMap,
  Marker,
  InfoWindow,
  DirectionsRenderer,
  useJsApiLoader,
} from "@react-google-maps/api";

/* ---------------------------------- Types --------------------------------- */

type LatLng = { lat: number; lng: number };

type TripStatus = "scheduled" | "active" | "ended";

type RouteMode = "morning" | "afternoon";

type TripDoc = {
  id: string;
  routeName?: string;
  busNumber?: string;
  driverId: string;
  status: TripStatus;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  currentLocation?: { lat: number; lng: number; timestamp: Timestamp };
};

type PassengerDoc = {
  id: string;           // studentId
  name: string;
  grade?: string;
  photoUrl?: string;
  parentPhone?: string;
  // stop coordinates (pickup/home)
  stop?: { lat: number; lng: number };
  // or legacy fields:
  pickupLat?: number;
  pickupLng?: number;

  status: "pending" | "boarded" | "dropped" | "absent";
  address?: string;
};

type SchoolSettings = {
  schoolGeo?: LatLng;
  name?: string;
};

/* --------------------------- Small helper utilities ------------------------ */

const asLatLng = (s: PassengerDoc): LatLng | null => {
  // Prioritize pickupLat/pickupLng first
  if (typeof s.pickupLat === "number" && typeof s.pickupLng === "number") {
    return { lat: s.pickupLat, lng: s.pickupLng };
  }
  // Fallback to existing stop coordinates
  if (s.stop && typeof s.stop.lat === "number" && typeof s.stop.lng === "number") {
    return { lat: s.stop.lat, lng: s.stop.lng };
  }
  return null;
};

const toDriverLatLng = (geo?: { latitude: number; longitude: number } | null): LatLng | undefined =>
  geo ? { lat: geo.latitude, lng: geo.longitude } : undefined;

const fmtTime = (ts?: Timestamp) =>
  ts ? new Date(ts.toDate()).toLocaleTimeString() : "—";

// Haversine distance calculation in kilometers
const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

/* --------------------------------- Page ----------------------------------- */

export default function DriverRoutePage() {
  const router = useRouter();
  const { user, profile, loading: profileLoading } = useProfile(); // expects { schoolId, role, ... }
  const { toast } = useToast();

  // Firestore data
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [trip, setTrip] = useState<TripDoc | null>(null);
  const [passengers, setPassengers] = useState<PassengerDoc[]>([]);

  // Geolocation
  const [driverGeo, setDriverGeo] = useState<{ latitude: number; longitude: number } | null>(null);
  const geoWatchIdRef = useRef<number | null>(null);

  // UI state
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isPassengersOpen, setIsPassengersOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // QR Scanner refs
  const lastScanRef = useRef<{ id: string; at: number } | null>(null);

  // Supervisor mode ref for auto-opening drawer
  const openedBySupervisorRef = useRef(false);

  // Route state
  const [showRoute, setShowRoute] = useState(false);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeMode, setRouteMode] = useState<RouteMode>("morning");
  const isRoutingRef = useRef(false);
  const autoDrawRanRef = useRef(false);

  // Preferences state (Goal 3)
  const [mapTheme, setMapTheme] = useState<"light" | "dark" | "auto">(() => 
    (localStorage.getItem("driver.mapTheme") as any) || "auto" 
  );
  const [haptics, setHaptics] = useState(true);
  const [sound, setSound] = useState(true);
  const [bgLocation, setBgLocation] = useState(true);

  // Location tracking refs (Goal 4)
  const locationWriteCountRef = useRef(0);
  const lastLocationWriteRef = useRef<number>(0);
  const visibilityIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Map reference
  const [mapRef, setMapRef] = useState<google.maps.Map | null>(null);

  // Google Maps
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded } = useJsApiLoader({
    id: "driver-route-map",
    googleMapsApiKey: apiKey,
  });

  // Map theme persistence
  useEffect(() => { 
    localStorage.setItem("driver.mapTheme", mapTheme); 
  }, [mapTheme]);

  // Map style arrays
  const LIGHT_STYLE: google.maps.MapTypeStyle[] = [ 
    { featureType:"poi", elementType:"labels", stylers:[{visibility:"off"}] } 
  ]; 
  const DARK_STYLE: google.maps.MapTypeStyle[] = [ 
    { elementType:"geometry", stylers:[{color:"#242f3e"}]}, 
    { elementType:"labels.text.stroke", stylers:[{color:"#242f3e"}]}, 
    { elementType:"labels.text.fill", stylers:[{color:"#746855"}]}, 
    { featureType:"poi", elementType:"labels", stylers:[{visibility:"off"}]} 
  ];

  // Resolve effective theme
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches; 
  const effectiveTheme = mapTheme === "auto" ? (prefersDark ? "dark" : "light") : mapTheme;

  /* -------------------------- Derived counters/state ------------------------ */

  const counts = useMemo(() => {
    const c = { pending: 0, boarded: 0, dropped: 0, absent: 0 };
    for (const p of passengers) {
      if (p.status in c) (c as any)[p.status] += 1;
      else c.pending += 1;
    }
    return c;
  }, [passengers]);

  const studentsWithCoords = useMemo(() => {
    const withCoords = passengers.filter(p => asLatLng(p) !== null).length;
    const total = passengers.length;
    return { withCoords, total };
  }, [passengers]);

  const driverLatLng = toDriverLatLng(driverGeo);

  const schoolCenter: LatLng | null =
    school?.schoolGeo && typeof school.schoolGeo.lat === "number" && typeof school.schoolGeo.lng === "number"
      ? school.schoolGeo
      : null;

  const mapCenter: LatLng =
    driverLatLng || schoolCenter || { lat: 32.8872, lng: 13.1913 }; // Tripoli fallback

  const tripStarted = trip?.status === "active";

  // Derived canSupervise logic
  const canSupervise = !!(
    (trip && user?.uid && trip.supervisorId === user.uid) ||
    profile?.supervisorMode === true ||
    trip?.allowDriverAsSupervisor === true
  );

  // useEffect for canSupervise toggle with toast notifications and auto-open drawer
  useEffect(() => {
    toast({
      title: canSupervise ? "Supervisor mode ON" : "Supervisor mode OFF",
      description: canSupervise ? "You can board/drop now." : "Board/Drop hidden."
    });

    // Auto-open Passengers drawer when canSupervise && tripStarted (only once)
    if (canSupervise && tripStarted && !openedBySupervisorRef.current) {
      setIsPassengersOpen(true);
      openedBySupervisorRef.current = true;
    }

    // Reset the ref when supervisor mode is turned off
    if (!canSupervise) {
      openedBySupervisorRef.current = false;
    }
  }, [canSupervise, tripStarted, toast]);

  // Apply map styles when effectiveTheme changes
  useEffect(() => { 
    if (!mapRef) return; 
    mapRef.setOptions({ styles: effectiveTheme === "dark" ? DARK_STYLE : LIGHT_STYLE }); 
  }, [mapRef, effectiveTheme]);

  // Next stop calculation (Goal 5)
  const nextStopId = useMemo(() => {
    if (!driverLatLng) return null;
    
    // Filter students based on route mode and status (never include "absent")
    const validStudents = passengers.filter(p => {
      if (p.status === "absent" || !asLatLng(p)) return false;
      if (routeMode === "morning") {
        return p.status === "pending" || p.status === "boarded";
      } else {
        return p.status === "pending";
      }
    });
    
    if (validStudents.length === 0) return null;

    // If we have directions, use the first leg's end location to match student
    if (directions && directions.routes[0]?.legs[0]?.end_location) {
      const firstLegEnd = directions.routes[0].legs[0].end_location;
      let closestStudent = validStudents[0];
      let minDistance = Infinity;
      
      for (const student of validStudents) {
        const studentPos = asLatLng(student);
        if (!studentPos) continue;
        
        const distance = haversineDistance(
          firstLegEnd.lat(),
          firstLegEnd.lng(),
          studentPos.lat,
          studentPos.lng
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestStudent = student;
        }
      }
      
      return closestStudent.id;
    }

    // Fallback: find nearest valid stop to driver using haversine
    let nearestStudent = validStudents[0];
    let minDistance = Infinity;

    for (const student of validStudents) {
      const studentPos = asLatLng(student);
      if (!studentPos) continue;

      const distance = haversineDistance(
        driverLatLng.lat,
        driverLatLng.lng,
        studentPos.lat,
        studentPos.lng
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestStudent = student;
      }
    }

    return nearestStudent.id;
  }, [driverLatLng, passengers, directions, routeMode]);

  /* ---------------------------- Firestore listeners ------------------------- */

  // Load school settings (school geo) from config/profile
  useEffect(() => {
    if (!profile?.schoolId) return;
    const ref = doc(db, "schools", profile.schoolId, "config", "profile");
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSchool({
            schoolGeo: (typeof data.latitude === "number" && typeof data.longitude === "number") 
              ? { lat: data.latitude, lng: data.longitude }
              : undefined,
            name: data.name || "School"
          });
        } else {
          setSchool({ schoolGeo: undefined, name: "School" });
        }
      })
      .catch((err) => {
        console.error("School settings error:", err);
        toast({
          variant: "destructive",
          title: "School location error",
          description: (err?.message || "Missing or insufficient permissions"),
        });
      });
  }, [profile?.schoolId, toast]);

  // Subscribe to driver's "today" trip with status scheduled/active (pick most recent by startedAt)
  useEffect(() => {
    if (!user?.uid || !profile?.schoolId) return;
    // You can refine this query as needed (e.g., startedAt >= startOfDay)
    const tripsQ = query(
      collection(db, "schools", profile.schoolId, "trips"),
      where("driverId", "==", user.uid),
      where("status", "in", ["scheduled", "active"]),
      orderBy("startedAt", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(tripsQ, (snap) => {
      if (snap.empty) {
        setTrip(null);
        setPassengers([]);
        return;
      }
      const d = snap.docs[0];
      const docData = d.data() as Omit<TripDoc, "id">;
      setTrip({ id: d.id, ...docData } as TripDoc);

      // Subscribe passengers under this trip
      const passQ = collection(db, "schools", profile.schoolId, "trips", d.id, "passengers");
      const unsubPass = onSnapshot(passQ, async (ps) => {
        const passengerDocs = ps.docs.map((pd) => ({ id: pd.id, ...(pd.data() as any) }));
        
        // Fetch student data for each passenger to get coordinates
        const enrichedPassengers: PassengerDoc[] = [];
        for (const passenger of passengerDocs) {
          try {
            // Fetch student document using the passenger's studentId (which is the passenger.id)
            const studentRef = doc(db, "schools", profile.schoolId, "students", passenger.id);
            const studentSnap = await getDoc(studentRef);
            
            if (studentSnap.exists()) {
              const studentData = studentSnap.data();
              // Merge passenger data with student coordinate data
              enrichedPassengers.push({
                ...passenger,
                pickupLat: studentData.pickupLat,
                pickupLng: studentData.pickupLng,
                stop: studentData.stop,
                // Also include other useful student fields
                address: studentData.address,
                grade: studentData.grade,
                photoUrl: studentData.photoUrl,
                parentPhone: studentData.parentPhone,
              });
            } else {
              // If student not found, keep passenger as-is
              enrichedPassengers.push(passenger);
            }
          } catch (error) {
            console.error(`Error fetching student data for ${passenger.id}:`, error);
            // If error, keep passenger as-is
            enrichedPassengers.push(passenger);
          }
        }
        
        setPassengers(enrichedPassengers);
      });
      // store cleanup on trip change
      return () => unsubPass();
    });

    return () => unsub();
  }, [user?.uid, profile?.schoolId]);

  /* ---------------------------- Geolocation watch --------------------------- */

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "Geolocation unavailable",
        description: "Your browser does not support geolocation.",
      });
      return;
    }
    // Start watching when page mounts
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverGeo({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : err.code === err.POSITION_UNAVAILABLE
            ? "Location unavailable."
            : err.code === err.TIMEOUT
            ? "Location request timed out."
            : "Location error.";
        toast({ variant: "destructive", title: "Geolocation", description: msg });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );

    return () => {
      if (geoWatchIdRef.current != null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    };
  }, [toast]);

  // Load preferences from localStorage (Goal 3)
  useEffect(() => {
    const savedRouteMode = localStorage.getItem("routeMode") as RouteMode;
    const savedMapTheme = localStorage.getItem("mapTheme") as "light" | "dark";
    const savedHaptics = localStorage.getItem("haptics");
    const savedSound = localStorage.getItem("sound");
    const savedBgLocation = localStorage.getItem("bgLocation");

    if (savedRouteMode && (savedRouteMode === "morning" || savedRouteMode === "afternoon")) {
      setRouteMode(savedRouteMode);
    }
    if (savedMapTheme && (savedMapTheme === "light" || savedMapTheme === "dark")) {
      setMapTheme(savedMapTheme);
    }
    if (savedHaptics !== null) {
      setHaptics(savedHaptics === "true");
    }
    if (savedSound !== null) {
      setSound(savedSound === "true");
    }
    if (savedBgLocation !== null) {
      setBgLocation(savedBgLocation === "true");
    }
  }, []);

  // Save preferences to localStorage when they change (Goal 3)
  useEffect(() => {
    localStorage.setItem("routeMode", routeMode);
  }, [routeMode]);

  useEffect(() => {
    localStorage.setItem("mapTheme", mapTheme);
  }, [mapTheme]);

  useEffect(() => {
    localStorage.setItem("haptics", haptics.toString());
  }, [haptics]);

  useEffect(() => {
    localStorage.setItem("sound", sound.toString());
  }, [sound]);

  useEffect(() => {
    localStorage.setItem("bgLocation", bgLocation.toString());
  }, [bgLocation]);

  // Smart location tracking with visibility-based cadence (Goal 4)
  useEffect(() => {
    if (!tripStarted || !trip || !profile?.schoolId || !driverLatLng) return;

    const writeLocation = async () => {
      // Skip writes when document is hidden and bgLocation is disabled
      if (document.hidden && !bgLocation) return;

      const now = Date.now();
      const timeSinceLastWrite = now - lastLocationWriteRef.current;
      const requiredInterval = document.hidden ? 90000 : 30000; // 90s hidden, 30s visible

      if (timeSinceLastWrite < requiredInterval) return;

      try {
        await updateDoc(doc(db, "schools", profile.schoolId, "trips", trip.id), {
          currentLocation: {
            lat: driverLatLng.lat,
            lng: driverLatLng.lng,
            timestamp: serverTimestamp(),
          },
        });

        lastLocationWriteRef.current = now;
        locationWriteCountRef.current += 1;

        // Every 3rd write, also add to locationHistory
        if (locationWriteCountRef.current % 3 === 0) {
          const historyRef = collection(db, "schools", profile.schoolId, "trips", trip.id, "locationHistory");
          await setDoc(doc(historyRef, `location_${now}`), {
            lat: driverLatLng.lat,
            lng: driverLatLng.lng,
            timestamp: serverTimestamp(),
          });
        }
      } catch (e: any) {
        console.error("Update driver location failed:", e?.message || e);
        toast({
          variant: "destructive",
          title: "Location update failed",
          description: e?.message || "Failed to update location",
        });
      }
    };

    // Initial write
    writeLocation();

    // Set up interval
    const interval = setInterval(writeLocation, 15000); // Check every 15s, but write based on visibility

    return () => clearInterval(interval);
  }, [tripStarted, driverLatLng, trip, profile?.schoolId, bgLocation, toast]);

  // Auto-restore route on mount (Goal 1)
  useEffect(() => {
    const restore = localStorage.getItem("routeDrawn") === "true";
    if (restore && !directions && !routing && !autoDrawRanRef.current && isLoaded) {
      autoDrawRanRef.current = true;
      handleShowRoute();
    }
  }, [isLoaded]); // Only depend on isLoaded to avoid infinite loops

  // Cleanup effect for performance (Goal 7)
  useEffect(() => {
    return () => {
      // Clear any remaining intervals
      if (visibilityIntervalRef.current) {
        clearInterval(visibilityIntervalRef.current);
      }
      
      // Clear geolocation watcher if it exists
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
      }
    };
  }, []);

  /* ------------------------------- Handlers -------------------------------- */

  const handleStartTrip = useCallback(async () => {
    if (!trip || !profile?.schoolId) {
      toast({
        variant: "destructive",
        title: "Cannot Start Trip",
        description: "No trip loaded or school information missing.",
      });
      return;
    }
    if (!driverLatLng) {
      toast({
        variant: "destructive",
        title: "Cannot Start Trip",
        description: "Driver location unavailable. Please enable location services.",
      });
      return;
    }
    try {
      await updateDoc(doc(db, "schools", profile.schoolId, "trips", trip.id), {
        status: "active",
        startedAt: serverTimestamp(),
        currentLocation: { lat: driverLatLng.lat, lng: driverLatLng.lng, timestamp: serverTimestamp() },
      });
      toast({ title: "Trip Started", description: "Route is now active. Safe driving!" });
    } catch (e: any) {
      console.error("Start trip error:", e);
      
      let errorMessage = "Failed to start trip.";
      if (e?.code === "permission-denied") {
        errorMessage = "You don't have permission to start this trip.";
      } else if (e?.code === "unavailable") {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (e?.code === "not-found") {
        errorMessage = "Trip not found. Please refresh and try again.";
      }
      
      toast({ 
        variant: "destructive", 
        title: "Start Trip Failed", 
        description: errorMessage 
      });
    }
  }, [trip, profile?.schoolId, driverLatLng, toast]);

  const handleEndTrip = useCallback(async () => {
    if (!trip || !profile?.schoolId) {
      toast({
        variant: "destructive",
        title: "Cannot End Trip",
        description: "No active trip found.",
      });
      return;
    }
    
    try {
      await updateDoc(doc(db, "schools", profile.schoolId, "trips", trip.id), {
        status: "ended",
        endedAt: serverTimestamp(),
      });
      toast({ title: "Trip Ended", description: "Trip has been successfully ended." });
    } catch (e: any) {
      console.error("End trip error:", e);
      
      let errorMessage = "Failed to end trip.";
      if (e?.code === "permission-denied") {
        errorMessage = "You don't have permission to end this trip.";
      } else if (e?.code === "unavailable") {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (e?.code === "not-found") {
        errorMessage = "Trip not found. Please refresh and try again.";
      }
      
      toast({ 
        variant: "destructive", 
        title: "End Trip Failed", 
        description: errorMessage 
      });
    }
  }, [trip, profile?.schoolId, toast]);

  const handleStatusUpdate = useCallback(
    async (studentId: string, status: PassengerDoc["status"]) => {
      if (!trip || !profile?.schoolId) {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "No active trip or school information available.",
        });
        return;
      }

      if (!canSupervise) {
        toast({
          variant: "destructive",
          title: "Permission Denied",
          description: "You don't have permission to update student status.",
        });
        return;
      }

      const student = passengers.find(p => p.id === studentId);
      const studentName = student?.name || "Student";

      try {
        await updateDoc(doc(db, "schools", profile.schoolId, "trips", trip.id, "passengers", studentId), {
          status,
        });
        
        toast({
          title: "Status Updated",
          description: `${studentName} marked as ${status}`,
        });
      } catch (e: any) {
        console.error("Status update error:", e);
        
        let errorMessage = "Failed to update student status.";
        if (e?.code === "permission-denied") {
          errorMessage = "You don't have permission to update this student.";
        } else if (e?.code === "not-found") {
          errorMessage = "Student record not found.";
        } else if (e?.code === "unavailable") {
          errorMessage = "Network error. Please check your connection.";
        }
        
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: errorMessage,
        });
      }
    },
    [trip, profile?.schoolId, canSupervise, passengers, toast]
  );

  const handleCallParent = useCallback((phone?: string) => {
    if (!phone) return;
    window.location.href = `tel:${phone}`;
  }, []);

  const handleNavigateTo = useCallback((target: LatLng) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`;
    window.open(url, "_blank");
  }, []);

  // Route handling
  const handleDrawFullRoute = useCallback(async () => {
    if (!isLoaded || !schoolCenter || routing) return;
    
    const studentsWithCoords = passengers.filter(p => asLatLng(p) !== null);
    if (studentsWithCoords.length === 0) {
      toast({
        variant: "destructive",
        title: "No Route Available",
        description: "No students with valid coordinates found.",
      });
      return;
    }

    setRouting(true);
    
    try {
      const directionsService = new google.maps.DirectionsService();
      
      // Determine origin and destination based on route mode
      let origin: LatLng;
      let destination: LatLng;
      
      if (routeMode === "morning") {
        // Morning mode: start from driver or school, end at school
        origin = driverLatLng || schoolCenter;
        destination = schoolCenter;
      } else {
        // Afternoon mode: start from school, end at driver or last waypoint
        origin = schoolCenter;
        destination = driverLatLng || asLatLng(studentsWithCoords[studentsWithCoords.length - 1]) || schoolCenter;
      }

      // Create waypoints (up to 23 students with coordinates)
      const waypoints = studentsWithCoords
        .slice(0, 23)
        .map(student => {
          const pos = asLatLng(student);
          return pos ? { location: pos, stopover: true } : null;
        })
        .filter(Boolean) as google.maps.DirectionsWaypoint[];

      const request: google.maps.DirectionsRequest = {
        origin,
        destination,
        waypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
      };

      directionsService.route(request, (result, status) => {
        setRouting(false);
        
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
          localStorage.setItem("routeDrawn", "true");
          toast({
            title: "Route Generated",
            description: `Optimized route with ${waypoints.length} stops created.`,
          });
        } else {
          console.error("Directions request failed:", status);
          
          let errorMessage = "Unable to generate route. You can still navigate to individual stops.";
          let errorTitle = "Route Generation Failed";
          
          switch (status) {
            case google.maps.DirectionsStatus.NOT_FOUND:
              errorMessage = "No route could be found between the specified locations.";
              break;
            case google.maps.DirectionsStatus.ZERO_RESULTS:
              errorMessage = "No route could be found for the given waypoints.";
              break;
            case google.maps.DirectionsStatus.MAX_WAYPOINTS_EXCEEDED:
              errorMessage = "Too many waypoints in the request. Maximum 23 stops allowed.";
              break;
            case google.maps.DirectionsStatus.INVALID_REQUEST:
              errorMessage = "Invalid route request. Please check student locations.";
              break;
            case google.maps.DirectionsStatus.OVER_QUERY_LIMIT:
              errorMessage = "Google Maps quota exceeded. Please try again later.";
              errorTitle = "Service Temporarily Unavailable";
              break;
            case google.maps.DirectionsStatus.REQUEST_DENIED:
              errorMessage = "Route request denied. Please check API permissions.";
              errorTitle = "Permission Denied";
              break;
            case google.maps.DirectionsStatus.UNKNOWN_ERROR:
              errorMessage = "Unknown error occurred. Please try again.";
              break;
          }
          
          toast({
            variant: "destructive",
            title: errorTitle,
            description: errorMessage,
          });
        }
      });
    } catch (error) {
      setRouting(false);
      console.error("Route generation error:", error);
      
      let errorMessage = "Unable to generate route. You can still navigate to individual stops.";
      let errorTitle = "Route Generation Error";
      
      if (error instanceof Error) {
        if (error.message.includes("network") || error.message.includes("fetch")) {
          errorMessage = "Network error. Please check your internet connection and try again.";
          errorTitle = "Network Error";
        } else if (error.message.includes("quota") || error.message.includes("limit")) {
          errorMessage = "Google Maps quota exceeded. Please try again later.";
          errorTitle = "Service Temporarily Unavailable";
        } else if (error.message.includes("permission") || error.message.includes("denied")) {
          errorMessage = "Permission denied. Please check API configuration.";
          errorTitle = "Permission Error";
        }
      }
      
      toast({
        variant: "destructive",
        title: errorTitle,
        description: errorMessage,
      });
    }
  }, [isLoaded, schoolCenter, driverLatLng, passengers, routeMode, routing, toast]);



  const handleNavigateToNext = useCallback(() => {
    if (!nextStopId) {
      toast({
        variant: "destructive",
        title: "No Next Stop",
        description: "No pending stops available for navigation.",
      });
      return;
    }

    const nextStudent = passengers.find(p => p.id === nextStopId);
    const nextPos = nextStudent ? asLatLng(nextStudent) : null;
    
    if (!nextPos) {
      toast({
        variant: "destructive",
        title: "Navigation Error",
        description: "Next stop coordinates not available.",
      });
      return;
    }

    handleNavigateTo(nextPos);
  }, [nextStopId, passengers, handleNavigateTo, toast]);

  const handleRecenter = useCallback(() => {
    if (!mapRef) return;
    
    if (driverLatLng) {
      // Pan to driver location
      mapRef.panTo(driverLatLng);
      mapRef.setZoom(14);
      toast({ title: "Map Recentered", description: "Map centered on your current location." });
    } else {
      // Fit bounds to school + students
      const bounds = new google.maps.LatLngBounds();
      if (schoolCenter) bounds.extend(schoolCenter);
      
      passengers.forEach(p => {
        const pos = asLatLng(p);
        if (pos) bounds.extend(pos);
      });
      
      if (!bounds.isEmpty()) {
        mapRef.fitBounds(bounds);
        toast({ title: "Map Recentered", description: "Map fitted to show all locations." });
      } else {
        // Fallback to default location
        const center = { lat: 32.8872, lng: 13.1913 };
        mapRef.panTo(center);
        mapRef.setZoom(14);
        toast({ title: "Map Recentered", description: "Map centered on default location." });
      }
    }
  }, [driverLatLng, schoolCenter, passengers, toast, mapRef]);

  // Route management handlers (Goal 1)
  const handleShowRoute = useCallback(async () => {
    if (routing || isRoutingRef.current || !isLoaded) return;
    
    setRouting(true);
    isRoutingRef.current = true;
    
    try {
      // Build waypoints from filtered passengers with coords
      const validStudents = passengers.filter(p => {
        const pos = asLatLng(p);
        if (!pos) return false;
        
        if (routeMode === "morning") {
          return p.status === "pending" || p.status === "boarded";
        } else {
          return p.status === "pending";
        }
      });

      if (validStudents.length === 0) {
        toast({
          variant: "destructive",
          title: "No Route Available",
          description: "No students with valid coordinates found.",
        });
        return;
      }

      const directionsService = new google.maps.DirectionsService();
      
      // Determine origin and destination
      let origin: LatLng;
      let destination: LatLng;
      
      if (routeMode === "morning") {
        origin = driverLatLng || schoolCenter || { lat: 32.8872, lng: 13.1913 };
        destination = schoolCenter || { lat: 32.8872, lng: 13.1913 };
      } else {
        origin = schoolCenter || { lat: 32.8872, lng: 13.1913 };
        destination = driverLatLng || asLatLng(validStudents[validStudents.length - 1]) || schoolCenter || { lat: 32.8872, lng: 13.1913 };
      }

      // Create waypoints (up to 23 students)
      const waypoints = validStudents
        .slice(0, 23)
        .map(student => {
          const pos = asLatLng(student);
          return pos ? { location: pos, stopover: true } : null;
        })
        .filter(Boolean) as google.maps.DirectionsWaypoint[];

      const request: google.maps.DirectionsRequest = {
        origin,
        destination,
        waypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
      };

      directionsService.route(request, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
          setShowRoute(true);
          localStorage.setItem("routeDrawn", "true");
          toast({ title: "Route Displayed", description: "Route calculated and displayed on map." });
        } else {
          toast({
            variant: "destructive",
            title: "Route Error",
            description: `Failed to calculate route: ${status}`,
          });
        }
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Route Error",
        description: error?.message || "Failed to calculate route",
      });
    } finally {
      setRouting(false);
      isRoutingRef.current = false;
    }
  }, [routing, passengers, schoolCenter, driverLatLng, routeMode, isLoaded, toast]);

  const handleClearRoute = useCallback(() => {
    setDirections(null);
    setShowRoute(false);
    localStorage.removeItem("routeDrawn");
    autoDrawRanRef.current = true;
    toast({ title: "Route Cleared", description: "Route removed from map." });
  }, [toast]);

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    setMapRef(map);
  }, []);

  // Memoized student markers for performance (Goal 7)
  const studentMarkers = useMemo(() => {
    return passengers.map((p) => {
      const pos = asLatLng(p);
      if (!pos) return null;
      
      // Highlight next stop with green marker
      const isNextStop = p.id === nextStopId;
      const icon = isNextStop 
        ? "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
        : "https://maps.google.com/mapfiles/ms/icons/red-dot.png";
      
      return (
        <Marker
          key={`${p.id}-${p.status}-${pos.lat}-${pos.lng}`}
          position={pos}
          title={p.name}
          icon={icon}
          onClick={() => setSelectedStudentId(p.id)}
        />
      );
    }).filter(Boolean);
  }, [passengers, nextStopId]);

  // QR Scanner effect
  useEffect(() => {
    if (!isQrOpen || !tripStarted || !canSupervise) return;
    let stop = false;
    let qrScanner: any = null;
    const el = document.getElementById("qr-area");
    if (!el) return;

    const handleScan = async (code: string) => {
      if (stop) return;
      
      let studentId = "";
      try {
        const parsed = JSON.parse(code);
        studentId = parsed?.studentId || code;
      } catch { studentId = code; }

      const now = Date.now();
      if (lastScanRef.current && lastScanRef.current.id === studentId && now - lastScanRef.current.at < 5000) {
        return;
      }
      lastScanRef.current = { id: studentId, at: now };

      const match = passengers.find(p => p.id === studentId);
      if (!match) {
        toast({ variant: "destructive", title: "Unknown code", description: studentId });
      } else {
        const target = routeMode === "morning" ? "boarded" : "dropped";
        await handleStatusUpdate(studentId, target as any);
        toast({ title: "Updated", description: `${match.name} → ${target}` });
      }
    };

    // Try BarcodeDetector first (Chrome/Edge)
    if ((window as any).BarcodeDetector) {
      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code", "code_128"] });
      const video = document.createElement("video");
      video.playsInline = true;
      video.autoplay = true;
      video.muted = true;
      video.style.width = "100%";
      video.style.maxHeight = "50vh";
      el.innerHTML = "";
      el.appendChild(video);

      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
          if (stop) { stream.getTracks().forEach(t => t.stop()); return; }
          video.srcObject = stream;
          const loop = async () => {
            if (stop) return;
            try {
              const codes = await detector.detect(video);
              const code = codes?.[0]?.rawValue;
              if (code) {
                await handleScan(code);
              }
            } catch {}
            requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        })
        .catch(() => { el.textContent = "Camera permission denied."; });

      return () => {
        stop = true;
        try {
          const stream = (video.srcObject as MediaStream | null);
          stream?.getTracks().forEach(t => t.stop());
        } catch {}
      };
    } else {
      // Fallback to qr-scanner library
      import('qr-scanner').then(({ default: QrScanner }) => {
        if (stop) return;
        
        const video = document.createElement("video");
        video.playsInline = true;
        video.autoplay = true;
        video.muted = true;
        video.style.width = "100%";
        video.style.maxHeight = "50vh";
        el.innerHTML = "";
        el.appendChild(video);

        qrScanner = new QrScanner(
          video,
          (result: any) => handleScan(result.data),
          {
            preferredCamera: 'environment',
            highlightScanRegion: true,
            highlightCodeOutline: true,
          }
        );

        qrScanner.start().catch((error: any) => {
          console.error('QR Scanner error:', error);
          el.textContent = "Camera permission denied or not available.";
        });
      }).catch(() => {
        el.textContent = "QR Scanner not available.";
      });

      return () => {
        stop = true;
        if (qrScanner) {
          qrScanner.destroy();
        }
      };
    }
  }, [isQrOpen, tripStarted, canSupervise, passengers, routeMode, handleStatusUpdate, toast]);

  /* --------------------------------- UI ------------------------------------ */

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-sm opacity-70">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm">Please sign in to view your route.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[calc(100vh-0px)] overflow-hidden">
      {/* Header badge card */}
      <Card className="absolute top-3 left-3 right-3 z-20 shadow-md">
        <CardContent className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 opacity-70" />
            <div className="text-sm font-medium">
              {trip?.routeName || "Route"}
              {trip?.busNumber ? <span className="ml-2 opacity-70">• Bus {trip.busNumber}</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={tripStarted ? "default" : "secondary"}>
              {tripStarted ? "Active" : (trip?.status ?? "—")}
            </Badge>
            {trip?.startedAt && <Badge variant="outline">Started {fmtTime(trip.startedAt)}</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Floating counts */}
      <div className="absolute top-3 right-3 z-30">
        <div className="bg-white/90 backdrop-blur rounded-lg shadow p-2 flex gap-2 text-xs">
          <Badge variant="outline">Pending: {counts.pending}</Badge>
          <Badge variant="outline">Boarded: {counts.boarded}</Badge>
          <Badge variant="outline">Dropped: {counts.dropped}</Badge>
          <Badge variant="outline">Absent: {counts.absent}</Badge>
          {canSupervise ? (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              Supervisor Mode
            </Badge>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    View-only
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Board/Drop requires supervisor assignment or driver supervisor mode.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Diagnostic chip for students with coordinates */}
      <div className="absolute top-16 right-3 z-30">
        <div className="bg-white/90 backdrop-blur rounded-lg shadow p-2">
          <Badge variant="outline" className="text-xs">
            Students with coords: {studentsWithCoords.withCoords}/{studentsWithCoords.total}
          </Badge>
        </div>
      </div>

      {/* Start/End & Route controls */}
      <div className="absolute top-20 left-3 z-30 flex gap-2 flex-wrap">
        {!tripStarted ? (
          <Button onClick={handleStartTrip}>
            <Play className="h-4 w-4 mr-2" />
            Start Trip
          </Button>
        ) : (
          <Button variant="destructive" onClick={handleEndTrip}>
            <Square className="h-4 w-4 mr-2" />
            End Trip
          </Button>
        )}
        
        {/* Route controls */}
        {!directions ? (
          <Button 
            onClick={handleDrawFullRoute} 
            disabled={routing || studentsWithCoords.withCoords === 0}
            variant="outline"
          >
            <Route className="h-4 w-4 mr-2" />
            {routing ? "Routing..." : "Show Route"}
          </Button>
        ) : (
          <Button onClick={handleClearRoute} variant="outline">
            <Route className="h-4 w-4 mr-2" />
            Clear Route
          </Button>
        )}

        {/* Navigate to Next */}
        <Button 
          onClick={handleNavigateToNext}
          disabled={!nextStopId}
          variant="outline"
        >
          <Target className="h-4 w-4 mr-2" />
          Navigate to Next
        </Button>

        {/* Morning/Afternoon Toggle */}
        <Button 
          onClick={() => setRouteMode(routeMode === "morning" ? "afternoon" : "morning")}
          variant="outline"
          size="sm"
        >
          {routeMode === "morning" ? <Sun className="h-4 w-4 mr-1" /> : <Moon className="h-4 w-4 mr-1" />}
          {routeMode === "morning" ? "Morning" : "Afternoon"}
        </Button>
      </div>

      {/* Bottom-left button cluster */}
      <div className="absolute bottom-6 left-3 z-30 flex gap-2">
        <Button onClick={handleRecenter} variant="outline" size="sm">
          <RotateCcw className="h-4 w-4 mr-2" />
          Recenter
        </Button>
        {!directions ? (
          <Button size="sm" onClick={handleShowRoute} disabled={routing}>
            <Route className="h-4 w-4 mr-2" />
            {routing ? "Routing..." : "Show Route"}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={handleClearRoute}>
            <Route className="h-4 w-4 mr-2" />
            Clear Route
          </Button>
        )}
      </div>

      {/* Floating buttons */}
      <div className="absolute bottom-6 right-3 z-30 flex flex-col gap-3">
        <Button className="rounded-full w-14 h-14 shadow" onClick={() => setIsPassengersOpen(true)}>
          <Users className="h-6 w-6" />
        </Button>
        <Button className="rounded-full w-14 h-14 shadow" variant="outline" onClick={() => setIsQrOpen(true)}>
          <QrCode className="h-6 w-6" />
        </Button>
        <Button className="rounded-full w-14 h-14 shadow" variant="outline" onClick={() => setShowSettings(true)}>
          <Settings className="h-6 w-6" />
        </Button>
      </div>

      {/* Map */}
      <div className="w-full h-full">
        {!apiKey ? (
          <div className="p-4 text-sm">Google Maps API key missing (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).</div>
        ) : !isLoaded ? (
          <div className="p-4 text-sm">Loading map…</div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={mapCenter}
            zoom={14}
            onLoad={handleMapLoad}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
              gestureHandling: "greedy",
            }}
          >
            {/* Directions Renderer */}
            {directions && (
              <DirectionsRenderer 
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: {
                    strokeColor: "#2563eb",
                    strokeWeight: 4,
                    strokeOpacity: 0.8,
                  },
                }}
              />
            )}

            {/* School marker */}
            {schoolCenter && (
              <Marker
                position={schoolCenter}
                title={school?.name || "School"}
                icon={"https://maps.google.com/mapfiles/ms/icons/blue-dot.png"}
              />
            )}

            {/* Driver marker */}
            {driverLatLng && (
              <Marker
                position={driverLatLng}
                title="You"
                icon={"https://maps.google.com/mapfiles/ms/icons/bus.png"}
              />
            )}

            {/* Student markers */}
            {studentMarkers}

            {/* Student InfoWindow */}
            {selectedStudentId && (() => {
              const s = passengers.find((x) => x.id === selectedStudentId);
              const pos = s ? asLatLng(s) : null;
              if (!s || !pos) return null;
              return (
                <InfoWindow position={pos} onCloseClick={() => setSelectedStudentId(null)}>
                  <div className="min-w-[220px]">
                    <div className="flex items-center gap-2 mb-2">
                      {s.photoUrl ? (
                        <img src={s.photoUrl} alt={s.name} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <Users className="h-5 w-5 text-gray-500" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold">{s.name}</div>
                        {s.grade && <div className="text-xs text-gray-500">Grade {s.grade}</div>}
                        {s.id === nextStopId && (
                          <Badge variant="default" className="text-xs mt-1">Next Stop</Badge>
                        )}
                      </div>
                    </div>

                    {s.address && <div className="text-xs mb-2">{s.address}</div>}

                    <div className="flex flex-wrap gap-2 mb-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCallParent(s.parentPhone)}
                        disabled={!s.parentPhone}
                      >
                        <Phone className="h-3 w-3 mr-1" />
                        Call Parent
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleNavigateTo(pos)}>
                        <Navigation className="h-3 w-3 mr-1" />
                        Navigate
                      </Button>
                    </div>

                    {tripStarted && (
                      <>
                        <div className="text-xs mb-1 text-gray-600">Quick Status:</div>
                        <div className={`flex gap-1 ${canSupervise ? "" : "opacity-50 pointer-events-none"}`}>
                          <Button size="sm" variant={s.status === "boarded" ? "default" : "outline"} onClick={() => handleStatusUpdate(s.id, "boarded")}>
                            Board
                          </Button>
                          <Button size="sm" variant={s.status === "dropped" ? "default" : "outline"} onClick={() => handleStatusUpdate(s.id, "dropped")}>
                            Drop
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </InfoWindow>
              );
            })()}
          </GoogleMap>
        )}
      </div>

      {/* Passenger Sheet */}
      <Sheet open={isPassengersOpen} onOpenChange={setIsPassengersOpen}>
        <SheetContent side="bottom" className="h-[75vh] overflow-hidden">
          <SheetHeader>
            <SheetTitle>Passengers ({passengers.length})</SheetTitle>
          </SheetHeader>
          <div className="mt-4 h-full overflow-auto space-y-2">
            {passengers.map(p => {
              const pos = asLatLng(p);
              return (
                <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {p.photoUrl 
                      ? <img src={p.photoUrl} className="h-10 w-10 rounded-full object-cover" /> 
                      : <div className="h-10 w-10 rounded-full bg-gray-200" />}
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-500">
                        {p.grade ? `Grade ${p.grade}` : ""} {p.address ? `• ${p.address}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{p.status}</Badge>
                    <Button size="sm" variant="outline" onClick={() => handleCallParent(p.parentPhone)} disabled={!p.parentPhone}>
                      Call
                    </Button>
                    {pos && (
                      <Button size="sm" variant="outline" onClick={() => handleNavigateTo(pos)}>Nav</Button>
                    )}
                    {tripStarted && (
                      <div className={`flex gap-1 ${canSupervise ? "" : "opacity-50 pointer-events-none"}`}>
                        <Button size="sm" onClick={() => handleStatusUpdate(p.id, "boarded")}>Board</Button>
                        <Button size="sm" variant="secondary" onClick={() => handleStatusUpdate(p.id, "dropped")}>Drop</Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* QR Scanner Sheet */}
      <Sheet open={isQrOpen} onOpenChange={setIsQrOpen}>
        <SheetContent side="bottom" className="h-[70vh]">
          <SheetHeader><SheetTitle>QR Scanner</SheetTitle></SheetHeader>
          {!tripStarted || !canSupervise ? (
            <div className="mt-4 text-sm text-gray-600">Scanner available only when trip is active and you have supervisor permissions.</div>
          ) : <div id="qr-area" className="mt-4"></div>}
        </SheetContent>
      </Sheet>

      {/* Settings Sheet */}
      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent side="bottom" className="h-[40vh]">
          <SheetHeader><SheetTitle>Map Settings</SheetTitle></SheetHeader>
          <div className="mt-4">
            <h3 className="text-sm font-medium mb-3">Map Theme</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="radio" name="mapTheme" checked={mapTheme==="auto"} onChange={()=>setMapTheme("auto")} />
                Auto (system)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mapTheme" checked={mapTheme==="light"} onChange={()=>setMapTheme("light")} />
                Light
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mapTheme" checked={mapTheme==="dark"} onChange={()=>setMapTheme("dark")} />
                Dark
              </label>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}