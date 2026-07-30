'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  desktopPortalRoute,
  roleCanAccessRoute,
  type DesktopPortalRole,
} from '@nemis-desktop/types';
import { sharedBridge } from '@/services/nemis-bridge/shared';

export function RouteGuard({
  children,
  requiredRole,
}: {
  children: ReactNode;
  requiredRole?: DesktopPortalRole;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    void sharedBridge.getProvisioningStatus().then((status) => {
      if (!status.isProvisioned || status.authentication !== 'authenticated' || !status.user) {
        router.replace('/');
        return;
      }
      const route = desktopPortalRoute(status.user.role);
      if (!route || (requiredRole && status.user.role !== requiredRole)) {
        router.replace(route ?? '/');
        return;
      }
      if (roleCanAccessRoute(status.user.role, window.location.pathname)) setAllowed(true);
      else router.replace(route);
    });
  }, [requiredRole, router]);
  return allowed ? <>{children}</> : null;
}
