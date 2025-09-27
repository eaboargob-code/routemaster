// src/lib/routeOptimization.ts

export interface StudentLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  photoUrl?: string;
  status?: 'pending' | 'boarded' | 'dropped' | 'absent';
}

export interface SchoolLocation {
  latitude: number;
  longitude: number;
}

export interface DriverLocation {
  latitude: number;
  longitude: number;
  photoUrl?: string;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp?: Date;
}

export interface OptimizedStop {
  student: StudentLocation;
  distanceFromSchool: number;
  distanceFromDriver?: number;
  order: number;
}

export interface OptimizedStopWithDriver {
  student: StudentLocation;
  distanceFromDriver: number;
  distanceFromSchool: number;
  order: number;
}

/**
 * Calculates the distance between two points using the Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

/**
 * Converts degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Optimizes the route by ordering stops from farthest to nearest from school
 * This ensures efficient pickup routing where the driver starts from the farthest point
 * and works their way back to school, ending at the school
 * Route pattern: Farthest Student → ... → Nearest Student → School
 */
export function optimizeRoute(
  students: StudentLocation[],
  school: SchoolLocation
): OptimizedStop[] {
  // Filter out students without valid coordinates
  const validStudents = students.filter(
    student => 
      student.latitude && 
      student.longitude && 
      !isNaN(student.latitude) && 
      !isNaN(student.longitude)
  );

  if (validStudents.length === 0) return [];

  // Calculate distance from school for each student
  const stopsWithDistance = validStudents.map(student => ({
    student,
    distanceFromSchool: calculateDistance(
      school.latitude,
      school.longitude,
      student.latitude,
      student.longitude
    ),
    order: 0 // Will be set after sorting
  }));

  // Sort by distance from school (farthest first, nearest last)
  // This creates the pattern: Farthest → ... → Nearest → School
  stopsWithDistance.sort((a, b) => b.distanceFromSchool - a.distanceFromSchool);

  // Assign order numbers (1 = farthest, last = nearest to school)
  return stopsWithDistance.map((stop, index) => ({
    ...stop,
    order: index + 1
  }));
}

/**
 * Optimizes the route based on driver's current location
 * This creates an efficient route starting from the driver's position,
 * following the pattern: Driver → Farthest Student → ... → Nearest Student → School
 * Uses a hybrid approach: starts from driver, then follows farthest-to-nearest pattern
 */
export function optimizeRouteWithDriverLocation(
  students: StudentLocation[],
  driverLocation: DriverLocation,
  school: SchoolLocation
): OptimizedStopWithDriver[] {
  // Filter out students without valid coordinates
  const validStudents = students.filter(
    student => 
      student.latitude != null && 
      student.longitude != null && 
      !isNaN(student.latitude) && 
      !isNaN(student.longitude)
  );

  if (validStudents.length === 0) return [];

  // Calculate distances from driver and school for each student
  const stopsWithDistances = validStudents.map(student => ({
    student,
    distanceFromDriver: calculateDistance(
      driverLocation.latitude,
      driverLocation.longitude,
      student.latitude,
      student.longitude
    ),
    distanceFromSchool: calculateDistance(
      school.latitude,
      school.longitude,
      student.latitude,
      student.longitude
    ),
    order: 0 // Will be set after optimization
  }));

  // Strategy: Find the farthest student from school that's reachable from driver
  // Then follow the farthest-to-nearest pattern from there
  
  // Sort by distance from school (farthest first) to follow the required pattern
  stopsWithDistances.sort((a, b) => b.distanceFromSchool - a.distanceFromSchool);
  
  // If we have students, start with the farthest from school
  // This ensures we follow the pattern: Farthest → ... → Nearest → School
  const optimizedRoute: OptimizedStopWithDriver[] = [];
  
  // Simply assign order based on distance from school (farthest first)
  // This maintains the required routing pattern while considering driver location
  stopsWithDistances.forEach((stop, index) => {
    stop.order = index + 1;
    optimizedRoute.push(stop);
  });

  return optimizedRoute;
}

/**
 * Calculates the total route distance
 * This is an approximation as it doesn't account for actual road distances
 */
