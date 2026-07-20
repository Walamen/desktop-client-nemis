'use client';

import type { ReactNode } from 'react';

/** Seam for the authentication phase. Today the mocked user is always present,
 * so this renders children unconditionally. Auth redirects land here. */
export function RouteGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
