'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Map, LogOut } from 'lucide-react';
import { SIDEBAR_DASHBOARD_ITEM, SIDEBAR_NAV } from './sidebar-config';

export function Sidebar({ institutionName }: { institutionName: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

  return (
    <div className="w-[230px] bg-primary h-full flex flex-col" aria-label="Primary">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 flex items-center justify-center">
            <Map className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-heading font-bold text-md text-white truncate w-[80%]">{institutionName}</h2>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 sidebar-scroll" aria-label="Sidebar">
        <div className="space-y-1">
          <Link
            href={SIDEBAR_DASHBOARD_ITEM.href}
            className={`flex items-center gap-3 px-4 py-3 transition-colors ${
              isActive(SIDEBAR_DASHBOARD_ITEM.href)
                ? 'bg-slate-800 text-neutral-light'
                : 'text-white/80 hover:bg-slate-900 hover:text-neutral-light'
            }`}
          >
            <SIDEBAR_DASHBOARD_ITEM.icon className="w-5 h-5" />
            <span className="font-semibold text-sm">{SIDEBAR_DASHBOARD_ITEM.name}</span>
          </Link>

          {SIDEBAR_NAV.map((group) => (
            <div key={group.label}>
              <div className="border-t border-white/20 my-4" />
              <div className="px-4 mb-2">
                <span className="text-white/40 text-xs font-semibold tracking-wider">{group.label}</span>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        isActive(item.href) ? 'bg-slate-800 text-slate-100' : 'text-white/80 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span className="font-semibold text-sm flex-1">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          type="button"
          disabled
          title="Available after sign-in support"
          className="flex items-center gap-3 px-4 py-3 text-white/40 w-full cursor-not-allowed"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Logout</span>
        </button>
      </div>
    </div>
  );
}
