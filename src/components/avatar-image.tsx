'use client';
import { useState } from 'react';
export function AvatarImage({
  src,
  name,
  className,
}: {
  src?: string;
  name: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={className} aria-hidden="true">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        name.trim().slice(0, 1).toLocaleUpperCase('kk-KZ')
      )}
    </span>
  );
}
