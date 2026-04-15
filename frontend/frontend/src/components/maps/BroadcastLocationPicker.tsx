import { useEffect, useMemo, useState } from 'react';
import L, { type Icon } from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Loader2, LocateFixed, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  buildLocationLink,
  formatLocationLabel,
  isValidLatitude,
  isValidLongitude,
  validateLocationInput,
  type StructuredLocation,
} from '@/utils/location';
import 'leaflet/dist/leaflet.css';

const markerIcon: Icon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;
const SELECTED_ZOOM = 13;

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface BroadcastLocationPickerProps {
  value: StructuredLocation | null;
  onChange: (value: StructuredLocation | null) => void;
  onValidationErrorChange?: (error: string | null) => void;
  disabled?: boolean;
}

function MapClickHandler({
  onPick,
  disabled,
}: {
  onPick: (lat: number, lng: number) => void;
  disabled: boolean;
}) {
  useMapEvents({
    click(event) {
      if (disabled) return;
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function MapViewportSync({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, map, zoom]);

  return null;
}

function MapSizeSync() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [map]);

  return null;
}

export default function BroadcastLocationPicker({
  value,
  onChange,
  onValidationErrorChange,
  disabled = false,
}: BroadcastLocationPickerProps) {
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [addressInput, setAddressInput] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [geolocating, setGeolocating] = useState(false);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);

  useEffect(() => {
    setLatInput(value?.lat !== undefined ? String(value.lat) : '');
    setLngInput(value?.lng !== undefined ? String(value.lng) : '');
    setAddressInput(value?.address || '');
  }, [value?.address, value?.lat, value?.lng]);

  const validatedLocation = useMemo(() => {
    return validateLocationInput({
      lat: latInput,
      lng: lngInput,
      address: addressInput,
    });
  }, [addressInput, latInput, lngInput]);

  useEffect(() => {
    onValidationErrorChange?.(validatedLocation.error);
    onChange(validatedLocation.normalized);
  }, [onChange, onValidationErrorChange, validatedLocation.error, validatedLocation.normalized]);

  const markerPosition = useMemo<[number, number] | null>(() => {
    const lat = Number(latInput);
    const lng = Number(lngInput);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
      return null;
    }

    return [lat, lng];
  }, [latInput, lngInput]);

  const mapCenter = markerPosition || DEFAULT_CENTER;
  const mapZoom = markerPosition ? SELECTED_ZOOM : DEFAULT_ZOOM;

  const locationLabel = formatLocationLabel(validatedLocation.normalized);
  const locationLink = buildLocationLink(validatedLocation.normalized);

  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));

      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const payload = (await response.json()) as { display_name?: unknown };
      return typeof payload.display_name === 'string' && payload.display_name.trim()
        ? payload.display_name.trim()
        : null;
    } catch {
      return null;
    }
  };

  const applyCoordinates = async (lat: number, lng: number, shouldResolveAddress: boolean) => {
    setLatInput(lat.toFixed(6));
    setLngInput(lng.toFixed(6));

    if (!shouldResolveAddress) {
      return;
    }

    const resolvedAddress = await reverseGeocode(lat, lng);
    if (resolvedAddress) {
      setAddressInput(resolvedAddress);
    }
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchError('Enter a place or address to search.');
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', query);
      url.searchParams.set('limit', '1');

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('search failed');
      }

      const payload = (await response.json()) as Array<Record<string, unknown>>;
      const first = Array.isArray(payload) ? payload[0] : undefined;

      const lat = Number(first?.lat);
      const lng = Number(first?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setSearchError('No matching location found.');
        return;
      }

      await applyCoordinates(lat, lng, false);
      const label = typeof first?.display_name === 'string' && first.display_name.trim()
        ? first.display_name.trim()
        : query;
      setAddressInput(label);
      setGeolocationError(null);
    } catch {
      setSearchError('Location search failed. Try a more specific query.');
    } finally {
      setSearching(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeolocationError('Current location is not supported in this browser.');
      return;
    }

    setGeolocating(true);
    setGeolocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          await applyCoordinates(position.coords.latitude, position.coords.longitude, true);
          setSearchError(null);
          setGeolocating(false);
        })();
      },
      (error) => {
        setGeolocationError(error.message || 'Unable to fetch your current location.');
        setGeolocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  const handleClear = () => {
    setLatInput('');
    setLngInput('');
    setAddressInput('');
    setSearchQuery('');
    setSearchError(null);
    setGeolocationError(null);
  };

  return (
    <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Location (optional)</p>
          <p className="text-xs text-muted-foreground">
            Click on map, drag marker, search place, or type coordinates manually.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={disabled}>
          <Trash2 className="mr-2 h-4 w-4" />
          Clear
        </Button>
      </div>

      <div className="flex flex-col gap-2 md:flex-row">
        <div className="flex-1">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search location (e.g., Dhaka, Bangladesh)"
            disabled={disabled || searching}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleSearch()}
          disabled={disabled || searching}
        >
          {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Search
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleUseCurrentLocation}
          disabled={disabled || geolocating}
        >
          {geolocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
          Use current location
        </Button>
      </div>

      {searchError && (
        <p className="text-xs text-destructive">{searchError}</p>
      )}
      {geolocationError && (
        <p className="text-xs text-destructive">{geolocationError}</p>
      )}

      <div className="overflow-hidden rounded-md border border-border/70">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          className="h-72 w-full"
          scrollWheelZoom
          zoomControl
        >
          <MapSizeSync />
          <MapViewportSync center={mapCenter} zoom={mapZoom} />
          <TileLayer
            attribution={OSM_ATTRIBUTION}
            url={OSM_TILE_URL}
          />
          <MapClickHandler
            disabled={disabled}
            onPick={(lat, lng) => {
              void applyCoordinates(lat, lng, true);
            }}
          />
          {markerPosition && (
            <Marker
              position={markerPosition}
              icon={markerIcon}
              draggable={!disabled}
              eventHandlers={{
                dragend: (event) => {
                  const marker = event.target as L.Marker;
                  const moved = marker.getLatLng();
                  void applyCoordinates(moved.lat, moved.lng, true);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="broadcast-location-lat">Latitude</Label>
          <Input
            id="broadcast-location-lat"
            inputMode="decimal"
            value={latInput}
            onChange={(event) => setLatInput(event.target.value)}
            placeholder="e.g., 23.810331"
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="broadcast-location-lng">Longitude</Label>
          <Input
            id="broadcast-location-lng"
            inputMode="decimal"
            value={lngInput}
            onChange={(event) => setLngInput(event.target.value)}
            placeholder="e.g., 90.412521"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="broadcast-location-address">Address / Place (optional)</Label>
        <Input
          id="broadcast-location-address"
          value={addressInput}
          onChange={(event) => setAddressInput(event.target.value)}
          placeholder="e.g., Dhaka, Bangladesh"
          disabled={disabled}
        />
      </div>

      {validatedLocation.error && (
        <p className="text-xs text-destructive">{validatedLocation.error}</p>
      )}

      {locationLabel && (
        <p className="text-xs text-muted-foreground">
          Selected location:{' '}
          {locationLink ? (
            <a
              href={locationLink}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {locationLabel}
            </a>
          ) : (
            <span className="font-medium text-foreground">{locationLabel}</span>
          )}
        </p>
      )}
    </div>
  );
}
