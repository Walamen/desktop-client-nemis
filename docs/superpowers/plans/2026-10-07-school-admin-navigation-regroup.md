# School Admin Navigation Regroup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup the School Admin sidebar so that yearly setup (grading system → academic years → terms → assessment periods → subjects) is a visible, ordered group. Groups collapse, sub-pages highlight their parent, and every "missing prerequisite" message points to where it can be fixed.

**Architecture:** This is a renderer-only change. A new pure module (`active-nav.ts`) decides which sidebar item is active, using longest-prefix matching. A small hook (`use-collapsed-groups.ts`) stores the collapsed groups in `localStorage`. The School Admin entry in `sidebarConfig.ts` is rewritten and opts in to collapsing with `collapsibleGroups: true`. The grading-periods drawer becomes a page panel. The dead-end messages become `next/link` links, or plain-text menu paths where a link would lose typed data.

**Tech Stack:** Next.js (static export, `trailingSlash: true`), React, TypeScript strict, Tailwind, `lucide-react`, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-07-school-admin-navigation-regroup-design.md`

## Global Constraints

- The working directory for every command is the repo root `desktop-client-nemis/`, unless a step says otherwise.
- Branch: `feature/school-admin-nav-regroup`. **Never stage** `apps/desktop/package.json` or `pnpm-lock.yaml`. They hold unrelated, pre-existing edits. Always `git add` explicit paths.
- Renderer only. Do not touch `packages/*`, `apps/desktop/electron/*`, IPC or the database.
- The COUNTY_ADMIN, DEO, MINISTRY_ADMIN and TEACHER entries in `sidebarConfigs` stay byte-for-byte unchanged.
- School-admin sidebar icons come from `lucide-react` only.
- Every href is an absolute `/government/school-admin/...` path.
- Link style: `text-blue-700 hover:underline`. Inside coloured notice boxes, use `font-semibold underline` so the link inherits the box colour.
- Group labels are UPPERCASE. No "Management" suffix in sidebar names.
- `localStorage` key: `nemis.sidebar.collapsed.<role>`, holding a JSON array of collapsed group labels.
- Group label colour: `text-white/60`. Item padding: `py-2.5`. Group separator: `my-3`.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Test commands** (run from the repo root):
- Single file: `pnpm vitest run --project renderer <path>`
- Renderer suite: `pnpm vitest run --project renderer`
- Typecheck: `pnpm --filter @nemis-desktop/app typecheck`
- Lint: `pnpm lint`

## Review Focus

1. **Trailing slashes in the packaged app.** The static export serves `/government/school-admin/students/`, so highlighting must still find Students. *(Task 1 test.)*
2. **The role's home page as a group item.** DEO and Teacher put Dashboard inside a group. An unmapped page such as `/government/deo/sync-conflicts` must not light up Dashboard through prefix matching. *(Task 1 test.)*
3. **Corrupt or foreign `localStorage` content** (`{}`, `"x"`, invalid JSON, or a throwing accessor) must give "all groups open" and must not crash. *(Task 3 test.)*
4. **No current academic year at all.** The Assessment Periods page must say the year is missing and link to Academic Years. Today it would wrongly claim "no terms". *(Task 4 test.)*
5. **A stale `?yearId` link** to a year that no longer exists on this device must fall back to the current year, not show an empty selector. *(Task 5 test.)*

---

### Task 1: Active-item matcher

**Files:**
- Create: `apps/desktop/renderer/components/shell/active-nav.ts`
- Create: `apps/desktop/renderer/components/shell/active-nav.test.ts`
- Modify: `apps/desktop/renderer/components/shell/sidebarConfig.ts` (types only, lines 20-39)

**Interfaces:**
- Produces:
  - `normalizePath(path: string): string`
  - `resolveActiveHref(pathname: string, config: SidebarConfig, basePath: string): string | null`
  - `SidebarNavItem.alsoActiveOn?: readonly string[]`
  - `SidebarConfig.collapsibleGroups?: boolean`

- [ ] **Step 1: Add the optional fields to the config types**

In `sidebarConfig.ts`, replace the `SidebarNavItem` and `SidebarConfig` interfaces with:

```ts
export interface SidebarNavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: SidebarBadge;
  /** Extra paths (exact or as a prefix) on which this item also counts as active. */
  alsoActiveOn?: readonly string[];
}
```

```ts
export interface SidebarConfig {
  /** Static header title. When omitted, the caller-supplied institutionName is shown. */
  headerTitle?: string;
  headerSubtitle?: string;
  /** Optional ungrouped item rendered above the groups. */
  dashboardItem?: SidebarNavItem;
  navGroups: readonly SidebarNavGroup[];
  /** Group headers become collapse toggles, remembered per device. Default false. */
  collapsibleGroups?: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

Create `active-nav.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SidebarConfig } from './sidebarConfig';
import { normalizePath, resolveActiveHref } from './active-nav';

const Icon = () => null;
const BASE = '/government/school-admin';
const config: SidebarConfig = {
  dashboardItem: { name: 'Overview', href: BASE, icon: Icon },
  navGroups: [
    {
      label: 'STUDENTS',
      items: [
        { name: 'Students', href: `${BASE}/students`, icon: Icon },
        { name: 'Student Transfers', href: `${BASE}/students/inter-school-transfer`, icon: Icon },
      ],
    },
    {
      label: 'SCHOOL',
      items: [{ name: 'Settings', href: `${BASE}/settings`, icon: Icon, alsoActiveOn: [`${BASE}/school-profile`] }],
    },
  ],
};

// DEO/Teacher shape: the home page is a group item, not a dashboardItem.
const DEO = '/government/deo';
const deoConfig: SidebarConfig = {
  navGroups: [
    { label: 'OVERVIEW', items: [{ name: 'Dashboard', href: DEO, icon: Icon }] },
    { label: 'MAIN', items: [{ name: 'Schools', href: `${DEO}/schools`, icon: Icon }] },
  ],
};

describe('normalizePath', () => {
  it('strips one trailing slash but keeps the root', () => {
    expect(normalizePath('/a/b/')).toBe('/a/b');
    expect(normalizePath('/a/b')).toBe('/a/b');
    expect(normalizePath('/')).toBe('/');
  });
});

describe('resolveActiveHref', () => {
  it('matches an item exactly', () => {
    expect(resolveActiveHref(`${BASE}/students`, config, BASE)).toBe(`${BASE}/students`);
  });

  it('highlights the parent item on a sub-page', () => {
    expect(resolveActiveHref(`${BASE}/students/profile`, config, BASE)).toBe(`${BASE}/students`);
  });

  it('only matches on a path-segment boundary', () => {
    expect(resolveActiveHref(`${BASE}/students-archive`, config, BASE)).toBeNull();
  });

  it('prefers the longest matching item', () => {
    expect(resolveActiveHref(`${BASE}/students/inter-school-transfer`, config, BASE)).toBe(
      `${BASE}/students/inter-school-transfer`,
    );
  });

  it('matches the dashboard item only exactly', () => {
    expect(resolveActiveHref(BASE, config, BASE)).toBe(BASE);
    expect(resolveActiveHref(`${BASE}/sync-conflicts`, config, BASE)).toBeNull();
  });

  it('honours alsoActiveOn', () => {
    expect(resolveActiveHref(`${BASE}/school-profile`, config, BASE)).toBe(`${BASE}/settings`);
  });

  it('ignores a trailing slash on the pathname (static export)', () => {
    expect(resolveActiveHref(`${BASE}/students/`, config, BASE)).toBe(`${BASE}/students`);
    expect(resolveActiveHref(`${BASE}/`, config, BASE)).toBe(BASE);
  });

  it('never prefix-matches a group item that is the role home page', () => {
    expect(resolveActiveHref(`${DEO}/sync-conflicts`, deoConfig, DEO)).toBeNull();
    expect(resolveActiveHref(DEO, deoConfig, DEO)).toBe(DEO);
    expect(resolveActiveHref(`${DEO}/schools/detail`, deoConfig, DEO)).toBe(`${DEO}/schools`);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/shell/active-nav.test.ts`
Expected: FAIL, "Failed to resolve import ./active-nav".

- [ ] **Step 4: Implement the matcher**

Create `active-nav.ts`:

```ts
import type { SidebarConfig } from './sidebarConfig';

/** Strips one trailing slash (the static export uses trailingSlash: true), keeping '/' itself. */
export function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Which sidebar item's href is active for `pathname`. Items match exactly or
 * as a path-segment prefix (so sub-pages highlight their parent). The longest
 * match wins. The dashboard item, and any item whose href is the role's home
 * page (`basePath`), match exactly only, since they would otherwise prefix
 * every page in the portal. */
export function resolveActiveHref(pathname: string, config: SidebarConfig, basePath: string): string | null {
  const path = normalizePath(pathname);
  const home = normalizePath(basePath);
  if (config.dashboardItem && normalizePath(config.dashboardItem.href) === path) return config.dashboardItem.href;

  let best: { href: string; length: number } | null = null;
  for (const group of config.navGroups) {
    for (const item of group.items) {
      for (const raw of [item.href, ...(item.alsoActiveOn ?? [])]) {
        const candidate = normalizePath(raw);
        const isMatch = candidate === home
          ? path === candidate
          : path === candidate || path.startsWith(`${candidate}/`);
        if (isMatch && (best === null || candidate.length > best.length)) {
          best = { href: item.href, length: candidate.length };
        }
      }
    }
  }
  return best?.href ?? null;
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/shell/active-nav.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/shell/active-nav.ts apps/desktop/renderer/components/shell/active-nav.test.ts apps/desktop/renderer/components/shell/sidebarConfig.ts
git commit -m "feat(shell): longest-prefix active sidebar item matcher

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: New School Admin menu, highlighting and visual fixes

**Files:**
- Modify: `apps/desktop/renderer/components/shell/sidebarConfig.ts` (imports at lines 1-14, INSTITUTION_ADMIN block at lines 52-114, `SCHOOL_ADMIN_PAGE_TITLES` at lines 297-306)
- Modify: `apps/desktop/renderer/components/shell/Sidebar.tsx`
- Modify: `apps/desktop/renderer/components/shell/page-titles.ts`
- Test: `apps/desktop/renderer/components/shell/Sidebar.test.tsx`, `apps/desktop/renderer/components/shell/page-titles.test.ts`

**Interfaces:**
- Consumes: `resolveActiveHref`, `normalizePath` (Task 1); `headerConfigs[role].basePath` (already exists).
- Produces: the INSTITUTION_ADMIN config with `collapsibleGroups: true` and the group labels `ACADEMIC SETUP`, `STUDENTS`, `STAFF & FAMILIES`, `TEACHING`, `FINANCE`, `REPORTS & MESSAGES`, `SCHOOL`. Task 3 relies on these labels.

- [ ] **Step 1: Update the existing tests for the new names, and add the new ones**

In `Sidebar.test.tsx`:

(a) Change the `next/navigation` mock so tests can set the path:

```ts
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/government/school-admin'),
  useRouter: () => ({ replace: vi.fn() }),
}));
```

Add `import { usePathname } from 'next/navigation';` next to the other imports below the mocks. In the existing `beforeEach`, add as the first line: `vi.mocked(usePathname).mockReturnValue('/government/school-admin');`

(b) Replace the first test (`'renders school-admin nav groups and items with correct hrefs'`) with:

```ts
  it('renders the school-admin groups in order, with correct hrefs', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    const labels = ['ACADEMIC SETUP', 'STUDENTS', 'STAFF & FAMILIES', 'TEACHING', 'FINANCE', 'REPORTS & MESSAGES', 'SCHOOL'];
    const rendered = labels.map((l) => screen.getByText(l));
    for (let i = 1; i < rendered.length; i += 1) {
      expect(rendered[i - 1]!.compareDocumentPosition(rendered[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Overview')).toBe('/government/school-admin');
    expect(href('Grading System')).toBe('/government/school-admin/academic-grading');
    expect(href('Academic Years')).toBe('/government/school-admin/academic-years');
    expect(href('Terms')).toBe('/government/school-admin/terms');
    expect(href('Assessment Periods')).toBe('/government/school-admin/academic-grading/periods');
    expect(href('Attendance')).toBe('/government/school-admin/attendance');
    expect(href('Grade Entry & Results')).toBe('/government/school-admin/academic-grading/windows');
    expect(href('Grade Levels')).toBe('/government/school-admin/grade-levels');
    expect(href('Infrastructure & Alerts')).toBe('/government/school-admin/infrastructure');
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });
```

(c) Replace the `'shows the End-of-Year Outcomes entry for a school admin only'` test: change its title to `'shows the Promotion & Outcomes entry for a school admin only'`, and replace both `'End-of-Year Outcomes'` strings in its body with `'Promotion & Outcomes'`.

(d) Add these tests inside the `describe`:

```ts
  it('marks the active item with aria-current', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Terms' })).not.toHaveAttribute('aria-current');
  });

  it('highlights the parent item on a sub-page', () => {
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/students/profile');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('keeps Settings highlighted on the school profile page', () => {
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/school-profile/');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });
```

In `page-titles.test.ts`, change `expect(r.title).toBe('Grade Windows');` to `expect(r.title).toBe('Grade Entry & Results');`. Then add:

```ts
  it('titles attendance from the sidebar name, with no override', () => {
    expect(resolvePageTitle('/government/school-admin/attendance', SystemRole.INSTITUTION_ADMIN).title).toBe('Attendance');
  });

  it('keeps exact-match titles on sub-pages (no prefix inheritance)', () => {
    expect(resolvePageTitle('/government/school-admin/students/profile', SystemRole.INSTITUTION_ADMIN).title).toBe('Profile');
  });

  it('ignores a trailing slash when resolving a title', () => {
    expect(resolvePageTitle('/government/school-admin/terms/', SystemRole.INSTITUTION_ADMIN).title).toBe('Terms');
  });
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/shell/Sidebar.test.tsx apps/desktop/renderer/components/shell/page-titles.test.ts`
Expected: FAIL, with no link named "Grading System", no `aria-current`, and title "Grade Windows" instead of "Grade Entry & Results".

- [ ] **Step 3: Rewrite the imports and the INSTITUTION_ADMIN config**

In `sidebarConfig.ts`, replace lines 1-14 (the `lucide-react` import and the seven `react-icons` imports) with:

```ts
import {
  LayoutDashboard, Map, School, CheckCircle, BookOpen, CalendarCheck, Users,
  Building2, CreditCard, Bell, MessageCircle,
  MessageSquare, DollarSign, ClipboardCheck, ShieldCheck, Settings, UserCog,
  GraduationCap, ArrowRightLeft, UserCircle2, AlertTriangle, FileBarChart,
  SlidersHorizontal, CalendarRange, CalendarDays, CalendarClock, Award, Clock, Receipt, Layers,
} from 'lucide-react';
import type { ComponentType } from 'react';
```

Replace the whole `[SystemRole.INSTITUTION_ADMIN]: { ... },` entry (lines 52-114) with:

```ts
  [SystemRole.INSTITUTION_ADMIN]: {
    collapsibleGroups: true,
    dashboardItem: {
      name: 'Overview',
      href: '/government/school-admin',
      icon: LayoutDashboard,
    },
    navGroups: [
      {
        // Dependency order, not frequency: Terms reads termsPerYear from the
        // grading config, and Assessment Periods auto-setup reads periodsPerTerm.
        label: 'ACADEMIC SETUP',
        items: [
          { name: 'Grading System', href: '/government/school-admin/academic-grading', icon: SlidersHorizontal },
          { name: 'Academic Years', href: '/government/school-admin/academic-years', icon: CalendarRange },
          { name: 'Terms', href: '/government/school-admin/terms', icon: CalendarDays },
          { name: 'Assessment Periods', href: '/government/school-admin/academic-grading/periods', icon: CalendarClock },
          { name: 'Subjects', href: '/government/school-admin/subjects', icon: BookOpen },
        ],
      },
      {
        label: 'STUDENTS',
        items: [
          { name: 'Students', href: '/government/school-admin/students', icon: GraduationCap },
          {
            name: 'Student Transfers',
            href: '/government/school-admin/students/inter-school-transfer',
            icon: ArrowRightLeft,
            badge: 'transfers',
          },
          { name: 'Promotion & Outcomes', href: '/government/school-admin/students/promote', icon: Award },
        ],
      },
      {
        label: 'STAFF & FAMILIES',
        items: [
          { name: 'Teachers & Staff', href: '/government/school-admin/teachers-staff', icon: UserCog },
          { name: 'Parents & Guardians', href: '/government/school-admin/parents-guardians', icon: Users },
        ],
      },
      {
        label: 'TEACHING',
        items: [
          { name: 'Classes', href: '/government/school-admin/classes', icon: School },
          { name: 'Timetable', href: '/government/school-admin/timetable', icon: Clock },
          { name: 'Attendance', href: '/government/school-admin/attendance', icon: CalendarCheck },
          { name: 'Grade Entry & Results', href: '/government/school-admin/academic-grading/windows', icon: ClipboardCheck },
        ],
      },
      {
        label: 'FINANCE',
        items: [
          { name: 'Record Payment', href: '/government/school-admin/financial/record-payment', icon: CreditCard },
          { name: 'Fees & Billing', href: '/government/school-admin/financial', icon: Receipt },
        ],
      },
      {
        label: 'REPORTS & MESSAGES',
        items: [
          { name: 'Reports', href: '/government/school-admin/reports', icon: FileBarChart },
          { name: 'Notifications', href: '/government/school-admin/notifications', icon: Bell },
          { name: 'Messages', href: '/government/school-admin/messages', icon: MessageCircle },
        ],
      },
      {
        label: 'SCHOOL',
        items: [
          {
            name: 'Settings',
            href: '/government/school-admin/settings',
            icon: Settings,
            alsoActiveOn: ['/government/school-admin/school-profile'],
          },
          { name: 'Grade Levels', href: '/government/school-admin/grade-levels', icon: Layers },
          { name: 'Infrastructure & Alerts', href: '/government/school-admin/infrastructure', icon: AlertTriangle },
        ],
      },
    ],
  },
```

Replace the `SCHOOL_ADMIN_PAGE_TITLES` doc comment and constant (lines 297-306) with:

```ts
/** Explicit header-title overrides for school-admin routes whose title differs
 * from the sidebar item's `name`. Only the dashboard root does. Every other
 * route resolves its title from the sidebar config via `sidebarItemName` in
 * `page-titles.ts`, so this is intentionally NOT a mirror of `sidebarConfigs`. */
const SCHOOL_ADMIN_PAGE_TITLES: Record<string, string> = {
  '/government/school-admin': 'Dashboard Overview',
};
```

- [ ] **Step 4: Make `page-titles.ts` ignore trailing slashes**

In `page-titles.ts`, add `import { normalizePath } from './active-nav';` to the imports. Then replace the whole `resolvePageTitle` function with:

```ts
export function resolvePageTitle(
  pathname: string,
  role: DesktopPortalRole,
): { title: string; segments: string[] } {
  const header = headerConfigs[role];
  const path = normalizePath(pathname);
  const lastSegment = path.split('/').filter(Boolean).at(-1) ?? '';
  const title =
    header.pageTitles?.[path] ??
    sidebarItemName(path, role) ??
    titleCase(lastSegment);
  const segments = path
    .slice(header.basePath.length)
    .split('/')
    .filter(Boolean)
    .map(titleCase);
  return { title, segments: [header.breadcrumbRoot, ...segments] };
}
```

(`sidebarItemName` keeps its exact `===` lookup. Titles must not inherit by prefix.)

- [ ] **Step 5: Use the matcher and the new styles in `Sidebar.tsx`**

Change the config import to:

```ts
import { headerConfigs, sidebarConfigs, type SidebarBadge } from './sidebarConfig';
import { resolveActiveHref } from './active-nav';
```

Replace `const isActive = (href: string) => pathname === href;` with:

```ts
  const activeHref = resolveActiveHref(pathname ?? '', config, headerConfigs[role].basePath);
  const isActive = (href: string) => href === activeHref;
```

On the dashboard `<Link>`, add `aria-current={isActive(config.dashboardItem.href) ? 'page' : undefined}` and change `py-3` to `py-2.5`.
On the group-item `<Link>`, add `aria-current={active ? 'page' : undefined}` and change `py-3` to `py-2.5`.
Change the separator `<div className="border-t border-white/20 my-4" />` to `my-3`.
Change the group label span class `text-white/40` to `text-white/60`.

- [ ] **Step 6: Run the shell tests to confirm they pass**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/shell`
Expected: PASS for all shell tests, including `Header.test.tsx` (its `/students` title is still "Students").

- [ ] **Step 7: Typecheck (the removed react-icons imports must leave no stragglers)**

Run: `pnpm --filter @nemis-desktop/app typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/renderer/components/shell/sidebarConfig.ts apps/desktop/renderer/components/shell/Sidebar.tsx apps/desktop/renderer/components/shell/page-titles.ts apps/desktop/renderer/components/shell/Sidebar.test.tsx apps/desktop/renderer/components/shell/page-titles.test.ts
git commit -m "feat(shell): regroup school-admin sidebar around setup and daily work

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Collapsible groups with per-device memory

**Files:**
- Create: `apps/desktop/renderer/components/shell/use-collapsed-groups.ts`
- Modify: `apps/desktop/renderer/components/shell/Sidebar.tsx` (full replacement below)
- Test: `apps/desktop/renderer/components/shell/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `SidebarConfig.collapsibleGroups`, `resolveActiveHref` (Task 1); the group labels from Task 2.
- Produces: `useCollapsedGroups(role: string, enabled: boolean): { collapsed: ReadonlySet<string>; toggle: (label: string) => void }`

- [ ] **Step 1: Write the failing tests**

In `Sidebar.test.tsx`, add `window.localStorage.clear();` to the existing `beforeEach`. Then add:

```ts
const STORE_KEY = `nemis.sidebar.collapsed.${SystemRole.INSTITUTION_ADMIN}`;
const groupToggle = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });

describe('Sidebar collapsible groups', () => {
  it('starts with every group open', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Academic Years' })).toBeVisible();
  });

  it('collapses and re-expands a group, remembering the choice', () => {
    const { unmount } = render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    fireEvent.click(groupToggle('ACADEMIC SETUP'));
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Academic Years' })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '[]')).toEqual(['ACADEMIC SETUP']);
    unmount();

    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(groupToggle('ACADEMIC SETUP'));
    expect(screen.getByRole('link', { name: 'Academic Years' })).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '[]')).toEqual([]);
  });

  it('forces open the group holding the current page', () => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(['ACADEMIC SETUP']));
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/terms');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([['{}'], ['"x"'], ['not json'], ['[1,null]']])('treats stored value %s as all open', (raw) => {
    window.localStorage.setItem(STORE_KEY, raw);
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps working when storage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('STUDENTS')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(groupToggle('STUDENTS'));
    expect(groupToggle('STUDENTS')).toHaveAttribute('aria-expanded', 'false');
    expect(warn).toHaveBeenCalled();
    get.mockRestore(); set.mockRestore(); warn.mockRestore();
  });

  it('shows the transfers badge total on a collapsed STUDENTS header', async () => {
    stubRows([pushToUs('a'), pushToUs('b')]);
    window.localStorage.setItem(STORE_KEY, JSON.stringify(['STUDENTS']));
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    await waitFor(() => expect(groupToggle('STUDENTS')).toHaveTextContent('2'));
  });

  it('renders plain, non-button group headers for a role without collapsibleGroups', () => {
    render(<Sidebar role={SystemRole.COUNTY_ADMIN} />);
    expect(screen.getByText('PEOPLE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^PEOPLE/ })).toBeNull();
  });
});
```

Also update the three existing tests that use `transfersLink()` while the group is open. They need no change, because groups start open and the badge stays on the link.

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/shell/Sidebar.test.tsx`
Expected: FAIL, "Unable to find an accessible element with the role "button" and name /^ACADEMIC SETUP/".

- [ ] **Step 3: Implement the hook**

Create `use-collapsed-groups.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

const storageKey = (role: string) => `nemis.sidebar.collapsed.${role}`;

function readCollapsed(role: string): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(role));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch (error) {
    console.warn('[sidebar] collapsed-group state unreadable; showing all groups open', error);
    return new Set();
  }
}

function writeCollapsed(role: string, collapsed: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(storageKey(role), JSON.stringify([...collapsed]));
  } catch (error) {
    console.warn('[sidebar] collapsed-group state not saved', error);
  }
}

/** Which sidebar groups this device has collapsed, for one role. A per-device
 * convenience only: storage failures fall back to "all open" and never break
 * navigation. Reads after mount so the static export never hydrates against
 * storage. */
export function useCollapsedGroups(role: string, enabled: boolean) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (enabled) setCollapsed(readCollapsed(role));
  }, [role, enabled]);

  const toggle = useCallback(
    (label: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        writeCollapsed(role, next);
        return next;
      });
    },
    [role],
  );

  return { collapsed, toggle };
}
```

Note on the forced-open case: if the admin clicks the header of the group holding the current page, `toggle` stores it as collapsed, but the group keeps rendering open until they navigate away (spec §6).

- [ ] **Step 4: Replace `Sidebar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import { SystemRole, type DesktopPortalRole } from '@nemis-desktop/types';
import { headerConfigs, sidebarConfigs, type SidebarBadge } from './sidebarConfig';
import { resolveActiveHref } from './active-nav';
import { useCollapsedGroups } from './use-collapsed-groups';
import { useNotificationStore } from '../../lib/presentation/hooks/shared';
import { useViewModel } from '../../hooks/use-view-model';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { usePendingTransferCount } from '@/lib/use-pending-transfer-count';

