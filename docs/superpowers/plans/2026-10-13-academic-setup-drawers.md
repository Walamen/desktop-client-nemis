# Academic Setup Drawers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Academic Years, Terms and Assessment Periods into drawers opened from FeatureCards on the school-admin Academic Grading page, delete their standalone pages, and repoint every link to `?open=` deep links.

**Architecture:** Each drawer is a thin `<Drawer>` wrapper around a "manager" component that holds the existing page logic; because `Drawer` only renders children while open, plus a per-open `key`, every open starts fresh on the list view. Create/edit swaps the drawer body to a form view (a `Modal` cannot stack inside the transformed Drawer); a capture-phase `document` Escape listener returns the form to the list without closing the drawer. `AcademicGradingPage` owns which drawer is open, reads `?open=`/`?yearId=` once on mount, and clears the query on close.

**Tech Stack:** Next.js (static export) renderer in Electron, React, TypeScript, Tailwind, `@nemis-desktop/ui` (Drawer/Button/Input/Select…), `@nemis-desktop/presentation` view models, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-13-academic-setup-drawers-design.md`

## Global Constraints

- Desktop renderer, School Admin role only. No portal-web changes. No view-model, IPC, bridge, or data changes.
- Static Next export (`output: 'export'`, `trailingSlash: true`) — no redirects; every link to a deleted route is repointed in code.
- Deep-link shape: `/government/school-admin/academic-grading?open=years|terms|periods[&yearId=<id>]`, produced only by `academicSetupHref()` in `apps/desktop/renderer/lib/academic-setup.ts`.
- Drawers use `size="xl"`. Titles: "Academic Years", "Terms", "Assessment Periods".
- Card order: Grading Configuration, Academic Years, Terms, Assessment Periods, Grade Entry Windows, Grade Entry (disabled).
- Sidebar ACADEMIC SETUP = **Academic Grading** (href `/government/school-admin/academic-grading`), **Subjects**.
- Link text stays the same everywhere it exists today ("Set a current term", "Create terms", "Set up an academic year", "Academic Years", "Terms", "Add one under Academic Years", "Manage academic years", "Manage terms", "No academic year configured", "No current term configured").
- Year status-action conditions (unchanged): Set current = `ACTIVE && !isCurrent`; Close = `ACTIVE && !isCurrent`; Archive = `status !== 'ARCHIVED' && !isCurrent`; Restore = `status !== 'ACTIVE'`. Close/Archive/Restore keep their `window.confirm(\`Change ${code} to ${status.toLowerCase()}?\`)`; term Delete keeps `window.confirm(\`Delete ${name}?\`)`.
- Match surrounding code style: `'use client'` at top of components, single quotes, Tailwind classes, `@/` imports.
- Tests that touch `window.nemis` use the cast form `(window as unknown as { nemis: unknown }).nemis` (the lint guard matches only the bare `window.nemis` member expression).
- `@nemis-desktop/ui` `Input` and `Select` render a `<label>` without `htmlFor`; tests reach a control via its label text's `parentElement` (see `field()` in Task 2).

**Commands** (run from the repo root `desktop-client-nemis/`):
- Tests: `pnpm exec vitest run --project renderer <paths…>`
- Typecheck: `pnpm --filter @nemis-desktop/app typecheck`
- Lint (renderer only): `pnpm exec eslint apps/desktop/renderer`

**Baseline** (measured on `main` / this branch before Task 1): the affected test files pass 104/104 with **1 pre-existing unhandled error** in `Sidebar.test.tsx` ("calls sharedBridge.logout()…": `Cannot read properties of undefined (reading 'finally')`). Full renderer suite has 2 pre-existing failures (`app/page.test` login, teacher `timetable.test`). Root lint has 6 pre-existing errors outside the renderer. None of these are to be fixed here; the gate is "no new failures/errors".

## Review Focus

1. **Reopening a drawer after closing it mid-edit** — a person expects the list, not the half-filled form. Pinned by the `useOpenSession` test (Task 2) and the per-open `key` in each drawer (Tasks 3–4).
2. **A save that fails** (view model returns `ok: false`) — the form stays open with the typed values and the drawer does not close. Pinned in Task 3 (years) and Task 4 (terms).
3. **A deep link whose `yearId` is not on this device** (deleted / not yet synced) — Terms opens on the current year instead of a blank selector. Pinned in Task 4.
4. **`?open=` with an unknown value or `setup`** — nothing opens and the page renders normally. Pinned in Task 1 (parser) and Task 6 (page).
5. **Escape twice from the form** — first Escape leaves the form, second closes the drawer. Pinned in Task 3.

---

## File Structure

Create:
- `apps/desktop/renderer/lib/academic-setup.ts` — deep-link href builder + `?open=` parser.
- `apps/desktop/renderer/lib/academic-setup.test.ts`
- `apps/desktop/renderer/components/academic/foundation-ui.tsx` — `LoadState`, `FormField`, `statusVariant` extracted from `AcademicFoundationPages.tsx` so the drawers and remaining pages share them.
- `apps/desktop/renderer/components/academic-grading/setup-drawers.ts` — `SetupDrawer`/`SetupNavigate`/`SetupDrawerProps` types + `useOpenSession` hook.
- `apps/desktop/renderer/components/academic-grading/use-escape-capture.ts` — capture-phase Escape hook for form views.
- `apps/desktop/renderer/components/academic-grading/setup-drawers.test.tsx` — tests for the two hooks.
- `apps/desktop/renderer/components/academic-grading/setup-test-support.tsx` — shared test helpers (`stubNemis`, `renderWithLayer`, `field`, row factories). Not a `*.test.*` file, so Vitest does not collect it.
- `apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.tsx` + `.test.tsx`
- `apps/desktop/renderer/components/academic-grading/TermsDrawer.tsx` + `.test.tsx`
- `apps/desktop/renderer/components/academic-grading/AssessmentPeriodsDrawer.tsx` + `.test.tsx`
- `apps/desktop/renderer/components/academic-grading/AcademicGradingPage.test.tsx`

Modify:
- `apps/desktop/renderer/components/academic-grading/AcademicGradingPage.tsx` — 6 cards, guide, drawer state, `?open=`.
- `apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.tsx` (+ test) — optional `onNavigate`.
- `apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx` — import shared UI; Settings links; later delete Years/Terms pages.
- `apps/desktop/renderer/app/government/school-admin/page.tsx` (+ `dashboard.test.tsx`)
- `apps/desktop/renderer/components/finance/CurrentTermNotice.tsx` (+ test)
- `apps/desktop/renderer/components/reports/ReportsPage.tsx`
- `apps/desktop/renderer/components/classes/ClassesDirectoryPage.tsx`
- `apps/desktop/renderer/components/outcomes/EndOfYearOutcomesPage.tsx` (+ test)
- `apps/desktop/renderer/components/shell/sidebarConfig.ts` (+ `Sidebar.test.tsx`, `page-titles.test.ts`)

Delete:
- `apps/desktop/renderer/app/government/school-admin/academic-years/`
- `apps/desktop/renderer/app/government/school-admin/terms/`
- `apps/desktop/renderer/app/government/school-admin/academic-grading/periods/`
- `apps/desktop/renderer/components/academic/AcademicFoundationPages.test.tsx` (all of its cases move to the drawer tests)

---

### Task 1: Deep-link helper

**Files:**
- Create: `apps/desktop/renderer/lib/academic-setup.ts`
- Test: `apps/desktop/renderer/lib/academic-setup.test.ts`

**Interfaces:**
- Produces:
  - `export const ACADEMIC_GRADING_PATH = '/government/school-admin/academic-grading'`
  - `export type SetupDrawerTarget = 'years' | 'terms' | 'periods'`
  - `export function academicSetupHref(drawer: SetupDrawerTarget, opts?: { yearId?: string }): string`
  - `export function parseSetupDrawerTarget(value: string): SetupDrawerTarget | null`

- [ ] **Step 1: Write the failing test**

`apps/desktop/renderer/lib/academic-setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { academicSetupHref, parseSetupDrawerTarget } from './academic-setup';

describe('academicSetupHref', () => {
  it.each([
    ['years', '/government/school-admin/academic-grading?open=years'],
    ['terms', '/government/school-admin/academic-grading?open=terms'],
    ['periods', '/government/school-admin/academic-grading?open=periods'],
  ] as const)('links %s to its drawer on the Academic Grading page', (drawer, href) => {
    expect(academicSetupHref(drawer)).toBe(href);
  });

  it('carries the year to open Terms on', () => {
    expect(academicSetupHref('terms', { yearId: 'y1' })).toBe('/government/school-admin/academic-grading?open=terms&yearId=y1');
  });

  it('encodes the year id', () => {
    expect(academicSetupHref('terms', { yearId: 'a&b' })).toBe('/government/school-admin/academic-grading?open=terms&yearId=a%26b');
  });

  it('omits an empty year id', () => {
    expect(academicSetupHref('terms', { yearId: '' })).toBe('/government/school-admin/academic-grading?open=terms');
  });
});

describe('parseSetupDrawerTarget', () => {
  it.each(['years', 'terms', 'periods'])('accepts %s', (value) => {
    expect(parseSetupDrawerTarget(value)).toBe(value);
  });

  it.each(['', 'setup', 'TERMS', 'windows', 'terms '])('rejects %j', (value) => {
    expect(parseSetupDrawerTarget(value)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/lib/academic-setup.test.ts`
Expected: FAIL — cannot resolve `./academic-setup`.

- [ ] **Step 3: Write the implementation**

`apps/desktop/renderer/lib/academic-setup.ts`:

```ts
/** Academic years, terms and assessment periods are managed in drawers on the
 * school-admin Academic Grading page. Links elsewhere in the app open the
 * right drawer through `?open=` (and `?yearId=` for Terms). The app is a
 * static export, so this is the only way old links can land in the right
 * place — there are no server redirects. */
export const ACADEMIC_GRADING_PATH = '/government/school-admin/academic-grading';

export type SetupDrawerTarget = 'years' | 'terms' | 'periods';

const TARGETS: readonly string[] = ['years', 'terms', 'periods'];

export function academicSetupHref(drawer: SetupDrawerTarget, opts: { yearId?: string } = {}): string {
  const params = new URLSearchParams({ open: drawer });
  if (opts.yearId) params.set('yearId', opts.yearId);
  return `${ACADEMIC_GRADING_PATH}?${params.toString()}`;
}

export function parseSetupDrawerTarget(value: string): SetupDrawerTarget | null {
  return TARGETS.includes(value) ? (value as SetupDrawerTarget) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/lib/academic-setup.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/lib/academic-setup.ts apps/desktop/renderer/lib/academic-setup.test.ts
git commit -m "feat(academic-setup): deep-link helper for setup drawers"
```

---

### Task 2: Shared drawer plumbing (types, hooks, shared UI, test support)

**Files:**
- Create: `apps/desktop/renderer/components/academic/foundation-ui.tsx`
- Modify: `apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx` (lines 15–35: remove the local `statusVariant`, `LoadState`, `FormField`; import them)
- Create: `apps/desktop/renderer/components/academic-grading/setup-drawers.ts`
- Create: `apps/desktop/renderer/components/academic-grading/use-escape-capture.ts`
- Create: `apps/desktop/renderer/components/academic-grading/setup-test-support.tsx`
- Test: `apps/desktop/renderer/components/academic-grading/setup-drawers.test.tsx`

**Interfaces:**
- Consumes: `SetupDrawerTarget` from Task 1.
- Produces:
  - `foundation-ui.tsx`: `export const statusVariant: (status: string) => 'success' | 'warning' | 'neutral'`; `export function LoadState(props: { state: { status: string; error?: { userMessage: string } }; emptyTitle: string; emptyDescription: string; action?: ReactNode }): JSX.Element | null`; `export function FormField({ children }: { children: ReactNode }): JSX.Element`
  - `setup-drawers.ts`: `export type SetupDrawer = 'setup' | SetupDrawerTarget`; `export type SetupNavigate = (drawer: SetupDrawer, opts?: { yearId?: string }) => void`; `export interface SetupDrawerProps { isOpen: boolean; onClose: () => void; onNavigate: SetupNavigate }`; `export function useOpenSession(isOpen: boolean): number`
  - `use-escape-capture.ts`: `export function useEscapeCapture(active: boolean, onEscape: () => void): void`
  - `setup-test-support.tsx`: `yearRow(over?)`, `termRow(over?)`, `stubNemis(opts?)`, `clearNemis()`, `renderWithLayer(ui)`, `field(label)` — signatures in Step 3.

- [ ] **Step 1: Write the failing hook tests**

`apps/desktop/renderer/components/academic-grading/setup-drawers.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook } from '@testing-library/react';
import { useOpenSession } from './setup-drawers';
import { useEscapeCapture } from './use-escape-capture';

describe('useOpenSession', () => {
  it('starts a new session each time the drawer goes from closed to open', () => {
    const { result, rerender } = renderHook(({ open }) => useOpenSession(open), { initialProps: { open: false } });
    const first = result.current;
    rerender({ open: true });
    const opened = result.current;
    expect(opened).not.toBe(first);
    rerender({ open: true });
    expect(result.current).toBe(opened);
    rerender({ open: false });
    expect(result.current).toBe(opened);
    rerender({ open: true });
    expect(result.current).not.toBe(opened);
  });
});

function Harness({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEscapeCapture(active, onEscape);
  return <input aria-label="field" />;
}

describe('useEscapeCapture', () => {
  it('handles Escape before a bubble-phase document listener sees it', () => {
    const drawerClose = vi.fn();
    document.addEventListener('keydown', drawerClose);
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Harness active onEscape={onEscape} />);
    fireEvent.keyDown(getByLabelText('field'), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(drawerClose).not.toHaveBeenCalled();
    document.removeEventListener('keydown', drawerClose);
  });

  it('ignores other keys', () => {
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Harness active onEscape={onEscape} />);
    fireEvent.keyDown(getByLabelText('field'), { key: 'Enter' });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('does nothing while inactive, so the drawer still closes', () => {
    const drawerClose = vi.fn();
    document.addEventListener('keydown', drawerClose);
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Harness active={false} onEscape={onEscape} />);
    fireEvent.keyDown(getByLabelText('field'), { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
    expect(drawerClose).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', drawerClose);
  });

  it('stops listening after unmount', () => {
    const onEscape = vi.fn();
    const { unmount } = render(<Harness active onEscape={onEscape} />);
    unmount();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/setup-drawers.test.tsx`
Expected: FAIL — cannot resolve `./setup-drawers` / `./use-escape-capture`.

- [ ] **Step 3: Write the implementation**

`apps/desktop/renderer/components/academic-grading/setup-drawers.ts`:

```ts
import { useState } from 'react';
import type { SetupDrawerTarget } from '@/lib/academic-setup';

/** The drawers on the Academic Grading page. 'setup' is the grading
 * configuration drawer; the rest are reachable by `?open=` deep links. */
export type SetupDrawer = 'setup' | SetupDrawerTarget;

/** Switch the page to another drawer (closing the current one). `yearId`
 * pre-selects the year when switching to Terms. */
export type SetupNavigate = (drawer: SetupDrawer, opts?: { yearId?: string }) => void;

export interface SetupDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: SetupNavigate;
}

/** A number that changes every time `isOpen` goes from false to true. Used as
 * the `key` of a drawer's body so each open starts fresh on the list view —
 * framer-motion's AnimatePresence would otherwise keep the old body (and a
 * half-filled form) if the drawer is reopened while its exit animation runs. */
export function useOpenSession(isOpen: boolean): number {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setSession((s) => s + 1);
  }
  return session;
}
```

`apps/desktop/renderer/components/academic-grading/use-escape-capture.ts`:

```ts
import { useEffect, useRef } from 'react';

/** While `active`, Escape calls `onEscape` and is stopped before anything else
 * sees it. The ui Drawer closes on a bubble-phase `keydown` listener on
 * `document`; React's synthetic stopPropagation can't reach that, but a
 * capture-phase listener on `document` runs first and can stop it. Used by the
 * setup drawers so Escape in a form returns to the list instead of closing
 * the drawer. */
export function useEscapeCapture(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      handler.current();
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [active]);
}
```

`apps/desktop/renderer/components/academic/foundation-ui.tsx` — move these three definitions out of `AcademicFoundationPages.tsx` verbatim (reformatted only), and export them:

```tsx
import type { ReactNode } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@nemis-desktop/ui';

export const statusVariant = (status: string) =>
  status === 'ACTIVE' ? 'success' : status === 'CLOSED' ? 'warning' : 'neutral';

export function LoadState({
  state,
  emptyTitle,
  emptyDescription,
  action,
}: {
  state: { status: string; error?: { userMessage: string } };
  emptyTitle: string;
  emptyDescription: string;
  action?: ReactNode;
}) {
  if (state.status === 'loading' || state.status === 'idle') return <Skeleton className="h-52 w-full rounded-card" />;
  if (state.status === 'error') return <ErrorState message={state.error?.userMessage ?? 'Unable to load local data.'} />;
  if (state.status === 'empty') return <EmptyState title={emptyTitle} description={emptyDescription} action={action} />;
  return null;
}

export function FormField({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}
```

In `AcademicFoundationPages.tsx`: delete the local `statusVariant` (line 17), `LoadState` (lines 29–34) and `FormField` (line 35) definitions and add:

```tsx
import { FormField, LoadState, statusVariant } from './foundation-ui';
```

Then remove `Skeleton` from the `@nemis-desktop/ui` import in `AcademicFoundationPages.tsx` only if nothing else in the file still uses it (`grep -n "Skeleton" apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx`). Keep `EmptyState`/`ErrorState` — `TermsPage` still uses them.

`apps/desktop/renderer/components/academic-grading/setup-test-support.tsx`:

```tsx
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';

/** Shared helpers for the academic-setup drawer tests. Each test file still
 * declares its own vi.mock('@/services/nemis-bridge/shared', …) — vi.mock is
 * hoisted per file. */

export const yearRow = (over: Record<string, unknown> = {}) => ({
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 2, classCount: 3, ...over,
});

export const termRow = (over: Record<string, unknown> = {}) => ({
  id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15',
  isCurrent: true, ...over,
});

/** The two years most tests use: an old closed year and the current one. */
export const OLD_YEAR = yearRow({ id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED', termCount: 3 });
export const CURRENT_YEAR = yearRow();

export function stubNemis({
  years = [OLD_YEAR, CURRENT_YEAR],
  terms = [],
  currentYear = null,
  academicYear = {},
  term = {},
}: {
  years?: unknown[];
  terms?: unknown[];
  currentYear?: unknown;
  academicYear?: Record<string, unknown>;
  term?: Record<string, unknown>;
} = {}) {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => currentYear), list: vi.fn(async () => years), ...academicYear },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => terms), ...term },
    identity: { getCurrentUser: vi.fn(async () => null) },
    device: { getInfo: vi.fn(async () => null) },
    teacher: { getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })) },
  };
}

export function clearNemis() {
  delete (window as unknown as { nemis?: unknown }).nemis;
}

export async function renderWithLayer(ui: ReactElement) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  return render(<PresentationProvider layer={layer}>{ui}</PresentationProvider>);
}

/** The ui Input/Select render a <label> without htmlFor, so getByLabelText
 * cannot resolve them; reach the control through its label's wrapper. */
export function field(label: string): HTMLInputElement & HTMLSelectElement {
  return screen.getByText(label).parentElement!.querySelector('input, select') as HTMLInputElement & HTMLSelectElement;
}
```

- [ ] **Step 4: Run tests to verify they pass, and that the refactor broke nothing**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/setup-drawers.test.tsx apps/desktop/renderer/components/academic`
Expected: PASS — the new hook tests plus the existing `AcademicFoundationPages.test.tsx` (10 tests) unchanged.

Run: `pnpm --filter @nemis-desktop/app typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic/foundation-ui.tsx apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx apps/desktop/renderer/components/academic-grading/setup-drawers.ts apps/desktop/renderer/components/academic-grading/use-escape-capture.ts apps/desktop/renderer/components/academic-grading/setup-test-support.tsx apps/desktop/renderer/components/academic-grading/setup-drawers.test.tsx
git commit -m "feat(academic-setup): drawer types, open-session and escape-capture hooks"
```

---

### Task 3: Academic Years drawer

**Files:**
- Create: `apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.tsx`
- Test: `apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.test.tsx`

**Interfaces:**
- Consumes: `SetupDrawerProps`, `SetupNavigate`, `useOpenSession` (Task 2); `useEscapeCapture` (Task 2); `FormField`, `LoadState`, `statusVariant` (Task 2); test support (Task 2).
- Produces: `export function AcademicYearsDrawer(props: SetupDrawerProps): JSX.Element`. The term-count button calls `onNavigate('terms', { yearId })` and has accessible name `` `${termCount} ${termCount === 1 ? 'term' : 'terms'} in ${code}` ``. Each row's edit button has accessible name `` `Edit ${code}` ``.

- [ ] **Step 1: Write the failing tests**

`apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })) },
}));

