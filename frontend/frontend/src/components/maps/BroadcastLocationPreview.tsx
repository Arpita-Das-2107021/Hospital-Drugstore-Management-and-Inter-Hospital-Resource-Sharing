import L, { type Icon } from 'leaflet';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { cn } from '@/lib/utils';
import { type StructuredLocation } from '@/utils/location';
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

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface BroadcastLocationPreviewProps {
  location: StructuredLocation | null | undefined;
  className?: string;
}

export default function BroadcastLocationPreview({
  location,
  className,
}: BroadcastLocationPreviewProps) {
  if (
    !location ||
    typeof location.lat !== 'number' ||
    !Number.isFinite(location.lat) ||
    typeof location.lng !== 'number' ||
    !Number.isFinite(location.lng)
  ) {
    return null;
  }

  const center: [number, number] = [location.lat, location.lng];

  return (
    <div className={cn('overflow-hidden rounded-md border border-border/70', className)}>
      <MapContainer
        center={center}
        zoom={13}
        className="h-40 w-full"
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          attribution={OSM_ATTRIBUTION}
          url={OSM_TILE_URL}
        />
        <Marker position={center} icon={markerIcon} />
      </MapContainer>
    </div>
  );
}
