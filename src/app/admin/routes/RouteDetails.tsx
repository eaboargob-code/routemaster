"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Bus, Users, MapPin, Route, Clock, Navigation } from "lucide-react";
import Link from "next/link";
import { useProfile } from "@/lib/useProfile";
import { 
  listBusesForSchool, 
  listStudentsForSchool, 
  getUsersByIds 
} from "@/lib/firestoreQueries";
import { 
  optimizeRoute, 
  getRouteStatistics, 
  type StudentLocation, 
  type OptimizedStop, 
  type SchoolLocation 
} from "@/lib/routeOptimization";
import { getSchoolProfile } from "@/lib/firestoreQueries";
import type { DocumentData } from "firebase/firestore";

interface RouteDetailsProps {
  routeId: string;
  routeName: string;
}

interface Bus extends DocumentData {
  id: string;
  busCode: string;
  plate?: string;
  capacity?: number;
  assignedRouteId?: string | null;
  driverId?: string | null;
  supervisorId?: string | null;
  active: boolean;
}

interface Student extends DocumentData {
  id: string;
  name: string;
  assignedRouteId?: string | null;
  assignedBusId?: string | null;
  grade?: string;
  parentId?: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
}

interface UserInfo extends DocumentData {
  id: string;
  displayName: string;
  email: string;
  role: string;
  phoneNumber?: string;
  photoUrl?: string;
}