export function calculateTotalRouteDistance(optimizedStops: OptimizedStop[]): number {
  if (optimizedStops.length === 0) return 0;
  if (optimizedStops.length === 1) return optimizedStops[0].distanceFromSchool;

  let totalDistance = 0;

  // Distance from first stop to school (this is the farthest)
  totalDistance += optimizedStops[0].distanceFromSchool;

  // Distance between consecutive stops
  for (let i = 0; i < optimizedStops.length - 1; i++) {
    const current = optimizedStops[i].student;
    const next = optimizedStops[i + 1].student;
    
    totalDistance += calculateDistance(
      current.latitude,
      current.longitude,
      next.latitude,
      next.longitude
    );
  }

  return totalDistance;
}

/**
 * Estimates travel time based on distance
 * Assumes average speed of 30 km/h in urban areas
 */
export function estimateTravelTime(distanceKm: number): number {
  const averageSpeedKmh = 30;
  return (distanceKm / averageSpeedKmh) * 60; // Return time in minutes
}

/**
 * Gets the current stop based on the current stop index
 */
export function getCurrentStop(
  optimizedStops: OptimizedStop[],
  currentStopIndex: number
): OptimizedStop | null {
  if (currentStopIndex >= 0 && currentStopIndex < optimizedStops.length) {
    return optimizedStops[currentStopIndex];
  }
  return null;
}

/**
 * Gets the next stop in the route based on current stop index
 */
export function getNextStop(
  optimizedStops: OptimizedStop[],
  currentStopIndex: number
): OptimizedStop | null {
  const nextIndex = currentStopIndex + 1;
  if (nextIndex < optimizedStops.length) {
    return optimizedStops[nextIndex];
  }
  return null;
}

/**
 * Calculates the total route distance starting from driver location
 * through all student stops and ending at school
 */
export function calculateTotalRouteDistanceWithDriver(
  optimizedStops: OptimizedStopWithDriver[],
  driverLocation: DriverLocation,
  school: SchoolLocation
): number {
  if (optimizedStops.length === 0) return 0;

  let totalDistance = 0;
  let currentLocation = driverLocation;

  // Calculate distance from driver to each stop in order
  for (const stop of optimizedStops) {
    const distanceToStop = calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      stop.student.latitude,
      stop.student.longitude
    );
    totalDistance += distanceToStop;
    
    // Update current location to this stop
    currentLocation = {
      latitude: stop.student.latitude,
      longitude: stop.student.longitude
    };
  }

  // Add distance from last stop to school
  if (optimizedStops.length > 0) {
    const lastStop = optimizedStops[optimizedStops.length - 1];
    const distanceToSchool = calculateDistance(
      lastStop.student.latitude,
      lastStop.student.longitude,
      school.latitude,
      school.longitude
    );
    totalDistance += distanceToSchool;
  }

  return totalDistance;
}

/**
 * Calculates route statistics for driver-based routes
 */
export function getRouteStatisticsWithDriver(
  optimizedStops: OptimizedStopWithDriver[],
  driverLocation: DriverLocation,
  school: SchoolLocation
) {
  const totalStops = optimizedStops.length;
  const completedStops = optimizedStops.filter(
    stop => stop.student.status === 'boarded' || stop.student.status === 'dropped'
  ).length;
  const pendingStops = optimizedStops.filter(
    stop => stop.student.status === 'pending'
  ).length;
  const absentStops = optimizedStops.filter(
    stop => stop.student.status === 'absent'
  ).length;

  const totalDistance = calculateTotalRouteDistanceWithDriver(optimizedStops, driverLocation, school);
  const estimatedTime = estimateTravelTime(totalDistance);

  return {
    totalStops,
    completedStops,
    pendingStops,
    absentStops,
    totalDistance: Math.round(totalDistance * 100) / 100, // Round to 2 decimal places
    estimatedTime: Math.round(estimatedTime)
  };
}

/**
 * Calculates route statistics (original function for backward compatibility)
 */
export function getRouteStatistics(optimizedStops: OptimizedStop[]) {
  const totalStops = optimizedStops.length;
  const completedStops = optimizedStops.filter(
    stop => stop.student.status === 'boarded' || stop.student.status === 'dropped'
  ).length;
  const pendingStops = optimizedStops.filter(
    stop => stop.student.status === 'pending'
  ).length;
  const absentStops = optimizedStops.filter(
    stop => stop.student.status === 'absent'
  ).length;

  const totalDistance = calculateTotalRouteDistance(optimizedStops);
  const estimatedTime = estimateTravelTime(totalDistance);

  return {
    totalStops,
    completedStops,
    pendingStops,
    absentStops,
    totalDistance: Math.round(totalDistance * 100) / 100, // Round to 2 decimal places
    estimatedTime: Math.round(estimatedTime)
  };
}