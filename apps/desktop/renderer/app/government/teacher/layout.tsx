'use client';

import type { ReactNode } from 'react';
import { SystemRole } from '@nemis-desktop/types';
import { RouteGuard } from '@/components/shell/RouteGuard';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { StatusBar } from '@/components/shell/StatusBar';
import { ToastHost } from '@/components/shell/ToastHost';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard requiredRole={SystemRole.TEACHER}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar role={SystemRole.TEACHER} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header role={SystemRole.TEACHER} />
          <main className="flex-1 overflow-y-auto">{children}</main>
          <StatusBar />
        </div>
      </div>
      <ToastHost />
    </RouteGuard>
  );
}
