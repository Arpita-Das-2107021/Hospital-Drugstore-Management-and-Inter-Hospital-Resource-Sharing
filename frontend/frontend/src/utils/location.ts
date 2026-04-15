export interface StructuredLocation {
  lat?: number;
  lng?: number;
  address?: string;
}

const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

const hasInputValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const toTrimmedText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
};

export const isValidLatitude = (value: number): boolean => {
  return Number.isFinite(value) && value >= LAT_MIN && value <= LAT_MAX;
};

export const isValidLongitude = (value: number): boolean => {
  return Number.isFinite(value) && value >= LNG_MIN && value <= LNG_MAX;
};

export const toCoordinate = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed;
  }

  return undefined;
};

const toRoundedCoordinate = (value: number | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Number(value.toFixed(6));
};

export const normalizeStructuredLocation = (
  value: Partial<StructuredLocation> | null | undefined,
): StructuredLocation | null => {
  if (!value || typeof value !== 'object') return null;

  const lat = toRoundedCoordinate(toCoordinate(value.lat));
  const lng = toRoundedCoordinate(toCoordinate(value.lng));
  const address = toTrimmedText(value.address);

  const normalized: StructuredLocation = {
    ...(lat !== undefined ? { lat } : {}),
    ...(lng !== undefined ? { lng } : {}),
    ...(address ? { address } : {}),
  };

  if (Object.keys(normalized).length === 0) {
    return null;
  }

  return normalized;
};

export const validateLocationInput = (value: {
  lat?: unknown;
  lng?: unknown;
  address?: unknown;
}): { normalized: StructuredLocation | null; error: string | null } => {
  const hasLat = hasInputValue(value.lat);
  const hasLng = hasInputValue(value.lng);
  const address = toTrimmedText(value.address);

  if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
    return {
      normalized: normalizeStructuredLocation({ address }),
      error: 'Provide both latitude and longitude, or clear both fields.',
    };
  }

  const lat = hasLat ? toCoordinate(value.lat) : undefined;
  const lng = hasLng ? toCoordinate(value.lng) : undefined;

  if (hasLat && lat === undefined) {
    return {
      normalized: normalizeStructuredLocation({ address }),
      error: 'Latitude must be a valid number.',
    };
  }

  if (hasLng && lng === undefined) {
    return {
      normalized: normalizeStructuredLocation({ address }),
      error: 'Longitude must be a valid number.',
    };
  }

  if (typeof lat === 'number' && !isValidLatitude(lat)) {
    return {
      normalized: normalizeStructuredLocation({ address }),
      error: 'Latitude must be between -90 and 90.',
    };
  }

  if (typeof lng === 'number' && !isValidLongitude(lng)) {
    return {
      normalized: normalizeStructuredLocation({ address }),
      error: 'Longitude must be between -180 and 180.',
    };
  }

  return {
    normalized: normalizeStructuredLocation({ lat, lng, address }),
    error: null,
  };
};

const asUnknownRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

export const parseStructuredLocation = (value: unknown): StructuredLocation | null => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    return normalizeStructuredLocation({ address: value });
  }

  const record = asUnknownRecord(value);

  const lat =
    toCoordinate(record.lat) ??
    toCoordinate(record.latitude) ??
    toCoordinate(record.coordinates_lat) ??
    toCoordinate(record.coordinatesLat) ??
    toCoordinate(record.y);

  const lng =
    toCoordinate(record.lng) ??
    toCoordinate(record.lon) ??
    toCoordinate(record.longitude) ??
    toCoordinate(record.coordinates_lng) ??
    toCoordinate(record.coordinatesLng) ??
    toCoordinate(record.x);

  const address =
    toTrimmedText(record.address) ??
    toTrimmedText(record.display_name) ??
    toTrimmedText(record.location_name) ??
    toTrimmedText(record.location_text) ??
    (typeof record.location === 'string' ? toTrimmedText(record.location) : undefined);

  return normalizeStructuredLocation({ lat, lng, address });
};

export const formatLocationLabel = (location: StructuredLocation | null | undefined): string => {
  if (!location) return '';

  const address = toTrimmedText(location.address);
  const lat = toCoordinate(location.lat);
  const lng = toCoordinate(location.lng);

  if (typeof lat === 'number' && typeof lng === 'number') {
    const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    return address ? `${address} (${coords})` : coords;
  }

  return address || '';
};

export const buildLocationLink = (location: StructuredLocation | null | undefined): string | null => {
  if (!location) return null;

  const lat = toCoordinate(location.lat);
  const lng = toCoordinate(location.lng);

  if (typeof lat === 'number' && typeof lng === 'number') {
    return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  const address = toTrimmedText(location.address);
  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};
