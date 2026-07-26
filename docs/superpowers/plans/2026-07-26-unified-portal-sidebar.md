# Unified Portal Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the school-admin-only `Sidebar`/`sidebar-config` and the crude `RolePortalShell` placeholder with one shared `Sidebar` + `sidebarConfig` + `Header` used by all 5 desktop portals (school-admin, county, deo, teacher, ministry-portal), and expand each non-school-admin portal's navigation to match the richer `portal-web` navigation breadth (adding ~25 new thin route pages).

**Architecture:** A single `components/shell/sidebarConfig.ts` exports `sidebarConfigs`/`headerConfigs` keyed by the existing `DesktopPortalRole` type. `Sidebar.tsx` and `Header.tsx` become role-parameterized, reading from that config instead of hardcoded school-admin data. All 5 `layout.tsx` files converge on the same `RouteGuard` → `Sidebar` + `Header` + `main` + `StatusBar` → `ToastHost` shape. New nav items get real routes: either a thin `SchoolAdminCollectionPage` wrapper (reads an already-synced local SQLite collection) or a `ComingSoon` stub where no backing collection exists.

**Tech Stack:** Next.js App Router (renderer), React, TypeScript strict mode, Tailwind, lucide-react icons, Vitest + Testing Library.

## Global Constraints

- Never introduce new IPC channels, new SQLite collections, or new business logic in the renderer — Electron/renderer code only reads already-synced local data (CLAUDE.md "Electron NEVER owns... business logic").
- Valid collections for the generic viewer are exactly `SCHOOL_ADMIN_COLLECTIONS` in `packages/types/src/school-admin.ts` — do not invent new collection names.
- `roleCanAccessRoute` (in `packages/types/src/desktop-portals.ts`) already allows any subpath under a role's base route (`DESKTOP_PORTALS[role].route`) — no changes needed there.
- No new automated tests for the new thin wrapper pages — matches existing convention (only root dashboard pages have `.test.tsx` files today).
- Named exports, no `any`, keep files focused (per repo CLAUDE.md coding standards).

---

## Task 1: `sidebarConfig.ts` — types and all 5 role configs

**Files:**
- Create: `apps/desktop/renderer/components/shell/sidebarConfig.ts`
- Delete: `apps/desktop/renderer/components/shell/sidebar-config.ts`

**Interfaces:**
- Produces: `SidebarBadge`, `SidebarNavItem`, `SidebarNavGroup`, `SidebarConfig`, `HeaderConfig`, `sidebarConfigs: Record<DesktopPortalRole, SidebarConfig>`, `headerConfigs: Record<DesktopPortalRole, HeaderConfig>` — consumed by Tasks 2-4.

- [ ] **Step 1: Write `sidebarConfig.ts`**

