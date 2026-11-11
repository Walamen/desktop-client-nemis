'use client';

import { type ReactNode } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { StatusBar } from '@/components/shell/StatusBar';
import { RouteGuard } from '@/components/shell/RouteGuard';
import { ModuleGuard } from '@/components/shell/ModuleGuard';
import { useSessionUser } from '@/components/shell/SessionUserContext';
import { ToastHost } from '@/components/shell/ToastHost';
import { SystemRole } from '@nemis-desktop/types';

// Module-level so RouteGuard's effect does not re-run on every navigation.
const SCHOOL_ROLES = [SystemRole.INSTITUTION_ADMIN, SystemRole.INSTITUTION_STAFF] as const;

function SchoolAdminShell({ children }: { children: ReactNode }) {
  const { role } = useSessionUser();
  return (
    <>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white">Skip to content</a>
        <Sidebar role={role} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header role={role} />
          <main id="main-content" className="flex-1 overflow-y-auto">
            <ModuleGuard>{children}</ModuleGuard>
          </main>
          <StatusBar />
        </div>
      </div>
      <ToastHost />
    </>
  );
}

export default function SchoolAdminLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard requiredRoles={SCHOOL_ROLES}>
      <SchoolAdminShell>{children}</SchoolAdminShell>
    </RouteGuard>
  );
}
