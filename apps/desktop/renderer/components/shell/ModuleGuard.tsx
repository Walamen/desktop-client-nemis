'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { canUseSchoolAccess, schoolRouteAccess } from '@nemis-desktop/types';
import { useSessionUser } from './SessionUserContext';

const SCHOOL_DASHBOARD = '/government/school-admin';

/** Sends an office user who lacks the module for the current route back to the dashboard. */
export function ModuleGuard({ children }: { children: ReactNode }) {
  const user = useSessionUser();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = canUseSchoolAccess(user, schoolRouteAccess(pathname));
  useEffect(() => {
    if (!allowed) router.replace(SCHOOL_DASHBOARD);
  }, [allowed, router]);
  return allowed ? <>{children}</> : null;
}
