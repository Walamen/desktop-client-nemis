'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  desktopPortalRoute,
  roleCanAccessRoute,
  type DesktopPortalRole,
  type ProvisioningUser,
} from '@nemis-desktop/types';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { useRealtime } from '@/hooks/use-realtime';
import { SessionUserProvider } from './SessionUserContext';

export function RouteGuard({
  children,
  requiredRoles,
}: {
  children: ReactNode;
  requiredRoles?: readonly DesktopPortalRole[];
}) {
  const router = useRouter();
  const [user, setUser] = useState<ProvisioningUser | null>(null);
  const check = useCallback(() => {
    void sharedBridge
      .getProvisioningStatus()
      .then((status) => {
        if (!status.isProvisioned || status.authentication !== 'authenticated' || !status.user) {
          router.replace('/');
          return;
        }
        const route = desktopPortalRoute(status.user.role);
        if (!route || (requiredRoles && !requiredRoles.includes(status.user.role))) {
          router.replace(route ?? '/');
          return;
        }
        if (roleCanAccessRoute(status.user.role, window.location.pathname)) setUser(status.user);
        else router.replace(route);
      })
      .catch(() => undefined);
  }, [requiredRoles, router]);
  useEffect(() => check(), [check]);
  useRealtime((event) => {
    if (event.type !== 'session') return;
    if (event.reason === 'revoked') {
      router.replace('/');
      return;
    }
    check();
  });
  return user ? <SessionUserProvider user={user}>{children}</SessionUserProvider> : null;
}