const groupListId = (label: string) => `sidebar-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

function CountPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Sidebar({
  role,
}: {
  role: DesktopPortalRole;
}) {
  const config = sidebarConfigs[role];
  const pathname = usePathname();
  const router = useRouter();
  const activeHref = resolveActiveHref(pathname ?? '', config, headerConfigs[role].basePath);
  const isActive = (href: string) => href === activeHref;
  const collapsible = config.collapsibleGroups === true;
  const { collapsed, toggle } = useCollapsedGroups(role, collapsible);

  const notifications = useNotificationStore();
  const unreadNotifications = useViewModel(notifications.store, (s) => s.notifications.length);
  // Hooks may not be called conditionally, so every role calls this; only the
  // school admin enables it, so other roles make no transfer reads.
  const pendingTransfers = usePendingTransferCount(role === SystemRole.INSTITUTION_ADMIN);
  const getBadgeCount = (badge?: SidebarBadge) => {
    if (badge === 'notifications') return unreadNotifications;
    if (badge === 'transfers') return pendingTransfers;
    return 0;
  };

  const handleLogout = () => {
    void sharedBridge.logout().finally(() => router.replace('/'));
  };

  return (
    <div className="w-[230px] bg-primary h-full flex flex-col" aria-label="Primary">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center">
          <img src="/logo.png" alt="NEMIS" className="h-11 w-11 object-contain" />
          </div>
          <div className="w-[80%]">
            <h2 className="font-heading font-bold text-md text-white truncate">Dashboard</h2>

          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 sidebar-scroll" aria-label="Sidebar">
        <div className="space-y-1">
          {config.dashboardItem && (
            <Link
              href={config.dashboardItem.href}
              aria-current={isActive(config.dashboardItem.href) ? 'page' : undefined}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                isActive(config.dashboardItem.href)
                  ? 'bg-slate-800 text-neutral-light'
                  : 'text-white/80 hover:bg-slate-900 hover:text-neutral-light'
              }`}
            >
              <config.dashboardItem.icon className="w-5 h-5" />
              <span className="font-semibold text-sm">{config.dashboardItem.name}</span>
            </Link>
          )}

          {config.navGroups.map((group) => {
            const holdsActive = group.items.some((item) => isActive(item.href));
            const open = !collapsible || holdsActive || !collapsed.has(group.label);
            const listId = groupListId(group.label);
            const groupBadgeTotal = group.items.reduce((sum, item) => sum + getBadgeCount(item.badge), 0);
            return (
              <div key={group.label}>
                <div className="border-t border-white/20 my-3" />
                {collapsible ? (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={listId}
                    onClick={() => toggle(group.label)}
                    className="w-full flex items-center gap-2 px-4 mb-2 text-white/60 hover:text-white text-xs font-semibold tracking-wider"
                  >
                    {open ? <ChevronDown className="w-3.5 h-3.5" aria-hidden /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden />}
                    <span className="flex-1 text-left">{group.label}</span>
                    {!open && <CountPill count={groupBadgeTotal} />}
                  </button>
                ) : (
                  <div className="px-4 mb-2">
                    <span className="text-white/60 text-xs font-semibold tracking-wider">{group.label}</span>
                  </div>
                )}
                <div id={listId} hidden={!open} className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                          active ? 'bg-slate-800 text-slate-100' : 'text-white/80 hover:bg-slate-900 hover:text-white'
                        }`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span className="font-semibold text-sm flex-1">{item.name}</span>
                        <CountPill count={getBadgeCount(item.badge)} />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
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

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/shell`
Expected: PASS for every shell test, including `'hides the badge when nothing awaits a decision'`. `CountPill` renders nothing for 0, so the link text stays exactly "Student Transfers".

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/shell/use-collapsed-groups.ts apps/desktop/renderer/components/shell/Sidebar.tsx apps/desktop/renderer/components/shell/Sidebar.test.tsx
git commit -m "feat(shell): collapsible sidebar groups remembered per device

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Assessment Periods page

**Files:**
- Rename: `apps/desktop/renderer/components/academic-grading/GradingPeriodsDrawer.tsx` → `GradingPeriodsPanel.tsx`
- Modify: `apps/desktop/renderer/app/government/school-admin/academic-grading/periods/page.tsx`
- Modify: `apps/desktop/renderer/components/academic-grading/AcademicGradingPage.tsx`
- Create: `apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.test.tsx`

**Interfaces:**
- Produces: `GradingPeriodsPanel(): JSX.Element` (no props).

- [ ] **Step 1: Write the failing test**

Create `GradingPeriodsPanel.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })),
    saveSchoolAdminRecord: vi.fn(),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { GradingPeriodsPanel } from './GradingPeriodsPanel';

const YEAR = { id: 'ay-1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-06-30', isCurrent: true };
const TERM = { id: 'term-1', academicYearId: 'ay-1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true };

function stubNemis({ year, terms }: { year: unknown; terms: unknown[] }) {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => year) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => terms) },
    identity: { getCurrentUser: vi.fn(async () => null) },
    device: { getInfo: vi.fn(async () => null) },
    teacher: { getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })) },
  };
}

async function renderPanel() {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  render(
    <PresentationProvider layer={layer}>
      <GradingPeriodsPanel />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('GradingPeriodsPanel', () => {
  it('lists the current year\'s terms to choose from', async () => {
    stubNemis({ year: YEAR, terms: [TERM] });
    await renderPanel();
    expect(await screen.findByText('Term 1')).toBeInTheDocument();
  });

  it('links to Terms when the current year has none', async () => {
    stubNemis({ year: YEAR, terms: [] });
    await renderPanel();
    expect(await screen.findByRole('link', { name: 'Create terms' })).toHaveAttribute('href', '/government/school-admin/terms');
  });

  it('links to Academic Years when there is no current year at all', async () => {
    stubNemis({ year: null, terms: [] });
    await renderPanel();
    expect(await screen.findByRole('link', { name: 'Set up an academic year' })).toHaveAttribute(
      'href',
      '/government/school-admin/academic-years',
    );
    expect(screen.queryByText(/No terms configured/)).toBeNull();
  });
});
```

If `bootstrap.run()` rejects because of a missing `window.nemis` method, the error names it. Add that method to `stubNemis`, returning `null` or an empty value, and nothing else.

- [ ] **Step 2: Move the file and confirm the test fails**

```bash
git mv apps/desktop/renderer/components/academic-grading/GradingPeriodsDrawer.tsx apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.tsx
```

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.test.tsx`
Expected: FAIL, "GradingPeriodsPanel is not exported" (the file still exports `GradingPeriodsDrawer`).

- [ ] **Step 3: Turn the drawer into a panel**

In `GradingPeriodsPanel.tsx`:

(a) Imports: replace `import { Button, Drawer, Input } from '@nemis-desktop/ui';` with

```ts
import Link from 'next/link';
import { Button, Input } from '@nemis-desktop/ui';
```

(b) Replace the doc comment and signature

```ts
/** Grading periods scoped to a term — mirrors portal-web's
 * GradingPeriodsModal, including "Auto Setup All Periods" (here computed
 * client-side from the institution's real periodsPerTerm config and the
 * term's real start/end dates, then saved one row at a time through the same
 * generic collection API used for manual create). */
export function GradingPeriodsDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
```

with

```ts
/** Assessment (grading) periods scoped to a term — the body of the
 * /academic-grading/periods page, mirroring portal-web's grading-periods page,
 * including "Auto Setup All Periods" (computed client-side from the
 * institution's real periodsPerTerm config and the term's real start/end
 * dates, then saved one row at a time through the same generic collection API
 * used for manual create). */
export function GradingPeriodsPanel() {
```

(c) Replace the open-gated effect

```ts
  useEffect(() => {
    if (!isOpen) return;
    void academicYear.loadCurrent();
    void getGradingConfig().then(setConfig);
  }, [isOpen, academicYear]);
```

with

```ts
  useEffect(() => {
    void academicYear.loadCurrent();
    void getGradingConfig().then(setConfig);
  }, [academicYear]);
```

(d) Replace the opening wrapper

```tsx
    <Drawer isOpen={isOpen} onClose={onClose} title="Grading Periods Management" size="lg">
      <div className="space-y-6 pb-6">
```

with `    <div className="space-y-6">`. Then replace the closing pair at the end of the JSX

```tsx
      </div>
    </Drawer>
```

with `    </div>`. Re-indent the body by two spaces less, if Prettier or ESLint wants it.

(e) Replace the empty-terms paragraph

```tsx
            {termOptions.length === 0 && (
              <p className="text-sm text-slate-400">No terms configured for the current academic year.</p>
            )}
```

with

```tsx
            {termOptions.length === 0 && year.status === 'empty' && (
              <p className="text-sm text-slate-500">
                No current academic year is set.{' '}
                <Link href="/government/school-admin/academic-years" className="text-blue-700 hover:underline">
                  Set up an academic year
                </Link>
              </p>
            )}
            {termOptions.length === 0 && (year.status === 'success' || year.status === 'refreshing') && (
              <p className="text-sm text-slate-500">
                No terms configured for the current academic year.{' '}
                <Link href="/government/school-admin/terms" className="text-blue-700 hover:underline">
                  Create terms
                </Link>
              </p>
            )}
```

- [ ] **Step 4: Replace the periods route page**

Overwrite `app/government/school-admin/academic-grading/periods/page.tsx`:

```tsx
import { GradingPeriodsPanel } from '@/components/academic-grading/GradingPeriodsPanel';

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-primary px-6 py-5 text-white">
        <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">School Admin Portal</p>
        <h1 className="text-xl font-bold">Assessment Periods</h1>
      </div>
      <div className="px-6 py-6">
        <GradingPeriodsPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Point the Grading System page's card at the new page**

In `AcademicGradingPage.tsx`:
- Delete `import { GradingPeriodsDrawer } from './GradingPeriodsDrawer';`.
- Change `type ModalKey = 'setup' | 'periods' | null;` to `type ModalKey = 'setup' | null;`.
- In `GUIDE_STEPS`, change `title: 'Create Grading Periods',` to `title: 'Create Assessment Periods',`.
- Replace the second `FeatureCard` (title "Grading Periods") with:

```tsx
          <FeatureCard
            icon={<CalendarRange className="h-6 w-6 text-slate-500" />}
            title="Assessment Periods"
            description="Create and manage the assessment periods in each term."
            action="Manage Periods"
            href="/government/school-admin/academic-grading/periods"
          />
```

- Delete the line `<GradingPeriodsDrawer isOpen={activeModal === 'periods'} onClose={() => setActiveModal(null)} />`.

- [ ] **Step 6: Confirm nothing else imports the drawer**

Run: `git grep -n "GradingPeriodsDrawer" -- apps/desktop/renderer`
Expected: no output.

- [ ] **Step 7: Run the tests and the typecheck**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/academic-grading`
Expected: PASS (the 3 new tests plus `assessments.test.ts`).
Run: `pnpm --filter @nemis-desktop/app typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading apps/desktop/renderer/app/government/school-admin/academic-grading/periods/page.tsx
git commit -m "feat(grading): assessment periods get a real page instead of a drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Academic Years → Terms wayfinding

**Files:**
- Modify: `apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx` (lines 1-16 imports and helpers, line 41 terms cell, line 52 initial-year effect)
- Create: `apps/desktop/renderer/components/academic/AcademicFoundationPages.test.tsx`

**Interfaces:**
- Consumes: `queryParam(name: string): string` from `@/components/teachers/shared` (exists).
- Produces: `initialYearId(years: readonly { id: string; isCurrent: boolean }[], requested: string): string`

- [ ] **Step 1: Write the failing tests**

Create `AcademicFoundationPages.test.tsx`:

```tsx
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })) },
}));

import { AcademicYearsPage, TermsPage, initialYearId } from './AcademicFoundationPages';

const year = (over: Record<string, unknown>) => ({
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 2, classCount: 3, ...over,
});
const CURRENT = year({});
const OLD = year({ id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED', termCount: 3 });

function stubNemis() {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [OLD, CURRENT]) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
    identity: { getCurrentUser: vi.fn(async () => null) },
    device: { getInfo: vi.fn(async () => null) },
    teacher: { getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })) },
  };
}

async function renderWithLayer(ui: ReactElement) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  render(<PresentationProvider layer={layer}>{ui}</PresentationProvider>);
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.replaceState({}, '', '/');
});

describe('initialYearId', () => {
  const years = [{ id: 'y0', isCurrent: false }, { id: 'y1', isCurrent: true }];
  it('uses the requested year when it exists', () => expect(initialYearId(years, 'y0')).toBe('y0'));
  it('falls back to the current year for an unknown request', () => expect(initialYearId(years, 'gone')).toBe('y1'));
  it('falls back to the current year when nothing is requested', () => expect(initialYearId(years, '')).toBe('y1'));
  it('falls back to the first year when none is current', () =>
    expect(initialYearId([{ id: 'a', isCurrent: false }], '')).toBe('a'));
  it('returns empty for no years', () => expect(initialYearId([], 'y0')).toBe(''));
});

describe('AcademicYearsPage', () => {
  it('links each year\'s term count to Terms for that year', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsPage />);
    expect(await screen.findByRole('link', { name: '3 terms in 2024/2025' })).toHaveAttribute(
      'href',
      '/government/school-admin/terms?yearId=y0',
    );
  });
});

describe('TermsPage', () => {
  it('opens on the year named in ?yearId', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?yearId=y0');
    await renderWithLayer(<TermsPage />);
    await waitFor(() => expect(screen.getByLabelText('Academic year')).toHaveValue('y0'));
  });

  it('opens on the current year when ?yearId is stale', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?yearId=deleted-year');
    await renderWithLayer(<TermsPage />);
    await waitFor(() => expect(screen.getByLabelText('Academic year')).toHaveValue('y1'));
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/academic/AcademicFoundationPages.test.tsx`
Expected: FAIL, "initialYearId is not a function" (or "not exported").

- [ ] **Step 3: Implement**

In `AcademicFoundationPages.tsx`:

(a) Add to the imports: `import { queryParam } from '@/components/teachers/shared';`

(b) Below the `statusVariant` constant (line 16), add:

```ts
/** The year the Terms page opens on: the one named in ?yearId when it is on
 * this device, else the current year, else the first. */
export function initialYearId(years: readonly { id: string; isCurrent: boolean }[], requested: string): string {
  if (requested && years.some((y) => y.id === requested)) return requested;
  return (years.find((y) => y.isCurrent) ?? years[0])?.id ?? '';
}
```

(c) In `AcademicYearsPage`'s row JSX, replace `<td className="p-4">{year.termCount}</td>` with:

```tsx
<td className="p-4"><Link className="text-blue-700 hover:underline" href={`/government/school-admin/terms?yearId=${year.id}`} aria-label={`${year.termCount} terms in ${year.code}`}>{year.termCount}</Link></td>
```

(d) In `TermsPage`, replace the effect on line 52

```ts
  useEffect(() => { if ((years.status === 'success' || years.status === 'refreshing') && selectedYear === '') { const current = years.data.find((year) => year.isCurrent) ?? years.data[0]; if (current) setSelectedYear(current.id); } }, [years, selectedYear]);
```

with

```ts
  useEffect(() => { if ((years.status === 'success' || years.status === 'refreshing') && selectedYear === '') { const id = initialYearId(years.data, queryParam('yearId')); if (id) setSelectedYear(id); } }, [years, selectedYear]);
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/academic/AcademicFoundationPages.test.tsx`
Expected: PASS (8 tests). If `getByLabelText('Academic year')` doesn't resolve to the native `<select>`, check how `@nemis-desktop/ui` `Select` wires `label`, and use `screen.getByRole('combobox', { name: 'Academic year' })` instead.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx apps/desktop/renderer/components/academic/AcademicFoundationPages.test.tsx
git commit -m "feat(academic): academic year term counts open Terms for that year

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Dashboard setup tiles become links

**Files:**
- Modify: `apps/desktop/renderer/components/dashboard/InfoTile.tsx`
- Modify: `apps/desktop/renderer/app/government/school-admin/page.tsx:126-128`
- Test: `apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`

**Interfaces:**
- Produces: `InfoTile` prop `emptyHref?: string`

- [ ] **Step 1: Write the failing assertions**

In `dashboard.test.tsx`, replace the three lines

```ts
    expect(screen.getByText('School profile not set up yet')).toBeInTheDocument();
    expect(screen.getByText('No academic year configured')).toBeInTheDocument();
    expect(screen.getByText('No current term configured')).toBeInTheDocument();
```

with

```ts
    expect(screen.getByText('School profile not set up yet').closest('a')).toHaveAttribute('href', '/government/school-admin/school-profile');
    expect(screen.getByText('No academic year configured').closest('a')).toHaveAttribute('href', '/government/school-admin/academic-years');
    expect(screen.getByText('No current term configured').closest('a')).toHaveAttribute('href', '/government/school-admin/terms');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`
Expected: FAIL, "expected null to have attribute href".

- [ ] **Step 3: Implement**

Replace `InfoTile.tsx`:

```tsx
import Link from 'next/link';
import { Card } from '@nemis-desktop/ui';

/** A single labelled fact. When `value` is null/empty it renders `emptyText`
 * in a muted style — never a fabricated number. With `emptyHref`, the empty
 * text becomes a link to the page where the missing thing is set up. */
export function InfoTile({
  label,
  value,
  emptyText,
  emptyHref,
}: {
  label: string;
  value: string | number | null;
  emptyText: string;
  emptyHref?: string;
}) {
  const isEmpty = value === null || value === '';
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      {!isEmpty ? (
        <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
      ) : emptyHref ? (
        <Link href={emptyHref} className="mt-2 inline-block text-sm text-blue-700 hover:underline">
          {emptyText}
          <span aria-hidden> →</span>
        </Link>
      ) : (
        <p className="mt-2 text-sm italic text-slate-500">{emptyText}</p>
      )}
    </Card>
  );
}
```

In `app/government/school-admin/page.tsx`, add `emptyHref` to the three tiles:

```tsx
          <InfoTile label="School" value={profile.status === 'success' ? profile.data.name : null} emptyText="School profile not set up yet" emptyHref="/government/school-admin/school-profile" />
          <InfoTile label="Academic Year" value={year.status === 'success' ? year.data.code : null} emptyText="No academic year configured" emptyHref="/government/school-admin/academic-years" />
          <InfoTile label="Current Term" value={term.status === 'success' ? term.data.name : null} emptyText="No current term configured" emptyHref="/government/school-admin/terms" />
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/dashboard/InfoTile.tsx apps/desktop/renderer/app/government/school-admin/page.tsx apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx
git commit -m "feat(dashboard): empty setup tiles link to where they are configured

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Missing current term (Record Payment, Reports, Outcomes)

**Files:**
- Create: `apps/desktop/renderer/components/finance/CurrentTermNotice.tsx`
- Create: `apps/desktop/renderer/components/finance/CurrentTermNotice.test.tsx`
- Modify: `apps/desktop/renderer/components/finance/RecordPaymentPage.tsx:217-221`
- Modify: `apps/desktop/renderer/components/reports/ReportsPage.tsx` (line 34 type, line 111, lines 300-308)
- Modify: `apps/desktop/renderer/components/outcomes/EndOfYearOutcomesPage.tsx:182-186`
- Test: `apps/desktop/renderer/components/outcomes/EndOfYearOutcomesPage.test.tsx:313-318`

**Interfaces:**
- Produces: `CurrentTermNotice({ status, errorMessage }: { status: string; errorMessage?: string })`

- [ ] **Step 1: Write the failing tests**

Create `CurrentTermNotice.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurrentTermNotice } from './CurrentTermNotice';

describe('CurrentTermNotice', () => {
  it.each(['success', 'refreshing'])('renders nothing once the term is %s', (status) => {
    const { container } = render(<CurrentTermNotice status={status} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['idle', 'loading'])('says the term is loading while %s', (status) => {
    render(<CurrentTermNotice status={status} />);
    expect(screen.getByText(/Loading the current term/)).toBeInTheDocument();
  });

  it('links to Terms when no current term exists', () => {
    render(<CurrentTermNotice status="empty" />);
    expect(screen.getByText(/No current term is set/)).toBeInTheDocument();
    expect(screen.queryByText(/Loading/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Set a current term' })).toHaveAttribute('href', '/government/school-admin/terms');
  });

  it('shows the load error instead of claiming it is loading', () => {
    render(<CurrentTermNotice status="error" errorMessage="Local database is locked." />);
    expect(screen.getByText(/Local database is locked\./)).toBeInTheDocument();
    expect(screen.queryByText(/Loading/)).toBeNull();
  });
});
```

In `EndOfYearOutcomesPage.test.tsx`, add this line inside `'explains when the device has no academic years'`, after the `findByText` assertion:

```ts
    expect(screen.getByRole('link', { name: 'Add one under Academic Years' })).toHaveAttribute('href', '/government/school-admin/academic-years');
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/finance/CurrentTermNotice.test.tsx apps/desktop/renderer/components/outcomes/EndOfYearOutcomesPage.test.tsx`
Expected: FAIL, with the import of `./CurrentTermNotice` unresolved and no link named "Add one under Academic Years".

- [ ] **Step 3: Implement `CurrentTermNotice` and use it in Record Payment**

Create `CurrentTermNotice.tsx`:

```tsx
import Link from 'next/link';

const BOX = 'rounded-card border border-pending/30 bg-pending/10 px-4 py-2.5 text-xs text-pending';

/** Why payment entry is disabled while the current term isn't usable.
 * Renders nothing once the term has loaded. */
export function CurrentTermNotice({ status, errorMessage }: { status: string; errorMessage?: string }) {
  if (status === 'success' || status === 'refreshing') return null;
  if (status === 'empty') {
    return (
      <div className={BOX}>
        No current term is set — payment entry is disabled.{' '}
        <Link href="/government/school-admin/terms" className="font-semibold underline">Set a current term</Link>
      </div>
    );
  }
  if (status === 'error') {
    return <div className={BOX}>{errorMessage ?? 'The current term could not be loaded.'} Payment entry is disabled.</div>;
  }
  return <div className={BOX}>Loading the current term — payment entry is disabled until it resolves.</div>;
}
```

In `RecordPaymentPage.tsx`, add `import { CurrentTermNotice } from './CurrentTermNotice';` and replace

```tsx
        {!termReady && (
          <div className="rounded-card border border-pending/30 bg-pending/10 px-4 py-2.5 text-xs text-pending">
            Loading the current term — payment entry is disabled until it resolves.
          </div>
        )}
```

with

```tsx
        <CurrentTermNotice status={term.status} errorMessage={term.status === 'error' ? term.error.userMessage : undefined} />
```

If the typecheck says `term.error` has no `userMessage`, check the `AsyncState` error type in `@nemis-desktop/presentation` and use its user-facing message field.

- [ ] **Step 4: Reports error carries a link**

In `ReportsPage.tsx`:
- Make sure `import Link from 'next/link';` is present (add it after the React import if missing).
- Line 34: change `| { status: 'error'; message: string }` to `| { status: 'error'; message: string; link?: { href: string; label: string } }`.
- Line 111: change `setReportState({ status: 'error', message: 'No term is set as current. Choose a year and term to generate this report.' })` to

```ts
setReportState({ status: 'error', message: 'No term is set as current. Choose a year and term to generate this report.', link: { href: '/government/school-admin/terms', label: 'Set a current term' } })
```

- In the error block (lines 300-308), after `<p className="mt-0.5 text-xs text-red-500">{reportState.message}</p>`, add:

```tsx
                  {reportState.link && (
                    <Link href={reportState.link.href} className="mt-1 inline-block text-xs font-semibold text-red-700 underline">
                      {reportState.link.label}
                    </Link>
                  )}
```

- [ ] **Step 5: Outcomes empty-years link**

In `EndOfYearOutcomesPage.tsx`, add `import Link from 'next/link';` and replace

```tsx
      <p className="text-sm text-amber-700">
        There are no academic years on this device. Add one under Academic Years, or sync this device, to record
        outcomes.
      </p>
```

with

```tsx
      <p className="text-sm text-amber-700">
        There are no academic years on this device.{' '}
        <Link href="/government/school-admin/academic-years" className="font-semibold underline">
          Add one under Academic Years
        </Link>
        , or sync this device, to record outcomes.
      </p>
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/finance apps/desktop/renderer/components/outcomes`
Expected: PASS.
Run: `pnpm --filter @nemis-desktop/app typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/components/finance/CurrentTermNotice.tsx apps/desktop/renderer/components/finance/CurrentTermNotice.test.tsx apps/desktop/renderer/components/finance/RecordPaymentPage.tsx apps/desktop/renderer/components/reports/ReportsPage.tsx apps/desktop/renderer/components/outcomes/EndOfYearOutcomesPage.tsx apps/desktop/renderer/components/outcomes/EndOfYearOutcomesPage.test.tsx
git commit -m "feat(wayfinding): missing-term and missing-year messages link to setup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Class, teacher and wizard prerequisite messages

**Files:**
- Modify: `apps/desktop/renderer/components/classes/ClassesDirectoryPage.tsx:686`
- Modify: `apps/desktop/renderer/components/classes/ClassDetailPage.tsx:583`
- Modify: `apps/desktop/renderer/components/timetable/ClassSchedulePage.tsx` (imports, line 531)
- Modify: `apps/desktop/renderer/components/students/add-student/ClassTermPicker.tsx:126,146`
- Test: `apps/desktop/renderer/components/students/add-student/ClassTermPicker.test.tsx:88`

- [ ] **Step 1: Update the picker test to the new copy (failing)**

In `ClassTermPicker.test.tsx`, change line 88 to:

```ts
const EMPTY_HINT = 'No classes for GRADE 7 — create one under Teaching → Classes, then return.';
```

Add this assertion to the same test that uses `EMPTY_HINT` (line 144), right after it:

```ts
    expect(screen.queryByRole('link')).toBeNull(); // the wizard holds typed data: text only, never a link
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/students/add-student/ClassTermPicker.test.tsx`
Expected: FAIL, "Unable to find an element with the text: No classes for GRADE 7 — create one under Teaching → Classes, then return."

- [ ] **Step 3: Update the picker copy (text only)**

In `ClassTermPicker.tsx`, replace `No classes for {human(gradeLevel)} — create one first.` with

```tsx
          No classes for {human(gradeLevel)} — create one under Teaching → Classes, then return.
```

and replace `<p className="text-sm text-amber-700">No terms in this academic year — create one first.</p>` with

```tsx
        <p className="text-sm text-amber-700">No terms in this academic year — create one under Academic Setup → Terms, then return.</p>
```

- [ ] **Step 4: Run the picker test to confirm it passes**

Run: `pnpm vitest run --project renderer apps/desktop/renderer/components/students/add-student`
Expected: PASS (including `AddStudentWizard.test.tsx`; confirm it doesn't assert the old copy).

- [ ] **Step 5: Link the three page-level messages**

`ClassesDirectoryPage.tsx` (`Link` is already imported). Replace

```tsx
                <p className="text-sm text-amber-800">No active academic year or term is configured yet.</p>
```

with

```tsx
                <p className="text-sm text-amber-800">
                  No active academic year or term is configured yet. Set them up in{' '}
                  <Link href="/government/school-admin/academic-years" className="font-semibold underline">Academic Years</Link>
                  {' '}and{' '}
                  <Link href="/government/school-admin/terms" className="font-semibold underline">Terms</Link>.
                </p>
```

`ClassDetailPage.tsx` (`Link` is already imported). Replace

```tsx
                <p className="text-sm text-gray-400 italic">No active teachers found. Add teachers from the Teachers module first.</p>
```

with

```tsx
                <p className="text-sm text-gray-500 italic">
                  No active teachers found. Add them under{' '}
                  <Link href="/government/school-admin/teachers-staff" className="text-blue-700 not-italic hover:underline">Teachers &amp; Staff</Link>{' '}
                  first.
                </p>
```

`ClassSchedulePage.tsx`: add `import Link from 'next/link';` after the `react` import. Replace

```tsx
              <p className="text-sm italic text-gray-400">No teachers are assigned to this class yet. Assign them from the class detail page first.</p>
```

with

```tsx
              <p className="text-sm italic text-gray-500">
                No teachers are assigned to this class yet.{' '}
                <Link href={`/government/school-admin/classes/detail?id=${selectedClassId}`} className="text-blue-700 not-italic hover:underline">
                  Assign them on the class page
                </Link>{' '}
                first.
              </p>
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/app typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/components/classes/ClassesDirectoryPage.tsx apps/desktop/renderer/components/classes/ClassDetailPage.tsx apps/desktop/renderer/components/timetable/ClassSchedulePage.tsx apps/desktop/renderer/components/students/add-student/ClassTermPicker.tsx apps/desktop/renderer/components/students/add-student/ClassTermPicker.test.tsx
git commit -m "feat(wayfinding): class and teacher prerequisite messages point to setup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Full gate and manual pass

**Files:** none changed, unless a check fails.

- [ ] **Step 1: Renderer suite**

Run: `pnpm vitest run --project renderer`
Expected: all pass. If anything outside the files this plan touched fails, compare with `main` (`git stash` is NOT safe here because of the unrelated edits; use `git worktree add ../nav-baseline main` and run the same command there). Report the failure as pre-existing or as introduced by this branch.

- [ ] **Step 2: Whole-repo tests, typecheck and lint**

Run: `pnpm test`
Run: `pnpm --filter @nemis-desktop/app typecheck`
Run: `pnpm lint`
Expected: all exit 0 (the lint includes the renderer boundary guard).

- [ ] **Step 3: Manual pass in the running app**

Run: `pnpm --filter @nemis-desktop/app dev` and log in as a school admin. Check:
1. The groups appear in §3 order, and every item opens its page.
2. Collapse ACADEMIC SETUP, restart the app: it stays collapsed. Navigate to Terms: the group opens.
3. Collapse STUDENTS with a pending transfer: the header shows the count.
4. Student profile → Students highlighted. Class detail → Classes. Window grades → Grade Entry & Results. School profile → Settings.
5. Assessment Periods: pick a term, add a period, use auto-setup, edit and delete it.
6. Academic Years: the term count opens Terms with that year selected.
7. On a device with no current term: the dashboard tiles, Record Payment, Reports (Academic report), the Classes assign modal and the periods page each show a working link.
8. Timetable cell editor on a class with no teachers: the link opens that class's detail page.
9. A County, DEO and Teacher login: the sidebars have the same items as before, and the group headers are not buttons.

Write down anything that doesn't match, and fix it in the owning task's files with a new commit.

- [ ] **Step 4: Report** the gate output (pass counts) and the manual checklist results to the human partner. Do not merge. Finishing the branch is a separate decision.
