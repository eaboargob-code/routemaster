"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  School, 
  Navigation, 
  Clock, 
  Route as RouteIcon,
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  Phone,
  Play,
  Square
} from 'lucide-react';
import { 
  StudentLocation, 
  SchoolLocation, 
  DriverLocation,
  OptimizedStop, 
  optimizeRoute, 
  getRouteStatistics,
  getNextStop
} from '@/lib/routeOptimization';

// Helper function to validate location coordinates
function isValidLocation(location: { lat: number; lng: number } | null): location is { lat: number; lng: number } {
  return location !== null && 
    typeof location.lat === 'number' && 
    typeof location.lng === 'number' &&
    !isNaN(location.lat) && 
    !isNaN(location.lng);
}

interface PassengerStatus {
  studentId: string;
  status: 'pending' | 'boarded' | 'dropped' | 'absent';
  timestamp?: any;
}

interface RouteStats {
  totalDistance: number;
  estimatedTime: number;
  studentsCount: number;
  completedStops: number;
}

interface GoogleRouteMapProps {
  students: {
    studentId: string;
    name: string;
    lat: number;
    lng: number;
    address: string;
    photoUrl?: string;
    grade?: string;
    pickupTime?: string;
    specialNeeds?: string;
  }[];
  schoolLocation: { lat: number; lng: number } | null;
  optimizedStops: OptimizedStop[];
  routeStats: RouteStats;
  driverLocation?: DriverLocation;
  passengerStatuses?: PassengerStatus[];
  currentStopIndex?: number;
  onNavigateToStop?: (stop: OptimizedStop) => void;
  onCallParent?: (studentId: string, phoneNumber?: string) => void;
  onStartTrip?: (driverLocation: { lat: number; lng: number }) => void;
  onStopTrip?: () => void;
  className?: string;
  tripStarted?: boolean;
}

