export interface GeolocationPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface GeolocationError {
  code: number;
  message: string;
}

export class GeolocationService {
  private static instance: GeolocationService;
  private watchId: number | null = null;
  private currentPosition: GeolocationPosition | null = null;
  private callbacks: ((position: GeolocationPosition) => void)[] = [];
  private errorCallbacks: ((error: GeolocationError) => void)[] = [];

  private constructor() {}

  static getInstance(): GeolocationService {
    if (!GeolocationService.instance) {
      GeolocationService.instance = new GeolocationService();
    }
    return GeolocationService.instance;
  }

  /**
   * Check if geolocation is supported by the browser
   */
  isSupported(): boolean {
    return 'geolocation' in navigator;
  }

  /**
   * Get the current position once
   */
  async getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        reject({
          code: 0,
          message: 'Geolocation is not supported by this browser'
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const geoPosition: GeolocationPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          this.currentPosition = geoPosition;
          resolve(geoPosition);
        },
        (error) => {
          const geoError: GeolocationError = {
            code: error.code,
            message: this.getErrorMessage(error.code)
          };
          reject(geoError);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000 // 1 minute
        }
      );
    });
  }

  /**
   * Start watching the position for real-time updates
   */
  startWatching(): void {
    if (!this.isSupported()) {
      this.notifyError({
        code: 0,
        message: 'Geolocation is not supported by this browser'
      });
      return;
    }

    if (this.watchId !== null) {
      this.stopWatching();
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const geoPosition: GeolocationPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        this.currentPosition = geoPosition;
        this.notifyCallbacks(geoPosition);
      },
      (error) => {
        const geoError: GeolocationError = {
          code: error.code,
          message: this.getErrorMessage(error.code)
        };
        this.notifyError(geoError);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000 // 30 seconds
      }
    );
  }

  /**
   * Stop watching the position
   */
  stopWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Subscribe to position updates
   */
  onPositionUpdate(callback: (position: GeolocationPosition) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Subscribe to geolocation errors
   */
  onError(callback: (error: GeolocationError) => void): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Unsubscribe from position updates
   */
  offPositionUpdate(callback: (position: GeolocationPosition) => void): void {
    this.callbacks = this.callbacks.filter(cb => cb !== callback);
  }

  /**
   * Unsubscribe from error updates
   */
  offError(callback: (error: GeolocationError) => void): void {
    this.errorCallbacks = this.errorCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Get the last known position
   */
  getLastKnownPosition(): GeolocationPosition | null {
    return this.currentPosition;
  }

  /**
   * Clear all callbacks and stop watching
   */
  cleanup(): void {
    this.stopWatching();
    this.callbacks = [];
    this.errorCallbacks = [];
    this.currentPosition = null;
  }

  private notifyCallbacks(position: GeolocationPosition): void {
    this.callbacks.forEach(callback => {
      try {
        callback(position);
      } catch (error) {
        console.error('Error in geolocation callback:', error);
      }
    });
  }

  private notifyError(error: GeolocationError): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        console.error('Error in geolocation error callback:', err);
      }
    });
  }

  private getErrorMessage(code: number): string {
    switch (code) {
      case 1:
        return 'Location access denied by user';
      case 2:
        return 'Location information unavailable';
      case 3:
        return 'Location request timeout';
      default:
        return 'Unknown geolocation error';
    }
  }
}

// Export a singleton instance
export const geolocationService = GeolocationService.getInstance();