```ts
import {
  LayoutDashboard, Map, School, CheckCircle, BookOpen, CalendarCheck, Users, CalendarRange,
  CalendarClock, Layers3, Building2, FileText, UserPlus, CreditCard, Bell, MessageCircle,
  Settings2Icon, MessageSquare, DollarSign, ClipboardCheck, ShieldCheck, Settings, UserCog,
  GraduationCap, ArrowRightLeft, UserCircle2, AlertTriangle, FileBarChart,
  type LucideIcon,
} from 'lucide-react';
import { SystemRole, type DesktopPortalRole } from '@nemis-desktop/types';
import type { AvatarRole } from '@nemis-desktop/ui';

export type SidebarBadge = 'notifications';

export interface SidebarNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: SidebarBadge;
}

export interface SidebarNavGroup {
  label: string;
  items: readonly SidebarNavItem[];
}

export interface SidebarConfig {
  /** Static header title. When omitted, the caller-supplied institutionName is shown. */
  headerTitle?: string;
  headerSubtitle?: string;
  /** Optional ungrouped item rendered above the groups. */
  dashboardItem?: SidebarNavItem;
  navGroups: readonly SidebarNavGroup[];
}

export interface HeaderConfig {
  /** Base route for the role; breadcrumb segments are computed relative to it. */
  basePath: string;
  avatarRole: AvatarRole;
  /** Label used as the first breadcrumb segment (after "Home /"). */
  breadcrumbRoot: string;
  /** Explicit title overrides for nested pages that are not themselves sidebar items. */
  pageTitles?: Record<string, string>;
}

export const sidebarConfigs: Record<DesktopPortalRole, SidebarConfig> = {
  [SystemRole.INSTITUTION_ADMIN]: {
    dashboardItem: {
      name: 'Overview',
      href: '/government/school-admin',
      icon: LayoutDashboard,
    },
    navGroups: [
      {
        label: 'User Management',
        items: [
          { name: 'Students', href: '/government/school-admin/students', icon: Map },
          { name: 'Student Transfers', href: '/government/school-admin/students/inter-school-transfer', icon: Map },
          { name: 'Teachers & Staff', href: '/government/school-admin/teachers-staff', icon: School },
          { name: 'Parents & Guardians', href: '/government/school-admin/parents-guardians', icon: CheckCircle },
        ],
      },
      {
        label: 'ACADEMIC',
        items: [
          { name: 'Academic Years', href: '/government/school-admin/academic-years', icon: CalendarRange },
          { name: 'Terms', href: '/government/school-admin/terms', icon: CalendarClock },
          { name: 'Grade Levels', href: '/government/school-admin/grade-levels', icon: Layers3 },
          { name: 'Classes Management', href: '/government/school-admin/classes', icon: BookOpen },
          { name: 'Subjects Management', href: '/government/school-admin/subjects', icon: BookOpen },
          { name: 'Attendence Management', href: '/government/school-admin/attendance', icon: CalendarCheck },
          { name: 'Academic & Grading', href: '/government/school-admin/academic-grading', icon: Users },
          { name: 'General Schedule Management', href: '/government/school-admin/timetable', icon: BookOpen },
          { name: 'Grade Windows', href: '/government/school-admin/academic-grading/windows', icon: FileText },
          { name: 'Grading Periods', href: '/government/school-admin/academic-grading/periods', icon: CalendarRange },
          { name: 'Infrastructure', href: '/government/school-admin/infrastructure', icon: Building2 },
        ],
      },
      {
        label: 'FINANCIAL',
        items: [
          { name: 'Financial / Fees', href: '/government/school-admin/financial', icon: UserPlus },
          { name: 'Record Payment', href: '/government/school-admin/financial/record-payment', icon: CreditCard },
          { name: 'Fee Rules', href: '/government/school-admin/financial/fee-rules', icon: FileText },
        ],
      },
      {
        label: 'REPORTS',
        items: [{ name: 'Reports', href: '/government/school-admin/reports', icon: FileText }],
      },
      {
        label: 'COMMUNICATION',
        items: [
          { name: 'Notifications', href: '/government/school-admin/notifications', icon: Bell, badge: 'notifications' },
          { name: 'Messages', href: '/government/school-admin/messages', icon: MessageCircle },
        ],
      },
      {
        label: 'SYSTEM',
        items: [
          { name: 'School Profile', href: '/government/school-admin/school-profile', icon: Building2 },
          { name: 'School Settings', href: '/government/school-admin/settings', icon: Settings2Icon },
        ],
      },
    ],
  },

  [SystemRole.COUNTY_ADMIN]: {
    headerTitle: 'NEMIS',
    headerSubtitle: 'CEO PANEL',
    dashboardItem: {
      name: 'Dashboard',
      href: '/government/county',
      icon: LayoutDashboard,
    },
    navGroups: [
      {
        label: 'MAIN',
        items: [
          { name: 'Districts', href: '/government/county/districts', icon: Map },
          { name: 'Schools', href: '/government/county/schools', icon: School },
        ],
      },
      {
        label: 'PEOPLE',
        items: [
          { name: 'Students', href: '/government/county/students', icon: Users },
          { name: 'Teachers', href: '/government/county/teachers', icon: BookOpen },
          { name: 'Parent/Guardians', href: '/government/county/parents', icon: UserCircle2 },
          { name: 'Administrative Users', href: '/government/county/users', icon: Users },
        ],
      },
      {
        label: 'FINANCE',
        items: [
          { name: 'Overview', href: '/government/county/finance', icon: DollarSign },
          { name: 'Fee Rules', href: '/government/county/finance/fee-rules', icon: ClipboardCheck },
        ],
      },
      {
        label: 'REPORTS',
        items: [{ name: 'Reports', href: '/government/county/reports', icon: ClipboardCheck }],
      },
      {
        label: 'COMMUNICATION',
        items: [
          { name: 'Messages', href: '/government/county/messages', icon: MessageSquare },
          { name: 'Notifications', href: '/government/county/notifications', icon: Bell, badge: 'notifications' },
          { name: 'Alerts', href: '/government/county/alerts', icon: AlertTriangle },
        ],
      },
      {
        label: 'SYSTEM',
        items: [
          { name: 'Audit Trail', href: '/government/county/audit', icon: ShieldCheck },
          { name: 'Settings', href: '/government/county/settings', icon: Settings },
        ],
      },
    ],
  },

  [SystemRole.DEO]: {
    headerTitle: 'Nemis',
    headerSubtitle: 'DEO Portal',
    navGroups: [
      {
        label: 'OVERVIEW',
        items: [{ name: 'Dashboard', href: '/government/deo', icon: LayoutDashboard }],
      },
      {
        label: 'MAIN',
        items: [
          { name: 'Schools', href: '/government/deo/schools', icon: Building2 },
          { name: 'School Admins', href: '/government/deo/school-admins', icon: UserCog },
          { name: 'Teachers', href: '/government/deo/teachers', icon: GraduationCap },
          { name: 'Students', href: '/government/deo/students', icon: Users },
          { name: 'Transfers', href: '/government/deo/transfers', icon: ArrowRightLeft },
        ],
      },
      {
        label: 'REPORTS',
        items: [
          { name: 'Reports', href: '/government/deo/reports', icon: FileBarChart },
          { name: 'Finance', href: '/government/deo/finance', icon: DollarSign },
        ],
      },
      {
        label: 'COMMUNICATION',
        items: [
          { name: 'Messaging', href: '/government/deo/messages', icon: MessageSquare },
          { name: 'Notifications', href: '/government/deo/notifications', icon: Bell, badge: 'notifications' },
          { name: 'Alerts', href: '/government/deo/alerts', icon: AlertTriangle },
        ],
      },
      {
        label: 'SYSTEM',
        items: [{ name: 'Settings', href: '/government/deo/settings', icon: Settings }],
      },
    ],
  },

  [SystemRole.MINISTRY_ADMIN]: {
    headerTitle: 'NEMIS',
    headerSubtitle: 'Ministry of Education',
    dashboardItem: {
      name: 'Dashboard',
      href: '/government/ministry-portal',
      icon: LayoutDashboard,
    },
    navGroups: [
      {
        label: 'MAIN',
        items: [{ name: 'Schools', href: '/government/ministry-portal/schools', icon: School }],
      },
      {
        label: 'PEOPLE',
        items: [
          { name: 'Students', href: '/government/ministry-portal/students', icon: Users },
          { name: 'Teachers', href: '/government/ministry-portal/teachers', icon: BookOpen },
          { name: 'Parent/Guardians', href: '/government/ministry-portal/parents', icon: UserCircle2 },
          { name: 'Administrative Users', href: '/government/ministry-portal/users', icon: Users },
        ],
      },
      {
        label: 'FINANCE',
        items: [
          { name: 'Overview', href: '/government/ministry-portal/finance', icon: DollarSign },
          { name: 'Fee Rules', href: '/government/ministry-portal/finance/fee-rules', icon: ClipboardCheck },
        ],
      },
      {
        label: 'REPORTS',
        items: [{ name: 'Reports', href: '/government/ministry-portal/reports', icon: ClipboardCheck }],
      },
      {
        label: 'COMMUNICATION',
        items: [
          { name: 'Messages', href: '/government/ministry-portal/messages', icon: MessageSquare },
          { name: 'Notifications', href: '/government/ministry-portal/notifications', icon: Bell, badge: 'notifications' },
          { name: 'Alerts', href: '/government/ministry-portal/alerts', icon: AlertTriangle },
        ],
      },
      {
        label: 'SYSTEM',
        items: [
          { name: 'Audit Trail', href: '/government/ministry-portal/audit', icon: ShieldCheck },
          { name: 'Settings', href: '/government/ministry-portal/settings', icon: Settings },
        ],
      },
    ],
  },

  [SystemRole.TEACHER]: {
    headerTitle: 'NEMIS',
    headerSubtitle: 'Teacher Portal',
    navGroups: [
      {
        label: 'OVERVIEW',
        items: [{ name: 'Dashboard', href: '/government/teacher', icon: LayoutDashboard }],
      },
      {
        label: 'TEACHING',
        items: [
          { name: 'My School', href: '/government/teacher/my-school', icon: Map },
          { name: 'My Classes', href: '/government/teacher/my-classes', icon: School },
          { name: 'Class Schedule', href: '/government/teacher/timetable', icon: CheckCircle },
          { name: 'Gradebook', href: '/government/teacher/grades', icon: CalendarCheck },
          { name: 'Attendence', href: '/government/teacher/attendance', icon: CalendarCheck },
        ],
      },
      {
        label: 'Exercises & Resources',
        items: [
          { name: 'Assignment', href: '/government/teacher/assignment', icon: BookOpen },
          { name: 'Resources', href: '/government/teacher/resources', icon: Users },
        ],
      },
      {
        label: 'COMMUNICATION',
        items: [
          { name: 'Messaging', href: '/government/teacher/messages', icon: MessageCircle },
          { name: 'Notifications', href: '/government/teacher/notifications', icon: Bell, badge: 'notifications' },
        ],
      },
    ],
  },
};

/** Legacy explicit titles for school-admin's nested pages that are not themselves sidebar
 * items (e.g. a sub-page reached only from within another page). Preserved verbatim from the
 * pre-unification `page-titles.ts` so existing behavior/tests don't change. */
const SCHOOL_ADMIN_PAGE_TITLES: Record<string, string> = {
  '/government/school-admin': 'Dashboard Overview',
  '/government/school-admin/students': 'Students',
  '/government/school-admin/students/inter-school-transfer': 'Student Transfers',
  '/government/school-admin/teachers-staff': 'Teachers & Staff',
  '/government/school-admin/parents-guardians': 'Parents & Guardians',
  '/government/school-admin/classes': 'Classes Management',
  '/government/school-admin/academic-years': 'Academic Years',
  '/government/school-admin/terms': 'Terms',
  '/government/school-admin/grade-levels': 'Grade Levels',
  '/government/school-admin/subjects': 'Subjects Management',
  '/government/school-admin/attendance': 'Attendance Management',
  '/government/school-admin/academic-grading': 'Academic & Grading',
  '/government/school-admin/academic-grading/windows': 'Grade Windows',
  '/government/school-admin/academic-grading/periods': 'Grading Periods',
  '/government/school-admin/infrastructure': 'Infrastructure',
  '/government/school-admin/timetable': 'General Schedule Management',
  '/government/school-admin/financial': 'Financial / Fees',
  '/government/school-admin/financial/record-payment': 'Record Payment',
  '/government/school-admin/financial/fee-rules': 'Fee Rules',
  '/government/school-admin/reports': 'Reports',
  '/government/school-admin/notifications': 'Notifications',
  '/government/school-admin/messages': 'Messages',
  '/government/school-admin/settings': 'School Settings',
  '/government/school-admin/school-profile': 'School Profile',
};

export const headerConfigs: Record<DesktopPortalRole, HeaderConfig> = {
  [SystemRole.INSTITUTION_ADMIN]: {
    basePath: '/government/school-admin',
    avatarRole: 'generic',
    breadcrumbRoot: 'School Admin',
    pageTitles: SCHOOL_ADMIN_PAGE_TITLES,
  },
  [SystemRole.COUNTY_ADMIN]: {
    basePath: '/government/county',
    avatarRole: 'generic',
    breadcrumbRoot: 'County',
  },
  [SystemRole.DEO]: {
    basePath: '/government/deo',
    avatarRole: 'deo',
    breadcrumbRoot: 'DEO',
  },
  [SystemRole.MINISTRY_ADMIN]: {
    basePath: '/government/ministry-portal',
    avatarRole: 'generic',
    breadcrumbRoot: 'Ministry',
  },
  [SystemRole.TEACHER]: {
    basePath: '/government/teacher',
    avatarRole: 'teacher',
    breadcrumbRoot: 'Teacher',
  },
};
```

