'use client';
import type { ReactNode } from 'react';
import { SystemRole } from '@nemis-desktop/types';
import { RolePortalShell } from '@/components/shell/RolePortalShell';
export default function Layout({ children }: { children: ReactNode }) {
  return <RolePortalShell role={SystemRole.DEO} title="District Education Office">{children}</RolePortalShell>;
}
