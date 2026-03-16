const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/api\/?$/, '');

export function resolveMediaUrl(path?: string | null): string {
  if (!path) return '';

  const value = String(path).trim();
  if (!value) return '';

  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${API_ORIGIN}${value}`;
  }

  return `${API_ORIGIN}/${value}`;
}

export function getInitials(name?: string | null): string {
  if (!name) return 'H';
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'H';
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || 'H';
}
