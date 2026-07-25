'use client';

import type { ReactNode } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { DESKTOP_PORTALS, type DesktopPortalRole } from '@nemis-desktop/types';
import { RouteGuard } from './RouteGuard';
import { StatusBar } from './StatusBar';
import { ToastHost } from './ToastHost';
import { nemisBridge } from '@/services/nemis-bridge';
import { useRouter } from 'next/navigation';

const ROLE_LINKS: Readonly<Record<DesktopPortalRole, readonly { label: string; path: string }[]>> =
  {
    MINISTRY_ADMIN: [
      { label: 'Reports', path: 'reports' },
      { label: 'Schools', path: 'schools' },
      { label: 'Alerts', path: 'alerts' },
    ],
    COUNTY_ADMIN: [
      { label: 'Schools', path: 'schools' },
      { label: 'Reports', path: 'reports' },
      { label: 'Alerts', path: 'alerts' },
    ],
    DEO: [
      { label: 'Schools', path: 'schools' },
      { label: 'Transfers', path: 'transfers' },
      { label: 'Reports', path: 'reports' },
      { label: 'Alerts', path: 'alerts' },
    ],
    INSTITUTION_ADMIN: [],
    TEACHER: [
      { label: 'My classes', path: 'my-classes' },
      { label: 'Attendance', path: 'attendance' },
    { label: 'Grades', path: 'grades' },
    { label: 'Assignments', path: 'assignment' },
    { label: 'Resources', path: 'resources' },
      { label: 'Timetable', path: 'timetable' },
      { label: 'Messages', path: 'messages' },
      { label: 'Notifications', path: 'notifications' },
    ],
  };

export function RolePortalShell({
  role,
  title,
  children,
}: {
  role: DesktopPortalRole;
  title: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const home = DESKTOP_PORTALS[role].route;
  return (
    <RouteGuard requiredRole={role}>
      <div className="flex h-screen overflow-hidden bg-slate-100">
        <aside className="w-64 shrink-0 bg-slate-950 text-white flex flex-col">
          <div className="p-5 border-b border-slate-800">
            <p className="text-xs uppercase tracking-[0.2em] text-blue-300">NEMIS Desktop</p>
            <h1 className="mt-2 font-semibold">{title}</h1>
          </div>
          <nav className="p-3 flex-1" aria-label={`${title} navigation`}>
            <a
              href={home}
              className="flex items-center gap-3 rounded-lg bg-blue-600 px-3 py-2 text-sm"
            >
              <ShieldCheck className="h-4 w-4" />
              Scoped overview
            </a>
            <div className="mt-2 space-y-1">
              {ROLE_LINKS[role].map((item) => (
                <a
                  key={item.path}
                  href={`${home}/${item.path}`}
                  className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>
          <button
            className="m-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-800"
            onClick={() => void nemisBridge.logout().finally(() => router.replace('/'))}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </aside>
        <div className="min-w-0 flex-1 flex flex-col">
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          <StatusBar />
        </div>
      </div>
      <ToastHost />
    </RouteGuard>
  );
}
