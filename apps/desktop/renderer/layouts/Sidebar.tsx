import { GraduationCap, LayoutDashboard, School, Settings, Users } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Schools', icon: School },
  { label: 'Students', icon: Users },
  { label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-primary text-white">
      <div className="flex items-center gap-3 px-6 py-6">
        <GraduationCap className="h-8 w-8" aria-hidden />
        <div>
          <p className="text-sm font-semibold tracking-wide">NEMIS</p>
          <p className="text-xs text-white/60">Desktop Client</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-4" aria-label="Main navigation">
        {NAV_ITEMS.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            disabled
            className="flex w-full items-center gap-3 rounded-full px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed"
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </nav>
      <p className="px-6 py-4 text-xs text-white/40">Phase 1 — Foundation</p>
    </aside>
  );
}