- [ ] **Step 2: Delete the old config file**

```bash
git rm apps/desktop/renderer/components/shell/sidebar-config.ts
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: fails only on `Sidebar.tsx`/`Header.tsx`/`page-titles.ts`/layouts still importing the old
module or the old no-arg component signatures (fixed in Tasks 2-6) — no errors inside
`sidebarConfig.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/components/shell/sidebarConfig.ts
git commit -m "feat(desktop): add unified sidebarConfig for all 5 portal roles"
```

---

## Task 2: Generalize `Sidebar.tsx` to all 5 roles

**Files:**
- Modify: `apps/desktop/renderer/components/shell/Sidebar.tsx`
- Test: `apps/desktop/renderer/components/shell/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `sidebarConfigs` from `./sidebarConfig` (Task 1); `useNotificationStore`, `useViewModel`
  from existing hooks; `nemisBridge.logout()` from `@/services/nemis-bridge`; `DesktopPortalRole`
  from `@nemis-desktop/types`.
- Produces: `Sidebar({ role, institutionName? }: { role: DesktopPortalRole; institutionName?: string })`
  — consumed by Task 6 (layouts).

- [ ] **Step 1: Update the failing/changed tests first**

Replace `apps/desktop/renderer/components/shell/Sidebar.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/government/school-admin',
  useRouter: () => ({ replace: vi.fn() }),
}));

// useViewModel calls zustand's real `useStore`, which needs a full StoreApi
// (subscribe/getState/setState) — a bare `{ getState: () => ... }` object is not
// enough and throws "store.subscribe is not a function". Use a real vanilla store,
// same pattern as Header.test.tsx.
const notificationStore = createStore(() => ({ notifications: [] as unknown[] }));
vi.mock('../../lib/presentation/hooks', () => ({
  useNotificationStore: () => ({ store: notificationStore }),
}));
vi.mock('@/services/nemis-bridge', () => ({ nemisBridge: { logout: vi.fn().mockResolvedValue(undefined) } }));

import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('renders school-admin nav groups and items with correct hrefs', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} institutionName="Monrovia Central School" />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Students').closest('a')).toHaveAttribute('href', '/government/school-admin/students');
    expect(screen.getByText('Attendence Management')).toBeInTheDocument();
    expect(screen.getByText('School Settings')).toBeInTheDocument();
    expect(screen.getByText('Monrovia Central School')).toBeInTheDocument();
  });

  it('marks the active route', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} institutionName="X" />);
    expect(screen.getByText('Overview').closest('a')).toHaveClass('bg-slate-800');
  });

  it('renders a second role from its own config, with a static header title', () => {
    render(<Sidebar role={SystemRole.COUNTY_ADMIN} />);
    expect(screen.getByText('NEMIS')).toBeInTheDocument();
    expect(screen.getByText('CEO PANEL')).toBeInTheDocument();
    expect(screen.getByText('Districts').closest('a')).toHaveAttribute('href', '/government/county/districts');
    expect(screen.getByText('Audit Trail').closest('a')).toHaveAttribute('href', '/government/county/audit');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ../.. && npx vitest run apps/desktop/renderer/components/shell/Sidebar.test.tsx`
