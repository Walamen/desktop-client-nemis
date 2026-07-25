'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { nemisBridge } from '@/services/nemis-bridge';

export function RouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    void nemisBridge.getProvisioningStatus().then((status) => {
      if (status.isProvisioned && status.authentication === 'authenticated') setAllowed(true);
      else router.replace('/');
    });
  }, [router]);
  return allowed ? <>{children}</> : null;
}
