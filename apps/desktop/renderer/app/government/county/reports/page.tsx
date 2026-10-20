'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** The web's Reports entry is Generate Reports (its /reports/enhanced
 * redirects there too); a static export has no server redirects. */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/government/county/reports/generate');
  }, [router]);
  return null;
}
