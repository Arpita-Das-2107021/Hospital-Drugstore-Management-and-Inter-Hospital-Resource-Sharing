import { useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { getInitials, resolveMediaUrl } from '@/utils/media';

interface HospitalLogoProps {
  name?: string;
  logo?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

export default function HospitalLogo({
  name,
  logo,
  className = 'h-12 w-12',
  imageClassName = 'object-cover',
  fallbackClassName = 'bg-primary/10 text-primary',
}: HospitalLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = useMemo(() => resolveMediaUrl(logo), [logo]);
  const initials = getInitials(name);

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt={name ? `${name} logo` : 'Hospital logo'}
        className={`${className} rounded-lg ${imageClassName}`}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className={`${className} rounded-lg flex items-center justify-center ${fallbackClassName}`}>
      {name ? <span className="font-semibold">{initials}</span> : <Building2 className="h-5 w-5" />}
    </div>
  );
}