import { AcademicYearsDrawer } from './AcademicYearsDrawer';
import { CURRENT_YEAR, OLD_YEAR, clearNemis, field, renderWithLayer, stubNemis, yearRow } from './setup-test-support';

const props = () => ({ isOpen: true, onClose: vi.fn(), onNavigate: vi.fn() });

afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
});

describe('AcademicYearsDrawer list view', () => {
  it('opens Terms for a year from its term count', async () => {
    stubNemis();
    const p = props();
    await renderWithLayer(<AcademicYearsDrawer {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: '3 terms in 2024/2025' }));
    expect(p.onNavigate).toHaveBeenCalledWith('terms', { yearId: 'y0' });
  });

  it('uses the singular for a year with one term', async () => {
    stubNemis({ years: [yearRow({ termCount: 1 })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    expect(await screen.findByRole('button', { name: '1 term in 2025/2026' })).toBeInTheDocument();
  });

  it('keeps status actions out of the table', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await screen.findByRole('button', { name: 'Edit 2024/2025' });
    for (const name of ['Set current', 'Close', 'Archive', 'Restore']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('closes the drawer on Escape', async () => {
    stubNemis();
    const p = props();
    await renderWithLayer(<AcademicYearsDrawer {...p} />);
    await screen.findByRole('button', { name: 'Edit 2024/2025' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AcademicYearsDrawer form view', () => {
  it('swaps to the create form and back on Cancel', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create academic year' }));
    expect(screen.getByRole('heading', { name: 'Create Academic Year' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit 2024/2025' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Edit 2024/2025' })).toBeInTheDocument();
  });

  it('first Escape leaves the form, second Escape closes the drawer', async () => {
    stubNemis();
    const p = props();
    await renderWithLayer(<AcademicYearsDrawer {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create academic year' }));
    fireEvent.keyDown(field('Academic year code'), { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'Edit 2024/2025' })).toBeInTheDocument();
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('creates a year and returns to the list', async () => {
    const create = vi.fn(async () => yearRow({ id: 'y2', code: '2026/2027', isCurrent: false, termCount: 0, classCount: 0 }));
    stubNemis({ academicYear: { create } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create academic year' }));
    fireEvent.change(field('Academic year code'), { target: { value: '2026/2027' } });
    fireEvent.change(field('Start date'), { target: { value: '2026-09-01' } });
    fireEvent.change(field('End date'), { target: { value: '2027-07-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ code: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31' })));
    expect(await screen.findByRole('button', { name: 'Edit 2024/2025' })).toBeInTheDocument();
  });

  it('stays on the form with the typed values when the save fails', async () => {
    const create = vi.fn(async () => { throw new Error('Year overlaps 2025/2026'); });
    stubNemis({ academicYear: { create } });
    const p = props();
    await renderWithLayer(<AcademicYearsDrawer {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create academic year' }));
    fireEvent.change(field('Academic year code'), { target: { value: '2026/2027' } });
    fireEvent.change(field('Start date'), { target: { value: '2026-09-01' } });
    fireEvent.change(field('End date'), { target: { value: '2027-07-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Create Academic Year' })).toBeInTheDocument();
    expect(field('Academic year code')).toHaveValue('2026/2027');
    expect(p.onClose).not.toHaveBeenCalled();
  });
});

describe('AcademicYearsDrawer status actions (edit view)', () => {
  const openEdit = async (code: string) => {
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${code}` }));
    expect(screen.getByRole('heading', { name: 'Edit Academic Year' })).toBeInTheDocument();
  };
  const shown = () => ['Set current', 'Close', 'Archive', 'Restore'].filter((name) => screen.queryByRole('button', { name }));

  it('offers Archive and Restore for a closed year', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit(OLD_YEAR.code);
    expect(shown()).toEqual(['Archive', 'Restore']);
  });

  it('offers no status change for the current year', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit(CURRENT_YEAR.code);
    expect(shown()).toEqual([]);
  });

  it('offers Set current, Close and Archive for an active non-current year', async () => {
    stubNemis({ years: [yearRow({ id: 'y3', code: '2026/2027', isCurrent: false })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2026/2027');
    expect(shown()).toEqual(['Set current', 'Close', 'Archive']);
  });

  it('offers only Restore for an archived year', async () => {
    stubNemis({ years: [yearRow({ id: 'y4', code: '2020/2021', isCurrent: false, status: 'ARCHIVED' })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2020/2021');
    expect(shown()).toEqual(['Restore']);
  });

  it('confirms, changes the status and returns to the list', async () => {
    const setStatus = vi.fn(async () => yearRow({ id: 'y0', code: '2024/2025', isCurrent: false, status: 'ARCHIVED' }));
    stubNemis({ academicYear: { setStatus } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit(OLD_YEAR.code);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(window.confirm).toHaveBeenCalledWith('Change 2024/2025 to archived?');
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'y0', status: 'ARCHIVED' })));
    expect(await screen.findByRole('button', { name: 'Edit 2024/2025' })).toBeInTheDocument();
  });

  it('does nothing when the confirmation is declined', async () => {
    const setStatus = vi.fn();
    stubNemis({ academicYear: { setStatus } });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit(OLD_YEAR.code);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(setStatus).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Edit Academic Year' })).toBeInTheDocument();
  });
});
```

Note on `confirm` text: today's code builds it with `status.toLowerCase()` where status is the enum value (`'ARCHIVED'` → `'archived'`), so the expected string is `'Change 2024/2025 to archived?'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.test.tsx`
Expected: FAIL — cannot resolve `./AcademicYearsDrawer`.

- [ ] **Step 3: Write the implementation**

`apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.tsx`:

```tsx
'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { AcademicYearStatus } from '@nemis-desktop/types';
import type { AcademicYearRowView } from '@nemis-desktop/presentation';
import { Badge, Button, Drawer, Input } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { FormField, LoadState, statusVariant } from '@/components/academic/foundation-ui';
import { useEscapeCapture } from './use-escape-capture';
import { useOpenSession, type SetupDrawerProps, type SetupNavigate } from './setup-drawers';

type YearStatus = (typeof AcademicYearStatus)[keyof typeof AcademicYearStatus];

/** Academic years, managed from a drawer on the Academic Grading page.
 * Create/edit swap the drawer body to a form — a Modal can't stack inside the
 * transformed Drawer. A year's status actions live in its edit form so the
 * table fits the drawer width. */
export function AcademicYearsDrawer({ isOpen, onClose, onNavigate }: SetupDrawerProps) {
  const session = useOpenSession(isOpen);
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Academic Years" size="xl">
      <AcademicYearsManager key={session} onNavigate={onNavigate} />
    </Drawer>
  );
}

function AcademicYearsManager({ onNavigate }: { onNavigate: SetupNavigate }) {
  const vm = useAcademicFoundationViewModel();
  const state = useViewModel(vm.store, (s) => s.academicYears);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<AcademicYearRowView | null>(null);
  const [code, setCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [makeCurrent, setMakeCurrent] = useState(false);
  const backToList = useCallback(() => setView('list'), []);
  useEscapeCapture(view === 'form', backToList);
  useRevalidateOnSync(() => { void vm.loadAcademicYears(); }, [vm]);

  const begin = (year?: AcademicYearRowView) => {
    setEditing(year ?? null);
    setCode(year?.code ?? '');
    setStartDate(year?.startDate ?? '');
    setEndDate(year?.endDate ?? '');
    setMakeCurrent(year?.isCurrent ?? false);
    setView('form');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = editing
      ? await vm.updateAcademicYear({ id: editing.id, code, startDate, endDate })
      : await vm.createAcademicYear({ code, startDate, endDate, makeCurrent });
    if (result.ok) setView('list');
  };

  const setStatus = async (year: AcademicYearRowView, status: YearStatus) => {
    if (!window.confirm(`Change ${year.code} to ${status.toLowerCase()}?`)) return;
    const result = await vm.setAcademicYearStatus(year.id, status);
    if (result.ok) setView('list');
  };

  const setCurrent = async (year: AcademicYearRowView) => {
    const result = await vm.setCurrentAcademicYear(year.id);
    if (result.ok) setView('list');
  };

  if (view === 'form') {
    return (
      <div className="space-y-6">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <h3 className="font-semibold text-slate-900">{editing ? 'Edit Academic Year' : 'Create Academic Year'}</h3>
          <Input label="Academic year code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="2026/2027" />
          <FormField>
            <Input label="Start date" required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="End date" required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
          {!editing && (
            <label className="flex gap-2 text-sm">
              <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} /> Make this the current academic year
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={backToList}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
        {editing && (
          <section className="space-y-3 border-t border-slate-200 pt-4">
            <h4 className="text-sm font-semibold text-slate-900">Status</h4>
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Badge variant={statusVariant(editing.status)} size="sm">{editing.status}</Badge>
              {editing.isCurrent && <span>Current academic year</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {editing.status === 'ACTIVE' && !editing.isCurrent && (
                <Button type="button" size="sm" onClick={() => void setCurrent(editing)}>Set current</Button>
              )}
              {editing.status === 'ACTIVE' && !editing.isCurrent && (
                <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus(editing, AcademicYearStatus.CLOSED)}>Close</Button>
              )}
              {editing.status !== 'ARCHIVED' && !editing.isCurrent && (
                <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus(editing, AcademicYearStatus.ARCHIVED)}>Archive</Button>
              )}
              {editing.status !== 'ACTIVE' && (
                <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus(editing, AcademicYearStatus.ACTIVE)}>Restore</Button>
              )}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => begin()}>Create academic year</Button>
      </div>
      <LoadState state={state} emptyTitle="No Academic Year has been configured." emptyDescription="Create an academic year before setting up terms and classes." />
      {(state.status === 'success' || state.status === 'refreshing') && (
        <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="p-3">Code</th>
                <th className="p-3">Period</th>
                <th className="p-3">Status</th>
                <th className="p-3">Terms</th>
                <th className="p-3">Classes</th>
                <th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((year) => (
                <tr key={year.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    {year.code}
                    {year.isCurrent && <Badge className="ml-2" size="sm">Current</Badge>}
                  </td>
                  <td className="p-3">{year.startDate} — {year.endDate}</td>
                  <td className="p-3"><Badge variant={statusVariant(year.status)} size="sm">{year.status}</Badge></td>
                  <td className="p-3">
                    <button
                      type="button"
                      className="text-blue-700 hover:underline"
                      onClick={() => onNavigate('terms', { yearId: year.id })}
                      aria-label={`${year.termCount} ${year.termCount === 1 ? 'term' : 'terms'} in ${year.code}`}
                    >
                      {year.termCount}
                    </button>
                  </td>
                  <td className="p-3">{year.classCount}</td>
                  <td className="p-3">
                    <Button size="sm" variant="secondary" onClick={() => begin(year)} aria-label={`Edit ${year.code}`}>Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

If `Button` does not forward `aria-label` (check `packages/ui/src/Button.tsx` spreads `...props` onto `<button>`), the test lookup `{ name: 'Edit 2024/2025' }` fails. In that case render `<span className="sr-only"> {year.code}</span>` inside the button instead of `aria-label`, giving the accessible name "Edit 2024/2025".

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.test.tsx`
Expected: PASS (all cases). If the save-failure test shows an unhandled rejection, check that the view model's command pipeline catches it (it is documented "Never throws" in `packages/presentation/src/core/async-runner.ts`); do not add a try/catch in the component.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.tsx apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.test.tsx
git commit -m "feat(academic-setup): Academic Years drawer with in-drawer form view"
```

---

### Task 4: Terms drawer

**Files:**
- Create: `apps/desktop/renderer/components/academic-grading/TermsDrawer.tsx`
- Test: `apps/desktop/renderer/components/academic-grading/TermsDrawer.test.tsx`
- Modify: `apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx` — delete the local `initialYearId` (lines 19–24) and import it from the drawer so `TermsPage` keeps working until Task 9.
- Modify: `apps/desktop/renderer/components/academic/AcademicFoundationPages.test.tsx` — delete the `describe('initialYearId', …)` block (it moves to `TermsDrawer.test.tsx`) and change the import to `import { AcademicYearsPage, TermsPage } from './AcademicFoundationPages';`.

**Interfaces:**
- Consumes: Task 2 types/hooks/UI/test support.
- Produces:
  - `export function initialYearId(years: readonly { id: string; isCurrent: boolean }[], requested: string): string` (same body as today)
  - `export interface TermsDrawerProps extends SetupDrawerProps { yearId?: string }`
  - `export function TermsDrawer(props: TermsDrawerProps): JSX.Element`
  - Empty-years state button "Create academic year" calls `onNavigate('years')`.

- [ ] **Step 1: Write the failing tests**

`apps/desktop/renderer/components/academic-grading/TermsDrawer.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })) },
}));

import { TermsDrawer, initialYearId } from './TermsDrawer';
import { clearNemis, field, renderWithLayer, stubNemis, termRow } from './setup-test-support';

const props = (yearId?: string) => ({ isOpen: true, onClose: vi.fn(), onNavigate: vi.fn(), yearId });

afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
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

describe('TermsDrawer', () => {
  it('opens on the year it was given', async () => {
    stubNemis();
    await renderWithLayer(<TermsDrawer {...props('y0')} />);
    await waitFor(() => expect(field('Academic year')).toHaveValue('y0'));
  });

  it('opens on the current year when the given year is not on this device', async () => {
    stubNemis();
    await renderWithLayer(<TermsDrawer {...props('deleted-year')} />);
    await waitFor(() => expect(field('Academic year')).toHaveValue('y1'));
  });

  it('opens on the current year when no year is given', async () => {
    stubNemis();
    await renderWithLayer(<TermsDrawer {...props()} />);
    await waitFor(() => expect(field('Academic year')).toHaveValue('y1'));
  });

  it('sends the admin to the Academic Years drawer when none exist yet', async () => {
    stubNemis({ years: [] });
    const p = props();
    await renderWithLayer(<TermsDrawer {...p} />);
    expect(await screen.findByText('No academic year yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create term' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create academic year' }));
    expect(p.onNavigate).toHaveBeenCalledWith('years');
  });

  it('lists the selected year\'s terms', async () => {
    stubNemis({ terms: [termRow()] });
    await renderWithLayer(<TermsDrawer {...props()} />);
    expect(await screen.findByText('Term 1')).toBeInTheDocument();
  });

  it('first Escape leaves the form, second Escape closes the drawer', async () => {
    stubNemis({ terms: [termRow()] });
    const p = props();
    await renderWithLayer(<TermsDrawer {...p} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create term' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Create term' }));
    expect(screen.getByRole('heading', { name: 'Create Term' })).toBeInTheDocument();
    fireEvent.keyDown(field('Term name'), { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'Create term' })).toBeInTheDocument();
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('creates a term in the selected year and returns to the list', async () => {
    const create = vi.fn(async () => termRow({ id: 't2', name: 'Term 2', sequence: 2, isCurrent: false }));
    stubNemis({ terms: [termRow()], term: { create } });
    await renderWithLayer(<TermsDrawer {...props()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create term' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Create term' }));
    fireEvent.change(field('Term name'), { target: { value: 'Term 2' } });
    fireEvent.change(field('Term position'), { target: { value: '2' } });
    fireEvent.change(field('Start date'), { target: { value: '2026-01-05' } });
    fireEvent.change(field('End date'), { target: { value: '2026-04-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ academicYearId: 'y1', name: 'Term 2', sequence: 2 })));
    expect(await screen.findByRole('button', { name: 'Create term' })).toBeInTheDocument();
  });

  it('stays on the form with the typed values when the save fails', async () => {
    const create = vi.fn(async () => { throw new Error('Dates overlap Term 1'); });
    stubNemis({ terms: [termRow()], term: { create } });
    const p = props();
    await renderWithLayer(<TermsDrawer {...p} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create term' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Create term' }));
    fireEvent.change(field('Term name'), { target: { value: 'Term 2' } });
    fireEvent.change(field('Term position'), { target: { value: '2' } });
    fireEvent.change(field('Start date'), { target: { value: '2026-01-05' } });
    fireEvent.change(field('End date'), { target: { value: '2026-04-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Create Term' })).toBeInTheDocument();
    expect(field('Term name')).toHaveValue('Term 2');
    expect(p.onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/TermsDrawer.test.tsx`
Expected: FAIL — cannot resolve `./TermsDrawer`.

- [ ] **Step 3: Write the implementation**

`apps/desktop/renderer/components/academic-grading/TermsDrawer.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { TermRowView } from '@nemis-desktop/presentation';
import { Badge, Button, Drawer, EmptyState, ErrorState, Input, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { FormField, LoadState } from '@/components/academic/foundation-ui';
import { useEscapeCapture } from './use-escape-capture';
import { useOpenSession, type SetupDrawerProps, type SetupNavigate } from './setup-drawers';

/** The year the Terms drawer opens on: the requested one when it is on this
 * device, else the current year, else the first. */
export function initialYearId(years: readonly { id: string; isCurrent: boolean }[], requested: string): string {
  if (requested && years.some((y) => y.id === requested)) return requested;
  return (years.find((y) => y.isCurrent) ?? years[0])?.id ?? '';
}

export interface TermsDrawerProps extends SetupDrawerProps {
  /** Year to open on (from `?yearId=` or the Academic Years drawer). */
  yearId?: string;
}

/** Terms of an academic year, managed from a drawer on the Academic Grading
 * page. Create/edit swap the drawer body to a form (see AcademicYearsDrawer). */
export function TermsDrawer({ isOpen, onClose, onNavigate, yearId = '' }: TermsDrawerProps) {
  const session = useOpenSession(isOpen);
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Terms" size="xl">
      <TermsManager key={session} requestedYearId={yearId} onNavigate={onNavigate} />
    </Drawer>
  );
}

function TermsManager({ requestedYearId, onNavigate }: { requestedYearId: string; onNavigate: SetupNavigate }) {
  const vm = useAcademicFoundationViewModel();
  const years = useViewModel(vm.store, (s) => s.academicYears);
  const terms = useViewModel(vm.store, (s) => s.terms);
  const [selectedYear, setSelectedYear] = useState('');
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<TermRowView | null>(null);
  const [name, setName] = useState('');
  const [sequence, setSequence] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [makeCurrent, setMakeCurrent] = useState(false);
  const [termsPerYear, setTermsPerYear] = useState(2);
  const backToList = useCallback(() => setView('list'), []);
  useEscapeCapture(view === 'form', backToList);

  useRevalidateOnSync(() => { void vm.loadAcademicYears(); }, [vm]);
  useEffect(() => {
    void sharedBridge.listSchoolAdminRecords({ collection: 'institution_grading_configs', limit: 1 }).then((result) => {
      const value = result.items[0]?.termsPerYear;
      if (typeof value === 'number') setTermsPerYear(value);
    });
  }, []);
  useEffect(() => {
    if ((years.status === 'success' || years.status === 'refreshing') && selectedYear === '') {
      const id = initialYearId(years.data, requestedYearId);
      if (id) setSelectedYear(id);
    }
  }, [years, selectedYear, requestedYearId]);
  useRevalidateOnSync(() => { if (selectedYear) void vm.loadTerms(selectedYear); }, [vm, selectedYear]);

  const begin = (term?: TermRowView) => {
    setEditing(term ?? null);
    setName(term?.name ?? '');
    setSequence(term ? String(term.sequence) : '');
    setStartDate(term?.startDate ?? '');
    setEndDate(term?.endDate ?? '');
    setMakeCurrent(term?.isCurrent ?? false);
    setView('form');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = editing
      ? await vm.updateTerm({ id: editing.id, name, sequence: Number(sequence), startDate, endDate }, selectedYear)
      : await vm.createTerm({ academicYearId: selectedYear, name, sequence: Number(sequence), startDate, endDate, makeCurrent });
    if (result.ok) setView('list');
  };

  const yearsReady = years.status === 'success' || years.status === 'refreshing';
  const yearOptions = yearsReady ? years.data.map((year) => ({ value: year.id, label: year.code })) : [];
  const positionOptions = Array.from({ length: termsPerYear }, (_, i) => ({ value: String(i + 1), label: `Term ${i + 1}` }));

  if (view === 'form') {
    return (
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <h3 className="font-semibold text-slate-900">{editing ? 'Edit Term' : 'Create Term'}</h3>
        <Input label="Term name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Term position" required value={sequence} onChange={(e) => setSequence(e.target.value)} options={positionOptions} placeholder="Select position" />
        <FormField>
          <Input label="Start date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End date" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
        {!editing && (
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} /> Make this the current term
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={backToList}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[14rem] flex-1">
          <Select label="Academic year" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} options={yearOptions} placeholder="Select academic year" />
        </div>
        <Button disabled={!selectedYear} onClick={() => begin()}>Create term</Button>
      </div>
      {years.status === 'empty' ? (
        <EmptyState
          title="No academic year yet."
          description="Create an academic year before adding its terms."
          action={<Button onClick={() => onNavigate('years')}>Create academic year</Button>}
        />
      ) : years.status === 'error' ? (
        <ErrorState message={years.error.userMessage} />
      ) : (
        <LoadState state={terms} emptyTitle="No terms have been created." emptyDescription="Create terms within the selected academic year." />
      )}
      {yearsReady && (terms.status === 'success' || terms.status === 'refreshing') && (
        <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="p-3">Term</th>
                <th className="p-3">Period</th>
                <th className="p-3">Status</th>
                <th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {terms.data.map((term) => (
                <tr key={term.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    {term.name} <span className="text-xs font-normal text-slate-500">(Term {term.sequence})</span>
                  </td>
                  <td className="p-3">{term.startDate} — {term.endDate}</td>
                  <td className="p-3">{term.isCurrent ? <Badge variant="success" size="sm">Current</Badge> : '—'}</td>
                  <td className="flex gap-2 p-3">
                    <Button size="sm" variant="secondary" onClick={() => begin(term)}>Edit</Button>
                    {!term.isCurrent && (
                      <Button size="sm" onClick={() => void vm.setCurrentTerm(term.id, selectedYear)}>Set current</Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (window.confirm(`Delete ${term.name}?`)) void vm.deleteTerm(term.id, selectedYear);
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

In `AcademicFoundationPages.tsx`: delete the `initialYearId` function and its comment (lines 19–24) and add `import { initialYearId } from '@/components/academic-grading/TermsDrawer';`. Apply the test-file edits listed under **Files**.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/TermsDrawer.test.tsx apps/desktop/renderer/components/academic`
Expected: PASS — new Terms drawer tests; `AcademicFoundationPages.test.tsx` now 5 tests, all passing.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/TermsDrawer.tsx apps/desktop/renderer/components/academic-grading/TermsDrawer.test.tsx apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx apps/desktop/renderer/components/academic/AcademicFoundationPages.test.tsx
git commit -m "feat(academic-setup): Terms drawer with in-drawer form view"
```

---

### Task 5: Assessment Periods drawer + panel cross-links

**Files:**
- Modify: `apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.tsx` (imports at lines 3–11; comment at lines 21–26; signature at line 27; links at lines 203–220)
- Modify: `apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.test.tsx`
- Create: `apps/desktop/renderer/components/academic-grading/AssessmentPeriodsDrawer.tsx`
- Test: `apps/desktop/renderer/components/academic-grading/AssessmentPeriodsDrawer.test.tsx`

**Interfaces:**
- Consumes: `academicSetupHref` (Task 1); `SetupDrawerProps`, `SetupNavigate` (Task 2).
- Produces: `export function GradingPeriodsPanel({ onNavigate }?: { onNavigate?: SetupNavigate }): JSX.Element`; `export function AssessmentPeriodsDrawer(props: SetupDrawerProps): JSX.Element`.

- [ ] **Step 1: Update and add the failing tests**

In `GradingPeriodsPanel.test.tsx`:
- Change `renderPanel` to accept props:

```tsx
async function renderPanel(props: { onNavigate?: () => void } = {}) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  return render(
    <PresentationProvider layer={layer}>
      <GradingPeriodsPanel {...props} />
    </PresentationProvider>,
  );
}
```

- Change the two href expectations:

```tsx
    expect(await screen.findByRole('link', { name: 'Create terms' })).toHaveAttribute('href', '/government/school-admin/academic-grading?open=terms');
```

```tsx
    expect(await screen.findByRole('link', { name: 'Set up an academic year' })).toHaveAttribute(
      'href',
      '/government/school-admin/academic-grading?open=years',
    );
```

- Add `fireEvent` to the `@testing-library/react` import, and add two tests inside the `describe`:

```tsx
  it('switches to the Terms drawer instead of navigating when hosted in a drawer', async () => {
    stubNemis({ year: YEAR, terms: [] });
    const onNavigate = vi.fn();
    await renderPanel({ onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: 'Create terms' }));
    expect(onNavigate).toHaveBeenCalledWith('terms');
    expect(screen.queryByRole('link', { name: 'Create terms' })).toBeNull();
  });

  it('switches to the Academic Years drawer when there is no current year', async () => {
    stubNemis({ year: null, terms: [] });
    const onNavigate = vi.fn();
    await renderPanel({ onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: 'Set up an academic year' }));
    expect(onNavigate).toHaveBeenCalledWith('years');
  });
```

`AssessmentPeriodsDrawer.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })),
    saveSchoolAdminRecord: vi.fn(),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { AssessmentPeriodsDrawer } from './AssessmentPeriodsDrawer';
import { CURRENT_YEAR, clearNemis, renderWithLayer, stubNemis } from './setup-test-support';

afterEach(() => clearNemis());

describe('AssessmentPeriodsDrawer', () => {
  it('shows the periods panel and routes its prompts to other drawers', async () => {
    stubNemis({ currentYear: CURRENT_YEAR, terms: [] });
    const onNavigate = vi.fn();
    await renderWithLayer(<AssessmentPeriodsDrawer isOpen onClose={vi.fn()} onNavigate={onNavigate} />);
    expect(screen.getByRole('heading', { name: 'Assessment Periods' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Create terms' }));
    expect(onNavigate).toHaveBeenCalledWith('terms');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.test.tsx apps/desktop/renderer/components/academic-grading/AssessmentPeriodsDrawer.test.tsx`
Expected: FAIL — old hrefs, no `button` named "Create terms", and `./AssessmentPeriodsDrawer` missing.

- [ ] **Step 3: Write the implementation**

In `GradingPeriodsPanel.tsx`:
- Change the React import to `import { useEffect, useState, type FormEvent, type ReactNode } from 'react';`
- Add imports:

```tsx
import { academicSetupHref, type SetupDrawerTarget } from '@/lib/academic-setup';
import type { SetupNavigate } from './setup-drawers';
```

- Replace the doc comment and signature (lines 21–27) with:

```tsx
/** Assessment (grading) periods scoped to a term — the body of the Assessment
 * Periods drawer on the Academic Grading page, mirroring portal-web's
 * grading-periods page, including "Auto Setup All Periods" (computed
 * client-side from the institution's real periodsPerTerm config and the
 * term's real start/end dates, then saved one row at a time through the same
 * generic collection API used for manual create). Inside the drawer,
 * `onNavigate` switches to the Years/Terms drawers; without it the prompts
 * are plain deep links. */
export function GradingPeriodsPanel({ onNavigate }: { onNavigate?: SetupNavigate } = {}) {
```

- Replace the two `<Link …>` prompts (currently `href="/government/school-admin/academic-years"` and `href="/government/school-admin/terms"`) with:

```tsx
                <SetupLink target="years" onNavigate={onNavigate}>
                  Set up an academic year
                </SetupLink>
```

```tsx
                <SetupLink target="terms" onNavigate={onNavigate}>
                  Create terms
                </SetupLink>
```

- Add at the bottom of the file:

```tsx
function SetupLink({ target, onNavigate, children }: { target: SetupDrawerTarget; onNavigate?: SetupNavigate; children: ReactNode }) {
  const className = 'text-blue-700 hover:underline';
  return onNavigate ? (
    <button type="button" className={className} onClick={() => onNavigate(target)}>
      {children}
    </button>
  ) : (
    <Link href={academicSetupHref(target)} className={className}>
      {children}
    </Link>
  );
}
```

Note the test asserts `toHaveBeenCalledWith('terms')` — exactly one argument — so call `onNavigate(target)`, not `onNavigate(target, {})`.

`AssessmentPeriodsDrawer.tsx`:

```tsx
'use client';

import { Drawer } from '@nemis-desktop/ui';
import { GradingPeriodsPanel } from './GradingPeriodsPanel';
import type { SetupDrawerProps } from './setup-drawers';

/** Assessment periods, managed from a drawer on the Academic Grading page.
 * The panel's create/edit form is already inline, so no form view is needed. */
export function AssessmentPeriodsDrawer({ isOpen, onClose, onNavigate }: SetupDrawerProps) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Assessment Periods" size="xl">
      <GradingPeriodsPanel onNavigate={onNavigate} />
    </Drawer>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.test.tsx apps/desktop/renderer/components/academic-grading/AssessmentPeriodsDrawer.test.tsx`
Expected: PASS (8 panel tests + 1 drawer test).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.tsx apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.test.tsx apps/desktop/renderer/components/academic-grading/AssessmentPeriodsDrawer.tsx apps/desktop/renderer/components/academic-grading/AssessmentPeriodsDrawer.test.tsx
git commit -m "feat(academic-setup): Assessment Periods drawer; panel prompts switch drawers"
```

---

### Task 6: Wire the drawers into AcademicGradingPage

**Files:**
- Modify: `apps/desktop/renderer/components/academic-grading/AcademicGradingPage.tsx`
- Test: `apps/desktop/renderer/components/academic-grading/AcademicGradingPage.test.tsx`

**Interfaces:**
- Consumes: `parseSetupDrawerTarget` (Task 1); `SetupDrawer`, `SetupNavigate` (Task 2); `AcademicYearsDrawer` (Task 3); `TermsDrawer` (Task 4); `AssessmentPeriodsDrawer` (Task 5); `queryParam` from `@/components/teachers/shared`.
- Produces: page behaviour only.

- [ ] **Step 1: Write the failing tests**

`apps/desktop/renderer/components/academic-grading/AcademicGradingPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })),
    saveSchoolAdminRecord: vi.fn(),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { AcademicGradingPage } from './AcademicGradingPage';
import { CURRENT_YEAR, clearNemis, field, renderWithLayer, stubNemis } from './setup-test-support';

const drawerHeading = (name: string) => screen.findByRole('heading', { level: 2, name });

afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('AcademicGradingPage', () => {
  it('shows the setup cards in dependency order', async () => {
    stubNemis();
    await renderWithLayer(<AcademicGradingPage />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Grading Configuration',
      'Academic Years',
      'Terms',
      'Assessment Periods',
      'Grade Entry Windows',
      'Grade Entry',
    ]);
  });

  it('puts the year and term steps into the quick start guide', async () => {
    stubNemis();
    await renderWithLayer(<AcademicGradingPage />);
    const order = ['Configure the Grading System', 'Create the Academic Year', 'Add Terms', 'Create Assessment Periods', 'Open Grade Entry Windows', 'Review and Publish'];
    const nodes = order.map((t) => screen.getByText(t));
    for (let i = 1; i < nodes.length; i += 1) {
      expect(nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it.each([
    ['Manage Years', 'Academic Years'],
    ['Manage Terms', 'Terms'],
    ['Manage Periods', 'Assessment Periods'],
  ])('%s opens the %s drawer', async (action, title) => {
    stubNemis({ currentYear: CURRENT_YEAR });
    await renderWithLayer(<AcademicGradingPage />);
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(await drawerHeading(title)).toBeInTheDocument();
  });

  it('opens the drawer named in ?open=, on the year named in ?yearId=', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?open=terms&yearId=y0');
    await renderWithLayer(<AcademicGradingPage />);
    expect(await drawerHeading('Terms')).toBeInTheDocument();
    await waitFor(() => expect(field('Academic year')).toHaveValue('y0'));
  });

  it.each(['setup', 'bogus', ''])('opens nothing for ?open=%s', async (value) => {
    stubNemis();
    window.history.replaceState({}, '', `/?open=${value}`);
    await renderWithLayer(<AcademicGradingPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Academic Grading' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close drawer' })).toBeNull();
  });

  it('drops the query string when the drawer closes, so it does not reopen', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?open=years');
    await renderWithLayer(<AcademicGradingPage />);
    await drawerHeading('Academic Years');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(replace).toHaveBeenCalledWith(null, '', '/');
  });

  it('follows a year\'s term count from the Years drawer into the Terms drawer', async () => {
    stubNemis();
    await renderWithLayer(<AcademicGradingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage Years' }));
    fireEvent.click(await screen.findByRole('button', { name: '3 terms in 2024/2025' }));
    expect(await drawerHeading('Terms')).toBeInTheDocument();
    await waitFor(() => expect(field('Academic year')).toHaveValue('y0'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/AcademicGradingPage.test.tsx`
Expected: FAIL — card order has 4 entries, no "Manage Years" button, guide lacks the new steps.

- [ ] **Step 3: Write the implementation**

In `AcademicGradingPage.tsx`:

Replace the imports and `ModalKey`/`GUIDE_STEPS` block (lines 1–33) with:

```tsx
'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, CalendarDays, CalendarRange, ClipboardList, DoorOpen, PenLine } from 'lucide-react';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { parseSetupDrawerTarget } from '@/lib/academic-setup';
import { queryParam } from '@/components/teachers/shared';
import { GradingConfigDrawer } from './GradingConfigDrawer';
import { AcademicYearsDrawer } from './AcademicYearsDrawer';
import { TermsDrawer } from './TermsDrawer';
import { AssessmentPeriodsDrawer } from './AssessmentPeriodsDrawer';
import type { SetupDrawer, SetupNavigate } from './setup-drawers';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

const GUIDE_STEPS = [
  {
    title: 'Configure the Grading System',
    body: 'Start here. Set your maximum marks, passing mark, number of terms per year, and periods per term. Also define your grade scale (A, B, C…).',
  },
  {
    title: 'Create the Academic Year',
    body: 'Add the school year with its start and end dates and set it as current. Terms, classes and reports all belong to the current year.',
  },
  {
    title: 'Add Terms',
    body: 'Add the terms in the academic year — how many comes from "terms per year" in the grading system — and set the current term.',
  },
  {
    title: 'Create Assessment Periods',
    body: 'Define the academic periods teachers will be submitting grades for. Each period has a start date, end date, and status (Upcoming, Active, or Completed).',
  },
  {
    title: 'Open Grade Entry Windows',
    body: 'A grade entry window controls whether teachers can submit grades for a grading period. Create a window, set the open and close dates, then open it so teachers can submit.',
  },
  {
    title: 'Review and Publish',
    body: 'Once a window closes, review the submitted grades and publish them so students and guardians can see their results.',
  },
];
```

Replace the doc comment + the first lines of the component (state through `useRevalidateOnSync`) with:

```tsx
/** School-admin Academic Grading landing page — mirrors portal-web's
 * academic-grading/page.tsx (GradingSystemManagement + Quick Start Guide), and
 * is also where the school's yearly setup lives: grading configuration,
 * academic years, terms and assessment periods each open in a drawer, in
 * dependency order. Links elsewhere open a drawer with ?open= (see
 * lib/academic-setup.ts). Grade Entry stays disabled here: that's a teacher
 * task (recording marks against an open window), the same split already
 * applied to Attendance — school admins configure and review, teachers enter. */
export function AcademicGradingPage() {
  const [windows, setWindows] = useState<SchoolAdminRecord[] | null>(null);
  const [activeModal, setActiveModal] = useState<SetupDrawer | null>(null);
  const [termsYearId, setTermsYearId] = useState('');

  useRevalidateOnSync(() => {
    void sharedBridge
      .listSchoolAdminRecords({ collection: 'grade_entry_windows', limit: 250 })
      .then((result) => setWindows(result.items));
  }, []);

  // Deep links (?open=terms&yearId=…) are read once on mount; in-page switches
  // go through `navigate`, since a Link to this same route would not remount.
  useEffect(() => {
    const target = parseSetupDrawerTarget(queryParam('open'));
    if (!target) return;
    setTermsYearId(queryParam('yearId'));
    setActiveModal(target);
  }, []);

  const navigate: SetupNavigate = useCallback((drawer, opts) => {
    setTermsYearId(opts?.yearId ?? '');
    setActiveModal(drawer);
  }, []);

  const close = useCallback(() => {
    setActiveModal(null);
    setTermsYearId('');
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);
```

Replace the four `<FeatureCard …/>` elements with six:

```tsx
          <FeatureCard
            icon={<ClipboardList className="h-6 w-6 text-primary" />}
            title="Grading Configuration"
            description="Set up institution-wide grading rules, grade scales, and policies."
            action="Configure System"
            onClick={() => navigate('setup')}
          />
          <FeatureCard
            icon={<CalendarRange className="h-6 w-6 text-slate-500" />}
            title="Academic Years"
            description="Create the school year, set the current one, and close or archive past years."
            action="Manage Years"
            onClick={() => navigate('years')}
          />
          <FeatureCard
            icon={<CalendarDays className="h-6 w-6 text-slate-500" />}
            title="Terms"
            description="Add the terms in each academic year and choose the current term."
            action="Manage Terms"
            onClick={() => navigate('terms')}
          />
          <FeatureCard
            icon={<CalendarClock className="h-6 w-6 text-slate-500" />}
            title="Assessment Periods"
            description="Create and manage the assessment periods in each term."
            action="Manage Periods"
            onClick={() => navigate('periods')}
          />
          <FeatureCard
            icon={<DoorOpen className="h-6 w-6 text-slate-500" />}
            title="Grade Entry Windows"
            description="Control when teachers can enter and submit grades."
            action="Manage Windows"
            href="/government/school-admin/academic-grading/windows"
          />
          <FeatureCard
            icon={<PenLine className="h-6 w-6 text-slate-400" />}
            title="Grade Entry"
            description="Teachers enter grades once a window is open — not a school-admin task on this device."
            action="Enter Grades"
            disabled
          />
```

Replace the single `<GradingConfigDrawer … />` at the bottom with:

```tsx
      <GradingConfigDrawer isOpen={activeModal === 'setup'} onClose={close} />
      <AcademicYearsDrawer isOpen={activeModal === 'years'} onClose={close} onNavigate={navigate} />
      <TermsDrawer isOpen={activeModal === 'terms'} onClose={close} onNavigate={navigate} yearId={termsYearId} />
      <AssessmentPeriodsDrawer isOpen={activeModal === 'periods'} onClose={close} onNavigate={navigate} />
```

Delete the now-unused `type ModalKey = 'setup' | null;`. `StatCard` and `FeatureCard` are unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading`
Expected: PASS — the new page tests plus every drawer/panel/hook test from Tasks 2–5.

Run: `pnpm --filter @nemis-desktop/app typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/AcademicGradingPage.tsx apps/desktop/renderer/components/academic-grading/AcademicGradingPage.test.tsx
git commit -m "feat(academic-setup): Academic Grading page opens years, terms and periods drawers"
```

---

### Task 7: Repoint inbound links to the drawers

**Files:**
- Modify: `apps/desktop/renderer/app/government/school-admin/page.tsx:127-128`
- Modify: `apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx:33-34`
- Modify: `apps/desktop/renderer/components/finance/CurrentTermNotice.tsx:13`
- Modify: `apps/desktop/renderer/components/finance/CurrentTermNotice.test.tsx:20`
- Modify: `apps/desktop/renderer/components/reports/ReportsPage.tsx:112`
- Modify: `apps/desktop/renderer/components/classes/ClassesDirectoryPage.tsx:688,690`
- Modify: `apps/desktop/renderer/components/outcomes/EndOfYearOutcomesPage.tsx:185`
- Modify: `apps/desktop/renderer/components/outcomes/EndOfYearOutcomesPage.test.tsx:317`
- Modify: `apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx` (`SettingsPage`, line ~104: two links)

**Interfaces:**
- Consumes: `academicSetupHref` (Task 1).

- [ ] **Step 1: Update the tests to the new targets (they fail first)**

Tests pin the literal URL, not the helper, so a broken helper can't make them pass:

`dashboard.test.tsx`:

```tsx
    expect(screen.getByText('No academic year configured').closest('a')).toHaveAttribute('href', '/government/school-admin/academic-grading?open=years');
    expect(screen.getByText('No current term configured').closest('a')).toHaveAttribute('href', '/government/school-admin/academic-grading?open=terms');
```

`CurrentTermNotice.test.tsx`:

```tsx
    expect(screen.getByRole('link', { name: 'Set a current term' })).toHaveAttribute('href', '/government/school-admin/academic-grading?open=terms');
```

`EndOfYearOutcomesPage.test.tsx` (line 317):

```tsx
    expect(screen.getByRole('link', { name: 'Add one under Academic Years' })).toHaveAttribute('href', '/government/school-admin/academic-grading?open=years');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx apps/desktop/renderer/components/finance/CurrentTermNotice.test.tsx apps/desktop/renderer/components/outcomes`
Expected: FAIL — hrefs still point to `/academic-years` and `/terms`.

- [ ] **Step 3: Repoint the links**

In each file add `import { academicSetupHref } from '@/lib/academic-setup';` alongside the other `@/` imports, then:

`app/government/school-admin/page.tsx`:

```tsx
          <InfoTile label="Academic Year" value={year.status === 'success' ? year.data.code : null} emptyText="No academic year configured" emptyHref={academicSetupHref('years')} />
          <InfoTile label="Current Term" value={term.status === 'success' ? term.data.name : null} emptyText="No current term configured" emptyHref={academicSetupHref('terms')} />
```

`components/finance/CurrentTermNotice.tsx`:

```tsx
        <Link href={academicSetupHref('terms')} className="font-semibold underline">Set a current term</Link>
```

`components/reports/ReportsPage.tsx` line 112 — change only the `href` inside the `link` object:

```tsx
link: { href: academicSetupHref('terms'), label: 'Set a current term' }
```

`components/classes/ClassesDirectoryPage.tsx`:

```tsx
                  <Link href={academicSetupHref('years')} className="font-semibold underline">Academic Years</Link>
                  {' '}and{' '}
                  <Link href={academicSetupHref('terms')} className="font-semibold underline">Terms</Link>.
```

`components/outcomes/EndOfYearOutcomesPage.tsx`:

```tsx
        <Link href={academicSetupHref('years')} className="font-semibold underline">
```

`components/academic/AcademicFoundationPages.tsx` `SettingsPage` — replace the two links:

```tsx
<Link className="text-sm text-blue-700" href={academicSetupHref('years')}>Manage academic years</Link><Link className="text-sm text-blue-700" href={academicSetupHref('terms')}>Manage terms</Link>
```

- [ ] **Step 4: Run tests to verify they pass, and check nothing else links to the old routes**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx apps/desktop/renderer/components/finance apps/desktop/renderer/components/outcomes apps/desktop/renderer/components/classes apps/desktop/renderer/components/reports apps/desktop/renderer/components/academic`
Expected: PASS.

Run: `git grep -n -e "school-admin/academic-years" -e "school-admin/terms" -e "academic-grading/periods" -- apps/desktop/renderer ':!*.test.*'`
Expected: only `components/shell/sidebarConfig.ts` (Task 8) and `components/academic/AcademicFoundationPages.tsx` lines inside `AcademicYearsPage`/`TermsPage` (deleted in Task 9). Anything else is a missed link — repoint it the same way.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/app/government/school-admin/page.tsx apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx apps/desktop/renderer/components/finance/CurrentTermNotice.tsx apps/desktop/renderer/components/finance/CurrentTermNotice.test.tsx apps/desktop/renderer/components/reports/ReportsPage.tsx apps/desktop/renderer/components/classes/ClassesDirectoryPage.tsx apps/desktop/renderer/components/outcomes/EndOfYearOutcomesPage.tsx apps/desktop/renderer/components/outcomes/EndOfYearOutcomesPage.test.tsx apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx
git commit -m "feat(academic-setup): point year/term prompts at the setup drawers"
```

---

### Task 8: Sidebar — one Academic Grading entry

**Files:**
- Modify: `apps/desktop/renderer/components/shell/sidebarConfig.ts:1-6` (icon import) and `:66-77` (ACADEMIC SETUP group)
- Modify: `apps/desktop/renderer/components/shell/Sidebar.test.tsx:66-70`, `:73-80`, `:196-201`
- Modify: `apps/desktop/renderer/components/shell/page-titles.test.ts:27-29`

- [ ] **Step 1: Update the tests (they fail first)**

`Sidebar.test.tsx`, in "renders the school-admin groups in order, with correct hrefs" replace the four ACADEMIC SETUP expectations (`Grading System`, `Academic Years`, `Terms`, `Assessment Periods`) with:

```tsx
    expect(href('Academic Grading')).toBe('/government/school-admin/academic-grading');
    expect(href('Subjects')).toBe('/government/school-admin/subjects');
    for (const gone of ['Grading System', 'Academic Years', 'Terms', 'Assessment Periods']) {
      expect(screen.queryByRole('link', { name: gone })).toBeNull();
    }
```

In "marks the active route" change `'Academic Years'` to `'Subjects'`:

```tsx
    expect(screen.getByRole('link', { name: 'Subjects' })).toBeVisible();
```

In "forces open the group holding the current page" use a route that still exists:

```tsx
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/subjects');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Subjects' })).toHaveAttribute('aria-current', 'page');
```

`page-titles.test.ts`, replace the trailing-slash case and add the renamed title:

```ts
  it('ignores a trailing slash when resolving a title', () => {
    expect(resolvePageTitle('/government/school-admin/subjects/', SystemRole.INSTITUTION_ADMIN).title).toBe('Subjects');
  });

  it('titles the Academic Grading page from its sidebar entry', () => {
    expect(resolvePageTitle('/government/school-admin/academic-grading', SystemRole.INSTITUTION_ADMIN).title).toBe('Academic Grading');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell`
Expected: FAIL — "Academic Grading" link not found; old links still present. (The pre-existing logout unhandled error also appears; ignore it.)

- [ ] **Step 3: Update the sidebar config**

Replace the ACADEMIC SETUP group:

```ts
      {
        // Academic years, terms and assessment periods live in drawers on the
        // Academic Grading page, in dependency order (grading config → years →
        // terms → periods); see lib/academic-setup.ts for their deep links.
        label: 'ACADEMIC SETUP',
        items: [
          { name: 'Academic Grading', href: '/government/school-admin/academic-grading', icon: SlidersHorizontal },
          { name: 'Subjects', href: '/government/school-admin/subjects', icon: BookOpen },
        ],
      },
```

Then remove `CalendarRange, CalendarDays, CalendarClock` from the `lucide-react` import if nothing else in the file uses them:

Run: `grep -n "CalendarRange\|CalendarDays\|CalendarClock" apps/desktop/renderer/components/shell/sidebarConfig.ts`
Expected after the edit: only the import line. Remove those three names from it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell`
Expected: PASS, with only the pre-existing logout unhandled error.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/shell/sidebarConfig.ts apps/desktop/renderer/components/shell/Sidebar.test.tsx apps/desktop/renderer/components/shell/page-titles.test.ts
git commit -m "feat(nav): collapse academic setup entries into Academic Grading"
```

---

### Task 9: Delete the old pages and verify the whole branch

**Files:**
- Delete: `apps/desktop/renderer/app/government/school-admin/academic-years/page.tsx` (and folder)
- Delete: `apps/desktop/renderer/app/government/school-admin/terms/page.tsx` (and folder)
- Delete: `apps/desktop/renderer/app/government/school-admin/academic-grading/periods/page.tsx` (and folder)
- Delete: `apps/desktop/renderer/components/academic/AcademicFoundationPages.test.tsx`
- Modify: `apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx` — remove `AcademicYearsPage`, `TermsPage`, the `initialYearId` import, and imports that become unused.

- [ ] **Step 1: Delete the routes, the old components and their test**

```bash
git rm -r apps/desktop/renderer/app/government/school-admin/academic-years apps/desktop/renderer/app/government/school-admin/terms apps/desktop/renderer/app/government/school-admin/academic-grading/periods apps/desktop/renderer/components/academic/AcademicFoundationPages.test.tsx
```

In `AcademicFoundationPages.tsx` delete the whole `export function AcademicYearsPage() { … }` and `export function TermsPage() { … }` blocks and the `import { initialYearId } …` line. Then remove imports that nothing left in the file uses. Check each candidate:

Run: `for n in useEffect FormEvent Modal Select EmptyState ErrorState Input Badge Button AcademicYearStatus AcademicYearRowView TermRowView sharedBridge queryParam FormField statusVariant LoadState; do printf "%s " $n; grep -c "\b$n\b" apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx; done`
Expected: any name with count `1` appears only in its import — remove it from that import (and drop the whole import line if it becomes empty).

- [ ] **Step 2: Clear stale Next route types**

`apps/desktop/renderer/tsconfig.json` includes `.next/types/**/*.ts`, which still has generated files for the deleted routes. `.next` is git-ignored build output and is regenerated by the next build/dev run:

```bash
rm -rf apps/desktop/renderer/.next/types
```

- [ ] **Step 3: Confirm nothing references the old routes or components**

Run: `git grep -n -e "school-admin/academic-years" -e "school-admin/terms" -e "academic-grading/periods" -e "AcademicYearsPage" -e "TermsPage" -- apps/desktop`
Expected: no output.

- [ ] **Step 4: Full verification gate**

Run: `pnpm --filter @nemis-desktop/app typecheck`
Expected: exit 0.

Run: `pnpm exec eslint apps/desktop/renderer`
Expected: no errors in renderer files. (Root `pnpm lint` keeps its 6 pre-existing errors outside the renderer — compare, don't fix.)

Run: `pnpm exec vitest run --project renderer`
Expected: only the 2 pre-existing failures (`app/page.test` login, teacher `timetable.test`) and the pre-existing Sidebar logout unhandled error. Every test added or changed in Tasks 1–8 passes. Report the exact pass/fail counts.

- [ ] **Step 5: Commit**

```bash
git add -A apps/desktop/renderer/components/academic/AcademicFoundationPages.tsx
git commit -m "refactor(academic-setup): remove standalone years, terms and periods pages"
```

- [ ] **Step 6: Hand Alvin the manual GUI checklist** (no agent can drive the Electron window)

1. Sidebar → ACADEMIC SETUP shows **Academic Grading** and **Subjects** only; header reads "Academic Grading" on that page.
2. Academic Grading shows six cards in order; each of Manage Years / Manage Terms / Manage Periods / Configure System opens its drawer.
3. Academic Years drawer: create a year (form replaces the list), Escape from the form returns to the list, Escape again closes the drawer.
4. Edit a closed year → Status section shows Archive + Restore only; Restore works after confirming.
5. Click a year's term count → Terms drawer opens on that year.
6. Terms drawer: create, edit, set current, delete a term.
7. Assessment Periods drawer with no current year → "Set up an academic year" switches to the Years drawer.
8. Dashboard "No current term configured" (or Finance "Set a current term") → lands on Academic Grading with the Terms drawer open; close it, press Back/refresh → it does not reopen.
9. Close a drawer mid-edit, reopen it → it starts on the list.