export default function RouteDetails({ routeId, routeName }: RouteDetailsProps) {
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const [loading, setLoading] = useState(true);
  const [assignedBus, setAssignedBus] = useState<Bus | null>(null);
  const [driver, setDriver] = useState<UserInfo | null>(null);
  const [supervisor, setSupervisor] = useState<UserInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [optimizedStops, setOptimizedStops] = useState<OptimizedStop[]>([]);
  const [routeStats, setRouteStats] = useState<any>(null);
  const [schoolLocation, setSchoolLocation] = useState<SchoolLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.schoolId || !routeId || profileLoading) return;
    
    loadRouteDetails();
  }, [profile?.schoolId, routeId, profileLoading]);

  const loadRouteDetails = async () => {
    if (!profile?.schoolId) return;
    
    try {
      setLoading(true);
      setError(null);

      // Load school profile to get location
      const schoolProfile = await getSchoolProfile(profile.schoolId);
      let currentSchoolLocation: SchoolLocation | null = null;
      if (schoolProfile?.latitude && schoolProfile?.longitude) {
        currentSchoolLocation = {
          latitude: schoolProfile.latitude,
          longitude: schoolProfile.longitude
        };
        setSchoolLocation(currentSchoolLocation);
      }

      // Load buses and find the one assigned to this route
      const buses = await listBusesForSchool(profile.schoolId);
      const routeBus = buses.find((bus: Bus) => bus.assignedRouteId === routeId);
      setAssignedBus(routeBus || null);

      // Load students assigned to this route
      const allStudents = await listStudentsForSchool(profile.schoolId);
      const routeStudents = allStudents.filter((student: Student) => 
        student.assignedRouteId === routeId
      );
      setStudents(routeStudents);

      // Optimize route if students have pickup locations and school location is set
      const studentsWithLocations = routeStudents
        .filter(student => 
          student.pickupLat != null && 
          student.pickupLng != null && 
          !isNaN(student.pickupLat) && 
          !isNaN(student.pickupLng)
        )
        .map(student => ({
          id: student.id,
          name: student.name,
          latitude: student.pickupLat!,
          longitude: student.pickupLng!,
          status: 'pending' as const
        }));

      if (studentsWithLocations.length > 0 && currentSchoolLocation) {
        const optimized = optimizeRoute(studentsWithLocations, currentSchoolLocation);
        setOptimizedStops(optimized);
        setRouteStats(getRouteStatistics(optimized));
      } else {
        setOptimizedStops([]);
        setRouteStats(null);
      }

      // Load driver and supervisor info if bus is assigned
      if (routeBus) {
        const userIds = [routeBus.driverId, routeBus.supervisorId].filter(Boolean);
        if (userIds.length > 0) {
          const users = await getUsersByIds(profile.schoolId, userIds);
          
          if (routeBus.driverId && users[routeBus.driverId]) {
            setDriver({ id: routeBus.driverId, ...users[routeBus.driverId] });
          }
          
          if (routeBus.supervisorId && users[routeBus.supervisorId]) {
            setSupervisor({ id: routeBus.supervisorId, ...users[routeBus.supervisorId] });
          }
        }
      }
    } catch (err) {
      console.error("Error loading route details:", err);
      setError("Failed to load route details");
    } finally {
      setLoading(false);
    }
  };

  if (profileLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (profileError || !profile?.schoolId) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Unable to load profile information</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-blue-600" />
        <h2 className="text-xl font-semibold">Route Details: {routeName}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bus Information */}
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bus className="h-4 w-4" />
              Bus Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignedBus ? (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Bus Code:</span>
                  <Badge variant="outline">{assignedBus.busCode}</Badge>
                </div>
                {assignedBus.plate && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Plate:</span>
                    <span className="text-sm font-medium">{assignedBus.plate}</span>
                  </div>
                )}
                {assignedBus.capacity && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Capacity:</span>
                    <span className="text-sm font-medium">{assignedBus.capacity} seats</span>
                  </div>
                )}
                {assignedBus.capacity && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Students Assigned:</span>
                    <span className="text-sm font-medium">{students.length}/{assignedBus.capacity}</span>
                  </div>
                )}
                {assignedBus.capacity && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Available Seats:</span>
                    <Badge variant={assignedBus.capacity - students.length > 0 ? "default" : "destructive"}>
                      {assignedBus.capacity - students.length} seats
                    </Badge>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Status:</span>
                  <Badge variant={assignedBus.active ? "default" : "secondary"}>
                    {assignedBus.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No bus assigned to this route</p>
            )}
          </CardContent>
        </Card>

        {/* Driver Information */}
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Assigned Driver
            </CardTitle>
          </CardHeader>
          <CardContent>
            {driver ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={driver.photoUrl} alt={driver.displayName} />
                    <AvatarFallback>
                      <User className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{driver.displayName}</p>
                    <Badge variant="secondary" className="text-xs">
                      {driver.role}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Email:</span>
                    <span className="text-sm">{driver.email}</span>
                  </div>
                  {driver.phoneNumber && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Phone:</span>
                      <span className="text-sm">{driver.phoneNumber}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No driver assigned to this route</p>
            )}
          </CardContent>
        </Card>

        {/* Supervisor Information */}
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Assigned Supervisor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {supervisor ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={supervisor.photoUrl} alt={supervisor.displayName} />
                    <AvatarFallback>
                      <User className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{supervisor.displayName}</p>
                    <Badge variant="secondary" className="text-xs">
                      {supervisor.role}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Email:</span>
                    <span className="text-sm">{supervisor.email}</span>
                  </div>
                  {supervisor.phoneNumber && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Phone:</span>
                      <span className="text-sm">{supervisor.phoneNumber}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No supervisor assigned to this route</p>
            )}
          </CardContent>
        </Card>

        {/* Students Information */}
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Registered Students ({students.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {students.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {students.map((student) => (
                  <div key={student.id} className="flex items-center justify-between">
                    <p className="text-sm">{student.name}</p>
                    {student.pickupLat != null && student.pickupLng != null ? (
                      <Badge variant="outline" className="text-xs">
                        <MapPin className="h-3 w-3 mr-1" />
                        Location Set
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        No Location
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No students registered for this route</p>
            )}
          </CardContent>
        </Card>

        {/* Route Optimization Information */}
        {optimizedStops.length > 0 && (
          <>
            {/* Route Statistics */}
            <Card>
              <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Route className="h-4 w-4" />
                  Route Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total Distance</p>
                    <p className="text-sm font-medium">{routeStats?.totalDistance || 0} km</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Estimated Time</p>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {routeStats?.estimatedTime || 0} min
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total Stops</p>
                    <p className="text-sm font-medium">{routeStats?.totalStops || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Students with Locations</p>
                    <p className="text-sm font-medium">{optimizedStops.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Optimized Pickup Sequence */}
            <Card>
              <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Navigation className="h-4 w-4" />
                  Optimized Pickup Sequence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {optimizedStops.map((stop, index) => (
                    <div key={stop.student.id} className="flex items-center justify-between p-2 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">
                          #{stop.order}
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">{stop.student.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {stop.distanceFromSchool.toFixed(1)} km from school
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Coordinates</p>
                        <p className="text-xs font-mono">
                          {stop.student.latitude.toFixed(4)}, {stop.student.longitude.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-2 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    💡 Route is optimized from farthest to nearest pickup point for efficient collection.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* School Location Warning */}
        {!schoolLocation && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-800">
                <MapPin className="h-4 w-4" />
                <p className="text-sm font-medium">School location not set</p>
              </div>
              <p className="text-xs text-red-700 mt-1">
                Please set the school location in <Link href="/admin/settings" className="underline font-medium">Admin Settings</Link> to enable route optimization.
              </p>
            </CardContent>
          </Card>
        )}

        {/* No Student Location Warning */}
        {students.length > 0 && schoolLocation && optimizedStops.length === 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-amber-800">
                <MapPin className="h-4 w-4" />
                <p className="text-sm font-medium">No pickup locations set</p>
              </div>
              <p className="text-xs text-amber-700 mt-1">
                All {students.length} students on this route need to set their pickup locations for route optimization to work.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Manage student pickup locations in <Link href="/admin/students" className="underline font-medium">Student Management</Link>.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Partial Student Location Warning */}
        {students.length > 0 && schoolLocation && optimizedStops.length > 0 && optimizedStops.length < students.length && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-amber-800">
                <MapPin className="h-4 w-4" />
                <p className="text-sm font-medium">Some pickup locations missing</p>
              </div>
              <p className="text-xs text-amber-700 mt-1">
                {students.length - optimizedStops.length} out of {students.length} students haven't set their pickup locations yet.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Manage student pickup locations in <Link href="/admin/students" className="underline font-medium">Student Management</Link>.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}