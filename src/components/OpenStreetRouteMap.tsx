"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

// Fix for default markers in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons for different marker types
const createCustomIcon = (color: string, iconType: 'school' | 'student' | 'driver' | 'stop') => {
  const iconHtml = iconType === 'school' ? '🏫' : 
                   iconType === 'student' ? '👤' : 
                   iconType === 'driver' ? '🚌' : '📍';
  
  return L.divIcon({
    html: `<div style="background-color: ${color}; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${iconHtml}</div>`,
    className: 'custom-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

interface RouteStats {
  totalDistance: number;
  estimatedTime: number;
  studentsCount: number;
  completedStops: number;
}

interface PassengerStatus {
  studentId: string;
  status: "pending" | "boarded" | "dropped" | "absent";
  timestamp?: any;
  location?: { lat: number; lng: number };
  method?: "qr" | "manual" | "auto";
  notes?: string;
}

interface OpenStreetRouteMapProps {
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

// Component to update map view when data changes
function MapUpdater({ 
  students, 
  schoolLocation, 
  driverLocation 
}: {
  students: any[];
  schoolLocation: { lat: number; lng: number } | null;
  driverLocation?: DriverLocation;
}) {
  const map = useMap();

  useEffect(() => {
    if (students.length > 0 || schoolLocation || driverLocation) {
      const bounds = L.latLngBounds([]);
      
      // Add student locations to bounds
      students.forEach(student => {
        bounds.extend([student.lat, student.lng]);
      });
      
      // Add school location to bounds
      if (schoolLocation) {
        bounds.extend([schoolLocation.lat, schoolLocation.lng]);
      }
      
      // Add driver location to bounds
      if (driverLocation) {
        bounds.extend([driverLocation.lat, driverLocation.lng]);
      }
      
      // Fit map to bounds with padding
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  }, [map, students, schoolLocation, driverLocation]);

  return null;
}

export default function OpenStreetRouteMap({
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
  tripStarted = false
}: OpenStreetRouteMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>([24.7136, 46.6753]); // Default to Riyadh
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  // Update map center when school location is available
  useEffect(() => {
    if (schoolLocation) {
      setMapCenter([schoolLocation.lat, schoolLocation.lng]);
    }
  }, [schoolLocation]);

  // Generate route coordinates from optimized stops
  useEffect(() => {
    if (optimizedStops.length > 0) {
      const coordinates: [number, number][] = [];
      
      // Add driver location if available
      if (driverLocation) {
        coordinates.push([driverLocation.lat, driverLocation.lng]);
      }
      
      // Add all stop coordinates
      optimizedStops.forEach(stop => {
        coordinates.push([stop.lat, stop.lng]);
      });
      
      // Add school location at the end if available
      if (schoolLocation) {
        coordinates.push([schoolLocation.lat, schoolLocation.lng]);
      }
      
      setRouteCoordinates(coordinates);
    }
  }, [optimizedStops, driverLocation, schoolLocation]);

  const getStudentStatus = (studentId: string) => {
    const status = passengerStatuses.find(p => p.studentId === studentId);
    return status?.status || "pending";
  };

  const getMarkerColor = (studentId: string) => {
    const status = getStudentStatus(studentId);
    switch (status) {
      case "boarded": return "#22c55e"; // green
      case "dropped": return "#6b7280"; // gray
      case "absent": return "#ef4444"; // red
      default: return "#3b82f6"; // blue
    }
  };

  if (!schoolLocation) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Map Unavailable</p>
            <p className="text-sm text-muted-foreground">School location not configured</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RouteIcon className="h-5 w-5" />
            Route Map
          </div>
          <div className="flex items-center gap-2">
            {tripStarted ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={onStopTrip}
                className="flex items-center gap-1"
              >
                <Square className="h-4 w-4" />
                Stop Trip
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => driverLocation && onStartTrip?.(driverLocation)}
                disabled={!driverLocation}
                className="flex items-center gap-1"
              >
                <Play className="h-4 w-4" />
                Start Trip
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Route Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{routeStats.studentsCount}</div>
            <div className="text-xs text-muted-foreground">Students</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{routeStats.completedStops}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{routeStats.totalDistance.toFixed(1)}km</div>
            <div className="text-xs text-muted-foreground">Distance</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{Math.round(routeStats.estimatedTime)}min</div>
            <div className="text-xs text-muted-foreground">Est. Time</div>
          </div>
        </div>

        {/* Map */}
        <div className="h-96 w-full rounded-lg overflow-hidden border">
          <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            <MapUpdater 
              students={students} 
              schoolLocation={schoolLocation} 
              driverLocation={driverLocation} 
            />

            {/* School Marker */}
            {schoolLocation && (
              <Marker 
                position={[schoolLocation.lat, schoolLocation.lng]}
                icon={createCustomIcon('#8b5cf6', 'school')}
              >
                <Popup>
                  <div className="text-center">
                    <School className="h-4 w-4 mx-auto mb-1" />
                    <strong>School</strong>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Driver Marker */}
            {driverLocation && (
              <Marker 
                position={[driverLocation.lat, driverLocation.lng]}
                icon={createCustomIcon('#f59e0b', 'driver')}
              >
                <Popup>
                  <div className="text-center">
                    <div className="flex items-center gap-1 mb-1">
                      <Users className="h-4 w-4" />
                      <strong>Bus Driver</strong>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Current Location
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Student Markers */}
            {students.map((student, index) => (
              <Marker
                key={student.studentId}
                position={[student.lat, student.lng]}
                icon={createCustomIcon(getMarkerColor(student.studentId), 'student')}
              >
                <Popup>
                  <div className="min-w-48">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="font-semibold">{student.name}</div>
                      <Badge 
                        variant={getStudentStatus(student.studentId) === "boarded" ? "default" : 
                                getStudentStatus(student.studentId) === "dropped" ? "secondary" :
                                getStudentStatus(student.studentId) === "absent" ? "destructive" : "outline"}
                      >
                        {getStudentStatus(student.studentId)}
                      </Badge>
                    </div>
                    
                    {student.grade && (
                      <div className="text-sm text-muted-foreground mb-1">
                        Grade: {student.grade}
                      </div>
                    )}
                    
                    <div className="text-sm text-muted-foreground mb-2">
                      {student.address}
                    </div>
                    
                    {student.pickupTime && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                        <Clock className="h-3 w-3" />
                        {student.pickupTime}
                      </div>
                    )}
                    
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const stop = optimizedStops.find(s => s.studentId === student.studentId);
                          if (stop && onNavigateToStop) {
                            onNavigateToStop(stop);
                          }
                        }}
                        className="flex-1"
                      >
                        <Navigation className="h-3 w-3 mr-1" />
                        Navigate
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onCallParent?.(student.studentId)}
                      >
                        <Phone className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Route Polyline */}
            {routeCoordinates.length > 1 && (
              <Polyline
                positions={routeCoordinates}
                color="#3b82f6"
                weight={4}
                opacity={0.8}
              />
            )}
          </MapContainer>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
            <span>Pending Pickup</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
            <span>Boarded</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-gray-500"></div>
            <span>Dropped Off</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span>Absent</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}