// Google Maps component
function GoogleMap({ 
  students, 
  schoolLocation, 
  optimizedStops, 
  driverLocation,
  currentDriverLocation,
  passengerStatuses = [],
  currentStopIndex = 0,
  onNavigateToStop,
  tripStarted = false,
  routeCoordinates
}: {
  students: {
    studentId: string;
    name: string;
    lat: number;
    lng: number;
    address: string;
    photoUrl?: string;
    grade?: string;
    pickupTime?: string;
    specialNeeds?: string;
  }[];
  schoolLocation: { lat: number; lng: number } | null;
  optimizedStops: OptimizedStop[];
  driverLocation?: DriverLocation;
  currentDriverLocation?: { lat: number; lng: number } | null;
  passengerStatuses: PassengerStatus[];
  currentStopIndex: number;
  onNavigateToStop?: (stop: OptimizedStop) => void;
  tripStarted: boolean;
  routeCoordinates: google.maps.LatLngLiteral[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map>();
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService>();
  const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer>();
  const markersRef = useRef<(google.maps.marker.AdvancedMarkerElement | google.maps.Marker)[]>([]);

  // Create custom marker with student photo
  const createStudentPhotoMarker = (photoUrl: string | undefined, status: string, index: number, currentStopIndex: number): string => {
    // Determine border color based on status
    let borderColor = '#3b82f6'; // Default blue
    if (status === 'boarded') borderColor = '#22c55e'; // Green
    else if (status === 'absent') borderColor = '#ef4444'; // Red
    else if (index === currentStopIndex) borderColor = '#f59e0b'; // Orange for current
    else if (index === currentStopIndex + 1) borderColor = '#8b5cf6'; // Purple for next

    // Create SVG marker with photo or fallback
    const size = 40;
    const borderWidth = 3;
    
    if (photoUrl) {
      // SVG with student photo
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="circle-clip">
              <circle cx="${size/2}" cy="${size/2}" r="${(size-borderWidth*2)/2}"/>
            </clipPath>
          </defs>
          <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${borderColor}"/>
          <circle cx="${size/2}" cy="${size/2}" r="${(size-borderWidth*2)/2}" fill="white"/>
          <image x="${borderWidth}" y="${borderWidth}" width="${size-borderWidth*2}" height="${size-borderWidth*2}" 
                 href="${photoUrl}" clip-path="url(#circle-clip)" preserveAspectRatio="xMidYMid slice"/>
        </svg>
      `)}`;
    } else {
      // SVG with fallback icon
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${borderColor}"/>
          <circle cx="${size/2}" cy="${size/2}" r="${(size-borderWidth*2)/2}" fill="white"/>
          <g transform="translate(${size/2-8}, ${size/2-8})">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" 
                  fill="#6b7280" stroke="none"/>
          </g>
        </svg>
      `)}`;
    }
  };

  // Create custom marker with yellow school bus icon
  const createDriverBusMarker = (): string => {
    const size = 50;
    const borderWidth = 3;
    const borderColor = '#f59e0b'; // Orange/yellow border
    
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${borderColor}"/>
        <circle cx="${size/2}" cy="${size/2}" r="${(size-borderWidth*2)/2}" fill="white"/>
        <g transform="translate(${size/2-14}, ${size/2-10})">
          <!-- School bus body -->
          <rect x="2" y="8" width="24" height="12" rx="2" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/>
          <!-- Bus front -->
          <rect x="0" y="10" width="4" height="8" rx="1" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/>
          <!-- Windows -->
          <rect x="4" y="10" width="4" height="3" fill="#93c5fd"/>
          <rect x="9" y="10" width="4" height="3" fill="#93c5fd"/>
          <rect x="14" y="10" width="4" height="3" fill="#93c5fd"/>
          <rect x="19" y="10" width="4" height="3" fill="#93c5fd"/>
          <!-- Wheels -->
          <circle cx="6" cy="20" r="2" fill="#374151"/>
          <circle cx="20" cy="20" r="2" fill="#374151"/>
          <!-- Door -->
          <rect x="24" y="12" width="2" height="6" fill="#dc2626"/>
          <!-- School text -->
          <text x="13" y="17" font-family="Arial" font-size="3" fill="#dc2626" text-anchor="middle" font-weight="bold">SCHOOL</text>
        </g>
      </svg>
    `)}`;
  };

  // Create custom marker with school building icon
  const createSchoolMarker = (): string => {
    const size = 45;
    const borderWidth = 3;
    const borderColor = '#10b981'; // Green for school
    
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${borderColor}"/>
        <circle cx="${size/2}" cy="${size/2}" r="${(size-borderWidth*2)/2}" fill="white"/>
        <g transform="translate(${size/2-12}, ${size/2-12})">
          <path d="M12 3L2 12h3v8h14v-8h3L12 3zm0 2.69L18 11v7h-3v-6H9v6H6v-7l6-5.31z" 
                fill="#10b981" stroke="none"/>
          <rect x="10" y="14" width="4" height="4" fill="#10b981"/>
          <rect x="7" y="13" width="2" height="2" fill="#10b981"/>
          <rect x="15" y="13" width="2" height="2" fill="#10b981"/>
        </g>
      </svg>
    `)}`;
  };

  // Initialize map
  useEffect(() => {
    if (ref.current && !map) {
      // Debug: Log the schoolLocation being used for map center
      console.log('[GoogleRouteMap] Initializing map with schoolLocation:', schoolLocation);
      console.log('[GoogleRouteMap] isValidLocation(schoolLocation):', isValidLocation(schoolLocation));
      
      const mapCenter = isValidLocation(schoolLocation) ? schoolLocation : { lat: 0, lng: 0 };
      console.log('[GoogleRouteMap] Map center will be set to:', mapCenter);
      
      // Check if this is New York coordinates
      if (mapCenter.lat >= 40.0 && mapCenter.lat <= 41.0 && mapCenter.lng >= -75.0 && mapCenter.lng <= -73.0) {
        console.warn('[GoogleRouteMap] 🗽 WARNING: Map center is in New York area!', mapCenter);
        console.warn('[GoogleRouteMap] schoolLocation source:', schoolLocation);
      }
      
      const newMap = new google.maps.Map(ref.current, {
        center: mapCenter,
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        mapId: 'DEMO_MAP_ID', // Required for Advanced Markers
        // Mobile-optimized controls
        zoomControl: true,
        mapTypeControl: false,
        scaleControl: false,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: true,
        gestureHandling: 'greedy', // Better for mobile touch
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
          }
        ]
      });
      
      const service = new google.maps.DirectionsService();
      const renderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true, // We'll add custom markers
        polylineOptions: {
          strokeColor: '#3b82f6',
          strokeWeight: 4,
          strokeOpacity: 0.8
        }
      });
      
      renderer.setMap(newMap);
      
      setMap(newMap);
      setDirectionsService(service);
      setDirectionsRenderer(renderer);
      
      
    }
  }, [schoolLocation]);

  // Clear existing markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];
  }, []);

  // Add markers to map
  useEffect(() => {
    if (!map) return;

    clearMarkers();

    // School marker - only create if valid location
    if (isValidLocation(schoolLocation)) {
      let schoolMarker;
      
      // Try to use AdvancedMarkerElement if available, fallback to regular Marker
      if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        // Create marker content element
        const markerContent = document.createElement('img');
        markerContent.src = createSchoolMarker();
        markerContent.style.width = '45px';
        markerContent.style.height = '45px';
        markerContent.style.cursor = 'pointer';
        
        schoolMarker = new google.maps.marker.AdvancedMarkerElement({
          position: schoolLocation,
          map: map,
          title: 'School',
          content: markerContent
        });
      } else {
        // Fallback to regular Marker
        schoolMarker = new google.maps.Marker({
          position: schoolLocation,
          map: map,
          title: 'School',
          icon: {
            url: createSchoolMarker(),
            scaledSize: new google.maps.Size(45, 45),
            anchor: new google.maps.Point(22.5, 22.5)
          }
        });
      }
      
      markersRef.current.push(schoolMarker as any);
    }

    // Driver marker - use current driver location if available, otherwise use props
    const activeDriverLocation = currentDriverLocation || 
      (driverLocation && typeof driverLocation.latitude === 'number' && typeof driverLocation.longitude === 'number' 
        ? { lat: driverLocation.latitude, lng: driverLocation.longitude } 
        : null);
    
    if (activeDriverLocation) {
      let driverMarker;
      
      // Try to use AdvancedMarkerElement if available, fallback to regular Marker
      if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        // Create marker content element
        const driverMarkerContent = document.createElement('img');
        driverMarkerContent.src = createDriverBusMarker();
        driverMarkerContent.style.width = '50px';
        driverMarkerContent.style.height = '50px';
        driverMarkerContent.style.cursor = 'pointer';
        
        driverMarker = new google.maps.marker.AdvancedMarkerElement({
          position: activeDriverLocation,
          map: map,
          title: 'Driver Location (You)',
          content: driverMarkerContent
        });
      } else {
        // Fallback to regular Marker
        driverMarker = new google.maps.Marker({
          position: activeDriverLocation,
          map: map,
          title: 'Driver Location (You)',
          icon: {
            url: createDriverBusMarker(),
            scaledSize: new google.maps.Size(50, 50),
            anchor: new google.maps.Point(25, 25)
          }
        });
      }
      
      markersRef.current.push(driverMarker as any);
    }

    // Student markers
      const validStops = optimizedStops.filter(stop => stop.student.latitude && stop.student.longitude);
      
      validStops.forEach((stop, index) => {
        const passengerStatus = passengerStatuses.find(p => p.studentId === stop.student.id);
        const status = passengerStatus?.status || 'pending';
        
        let studentMarker;
        
        // Try to use AdvancedMarkerElement if available, fallback to regular Marker
        if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
          // Create marker content element
          const studentMarkerContent = document.createElement('img');
          studentMarkerContent.src = createStudentPhotoMarker(stop.student.photoUrl, status, index, currentStopIndex);
          studentMarkerContent.style.width = '40px';
          studentMarkerContent.style.height = '40px';
          studentMarkerContent.style.cursor = 'pointer';
          
          studentMarker = new google.maps.marker.AdvancedMarkerElement({
            position: { lat: stop.student.latitude, lng: stop.student.longitude },
            map: map,
            title: stop.student.name,
            content: studentMarkerContent
          });
        } else {
          // Fallback to regular Marker
          studentMarker = new google.maps.Marker({
            position: { lat: stop.student.latitude, lng: stop.student.longitude },
            map: map,
            title: stop.student.name,
            icon: {
              url: createStudentPhotoMarker(stop.student.photoUrl, status, index, currentStopIndex),
              scaledSize: new google.maps.Size(40, 40),
              anchor: new google.maps.Point(20, 20)
            }
          });
        }

        // Add click listener for navigation
        studentMarker.addListener('click', () => {
          if (onNavigateToStop) {
            onNavigateToStop(stop);
          }
        });

        markersRef.current.push(studentMarker);
      });

    // Fit bounds to show all markers
    if (markersRef.current.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      markersRef.current.forEach(marker => {
        let position;
        if ('position' in marker && marker.position) {
          position = marker.position;
        } else if ('getPosition' in marker && marker.getPosition) {
          position = marker.getPosition();
        }
        if (position) {
          bounds.extend(position);
        }
      });
      map.fitBounds(bounds);
    }

  }, [map, optimizedStops, driverLocation, currentDriverLocation, passengerStatuses, currentStopIndex, schoolLocation, onNavigateToStop, clearMarkers]);

  // Draw route when trip is started
  useEffect(() => {
    if (!map || !directionsService || !directionsRenderer || !tripStarted || routeCoordinates.length < 2) {
      return;
    }

    // Create waypoints from route coordinates (excluding start and end)
    const waypoints = routeCoordinates.slice(1, -1).map(coord => ({
      location: coord,
      stopover: true
    }));

    const request: google.maps.DirectionsRequest = {
      origin: routeCoordinates[0],
      destination: routeCoordinates[routeCoordinates.length - 1],
      waypoints: waypoints,
      optimizeWaypoints: false, // We already have optimized order
      travelMode: google.maps.TravelMode.DRIVING
    };

    directionsService.route(request, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result) {
        directionsRenderer.setDirections(result);
      } else {
        console.error('Directions request failed:', status);
      }
    });

  }, [map, directionsService, directionsRenderer, tripStarted, routeCoordinates]);
 
   return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
  }

