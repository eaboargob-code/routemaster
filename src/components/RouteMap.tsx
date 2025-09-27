"use client";

import { useEffect, useRef, useState } from 'react';
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
  Phone
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
const createCustomIcon = (color: string, icon: string, size: number = 30) => {
  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: ${size > 30 ? '16px' : '14px'};
        font-weight: bold;
      ">
        ${icon}
      </div>
    `,
    className: 'custom-marker',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  });
};

const schoolIcon = createCustomIcon('#10b981', '🏫', 35);
const studentIcon = createCustomIcon('#3b82f6', '👤');
const pickedUpIcon = createCustomIcon('#22c55e', '✓');
const currentStopIcon = createCustomIcon('#f59e0b', '📍', 35);
const nextStopIcon = createCustomIcon('#8b5cf6', '⭐', 32);
const driverIcon = createCustomIcon('#ef4444', '🚌', 35);

interface PassengerStatus {
  studentId: string;
  status: 'pending' | 'boarded' | 'dropped' | 'absent';
  timestamp?: any;
}

interface RouteMapProps {
  students: StudentLocation[];
  schoolLocation: { lat: number; lng: number };
  optimizedStops: OptimizedStop[];
  routeStats: RouteStats;
  driverLocation?: DriverLocation;
  passengerStatuses?: PassengerStatus[];
  currentStopIndex?: number;
  onNavigateToStop?: (stop: OptimizedStop) => void;
  onCallParent?: (studentId: string, phoneNumber?: string) => void;
  className?: string;
}

// Component to fit map bounds to show all markers
function MapBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, bounds]);
  
  return null;
}

export function RouteMap({ 
  students, 
  schoolLocation, 
  optimizedStops, 
  routeStats,
  driverLocation,
  passengerStatuses = [],
  currentStopIndex = 0,
  onNavigateToStop,
  onCallParent,
  className = ""
}: RouteMapProps) {
  // Validate school location coordinates
  const isValidLocation = schoolLocation && 
    typeof schoolLocation.lat === 'number' && 
    typeof schoolLocation.lng === 'number' &&
    !isNaN(schoolLocation.lat) && 
    !isNaN(schoolLocation.lng);

  // If location is invalid, show error message
  if (!isValidLocation) {
    return (
      <Card>
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
  const mapRef = useRef<L.Map | null>(null);

  // Get passenger status for a student
  const getPassengerStatus = (studentId: string) => {
    return passengerStatuses.find(p => p.studentId === studentId)?.status || 'pending';
  };

  // Get the next stop based on current position and passenger statuses
  const nextStop = getNextStop(optimizedStops, passengerStatuses, currentStopIndex);

  // Get status badge for passenger status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'boarded':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Boarded
          </Badge>
        );
      case 'dropped':
        return (
          <Badge variant="default" className="bg-blue-100 text-blue-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Dropped
          </Badge>
        );
      case 'absent':
        return (
          <Badge variant="destructive" className="bg-red-100 text-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            Absent
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  // Get appropriate icon based on status and position
  const getMarkerIcon = (stop: OptimizedStop, index: number) => {
    const status = getPassengerStatus(stop.student.id);
    
    if (index === currentStopIndex) {
      return currentStopIcon;
    }
    if (index === currentStopIndex + 1) {
      return nextStopIcon;
    }
    
    switch (status) {
      case 'boarded':
        return pickedUpIcon;
      case 'dropped':
        return pickedUpIcon;
      case 'absent':
        return createCustomIcon('#f59e0b', '✗');
      default:
        return studentIcon;
    }
  };

  // Calculate map bounds to show all markers
  const bounds = useRef<L.LatLngBounds | null>(null);
  useEffect(() => {
    if (students.length > 0 && isValidLocation) {
      // Filter students with valid coordinates
      const validStudents = students.filter(s => 
        typeof s.lat === 'number' && 
        typeof s.lng === 'number' && 
        !isNaN(s.lat) && 
        !isNaN(s.lng)
      );
      
      const latLngs: [number, number][] = [
        [schoolLocation.lat, schoolLocation.lng],
        ...validStudents.map(s => [s.lat, s.lng] as [number, number])
      ];
      
      // Include driver location in bounds if available and valid
      if (driverLocation && 
          typeof driverLocation.latitude === 'number' && 
          typeof driverLocation.longitude === 'number' &&
          !isNaN(driverLocation.latitude) && 
          !isNaN(driverLocation.longitude)) {
        latLngs.push([driverLocation.latitude, driverLocation.longitude]);
      }
      
      // Only create bounds if we have valid coordinates
      if (latLngs.length > 0) {
        bounds.current = L.latLngBounds(latLngs);
      }
    }
  }, [students, schoolLocation, driverLocation, isValidLocation]);

  // Create route line coordinates
  const routeCoordinates: [number, number][] = isValidLocation ? [
    ...optimizedStops
      .filter(stop => 
        typeof stop.student.latitude === 'number' && 
        typeof stop.student.longitude === 'number' && 
        !isNaN(stop.student.latitude) && 
        !isNaN(stop.student.longitude)
      )
      .map(stop => [stop.student.latitude, stop.student.longitude] as [number, number]),
    [schoolLocation.lat, schoolLocation.lng]
  ] : [];



  if (students.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-2" />
            <p>No student locations available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Route Statistics */}
      {routeStats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <RouteIcon className="h-5 w-5" />
              Route Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{routeStats.totalStops}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Users className="h-4 w-4" />
                  Total Stops
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {routeStats.nextStop ? `Stop ${routeStats.nextStop.order}` : 'Complete'}
                </div>
                <div className="text-sm text-muted-foreground">Next Stop</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{routeStats.totalDistance.toFixed(1)} km</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <MapPin className="h-4 w-4" />
                  Distance
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{routeStats.estimatedTime} min</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-4 w-4" />
                  Est. Time
                </div>
              </div>
            </div>
            
            {/* Progress indicator */}
            <div className="mt-4">
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>Progress</span>
                <span>{currentStopIndex} of {optimizedStops.length} stops</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${(currentStopIndex / optimizedStops.length) * 100}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Map */}
      <Card>
        <CardContent className="p-0">
          <div className="h-96 w-full rounded-lg overflow-hidden">
            <MapContainer
              center={[schoolLocation.lat, schoolLocation.lng]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              ref={mapRef}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {/* Map bounds adjustment */}
              <MapBounds bounds={bounds.current} />
              
              {/* Driver location marker */}
              {driverLocation && 
               typeof driverLocation.latitude === 'number' && 
               typeof driverLocation.longitude === 'number' &&
               !isNaN(driverLocation.latitude) && 
               !isNaN(driverLocation.longitude) && (
                <Marker position={[driverLocation.latitude, driverLocation.longitude]} icon={driverIcon}>
                  <Popup>
                    <div className="text-center">
                      <h3 className="font-semibold">Driver Location</h3>
                      <p className="text-sm text-muted-foreground">Your current position</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {driverLocation.latitude.toFixed(4)}, {driverLocation.longitude.toFixed(4)}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* School marker */}
              <Marker position={[schoolLocation.lat, schoolLocation.lng]} icon={schoolIcon}>
                <Popup>
                  <div className="text-center">
                    <h3 className="font-semibold">School</h3>
                    <p className="text-sm text-muted-foreground">Final destination</p>
                  </div>
                </Popup>
              </Marker>

              {/* Student markers */}
              {optimizedStops
                .filter(stop => 
                  typeof stop.student.latitude === 'number' && 
                  typeof stop.student.longitude === 'number' && 
                  !isNaN(stop.student.latitude) && 
                  !isNaN(stop.student.longitude)
                )
                .map((stop, index) => {
                const status = getPassengerStatus(stop.student.id);
                const isCurrent = index === currentStopIndex;
                const isNext = index === currentStopIndex + 1;
                
                return (
                  <Marker
                    key={stop.student.id}
                    position={[stop.student.latitude, stop.student.longitude]}
                    icon={getMarkerIcon(stop, index)}
                  >
                    <Popup>
                      <div className="space-y-3 min-w-[200px]">
                        <div>
                          <h3 className="font-semibold">{stop.student.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline">Stop #{stop.order}</Badge>
                            <Badge 
                              variant={
                                status === 'boarded' ? 'default' :
                                status === 'absent' ? 'destructive' :
                                isCurrent ? 'secondary' : 'outline'
                              }
                            >
                              {isCurrent ? 'Current Stop' : 
                               isNext ? 'Next Stop' :
                               status === 'boarded' ? 'Picked Up' :
                               status === 'absent' ? 'Absent' : 'Pending'}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="text-sm text-muted-foreground">
                          <p>{stop.distanceFromSchool.toFixed(1)} km from school</p>
                          <p>Coordinates: {stop.student.latitude.toFixed(4)}, {stop.student.longitude.toFixed(4)}</p>
                        </div>

                        <div className="flex gap-2">
                          {onNavigateToStop && (
                            <Button 
                              size="sm" 
                              onClick={() => onNavigateToStop(stop)}
                              className="flex-1"
                            >
                              <Navigation className="h-3 w-3 mr-1" />
                              Navigate
                            </Button>
                          )}
                          {onCallParent && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onCallParent(stop.student.id)}
                              className="flex-1"
                            >
                              <Phone className="h-3 w-3 mr-1" />
                              Call
                            </Button>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Route line */}
              {routeCoordinates.length > 1 && (
                <Polyline
                  positions={routeCoordinates}
                  color="#3b82f6"
                  weight={4}
                  opacity={0.7}
                />
              )}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {/* Stop List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Pickup Sequence ({optimizedStops.length} stops)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {optimizedStops.map((stop, index) => (
              <div
                key={stop.student.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  nextStop && nextStop.student.id === stop.student.id
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium">
                    {stop.order}
                  </div>
                  <div>
                    <div className="font-medium">{stop.student.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {stop.distanceFromSchool.toFixed(1)} km from school
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(getPassengerStatus(stop.student.id))}
                  {nextStop && nextStop.student.id === stop.student.id && (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800">
                      Next
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}