'use client';

import { type ReactNode } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { StatusBar } from '@/components/shell/StatusBar';
import { RouteGuard } from '@/components/shell/RouteGuard';
import { ToastHost } from '@/components/shell/ToastHost';
import { useSettingsViewModel } from '@/lib/presentation/hooks';
import { useViewModel } from '@/hooks/use-view-model';
import { SystemRole } from '@nemis-desktop/types';

export default function SchoolAdminLayout({ children }: { children: ReactNode }) {
  // The school profile is loaded once by the BootstrapService; here we only read it.
  const settings = useSettingsViewModel();
  const profile = useViewModel(settings.store, (s) => s.profile);
  const institutionName = profile.status === 'success' ? profile.data.name : 'NEMIS School';

  return (
    <RouteGuard requiredRole={SystemRole.INSTITUTION_ADMIN}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white">Skip to content</a>
        <Sidebar institutionName={institutionName} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main id="main-content" className="flex-1 overflow-y-auto">{children}</main>
          <StatusBar />
        </div>
      </div>
      <ToastHost />
    </RouteGuard>
  );
}