Expected: FAIL — `Sidebar` doesn't accept a `role` prop yet, `institutionName` header title / static
title branches don't exist yet.

- [ ] **Step 3: Rewrite `Sidebar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Map, LogOut } from 'lucide-react';
import type { DesktopPortalRole } from '@nemis-desktop/types';
import { sidebarConfigs, type SidebarBadge } from './sidebarConfig';
import { useNotificationStore } from '../../lib/presentation/hooks';
import { useViewModel } from '../../hooks/use-view-model';
import { nemisBridge } from '@/services/nemis-bridge';

export function Sidebar({
  role,
  institutionName,
}: {
  role: DesktopPortalRole;
  institutionName?: string;
}) {
  const config = sidebarConfigs[role];
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => pathname === href;

  const notifications = useNotificationStore();
  const unreadNotifications = useViewModel(notifications.store, (s) => s.notifications.length);
  const getBadgeCount = (badge?: SidebarBadge) => (badge === 'notifications' ? unreadNotifications : 0);

  const headerTitle = config.headerTitle ?? institutionName ?? 'NEMIS';

  const handleLogout = () => {
    void nemisBridge.logout().finally(() => router.replace('/'));
  };

  return (
    <div className="w-[230px] bg-primary h-full flex flex-col" aria-label="Primary">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 flex items-center justify-center">
            <Map className="w-6 h-6 text-white" />
          </div>
          <div className="w-[80%]">
            <h2 className="font-heading font-bold text-md text-white truncate">{headerTitle}</h2>
            {config.headerSubtitle && <p className="text-xs text-white/50">{config.headerSubtitle}</p>}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 sidebar-scroll" aria-label="Sidebar">
        <div className="space-y-1">
          {config.dashboardItem && (
            <Link
              href={config.dashboardItem.href}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                isActive(config.dashboardItem.href)
                  ? 'bg-slate-800 text-neutral-light'
                  : 'text-white/80 hover:bg-slate-900 hover:text-neutral-light'
              }`}
            >
              <config.dashboardItem.icon className="w-5 h-5" />
              <span className="font-semibold text-sm">{config.dashboardItem.name}</span>
            </Link>
          )}

          {config.navGroups.map((group) => (
            <div key={group.label}>
              <div className="border-t border-white/20 my-4" />
              <div className="px-4 mb-2">
                <span className="text-white/40 text-xs font-semibold tracking-wider">{group.label}</span>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  const badgeCount = getBadgeCount(item.badge);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        active ? 'bg-slate-800 text-slate-100' : 'text-white/80 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span className="font-semibold text-sm flex-1">{item.name}</span>
                      {badgeCount > 0 && (
                        <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
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
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-error hover:text-white transition-colors w-full"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Logout</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/desktop/renderer/components/shell/Sidebar.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/shell/Sidebar.tsx apps/desktop/renderer/components/shell/Sidebar.test.tsx
git commit -m "feat(desktop): generalize Sidebar to all 5 portal roles"
```

---

## Task 3: Generalize `page-titles.ts`

**Files:**
- Modify: `apps/desktop/renderer/components/shell/page-titles.ts`
- Test: `apps/desktop/renderer/components/shell/page-titles.test.ts`

**Interfaces:**
- Consumes: `sidebarConfigs`, `headerConfigs` from `./sidebarConfig` (Task 1).
- Produces: `resolvePageTitle(pathname: string, role: DesktopPortalRole): { title: string; segments: string[] }`
  — consumed by Task 4 (`Header.tsx`).

- [ ] **Step 1: Update the test**

Replace `page-titles.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';
import { resolvePageTitle } from './page-titles';

describe('resolvePageTitle', () => {
  it('resolves the school-admin dashboard root via the explicit override', () => {
    expect(resolvePageTitle('/government/school-admin', SystemRole.INSTITUTION_ADMIN)).toEqual({
      title: 'Dashboard Overview',
      segments: ['School Admin'],
    });
  });

  it('builds a breadcrumb trail for nested school-admin routes', () => {
    const r = resolvePageTitle('/government/school-admin/academic-grading/windows', SystemRole.INSTITUTION_ADMIN);
    expect(r.title).toBe('Grade Windows');
    expect(r.segments).toEqual(['School Admin', 'Academic Grading', 'Windows']);
  });

  it('resolves a county page title from the sidebar config, with no explicit override', () => {
    const r = resolvePageTitle('/government/county/students', SystemRole.COUNTY_ADMIN);
    expect(r.title).toBe('Students');
    expect(r.segments).toEqual(['County', 'Students']);
  });

  it('falls back to title-casing the last path segment for an unmapped nested path', () => {
    // Not itself a sidebar item and not in any explicit override — exercises the
    // third resolution branch (neither of the previous two tests do: "students" and
    // "fee-rules" are both real top-level sidebar items, matched by the second branch).
    const r = resolvePageTitle('/government/county/districts/detail', SystemRole.COUNTY_ADMIN);
    expect(r.title).toBe('Detail');
    expect(r.segments).toEqual(['County', 'Districts', 'Detail']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/desktop/renderer/components/shell/page-titles.test.ts`
Expected: FAIL — `resolvePageTitle` doesn't accept a second `role` argument yet.

- [ ] **Step 3: Rewrite `page-titles.ts`**

```ts
import type { DesktopPortalRole } from '@nemis-desktop/types';
import { headerConfigs, sidebarConfigs } from './sidebarConfig';

const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function sidebarItemName(pathname: string, role: DesktopPortalRole): string | undefined {
  const config = sidebarConfigs[role];
  if (config.dashboardItem?.href === pathname) return config.dashboardItem.name;
  for (const group of config.navGroups) {
    const match = group.items.find((item) => item.href === pathname);
    if (match) return match.name;
  }
  return undefined;
}

export function resolvePageTitle(
  pathname: string,
  role: DesktopPortalRole,
): { title: string; segments: string[] } {
  const header = headerConfigs[role];
  const lastSegment = pathname.split('/').filter(Boolean).at(-1) ?? '';
  const title =
    header.pageTitles?.[pathname] ??
    sidebarItemName(pathname, role) ??
    titleCase(lastSegment);
  const segments = pathname
    .replace(header.basePath, '')
    .split('/')
    .filter(Boolean)
    .map(titleCase);
  return { title, segments: [header.breadcrumbRoot, ...segments] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/desktop/renderer/components/shell/page-titles.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/shell/page-titles.ts apps/desktop/renderer/components/shell/page-titles.test.ts
git commit -m "feat(desktop): generalize resolvePageTitle to all 5 portal roles"
```

---

## Task 4: Generalize `Header.tsx`

**Files:**
- Modify: `apps/desktop/renderer/components/shell/Header.tsx`
- Test: `apps/desktop/renderer/components/shell/Header.test.tsx`

**Interfaces:**
- Consumes: `resolvePageTitle(pathname, role)` (Task 3); `headerConfigs` (Task 1); existing
  `useCurrentUserViewModel`, `useNotificationStore`, `useViewModel` hooks; `Avatar`, `Breadcrumbs`,
  `Dropdown`, `DropdownItem` from `@nemis-desktop/ui`.
- Produces: `Header({ role }: { role: DesktopPortalRole })` — consumed by Task 6 (layouts).

- [ ] **Step 1: Update the test**

Replace `Header.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/government/school-admin/students',
  useRouter: () => ({ replace: vi.fn() }),
}));

const notificationStore = createStore(() => ({ notifications: [{ id: 'n1', kind: 'info', message: 'x', autoDismissMs: null, createdAt: 0 }] }));
const currentUserStore = createStore(() => ({ user: { status: 'success', data: { fullName: 'Joseph Boakai', roleLabels: ['Institution admin'] } } }));

vi.mock('../../lib/presentation/hooks', () => ({
  useCurrentUserViewModel: () => ({ store: currentUserStore, loadUser: vi.fn() }),
  useNotificationStore: () => ({ store: notificationStore }),
}));

import { Header } from './Header';

describe('Header', () => {
  it('shows the resolved title, breadcrumb, user, and notification count', () => {
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText(/Home \/ School Admin \/ Students/)).toBeInTheDocument();
    expect(screen.getByText('Joseph Boakai')).toBeInTheDocument();
    expect(screen.getByLabelText(/1 unread notification/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/components/shell/Header.test.tsx`
Expected: FAIL — `Header` doesn't accept props yet; `resolvePageTitle` call site inside it is missing a role argument.

- [ ] **Step 3: Update `Header.tsx`**

Only the signature and the `resolvePageTitle` call change; everything else (search box, bell,
dropdown, avatar) stays exactly as-is. Apply this diff:

```tsx
// before
import { resolvePageTitle } from './page-titles';
...
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { title, segments } = resolvePageTitle(pathname);
```

```tsx
// after
import type { DesktopPortalRole } from '@nemis-desktop/types';
import { resolvePageTitle } from './page-titles';
...
export function Header({ role }: { role: DesktopPortalRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const { title, segments } = resolvePageTitle(pathname, role);
```

Also update the avatar's `role` prop, which today is hardcoded `role="generic"` — read it from
`headerConfigs[role].avatarRole` instead:

```tsx
// before
import { Avatar, Breadcrumbs, Dropdown, DropdownItem } from '@nemis-desktop/ui';
...
<Avatar firstName={fullName.split(' ')[0]} lastName={fullName.split(' ')[1]} role="generic" size="md" className="border border-gray-200" alt={fullName} />
```

```tsx
// after
import { Avatar, Breadcrumbs, Dropdown, DropdownItem } from '@nemis-desktop/ui';
import { headerConfigs } from './sidebarConfig';
...
<Avatar firstName={fullName.split(' ')[0]} lastName={fullName.split(' ')[1]} role={headerConfigs[role].avatarRole} size="md" className="border border-gray-200" alt={fullName} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/desktop/renderer/components/shell/Header.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/shell/Header.tsx apps/desktop/renderer/components/shell/Header.test.tsx
git commit -m "feat(desktop): generalize Header to all 5 portal roles"
```

---

## Task 5: Rewire the school-admin layout

**Files:**
- Modify: `apps/desktop/renderer/app/government/school-admin/layout.tsx`

**Interfaces:**
- Consumes: `Sidebar({ role, institutionName })` (Task 2), `Header({ role })` (Task 4).

- [ ] **Step 1: Update the layout**

```tsx
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
        <Sidebar role={SystemRole.INSTITUTION_ADMIN} institutionName={institutionName} />
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
```

(This is a one-line-per-call change from what's there today — just threading `role` through.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: no errors from this file.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/app/government/school-admin/layout.tsx
git commit -m "feat(desktop): thread role prop through school-admin layout"
```

---

## Task 6: Replace `RolePortalShell` in the 4 other layouts; delete it

**Files:**
- Modify: `apps/desktop/renderer/app/government/county/layout.tsx`
- Modify: `apps/desktop/renderer/app/government/deo/layout.tsx`
- Modify: `apps/desktop/renderer/app/government/ministry-portal/layout.tsx`
- Modify: `apps/desktop/renderer/app/government/teacher/layout.tsx`
- Delete: `apps/desktop/renderer/components/shell/RolePortalShell.tsx`

**Interfaces:**
- Consumes: `Sidebar`, `Header`, `StatusBar`, `RouteGuard`, `ToastHost` (all existing/Task 2/Task 4).

- [ ] **Step 1: Rewrite `county/layout.tsx`**

```tsx
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
    <RouteGuard requiredRole={SystemRole.COUNTY_ADMIN}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar role={SystemRole.COUNTY_ADMIN} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header role={SystemRole.COUNTY_ADMIN} />
          <main className="flex-1 overflow-y-auto">{children}</main>
          <StatusBar />
        </div>
      </div>
      <ToastHost />
    </RouteGuard>
  );
}
```

- [ ] **Step 2: Rewrite `deo/layout.tsx`** (identical shape, role swapped)

```tsx
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
    <RouteGuard requiredRole={SystemRole.DEO}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar role={SystemRole.DEO} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header role={SystemRole.DEO} />
          <main className="flex-1 overflow-y-auto">{children}</main>
          <StatusBar />
        </div>
      </div>
      <ToastHost />
    </RouteGuard>
  );
}
```

- [ ] **Step 3: Rewrite `ministry-portal/layout.tsx`**

```tsx
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
    <RouteGuard requiredRole={SystemRole.MINISTRY_ADMIN}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar role={SystemRole.MINISTRY_ADMIN} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header role={SystemRole.MINISTRY_ADMIN} />
          <main className="flex-1 overflow-y-auto">{children}</main>
          <StatusBar />
        </div>
      </div>
      <ToastHost />
    </RouteGuard>
  );
}
```

- [ ] **Step 4: Rewrite `teacher/layout.tsx`**

```tsx
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
```

- [ ] **Step 5: Delete `RolePortalShell.tsx`**

```bash
git rm apps/desktop/renderer/components/shell/RolePortalShell.tsx
```

- [ ] **Step 6: Typecheck and run the full shell test suite**

Run: `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: no errors (confirms nothing else imports `RolePortalShell`).

Run: `cd ../.. && npx vitest run apps/desktop/renderer/components/shell`
Expected: all pass.

- [ ] **Step 7: Manual smoke test**

Run the app (`pnpm dev` from `desktop-client-nemis`, or use the project's `run` skill) and, for
each of county/deo/ministry-portal/teacher, confirm: the sidebar renders with the correct groups,
the header bar now appears (it didn't before), and clicking the existing nav items (Schools,
Reports, Alerts, Transfers, etc.) still navigates correctly.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/renderer/app/government/county/layout.tsx \
        apps/desktop/renderer/app/government/deo/layout.tsx \
        apps/desktop/renderer/app/government/ministry-portal/layout.tsx \
        apps/desktop/renderer/app/government/teacher/layout.tsx
git commit -m "feat(desktop): replace RolePortalShell with unified Sidebar/Header in all layouts"
```

---

## Task 7: County — 11 new route pages

**Files:** all new, under `apps/desktop/renderer/app/government/county/`

- [ ] **Step 1: Create the 4 ComingSoon stubs**

`districts/page.tsx`:
```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';
export default function Page() {
  return <ComingSoon title="Districts" />;
}
```

`users/page.tsx`:
```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';
export default function Page() {
  return <ComingSoon title="Administrative Users" />;
}
```

`audit/page.tsx`:
```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';
export default function Page() {
  return <ComingSoon title="Audit Trail" />;
}
```

`settings/page.tsx`:
```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';
export default function Page() {
  return <ComingSoon title="County Settings" />;
}
```

- [ ] **Step 2: Create the 7 real collection-backed pages**

`students/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County students" description="Students enrolled in institutions within this county." sections={[
    { collection: 'students', label: 'Students', columns: ['institutionId', 'firstName', 'lastName', 'admissionNumber', 'gradeLevel'] },
  ]} />;
}
```

`teachers/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County teachers" description="Teaching and administrative staff within this county." sections={[
    { collection: 'staff', label: 'Staff', columns: ['institutionId', 'firstName', 'lastName', 'position', 'isActive'] },
  ]} />;
}
```

`parents/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County parents/guardians" description="Guardians on record for students within this county." sections={[
    { collection: 'guardians', label: 'Guardians', columns: ['firstName', 'lastName', 'relationship', 'phoneNumber', 'email', 'isEmergencyContact'] },
  ]} />;
}
```

`finance/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County finance overview" description="Fee obligations, payments, and rules across this county's institutions." sections={[
    { collection: 'fee_obligations', label: 'Obligations', columns: ['studentId', 'requiredAmount', 'totalPaid', 'status', 'dueDate'] },
    { collection: 'fee_payments', label: 'Payments', columns: ['receiptNumber', 'studentId', 'amount', 'method', 'paidAt', 'isReversed'] },
    { collection: 'fee_rules', label: 'Fee rules', columns: ['name', 'category', 'amount', 'currency', 'isMandatory', 'isActive'] },
  ]} />;
}
```

`finance/fee-rules/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County fee rules" description="Fee rules defined by institutions within this county." sections={[
    { collection: 'fee_rules', label: 'Fee rules', columns: ['name', 'category', 'amount', 'currency', 'isMandatory', 'isActive'] },
  ]} />;
}
```

`messages/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County messages" description="Message threads visible to this county workspace." sections={[
    { collection: 'messages', label: 'Messages', columns: ['conversationId', 'senderRole', 'content', 'isRead', 'createdAt'] },
  ]} />;
}
```

`notifications/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County notifications" description="Notifications addressed to this county workspace." sections={[
    { collection: 'user_notifications', label: 'Notifications', columns: ['type', 'title', 'message', 'isRead', 'createdAt'] },
  ]} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: no errors (confirms every `collection` value is a valid `SchoolAdminCollection`).

- [ ] **Step 4: Manual smoke test**

Run the app, sign in (or use the dev fake) as a county admin, and click every item in the County
sidebar. Each should render without error: the 4 ComingSoon pages show the placeholder banner,
the 7 real pages show a (possibly empty) table with the right column headers.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/app/government/county
git commit -m "feat(desktop): add county nav pages to match richer web navigation"
```

---

## Task 8: DEO — 7 new route pages

**Files:** all new, under `apps/desktop/renderer/app/government/deo/`

- [ ] **Step 1: Create the 2 ComingSoon stubs**

`school-admins/page.tsx`:
```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';
export default function Page() {
  return <ComingSoon title="School Admins" />;
}
```

`settings/page.tsx`:
```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';
export default function Page() {
  return <ComingSoon title="DEO Settings" />;
}
```

- [ ] **Step 2: Create the 5 real collection-backed pages**

`teachers/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="District teachers" description="Teaching and administrative staff within this district." sections={[
    { collection: 'staff', label: 'Staff', columns: ['institutionId', 'firstName', 'lastName', 'position', 'isActive'] },
  ]} />;
}
```

`students/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="District students" description="Students enrolled in institutions within this district." sections={[
    { collection: 'students', label: 'Students', columns: ['institutionId', 'firstName', 'lastName', 'admissionNumber', 'gradeLevel'] },
  ]} />;
}
```

`finance/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="District finance" description="Fee obligations, payments, and rules across this district's institutions." sections={[
    { collection: 'fee_obligations', label: 'Obligations', columns: ['studentId', 'requiredAmount', 'totalPaid', 'status', 'dueDate'] },
    { collection: 'fee_payments', label: 'Payments', columns: ['receiptNumber', 'studentId', 'amount', 'method', 'paidAt', 'isReversed'] },
    { collection: 'fee_rules', label: 'Fee rules', columns: ['name', 'category', 'amount', 'currency', 'isMandatory', 'isActive'] },
  ]} />;
}
```

`messages/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="District messages" description="Message threads visible to this district workspace." sections={[
    { collection: 'messages', label: 'Messages', columns: ['conversationId', 'senderRole', 'content', 'isRead', 'createdAt'] },
  ]} />;
}
```

`notifications/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="District notifications" description="Notifications addressed to this district workspace." sections={[
    { collection: 'user_notifications', label: 'Notifications', columns: ['type', 'title', 'message', 'isRead', 'createdAt'] },
  ]} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Same as Task 7, but for the DEO portal and its sidebar items.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/app/government/deo
git commit -m "feat(desktop): add deo nav pages to match richer web navigation"
```

---

## Task 9: Ministry Portal — 10 new route pages

**Files:** all new, under `apps/desktop/renderer/app/government/ministry-portal/`

- [ ] **Step 1: Create the 3 ComingSoon stubs**

`users/page.tsx`:
```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';
export default function Page() {
  return <ComingSoon title="Administrative Users" />;
}
```

`audit/page.tsx`:
```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';
export default function Page() {
  return <ComingSoon title="Audit Trail" />;
}
```

`settings/page.tsx`:
```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';
export default function Page() {
  return <ComingSoon title="Ministry Settings" />;
}
```

- [ ] **Step 2: Create the 7 real collection-backed pages**

`students/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National students" description="Students enrolled across the authorized national dataset." sections={[
    { collection: 'students', label: 'Students', columns: ['institutionId', 'firstName', 'lastName', 'admissionNumber', 'gradeLevel'] },
  ]} />;
}
```

`teachers/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National teachers" description="Teaching and administrative staff across the authorized national dataset." sections={[
    { collection: 'staff', label: 'Staff', columns: ['institutionId', 'firstName', 'lastName', 'position', 'isActive'] },
  ]} />;
}
```

`parents/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National parents/guardians" description="Guardians on record across the authorized national dataset." sections={[
    { collection: 'guardians', label: 'Guardians', columns: ['firstName', 'lastName', 'relationship', 'phoneNumber', 'email', 'isEmergencyContact'] },
  ]} />;
}
```

`finance/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National finance overview" description="Fee obligations, payments, and rules across the authorized national dataset." sections={[
    { collection: 'fee_obligations', label: 'Obligations', columns: ['studentId', 'requiredAmount', 'totalPaid', 'status', 'dueDate'] },
    { collection: 'fee_payments', label: 'Payments', columns: ['receiptNumber', 'studentId', 'amount', 'method', 'paidAt', 'isReversed'] },
    { collection: 'fee_rules', label: 'Fee rules', columns: ['name', 'category', 'amount', 'currency', 'isMandatory', 'isActive'] },
  ]} />;
}
```

`finance/fee-rules/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National fee rules" description="Fee rules defined across the authorized national dataset." sections={[
    { collection: 'fee_rules', label: 'Fee rules', columns: ['name', 'category', 'amount', 'currency', 'isMandatory', 'isActive'] },
  ]} />;
}
```

`messages/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National messages" description="Message threads visible to the ministry workspace." sections={[
    { collection: 'messages', label: 'Messages', columns: ['conversationId', 'senderRole', 'content', 'isRead', 'createdAt'] },
  ]} />;
}
```

`notifications/page.tsx`:
```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National notifications" description="Notifications addressed to the ministry workspace." sections={[
    { collection: 'user_notifications', label: 'Notifications', columns: ['type', 'title', 'message', 'isRead', 'createdAt'] },
  ]} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Same as Task 7, but for the Ministry portal and its sidebar items.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/app/government/ministry-portal
git commit -m "feat(desktop): add ministry-portal nav pages to match richer web navigation"
```

---

## Task 10: Teacher — "My School" page

**Files:** new: `apps/desktop/renderer/app/government/teacher/my-school/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="My school" description="Your institution's profile, as included in this device's offline snapshot." sections={[
    { collection: 'institutions', label: 'School', columns: ['code', 'name', 'type', 'ownership', 'districtId', 'approvalStatus'] },
  ]} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Run the app as a teacher, click "My School" in the sidebar, confirm the institution row renders
(or the empty state, if the workspace hasn't synced yet).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/app/government/teacher/my-school
git commit -m "feat(desktop): add teacher My School page"
```

---

## Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 2: Full lint**

Run: `cd ../.. && npx eslint apps/desktop/renderer --no-warn-ignored`
Expected: no errors.

- [ ] **Step 3: Full renderer test suite**

Run: `npx vitest run apps/desktop/renderer`
Expected: all pass, including the updated `Sidebar`, `Header`, and `page-titles` suites.

- [ ] **Step 4: Manual click-through of all 5 portals**

Run the app (`pnpm dev` or the `run` skill). For each of school-admin, county, deo,
ministry-portal, teacher: sign in as that role (or switch the dev fake user), click every sidebar
item once, and confirm:
- the header bar shows the correct title/breadcrumb for each page,
- the active nav item is highlighted,
- logout actually signs out and returns to the login screen (this was silently broken for
  school-admin before this change).

- [ ] **Step 5: Update the design spec's status line**

In `docs/superpowers/specs/2026-07-26-unified-portal-sidebar-design.md`, no change needed — it's
already marked `Status: approved (pending plan)`; leave as historical record (the plan doc is the
living checklist from here).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore(desktop): verify unified portal sidebar rollout" --allow-empty
```

(Use `--allow-empty` only if Step 4-5 produced no file changes; if any smoke-test fixes were
needed, commit those with a descriptive message instead of this placeholder.)
