'use client';

import { type ReactNode, useEffect } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { StatusBar } from '@/components/shell/StatusBar';
import { RouteGuard } from '@/components/shell/RouteGuard';
import { ToastHost } from '@/components/shell/ToastHost';
import { useSettingsViewModel, useCurrentUserViewModel } from '@/lib/presentation/hooks';
import { useViewModel } from '@/hooks/use-view-model';
import { DEMO_INSTITUTION_ID, DEMO_USER_ID } from '@/lib/presentation/seed-demo-data';

export default function SchoolAdminLayout({ children }: { children: ReactNode }) {
  const settings = useSettingsViewModel();
  const currentUser = useCurrentUserViewModel();

  useEffect(() => {
    void settings.loadProfile(DEMO_INSTITUTION_ID);
    void currentUser.loadUser(DEMO_USER_ID);
  }, [settings, currentUser]);

  const profile = useViewModel(settings.store, (s) => s.profile);
  const institutionName = profile.status === 'success' ? profile.data.name : 'NEMIS School';

  return (
    <RouteGuard>
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
