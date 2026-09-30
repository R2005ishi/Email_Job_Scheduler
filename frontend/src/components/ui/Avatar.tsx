import { useState } from 'react';
import { initials } from '../../lib/format';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ name, src, size = 36, className = '' }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      style={{ ...style, fontSize: size * 0.4 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-semibold text-white ${className}`}
    >
      {initials(name)}
    </span>
  );
}
