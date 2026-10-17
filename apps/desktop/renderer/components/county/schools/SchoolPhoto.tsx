'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

const FALLBACK = '/school-fallback.jpg';

/** next/image for school photos: unoptimized (static export, remote Cloudinary
 * URLs) and swapped to the local fallback when the photo cannot load — offline,
 * or a missing image. Students and others pass their own `fallback`. */
export function SchoolPhoto({ src, alt, fallback = FALLBACK, ...rest }: ImageProps & { fallback?: string }) {
  const [failedSrc, setFailedSrc] = useState<ImageProps['src'] | null>(null);
  return (
    <Image
      {...rest}
      unoptimized
      alt={alt}
      src={failedSrc === src ? fallback : src}
      onError={() => setFailedSrc(src)}
    />
  );
}
