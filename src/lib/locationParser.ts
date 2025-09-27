// src/lib/locationParser.ts

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocationParseResult {
  success: boolean;
  coordinates?: LocationCoordinates;
  error?: string;
}

/**
 * Parses various Google Maps URL formats to extract latitude and longitude coordinates.
 * Supports formats commonly shared via WhatsApp:
 * - https://maps.google.com?q=lat,lng
 * - https://maps.google.com/@lat,lng,zoom
 * - https://maps.google.com/maps?ll=lat,lng
 * - https://goo.gl/maps/... (shortened URLs - requires resolution)
 * - https://maps.app.goo.gl/... (new shortened format)
 */
export function parseLocationLink(url: string): LocationParseResult {
  try {
    // Clean and normalize the URL
    const cleanUrl = url.trim();
    
    // Handle empty or invalid URLs
    if (!cleanUrl || !isValidUrl(cleanUrl)) {
      return {
        success: false,
        error: "Invalid URL format"
      };
    }

    const urlObj = new URL(cleanUrl);
    
    // Check if it's a Google Maps domain
    if (!isGoogleMapsUrl(urlObj.hostname)) {
      return {
        success: false,
        error: "URL must be from Google Maps (maps.google.com, goo.gl, or maps.app.goo.gl)"
      };
    }

    // Handle shortened URLs (these would need to be resolved first)
    if (urlObj.hostname.includes('goo.gl')) {
      return {
        success: false,
        error: "Shortened URLs are not supported yet. Please use the full Google Maps URL."
      };
    }

    // Parse different URL formats
    const coordinates = extractCoordinatesFromUrl(urlObj);
    
    if (coordinates) {
      // Validate coordinate ranges
      if (isValidCoordinates(coordinates)) {
        return {
          success: true,
          coordinates
        };
      } else {
        return {
          success: false,
          error: "Invalid coordinate values. Latitude must be between -90 and 90, longitude between -180 and 180."
        };
      }
    }

    return {
      success: false,
      error: "Could not extract coordinates from the URL. Make sure it's a direct location link from Google Maps."
    };

  } catch (error) {
    return {
      success: false,
      error: `Failed to parse URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Validates if a string is a valid URL
 */
function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if the hostname belongs to Google Maps
 */
function isGoogleMapsUrl(hostname: string): boolean {
  const validDomains = [
    'maps.google.com',
    'www.google.com',
    'google.com',
    'goo.gl',
    'maps.app.goo.gl'
  ];
  
  return validDomains.some(domain => 
    hostname === domain || hostname.endsWith('.' + domain)
  );
}

/**
 * Extracts coordinates from various Google Maps URL formats
 */
function extractCoordinatesFromUrl(urlObj: URL): LocationCoordinates | null {
  const { pathname, searchParams, hash } = urlObj;

  // Format 1: ?q=lat,lng
  const qParam = searchParams.get('q');
  if (qParam) {
    const coords = parseCoordinateString(qParam);
    if (coords) return coords;
  }

  // Format 2: ?ll=lat,lng
  const llParam = searchParams.get('ll');
  if (llParam) {
    const coords = parseCoordinateString(llParam);
    if (coords) return coords;
  }

  // Format 3: /@lat,lng,zoom or /@lat,lng
  const atMatch = pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,\d+\.?\d*)?/);
  if (atMatch) {
    const latitude = parseFloat(atMatch[1]);
    const longitude = parseFloat(atMatch[2]);
    if (!isNaN(latitude) && !isNaN(longitude)) {
      return { latitude, longitude };
    }
  }

  // Format 4: Check hash for coordinates (some mobile formats)
  if (hash) {
    const hashCoords = extractCoordinatesFromHash(hash);
    if (hashCoords) return hashCoords;
  }

  // Format 5: /maps/place/.../@lat,lng
  const placeMatch = pathname.match(/\/maps\/place\/[^@]*@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (placeMatch) {
    const latitude = parseFloat(placeMatch[1]);
    const longitude = parseFloat(placeMatch[2]);
    if (!isNaN(latitude) && !isNaN(longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

/**
 * Parses coordinate string in format "lat,lng" or "lat lng"
 */
function parseCoordinateString(coordString: string): LocationCoordinates | null {
  // Remove any extra whitespace and split by comma or space
  const parts = coordString.trim().split(/[,\s]+/);
  
  if (parts.length >= 2) {
    const latitude = parseFloat(parts[0]);
    const longitude = parseFloat(parts[1]);
    
    if (!isNaN(latitude) && !isNaN(longitude)) {
      return { latitude, longitude };
    }
  }
  
  return null;
}

/**
 * Extracts coordinates from URL hash fragment
 */
function extractCoordinatesFromHash(hash: string): LocationCoordinates | null {
  // Remove the # symbol
  const hashContent = hash.substring(1);
  
  // Look for coordinate patterns in the hash
  const coordMatch = hashContent.match(/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (coordMatch) {
    const latitude = parseFloat(coordMatch[1]);
    const longitude = parseFloat(coordMatch[2]);
    if (!isNaN(latitude) && !isNaN(longitude)) {
      return { latitude, longitude };
    }
  }
  
  return null;
}

/**
 * Validates if coordinates are within valid ranges
 */
function isValidCoordinates(coords: LocationCoordinates): boolean {
  const { latitude, longitude } = coords;
  
  return (
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  );
}

/**
 * Formats coordinates for display
 */
export function formatCoordinates(coords: LocationCoordinates, precision: number = 6): string {
  return `${coords.latitude.toFixed(precision)}, ${coords.longitude.toFixed(precision)}`;
}

/**
 * Creates a Google Maps URL from coordinates
 */
export function createGoogleMapsUrl(coords: LocationCoordinates): string {
  return `https://maps.google.com?q=${coords.latitude},${coords.longitude}`;
}