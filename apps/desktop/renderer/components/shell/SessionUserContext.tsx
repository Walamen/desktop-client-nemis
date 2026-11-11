'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ProvisioningUser } from '@nemis-desktop/types';

const SessionUserContext = createContext<ProvisioningUser | null>(null);

export function SessionUserProvider({
  user,
  children,
}: {
  user: ProvisioningUser;
  children: ReactNode;
}) {
  return <SessionUserContext.Provider value={user}>{children}</SessionUserContext.Provider>;
}

export function useSessionUser(): ProvisioningUser {
  const user = useContext(SessionUserContext);
  if (!user) throw new Error('useSessionUser must be used inside a SessionUserProvider');
  return user;
}

/** Non-throwing variant for shared chrome that also renders in tests or portals
 * where no session user is required. */
export function useOptionalSessionUser(): ProvisioningUser | null {
  return useContext(SessionUserContext);
}