// Loading component
const MapLoading = ({ status }: { status: Status }) => {
  if (status === Status.LOADING) return <div className="flex items-center justify-center h-full">Loading Google Maps...</div>;
  if (status === Status.FAILURE) return <div className="flex items-center justify-center h-full text-red-500">Error loading Google Maps</div>;
  return null;
};

export default function GoogleRouteMap({
  students,
  schoolLocation,
  optimizedStops,
  routeStats,
  driverLocation,
  passengerStatuses = [],
  currentStopIndex = 0,
  onNavigateToStop,
  onCallParent,
  onStartTrip,
  onStopTrip,
  className,
  tripStarted = false,
}: GoogleRouteMapProps) {
  const [currentDriverLocation, setCurrentDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Validation function for coordinates
  const isValidLocation = (location: { lat: number; lng: number }) => {
    return location && 
           typeof location.lat === 'number' && 
           typeof location.lng === 'number' && 
           !isNaN(location.lat) && 
           !isNaN(location.lng) &&
           location.lat >= -90 && location.lat <= 90 &&
           location.lng >= -180 && location.lng <= 180;
  };

  // Get current location for trip start
  const getCurrentLocation = () => {
    return new Promise<{ lat: number; lng: number }>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => reject(error),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  };

  // Handle trip start
  const handleStartTrip = async () => {
    try {
      const location = await getCurrentLocation();
      setCurrentDriverLocation(location);
      if (onStartTrip) {
        onStartTrip(location);
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      alert('Unable to get your current location. Please enable location services.');
    }
  };

  // Handle trip stop
  const handleStopTrip = () => {
    setCurrentDriverLocation(null);
    if (onStopTrip) {
      onStopTrip();
    }
  };

  // Create route coordinates for Google Maps
  const routeCoordinates: google.maps.LatLngLiteral[] = [];
  
  // Determine active driver location
  const activeDriverLocation = currentDriverLocation || 
    (driverLocation && typeof driverLocation.latitude === 'number' && typeof driverLocation.longitude === 'number' 
      ? { lat: driverLocation.latitude, lng: driverLocation.longitude } 
      : null);
  
  if (tripStarted && activeDriverLocation) {
    // Start from driver's current location
    routeCoordinates.push(activeDriverLocation);
    
    // Add student stops
    optimizedStops
      .filter(stop => typeof stop.student.latitude === 'number' && typeof stop.student.longitude === 'number')
      .forEach(stop => {
        routeCoordinates.push({
          lat: stop.student.latitude,
          lng: stop.student.longitude
        });
      });
    
    // End at school
    if (isValidLocation(schoolLocation)) {
      routeCoordinates.push(schoolLocation);
    }
  }

  // Get next stop information
  const nextStop = getNextStop(optimizedStops, currentStopIndex);
  const currentStop = optimizedStops[currentStopIndex];

  // Calculate statistics
  const completedStops = passengerStatuses.filter(p => p.status === 'boarded' || p.status === 'dropped').length;
  const pendingStudents = optimizedStops.length - completedStops;

  if (!isValidLocation(schoolLocation)) {
    return (
      <Card className={`w-full ${className}`}>
        <CardContent className="p-6">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Map Unavailable</h3>
            <p className="text-muted-foreground">
              School location coordinates are not available. Please contact your administrator to set up the school location.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'your_google_maps_api_key_here') {
    return (
      <Card className={`w-full ${className}`}>
        <CardContent className="p-6">
          <div className="text-center text-red-500">
            <AlertCircle className="mx-auto mb-2" size={24} />
            <p>Google Maps API key not configured</p>
            <p className="text-sm mt-1">Please add your API key to .env.local</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Trip Control */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <RouteIcon className="h-5 w-5" />
              Trip Control
            </CardTitle>
            <div className="flex gap-2">
              {!tripStarted ? (
                <Button onClick={handleStartTrip} className="flex items-center gap-2 w-full sm:w-auto" size="sm">
                  <Play className="h-4 w-4" />
                  Start Trip
                </Button>
              ) : (
                <Button onClick={handleStopTrip} variant="destructive" className="flex items-center gap-2 w-full sm:w-auto" size="sm">
                  <Square className="h-4 w-4" />
                  Stop Trip
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        {tripStarted && currentDriverLocation && (
          <CardContent className="pt-0">
            <div className="text-sm text-gray-600">
              Trip started from: {currentDriverLocation.lat.toFixed(6)}, {currentDriverLocation.lng.toFixed(6)}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Route Statistics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <RouteIcon className="h-5 w-5" />
            Route Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="text-center p-2 sm:p-3 bg-blue-50 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold text-blue-600">{optimizedStops.length}</div>
              <div className="text-xs sm:text-sm text-gray-600">Total Stops</div>
            </div>
            <div className="text-center p-2 sm:p-3 bg-green-50 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold text-green-600">{completedStops}</div>
              <div className="text-xs sm:text-sm text-gray-600">Completed</div>
            </div>
            <div className="text-center p-2 sm:p-3 bg-orange-50 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold text-orange-600">{pendingStudents}</div>
              <div className="text-xs sm:text-sm text-gray-600">Pending</div>
            </div>
            <div className="text-center p-2 sm:p-3 bg-purple-50 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold text-purple-600">
                {routeStats.estimatedTime ? `${Math.round(routeStats.estimatedTime)}m` : 'N/A'}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">Est. Time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Map */}
      <Card>
        <CardContent className="p-0">
          <div className="h-64 sm:h-80 md:h-96 w-full rounded-lg overflow-hidden">
            <Wrapper apiKey={apiKey} libraries={['marker']} render={MapLoading}>
              <GoogleMap
                students={students}
                schoolLocation={schoolLocation}
                optimizedStops={optimizedStops}
                driverLocation={currentDriverLocation ? { latitude: currentDriverLocation.lat, longitude: currentDriverLocation.lng } : driverLocation}
                currentDriverLocation={currentDriverLocation}
                passengerStatuses={passengerStatuses}
                currentStopIndex={currentStopIndex}
                onNavigateToStop={onNavigateToStop}
                tripStarted={tripStarted}
                routeCoordinates={routeCoordinates}
              />
            </Wrapper>
          </div>
        </CardContent>
      </Card>

      {/* Current Stop Info */}
      {currentStop && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Current Stop
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1">
                <h3 className="font-semibold text-base">{currentStop.student.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{currentStop.student.address}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Stop {currentStopIndex + 1} of {optimizedStops.length}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {currentStop.student.parentPhone && onCallParent && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCallParent(currentStop.student.id, currentStop.student.parentPhone)}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px]"
                  >
                    <Phone className="h-4 w-4" />
                    Call Parent
                  </Button>
                )}
                {onNavigateToStop && (
                  <Button
                    size="sm"
                    onClick={() => onNavigateToStop(currentStop)}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px]"
                  >
                    <Navigation className="h-4 w-4" />
                    Navigate
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Stop Info */}
      {nextStop && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Next Stop
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1">
                <h3 className="font-semibold text-base">{nextStop.student.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{nextStop.student.address}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Distance: {nextStop.distanceFromPrevious?.toFixed(1)} km
                </p>
              </div>
              <Badge variant="outline" className="self-start sm:self-center">Next</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}