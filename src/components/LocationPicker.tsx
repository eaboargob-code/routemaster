"use client";

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Search, RotateCcw } from 'lucide-react';

// Fix for default markers in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationPickerProps {
  latitude?: number;
  longitude?: number;
  onLocationChange: (lat: number, lng: number) => void;
  className?: string;
}

// Component to handle map clicks
function LocationMarker({ position, onLocationChange }: { 
  position: [number, number] | null; 
  onLocationChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });

  return position === null ? null : (
    <Marker position={position} />
  );
}

export function LocationPicker({ 
  latitude, 
  longitude, 
  onLocationChange, 
  className 
}: LocationPickerProps) {
  const [position, setPosition] = useState<[number, number] | null>(
    latitude && longitude ? [latitude, longitude] : null
  );
  const [searchAddress, setSearchAddress] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  // Default center (you can change this to your preferred location)
  const defaultCenter: [number, number] = [24.7136, 46.6753]; // Riyadh, Saudi Arabia

  useEffect(() => {
    if (latitude && longitude) {
      setPosition([latitude, longitude]);
    }
  }, [latitude, longitude]);

  const handleLocationChange = (lat: number, lng: number) => {
    setPosition([lat, lng]);
    onLocationChange(lat, lng);
  };

  const handleSearch = async () => {
    if (!searchAddress.trim()) return;
    
    setIsSearching(true);
    try {
      // Using Nominatim (OpenStreetMap) geocoding service
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=1`
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        handleLocationChange(lat, lng);
        
        // Pan map to the new location
        if (mapRef.current) {
          mapRef.current.setView([lat, lng], 15);
        }
      } else {
        alert('Location not found. Please try a different search term.');
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      alert('Error searching for location. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleReset = () => {
    setPosition(null);
    setSearchAddress('');
    onLocationChange(0, 0);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Select Location
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Section */}
        <div className="space-y-2">
          <Label htmlFor="address-search">Search for an address</Label>
          <div className="flex gap-2">
            <Input
              id="address-search"
              placeholder="Enter city, address, or landmark..."
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button 
              onClick={handleSearch} 
              disabled={isSearching || !searchAddress.trim()}
              size="sm"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Coordinates Display */}
        {position && (
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="text-sm">
              <strong>Selected Location:</strong><br />
              Latitude: {position[0].toFixed(6)}<br />
              Longitude: {position[1].toFixed(6)}
            </div>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        )}

        {/* Map */}
        <div className="h-64 w-full rounded-lg overflow-hidden border">
          <MapContainer
            center={position || defaultCenter}
            zoom={position ? 15 : 10}
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationMarker 
              position={position} 
              onLocationChange={handleLocationChange} 
            />
          </MapContainer>
        </div>

        <p className="text-sm text-muted-foreground">
          Click on the map to select a location, or search for an address above.
        </p>
      </CardContent>
    </Card>
  );
}