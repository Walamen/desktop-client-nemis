'use client';

import { type ReactNode } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { StatusBar } from '@/components/shell/StatusBar';
import { RouteGuard } from '@/components/shell/RouteGuard';
import { ToastHost } from '@/components/shell/ToastHost';
import { SystemRole } from '@nemis-desktop/types';

export default function SchoolAdminLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard requiredRole={SystemRole.INSTITUTION_ADMIN}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white">Skip to content</a>
        <Sidebar role={SystemRole.INSTITUTION_ADMIN} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header role={SystemRole.INSTITUTION_ADMIN} />
          <main id="main-content" className="flex-1 overflow-y-auto">{children}</main>
          <StatusBar />
        </div>
      </div>
      <ToastHost />
    </RouteGuard>
  );
}
