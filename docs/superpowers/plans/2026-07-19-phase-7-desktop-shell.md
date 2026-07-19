# Phase 7 — Desktop Shell & UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the NEMIS Desktop Shell (Sidebar, Header, StatusBar, routing) for the School Admin portal by porting the canonical web UI and wiring React to the Phase-6 presentation layer over an in-renderer fake application.

**Architecture:** React components → `useViewModel(store, selector)` hook → ViewModel (`@nemis-desktop/presentation`, real) → ApplicationLayer (Phase-6 test factory over in-memory fakes, seeded through real use cases). Components import only `@nemis-desktop/presentation` and `@nemis-desktop/ui`; an ESLint guard makes bypassing the presentation layer a lint error. The Phase-8 IPC facade will replace only the composition file.

**Tech Stack:** Electron Forge, Next.js 15 App Router (static export), React 19, TypeScript strict, Tailwind CSS 3, vanilla Zustand, vitest 3 + @testing-library/react + jsdom, lucide-react.

## Global Constraints

- **Target portal:** School Admin only. No other role portals this phase.
- **No page migrations beyond Dashboard.** Every other sidebar destination renders the shared `ComingSoon` page. No CRUD workflows, no synchronization, no login screen.
- **No REST, no IPC data facade, no SQLite/repository/Electron/domain imports from React.** Enforced by ESLint. (`window.nemis.system` for app version stays allowed — it is the only existing bridge use.)
- **Do not touch the Phase-5 business repo adapter debt** (`as never` in `electron/data/adapters/createApplicationComposition.ts`). It is a Phase-8 prerequisite.
- **Visual identity is fixed:** adopt the web theme verbatim; preserve existing web label typos (e.g. "Attendence Management") — fidelity over cleanup.
- **TypeScript strict** with `noUncheckedIndexedAccess` and `noImplicitOverride` (from `tsconfig.base.json`). No `any` (`@typescript-eslint/no-explicit-any: error`).
- **Package manager:** pnpm 10, Node ≥ 22.
- **Test ABI:** the full `pnpm test` includes infra E2E needing `better-sqlite3` on the Node ABI. Run `pnpm rebuild:node` before running the full suite, `pnpm rebuild:electron` after (before dev/packaging).
- **Real stat honesty:** on the dashboard, only the total-students count is real (from `listStudents` `PagedResult.total`); every other stat/section is placeholder-flagged.
- **Brand tokens:** primary `#000e21`, secondary `#0367A0`, accent `#1874A8`, success `#065808`, active `#146316`, pending `#a6731c`, error `#c10021`, border `#e3e3e5`; radii card `16px` / button `9999px`.

---

## File Structure

**Presentation package (`packages/presentation/`):**
- Modify `package.json` — add `"./testing"` subpath export.
- Modify `src/view-models/dashboard/dashboard-view-model.ts` — graduate from stub to implementation.
- Create `src/view-models/dashboard/dashboard-views.ts` — dashboard view types.
- Create `src/view-models/dashboard/dashboard-view-model.test.ts`.
- Modify `src/index.ts` — export dashboard views.
- Modify `src/view-models/extension-stubs.test.ts` — remove the dashboard-stub assertion (it now works).

**UI package (`packages/ui/`):**
- Modify `package.json` — React + peer deps, port deps.
- Create `src/*.tsx` — 15 ported components + 4 new ones.
- Modify `src/index.ts` — real barrel.
- Create `src/ui-package.test.tsx` — smoke test.

**Renderer (`apps/desktop/renderer/`):**
- Create `lib/presentation/create-renderer-presentation.ts`, `seed-demo-data.ts`, `presentation-provider.tsx`, `hooks.ts`.
- Create `hooks/use-view-model.ts` (+ `.test.tsx`).
- Create `components/shell/Sidebar.tsx`, `Header.tsx`, `StatusBar.tsx`, `ComingSoon.tsx`, `RouteGuard.tsx`, `ToastHost.tsx`, `sidebar-config.ts` (+ tests).
- Create `components/dashboard/StatCard.tsx`, `QuickActionCard.tsx`, `ActivityItem.tsx`, `RecentActivityFeed.tsx`, `TeachersListSection.tsx`, `DashboardGreeting.tsx`.
- Replace `app/layout.tsx`, `app/page.tsx`; create `app/not-found.tsx`, `app/government/school-admin/layout.tsx`, `app/government/school-admin/page.tsx`, and 15 ComingSoon route pages.
- Modify `tailwind.config.ts`, `styles/globals.css`.
- Delete `layouts/AppShell.tsx`, `layouts/Header.tsx`, `layouts/Sidebar.tsx` (Phase-1 scaffold, superseded).
- Create `vitest.setup.ts`.

**Root:**
- Modify `vitest.config.ts` — node + jsdom projects.
- Modify `eslint.config.mjs` — renderer boundary guard.
- Create `docs/desktop-shell.md`; modify `docs/conventions.md`.

---

## Task 1: Vitest renderer (jsdom) test project

**Files:**
- Modify: `vitest.config.ts`
- Create: `apps/desktop/renderer/vitest.setup.ts`
- Modify: `package.json` (root) — devDeps

**Interfaces:**
- Produces: a `renderer` vitest project running `apps/desktop/renderer/**/*.test.{ts,tsx}` under jsdom with React JSX + `@testing-library/jest-dom` matchers. Consumed by every later renderer test task.

- [ ] **Step 1: Add dev dependencies**

Run:
```bash
pnpm -w add -D jsdom @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event
```
Expected: root `package.json` devDependencies updated; lockfile changes.

- [ ] **Step 2: Rewrite `vitest.config.ts` with two projects**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['packages/**/src/**/*.test.ts', 'apps/desktop/electron/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          include: ['apps/desktop/renderer/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['apps/desktop/renderer/vitest.setup.ts'],
        },
      },
    ],
  },
});
```

- [ ] **Step 3: Create the jsdom setup file**

`apps/desktop/renderer/vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Add a throwaway sanity test**

`apps/desktop/renderer/hooks/__vitest_sanity__.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('renderer test env', () => {
  it('renders JSX under jsdom', () => {
    render(<div>hello-renderer</div>);
    expect(screen.getByText('hello-renderer')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the renderer project**

Run: `pnpm exec vitest run --project renderer`
Expected: PASS (1 test). Confirms jsdom + React + jest-dom matchers work.

- [ ] **Step 6: Confirm the node project still runs**

Run: `pnpm rebuild:node && pnpm exec vitest run --project node`
Expected: PASS (all prior 456 tests). Then delete the sanity test:
```bash
rm apps/desktop/renderer/hooks/__vitest_sanity__.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts apps/desktop/renderer/vitest.setup.ts package.json pnpm-lock.yaml
git commit -m "test: add jsdom renderer vitest project"
```

---

## Task 2: Presentation `./testing` subpath export

**Files:**
- Modify: `packages/presentation/package.json`

**Interfaces:**
- Produces: `import { createTestApplication, type TestPorts } from '@nemis-desktop/presentation/testing'` resolves. Consumed by Task 9 (renderer composition root).

- [ ] **Step 1: Add the subpath export**

In `packages/presentation/package.json`, replace the `exports` block:
```json
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/create-test-application.ts"
  },
```

- [ ] **Step 2: Verify the existing test factory already exports what the renderer needs**

Confirm `packages/presentation/src/testing/create-test-application.ts` exports `createTestApplication` and `TestPorts` (it does). No code change.

- [ ] **Step 3: Typecheck the workspace**

Run: `pnpm typecheck`
Expected: PASS (no consumers yet; this just confirms the manifest is valid).

- [ ] **Step 4: Commit**

```bash
git add packages/presentation/package.json
git commit -m "feat(presentation): expose ./testing subpath for renderer composition"
```

---

## Task 3: DashboardViewModel implementation

**Files:**
- Create: `packages/presentation/src/view-models/dashboard/dashboard-views.ts`
- Modify: `packages/presentation/src/view-models/dashboard/dashboard-view-model.ts`
- Create: `packages/presentation/src/view-models/dashboard/dashboard-view-model.test.ts`
- Modify: `packages/presentation/src/index.ts`
- Modify: `packages/presentation/src/view-models/extension-stubs.test.ts`

**Interfaces:**
- Consumes: `StudentApplicationService.list(dto)` → `ApplicationResponse<PagedResult<StudentSummaryOutput>>`; `trackQuery`; `AsyncState`; `NotificationStore`.
- Produces: `DashboardViewModel` with `readonly store: StoreApi<DashboardState>`, `async loadSummary(): Promise<void>`, constructed as `new DashboardViewModel({ students, notifications })`. `DashboardState = { summary: AsyncState<DashboardSummaryView> }`. `DashboardSummaryView` (see Step 1). Consumed by Task 4 (factory wiring) and Task 16 (dashboard page).

- [ ] **Step 1: Write the view types**

`packages/presentation/src/view-models/dashboard/dashboard-views.ts`:
```ts
/** A single dashboard statistic. `placeholder: true` means the value is NOT
 * backed by a real application use case yet (Phase 7 has no summary queries
 * beyond the student count). The UI marks placeholder tiles visibly. */
export interface DashboardStat {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly placeholder: boolean;
}

export interface DashboardSummaryView {
  /** Real: from listStudents PagedResult.total. */
  readonly totalStudents: number;
  /** All tiles for the stat grid (totalStudents is real, the rest placeholder). */
  readonly stats: readonly DashboardStat[];
}
```

- [ ] **Step 2: Write the failing test**

`packages/presentation/src/view-models/dashboard/dashboard-view-model.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { DashboardViewModel } from './dashboard-view-model';

async function seedStudents(count: number) {
  const { app, ports } = createTestApplication();
  for (let i = 0; i < count; i += 1) {
    await app.students.create({
      institutionId: 'inst-1',
      firstName: `Student${i}`,
      lastName: 'Test',
      admissionNumber: `ADM-${i}`,
      dateOfBirth: '2015-01-01',
      gender: Gender.MALE,
    });
  }
  return { app, ports };
}

describe('DashboardViewModel', () => {
  it('loads the real total-students count from listStudents', async () => {
    const { app } = await seedStudents(3);
    const vm = new DashboardViewModel({ students: app.students, notifications: new NotificationStore() });
    await vm.loadSummary();
    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status === 'success') {
      expect(summary.data.totalStudents).toBe(3);
      const total = summary.data.stats.find((s) => s.key === 'total-students');
      expect(total).toEqual({ key: 'total-students', label: 'Total Students', value: 3, placeholder: false });
      expect(summary.data.stats.filter((s) => s.placeholder).length).toBeGreaterThan(0);
    }
  });

  it('reports success with zero when no students exist', async () => {
    const { app } = await seedStudents(0);
    const vm = new DashboardViewModel({ students: app.students, notifications: new NotificationStore() });
    await vm.loadSummary();
    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status === 'success') expect(summary.data.totalStudents).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run --project node packages/presentation/src/view-models/dashboard/dashboard-view-model.test.ts`
Expected: FAIL — `loadSummary` throws `NotImplementedPresentationError`.

- [ ] **Step 4: Implement the ViewModel**

Replace `packages/presentation/src/view-models/dashboard/dashboard-view-model.ts`:
```ts
import type { PagedResult, StudentApplicationService, StudentSummaryOutput } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import type { NotificationStore } from '../../stores/notification-store';
import type { DashboardStat, DashboardSummaryView } from './dashboard-views';

export interface DashboardState {
  readonly summary: AsyncState<DashboardSummaryView>;
}

export interface DashboardViewModelDeps {
  readonly students: StudentApplicationService;
  readonly notifications: NotificationStore;
}

/** A wide page size so the total reflects the whole roster. Real production
 * summaries (a dedicated count query) arrive with the sync/reporting phase. */
const COUNT_PAGE: Readonly<{ limit: number; offset: number }> = { limit: 1000, offset: 0 };

const PLACEHOLDER_STATS: readonly Omit<DashboardStat, 'placeholder'>[] = [
  { key: 'total-teachers', label: 'Total Teachers', value: 0 },
  { key: 'total-classes', label: 'Total Classes', value: 0 },
  { key: 'avg-class-size', label: 'Avg Class Size', value: 0 },
  { key: 'male-students', label: 'Male Students', value: 0 },
  { key: 'female-students', label: 'Female Students', value: 0 },
];

export class DashboardViewModel {
  readonly store = createStore<DashboardState>(() => ({ summary: idleState() }));

  constructor(private readonly deps: DashboardViewModelDeps) {}

  async loadSummary(): Promise<void> {
    await trackQuery<PagedResult<StudentSummaryOutput>, DashboardSummaryView>({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.deps.students.list(COUNT_PAGE),
      map: (page) => ({
        totalStudents: page.total,
        stats: [
          { key: 'total-students', label: 'Total Students', value: page.total, placeholder: false },
          ...PLACEHOLDER_STATS.map((s) => ({ ...s, placeholder: true })),
        ],
      }),
    });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run --project node packages/presentation/src/view-models/dashboard/dashboard-view-model.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Fix the extension-stubs test (dashboard is no longer a stub)**

In `packages/presentation/src/view-models/extension-stubs.test.ts`, remove the two dashboard lines inside the first `it` block:
```ts
    const dashboard = new DashboardViewModel();
    expect(dashboard.store.getState().summary.status).toBe('idle');
    await expect(dashboard.loadSummary()).rejects.toBeInstanceOf(NotImplementedPresentationError);
```
and remove the now-unused `import { DashboardViewModel } from './dashboard/dashboard-view-model';`. Rename the test title from `'dashboard and teachers ...'` to `'teachers exposes typed idle state and throws NotImplemented'` and keep the Teachers assertions.

- [ ] **Step 7: Export the dashboard views and update the factory call**

In `packages/presentation/src/index.ts`, add after the dashboard view-model export line:
```ts
export * from './view-models/dashboard/dashboard-views';
```
In `packages/presentation/src/factories/create-presentation-layer.ts`, change the dashboard construction:
```ts
    dashboard: new DashboardViewModel({ students: app.students, notifications }),
```

- [ ] **Step 8: Run the full presentation suite + typecheck**

Run: `pnpm exec vitest run --project node && pnpm typecheck`
Expected: PASS (457+ tests: prior 456 minus 0, plus 2 dashboard, minus the removed dashboard-stub assertions).

- [ ] **Step 9: Commit**

```bash
git add packages/presentation/src packages/presentation/src/index.ts
git commit -m "feat(presentation): implement DashboardViewModel (real student total, placeholder rest)"
```

---

## Task 4: UI package — port web components + theme deps

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/src/Alert.tsx`, `Avatar.tsx`, `Badge.tsx`, `Button.tsx`, `Card.tsx`, `Drawer.tsx`, `EmptyState.tsx`, `Input.tsx`, `Modal.tsx`, `ProgressBar.tsx`, `Select.tsx`, `Spinner.tsx`, `Table.tsx`, `Textarea.tsx`, `Toast.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `@nemis-desktop/ui` exporting `Card, CardProps, Avatar, AvatarProps, Spinner, EmptyState, Badge, Button, Input, Select, Textarea, Table, Modal, Drawer, Alert, ProgressBar, Toast` with the same prop shapes as web `@nemis/ui`. Consumed by Tasks 5, 14–16.

- [ ] **Step 1: Set the package dependencies**

Replace `packages/ui/package.json`:
```json
{
  "name": "@nemis-desktop/ui",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.15",
    "framer-motion": "^12.38.0",
    "sweetalert2": "^11.14.5"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.6",
    "@types/react-dom": "^19.0.2"
  }
}
```
Then run: `pnpm install`
Expected: deps resolve.

- [ ] **Step 2: Port the 15 components verbatim**

Copy each file from `../../Nemis/apps/portal-web/../../packages/ui/src/` (repo path: `Nemis/packages/ui/src/`) into `packages/ui/src/` **unchanged**:
`Alert.tsx, Avatar.tsx, Badge.tsx, Button.tsx, Card.tsx, Drawer.tsx, EmptyState.tsx, Input.tsx, Modal.tsx, ProgressBar.tsx, Select.tsx, Spinner.tsx, Table.tsx, Textarea.tsx, Toast.tsx`.

These are self-contained (React + framer-motion in Drawer + sweetalert2 in Toast, all now dependencies). Do not modify their code. Note: `Avatar.tsx` references role-fallback image paths under `/` (e.g. `/avatar-placeholder.jpg`); the desktop `public/` must ship those assets — see Task 14 Step for asset copy.

- [ ] **Step 3: Write the real barrel**

Replace `packages/ui/src/index.ts`:
```ts
export * from './Alert';
export * from './Avatar';
export * from './Badge';
export * from './Button';
export * from './Card';
export * from './Drawer';
export * from './EmptyState';
export * from './Input';
export * from './Modal';
export * from './ProgressBar';
export * from './Select';
export * from './Spinner';
export * from './Table';
export * from './Textarea';
export * from './Toast';
```

- [ ] **Step 4: Typecheck the UI package**

Run: `pnpm --filter @nemis-desktop/ui typecheck`
Expected: PASS. If a component uses a JSX-runtime import mismatch, ensure `packages/ui/tsconfig.json` extends base with `"jsx": "react-jsx"` and `"lib": ["ES2022","DOM"]`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src"]
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): port web design-system components into @nemis-desktop/ui"
```

---

## Task 5: UI package — new shell components

**Files:**
- Create: `packages/ui/src/Breadcrumbs.tsx`, `Dropdown.tsx`, `Skeleton.tsx`, `ErrorState.tsx`
- Create: `packages/ui/src/ui-package.test.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces:
  - `Breadcrumbs({ segments: readonly string[], className?: string })` — renders `Home / a / b`.
  - `Dropdown({ trigger, children, align?, open, onOpenChange })` — controlled menu with outside-click + Escape close; `DropdownItem({ icon?, onSelect, disabled?, children })`.
  - `Skeleton({ className?: string })` — animated placeholder block.
  - `ErrorState({ title?, message, onRetry?, retryLabel? })` — error panel with optional retry button.
- Consumed by Tasks 11 (Header), 12 (StatusBar), 15/16 (dashboard).

- [ ] **Step 1: Write the failing smoke test**

`packages/ui/src/ui-package.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from './Breadcrumbs';
import { Skeleton } from './Skeleton';
import { ErrorState } from './ErrorState';
import { Dropdown, DropdownItem } from './Dropdown';

describe('@nemis-desktop/ui new components', () => {
  it('renders breadcrumb trail with Home prefix', () => {
    render(<Breadcrumbs segments={['School Admin', 'Students']} />);
    expect(screen.getByText(/Home/)).toBeInTheDocument();
    expect(screen.getByText(/Students/)).toBeInTheDocument();
  });

  it('renders a skeleton block', () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });

  it('fires retry from the error state', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Boom" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('invokes a dropdown item and supports disabled items', async () => {
    const onSelect = vi.fn();
    render(
      <Dropdown open onOpenChange={() => {}} trigger={<span>menu</span>}>
        <DropdownItem onSelect={onSelect}>Profile</DropdownItem>
        <DropdownItem onSelect={vi.fn()} disabled>Sign Out</DropdownItem>
      </Dropdown>,
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Profile' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByRole('menuitem', { name: 'Sign Out' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --project renderer packages/ui/src/ui-package.test.tsx`
Expected: FAIL — modules not found. (Renderer project glob does not include `packages/**`; add `packages/ui/**/*.test.tsx` to the renderer project `include` in `vitest.config.ts` now: change to `include: ['apps/desktop/renderer/**/*.test.{ts,tsx}', 'packages/ui/**/*.test.tsx']`.) Re-run; expected FAIL on missing components.

- [ ] **Step 3: Implement Breadcrumbs**

`packages/ui/src/Breadcrumbs.tsx`:
```tsx
import React from 'react';

export interface BreadcrumbsProps {
  segments: readonly string[];
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ segments, className = '' }) => {
  const trail = ['Home', ...segments];
  return (
    <p className={`text-xs font-semibold text-gray-600 truncate ${className}`} aria-label="Breadcrumb">
      {trail.join(' / ')}
    </p>
  );
};
```

- [ ] **Step 4: Implement Skeleton**

`packages/ui/src/Skeleton.tsx`:
```tsx
import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', ...props }) => (
  <div className={`animate-pulse rounded bg-slate-200 ${className}`} {...props} />
);
```

- [ ] **Step 5: Implement ErrorState**

`packages/ui/src/ErrorState.tsx`:
```tsx
import React from 'react';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
}) => (
  <div className="flex flex-col items-center justify-center py-10 px-4 text-center" role="alert">
    <h3 className="text-base font-semibold text-neutral-dark mb-1">{title}</h3>
    <p className="text-sm text-gray-600 mb-4 max-w-md">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-button bg-primary text-white text-sm font-semibold hover:opacity-90"
      >
        {retryLabel}
      </button>
    )}
  </div>
);
```

- [ ] **Step 6: Implement Dropdown**

`packages/ui/src/Dropdown.tsx`:
```tsx
import React, { useEffect, useRef } from 'react';

export interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: 'left' | 'right';
}

export const Dropdown: React.FC<DropdownProps> = ({ trigger, children, open, onOpenChange, align = 'right' }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 pl-2 pr-3 py-2 rounded-md hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 w-56 bg-white border border-gray-200 rounded-md overflow-hidden z-50`}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export interface DropdownItemProps {
  onSelect: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({ onSelect, icon, disabled = false, children }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={onSelect}
    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {icon}
    {children}
  </button>
);
```

- [ ] **Step 7: Export the new components**

Append to `packages/ui/src/index.ts`:
```ts
export * from './Breadcrumbs';
export * from './Dropdown';
export * from './Skeleton';
export * from './ErrorState';
```

- [ ] **Step 8: Run the smoke test + typecheck**

Run: `pnpm exec vitest run --project renderer packages/ui/src/ui-package.test.tsx && pnpm --filter @nemis-desktop/ui typecheck`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/ui vitest.config.ts
git commit -m "feat(ui): add Breadcrumbs, Dropdown, Skeleton, ErrorState"
```

---

## Task 6: Renderer Tailwind theme, fonts, and global CSS

**Files:**
- Modify: `apps/desktop/renderer/tailwind.config.ts`
- Modify: `apps/desktop/renderer/styles/globals.css`

**Interfaces:**
- Produces: the web theme tokens (colors/fonts/sizes/radii), font CSS variables, and `.sidebar-scroll` utility available to all renderer components. Consumed by every UI task.

- [ ] **Step 1: Replace the Tailwind config with the web theme**

`apps/desktop/renderer/tailwind.config.ts` — copy the `theme.extend` block from `Nemis/apps/portal-web/tailwind.config.ts` verbatim (colors primary/secondary/accent scales, neutral, border, success/active/pending/error; `screens.3xl`; `fontFamily.sans`/`heading`; `fontSize` h1–button; `borderRadius.card`/`button`; `spacing.card`). Extend `content.files` to include shell + dashboard dirs and the UI package:
```ts
  content: {
    relative: true,
    files: [
      './app/**/*.{ts,tsx}',
      './components/**/*.{ts,tsx}',
      './lib/**/*.{ts,tsx}',
      '../../../packages/ui/src/**/*.{ts,tsx}',
    ],
  },
```

- [ ] **Step 2: Add fonts to the root layout (done in Task 13) and the sidebar-scroll utility to globals**

Append to `apps/desktop/renderer/styles/globals.css` the `.sidebar-scroll` rules from `Nemis/apps/portal-web/src/app/globals.css` (webkit + firefox thumb-on-hover). Also add a focus-visible baseline:
```css
.sidebar-scroll {
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.sidebar-scroll:hover {
  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}
.sidebar-scroll::-webkit-scrollbar {
  width: 8px;
}
.sidebar-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.sidebar-scroll::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 9999px;
}
.sidebar-scroll:hover::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.18);
}
:focus-visible {
  outline: 2px solid #1874a8;
  outline-offset: 2px;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @nemis-desktop/app typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/tailwind.config.ts apps/desktop/renderer/styles/globals.css
git commit -m "feat(renderer): adopt web Tailwind theme and sidebar-scroll utility"
```

---

## Task 7: ESLint renderer boundary guard

**Files:**
- Create: `apps/desktop/renderer/eslint.config.mjs`
- Modify: `eslint.config.mjs` (root)

**Interfaces:**
- Produces: `rendererImportGuard` + `rendererTestRelaxation` blocks banning application/domain/electron/sqlite/data/ipc/database imports from `apps/desktop/renderer/**`, allowing `@nemis-desktop/presentation/testing` only under `renderer/lib/presentation/**`. Consumed by the root config.

- [ ] **Step 1: Write the guard module**

`apps/desktop/renderer/eslint.config.mjs`:
```js
// Renderer boundary: React components talk ONLY to @nemis-desktop/presentation
// and @nemis-desktop/ui. Application/domain/electron/sqlite/data/ipc are banned;
// the presentation `./testing` composition helper is allowed only in the
// composition root (lib/presentation).

const RENDERER_RESTRICTED = {
  paths: [
    { name: '@nemis-desktop/application', message: 'Renderer must go through @nemis-desktop/presentation ViewModels.' },
    { name: '@nemis-desktop/domain', message: 'Renderer never imports domain entities.' },
    { name: 'better-sqlite3', message: 'Renderer must not touch SQLite.' },
    { name: 'better-sqlite3-multiple-ciphers', message: 'Renderer must not touch SQLite.' },
    { name: 'electron', message: 'Renderer must not import Electron; use the preload bridge.' },
    { name: '@nemis-desktop/presentation/testing', message: 'The fake application may only be composed in renderer/lib/presentation.' },
  ],
  patterns: [
    { group: ['**/electron/**', '**/data/**', '**/database/**', '**/ipc/**', 'electron', 'electron/*'], message: 'Renderer must not import main-process/infrastructure modules.' },
  ],
};

export const rendererImportGuard = {
  files: ['apps/desktop/renderer/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', RENDERER_RESTRICTED],
  },
};

// The composition root is the one place allowed to build the fake application.
export const rendererCompositionRelaxation = {
  files: ['apps/desktop/renderer/lib/presentation/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: RENDERER_RESTRICTED.paths.filter((p) => p.name !== '@nemis-desktop/presentation/testing'),
        patterns: RENDERER_RESTRICTED.patterns,
      },
    ],
  },
};
```

- [ ] **Step 2: Register in the root config**

In `eslint.config.mjs`, add the import near the others:
```js
import { rendererImportGuard, rendererCompositionRelaxation } from './apps/desktop/renderer/eslint.config.mjs';
```
and add both blocks to the `tseslint.config(...)` list, **after** the renderer React block and before `prettier`:
```js
  rendererImportGuard,
  rendererCompositionRelaxation,
```

- [ ] **Step 3: Add a temporary violation to prove the guard bites**

Create `apps/desktop/renderer/components/__guard_probe__.ts`:
```ts
import '@nemis-desktop/application';
```
Run: `pnpm lint`
Expected: FAIL with the "must go through ViewModels" message on that file.

- [ ] **Step 4: Remove the probe and confirm clean**

```bash
rm apps/desktop/renderer/components/__guard_probe__.ts
```
Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs apps/desktop/renderer/eslint.config.mjs
git commit -m "feat(renderer): enforce presentation-layer boundary via ESLint"
```

---

## Task 8: Renderer composition root, demo seed, provider, and hooks

**Files:**
- Create: `apps/desktop/renderer/lib/presentation/create-renderer-presentation.ts`
- Create: `apps/desktop/renderer/lib/presentation/seed-demo-data.ts`
- Create: `apps/desktop/renderer/lib/presentation/presentation-provider.tsx`
- Create: `apps/desktop/renderer/lib/presentation/hooks.ts`
- Create: `apps/desktop/renderer/lib/presentation/create-renderer-presentation.test.ts`

**Interfaces:**
- Consumes: `createTestApplication` from `@nemis-desktop/presentation/testing`; `createPresentationLayer`, `PresentationLayer` from `@nemis-desktop/presentation`; the seeded `TestPorts`; `Gender`, `SystemRole`, `InstitutionType`, `OwnershipType`, `ApprovalStatus` from `@nemis-desktop/types`; `User`, `UserOrganization`, `Institution` from `@nemis-desktop/domain` (composition root only — allowed by the relaxation).
- Produces:
  - `createRendererPresentation(): Promise<PresentationLayer>` — builds fakes, seeds, returns the layer.
  - `DEMO_INSTITUTION_ID = 'inst-1'`, `DEMO_USER_ID = 'usr-1'`.
  - `PresentationProvider({ layer, children })` + `usePresentation(): PresentationLayer`.
  - Typed accessor hooks: `useDashboardViewModel`, `useStudentsViewModel`, `useSettingsViewModel`, `useCurrentUserViewModel`, `useSyncViewModel`, `useConnectivityStore`, `useNotificationStore`.
- Consumed by Tasks 10–16.

- [ ] **Step 1: Write the seed module**

`apps/desktop/renderer/lib/presentation/seed-demo-data.ts`:
```ts
import type { TestPorts } from '@nemis-desktop/presentation/testing';
import type { ApplicationLayer } from '@nemis-desktop/application';
import { User, UserOrganization, Institution } from '@nemis-desktop/domain';
import {
  ApprovalStatus,
  Gender,
  InstitutionType,
  OwnershipType,
  SystemRole,
} from '@nemis-desktop/types';

export const DEMO_INSTITUTION_ID = 'inst-1';
export const DEMO_USER_ID = 'usr-1';

const DEMO_STUDENTS: readonly { first: string; last: string; gender: Gender }[] = [
  { first: 'Grace', last: 'Toe', gender: Gender.FEMALE },
  { first: 'Emmanuel', last: 'Kollie', gender: Gender.MALE },
  { first: 'Fatu', last: 'Sirleaf', gender: Gender.FEMALE },
  { first: 'Prince', last: 'Weah', gender: Gender.MALE },
  { first: 'Musu', last: 'Johnson', gender: Gender.FEMALE },
];

/** Seed a demo school. Students go through the REAL create use case so the
 * data flows the same path production data will. The institution and user are
 * reconstituted directly into the fakes (no create use case exists for them). */
export async function seedDemoData(app: ApplicationLayer, ports: TestPorts): Promise<void> {
  ports.institutions.store.set(
    DEMO_INSTITUTION_ID,
    Institution.reconstitute({
      id: DEMO_INSTITUTION_ID,
      code: 'lib-001',
      name: 'Monrovia Central School',
      type: InstitutionType.SCHOOL,
      ownership: OwnershipType.GOVERNMENT,
      countyId: 'county-1',
      approvalStatus: ApprovalStatus.APPROVED,
      address: { communityTown: 'Sinkor, Monrovia' },
      version: 1,
      updatedAt: '2026-07-19T00:00:00.000Z',
    }),
  );

  ports.users.store.set(
    DEMO_USER_ID,
    User.reconstitute({
      id: DEMO_USER_ID,
      firstName: 'Joseph',
      lastName: 'Boakai',
      email: 'principal@monrovia-central.edu.lr',
      isActive: true,
      organizations: [
        UserOrganization.reconstitute({
          id: 'org-1',
          role: SystemRole.INSTITUTION_ADMIN,
          institutionId: DEMO_INSTITUTION_ID,
          isActive: true,
        }),
      ],
      version: 1,
      updatedAt: '2026-07-19T00:00:00.000Z',
    }),
  );

  for (const [i, s] of DEMO_STUDENTS.entries()) {
    await app.students.create({
      institutionId: DEMO_INSTITUTION_ID,
      firstName: s.first,
      lastName: s.last,
      admissionNumber: `MCS-2026-${String(i + 1).padStart(3, '0')}`,
      dateOfBirth: '2014-05-01',
      gender: s.gender,
    });
  }
}
```

- [ ] **Step 2: Write the composition root**

`apps/desktop/renderer/lib/presentation/create-renderer-presentation.ts`:
```ts
import { createPresentationLayer, type PresentationLayer } from '@nemis-desktop/presentation';
import { createTestApplication } from '@nemis-desktop/presentation/testing';
import { seedDemoData } from './seed-demo-data';

/** THE Phase-8 SEAM: today this builds the in-memory fake application; the
 * sync/IPC phase replaces the body with an ApplicationLayer-shaped proxy over
 * window.nemis. Nothing else in the renderer changes. */
export async function createRendererPresentation(): Promise<PresentationLayer> {
  const { app, ports } = createTestApplication();
  await seedDemoData(app, ports);
  return createPresentationLayer(app);
}
```

- [ ] **Step 3: Write the provider and accessor hooks**

`apps/desktop/renderer/lib/presentation/presentation-provider.tsx`:
```tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PresentationLayer } from '@nemis-desktop/presentation';

const PresentationContext = createContext<PresentationLayer | null>(null);

export function PresentationProvider({ layer, children }: { layer: PresentationLayer; children: ReactNode }) {
  return <PresentationContext.Provider value={layer}>{children}</PresentationContext.Provider>;
}

export function usePresentation(): PresentationLayer {
  const layer = useContext(PresentationContext);
  if (!layer) throw new Error('usePresentation must be used within a PresentationProvider.');
  return layer;
}
```

`apps/desktop/renderer/lib/presentation/hooks.ts`:
```ts
'use client';

import { usePresentation } from './presentation-provider';

export const useDashboardViewModel = () => usePresentation().viewModels.dashboard;
export const useStudentsViewModel = () => usePresentation().viewModels.students;
export const useSettingsViewModel = () => usePresentation().viewModels.settings;
export const useCurrentUserViewModel = () => usePresentation().viewModels.currentUser;
export const useSyncViewModel = () => usePresentation().viewModels.sync;
export const useConnectivityStore = () => usePresentation().stores.connectivity;
export const useNotificationStore = () => usePresentation().stores.notifications;
```

- [ ] **Step 4: Write the composition test**

`apps/desktop/renderer/lib/presentation/create-renderer-presentation.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createRendererPresentation } from './create-renderer-presentation';
import { DEMO_USER_ID } from './seed-demo-data';

describe('createRendererPresentation', () => {
  it('builds a seeded presentation layer with a real student total', async () => {
    const layer = await createRendererPresentation();
    await layer.viewModels.dashboard.loadSummary();
    const summary = layer.viewModels.dashboard.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status === 'success') expect(summary.data.totalStudents).toBe(5);
  });

  it('seeds the current user', async () => {
    const layer = await createRendererPresentation();
    await layer.viewModels.currentUser.loadUser(DEMO_USER_ID);
    const user = layer.viewModels.currentUser.store.getState().user;
    expect(user.status).toBe('success');
    if (user.status === 'success') expect(user.data.fullName).toBe('Joseph Boakai');
  });
});
```

- [ ] **Step 5: Run the test**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/lib/presentation/create-renderer-presentation.test.ts`
Expected: PASS (2 tests). (jsdom is fine; no DOM used here but the project resolves the `/testing` subpath.)

- [ ] **Step 6: Lint (composition relaxation must permit the domain/testing imports here)**

Run: `pnpm lint`
Expected: PASS — domain + `/testing` imports allowed under `lib/presentation/**`, banned elsewhere.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/lib/presentation
git commit -m "feat(renderer): compose seeded presentation layer with provider and hooks"
```

---

## Task 9: `useViewModel` binding hook

**Files:**
- Create: `apps/desktop/renderer/hooks/use-view-model.ts`
- Create: `apps/desktop/renderer/hooks/use-view-model.test.tsx`

**Interfaces:**
- Consumes: `StoreApi<S>` from `zustand/vanilla` (the shape every ViewModel `.store` has), React `useSyncExternalStore` via `zustand`'s `useStore`.
- Produces: `useViewModel<S, T>(store: StoreApi<S>, selector: (s: S) => T): T`. Consumed by every component task.

- [ ] **Step 1: Write the failing test**

`apps/desktop/renderer/hooks/use-view-model.test.tsx`:
```tsx
import { act, render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it } from 'vitest';
import { useViewModel } from './use-view-model';

describe('useViewModel', () => {
  it('renders selected state and re-renders on change', () => {
    const store = createStore<{ count: number }>(() => ({ count: 0 }));
    function Probe() {
      const count = useViewModel(store, (s) => s.count);
      return <span data-testid="count">{count}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    act(() => store.setState({ count: 5 }));
    expect(screen.getByTestId('count')).toHaveTextContent('5');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/hooks/use-view-model.test.tsx`
Expected: FAIL — `use-view-model` not found.

- [ ] **Step 3: Implement the hook**

`apps/desktop/renderer/hooks/use-view-model.ts`:
```ts
'use client';

import type { StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';

/** The single bridge from a framework-free ViewModel store to React. Keeps
 * re-renders minimal via the selector. */
export function useViewModel<S, T>(store: StoreApi<S>, selector: (state: S) => T): T {
  return useStore(store, selector);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/hooks/use-view-model.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/hooks/use-view-model.ts apps/desktop/renderer/hooks/use-view-model.test.tsx
git commit -m "feat(renderer): add useViewModel store-binding hook"
```

---

## Task 10: Sidebar + sidebar config

**Files:**
- Create: `apps/desktop/renderer/components/shell/sidebar-config.ts`
- Create: `apps/desktop/renderer/components/shell/Sidebar.tsx`
- Create: `apps/desktop/renderer/components/shell/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `useViewModel`, `useSettingsViewModel`, lucide icons, `next/link`, `usePathname`.
- Produces: `SIDEBAR_NAV: readonly SidebarGroup[]` (school-admin nav from web `sidebarConfig`), `SIDEBAR_DASHBOARD_ITEM`, and `<Sidebar />`. Consumed by Task 13 (layout).

- [ ] **Step 1: Write the nav config**

`apps/desktop/renderer/components/shell/sidebar-config.ts` — port the `school-admin` slice of `Nemis/apps/portal-web/src/components/sidebarConfig.ts` verbatim (same `name`/`href`/`icon`, existing typos preserved). Shape:
```ts
import {
  LayoutDashboard, Map, School, CheckCircle, BookOpen, CalendarCheck, Users,
  FileText, UserPlus, CreditCard, Bell, MessageCircle, Settings2Icon, type LucideIcon,
} from 'lucide-react';

export interface SidebarNavItem { name: string; href: string; icon: LucideIcon; }
export interface SidebarGroup { label: string; items: readonly SidebarNavItem[]; }

export const SIDEBAR_DASHBOARD_ITEM: SidebarNavItem = {
  name: 'Overview', href: '/government/school-admin', icon: LayoutDashboard,
};

export const SIDEBAR_NAV: readonly SidebarGroup[] = [
  { label: 'User Management', items: [
    { name: 'Students', href: '/government/school-admin/students', icon: Map },
    { name: 'Teachers & Staff', href: '/government/school-admin/teachers-staff', icon: School },
    { name: 'Parents & Guardians', href: '/government/school-admin/parents-guardians', icon: CheckCircle },
  ]},
  { label: 'ACADEMIC', items: [
    { name: 'Classes Management', href: '/government/school-admin/classes', icon: BookOpen },
    { name: 'Subjects Management', href: '/government/school-admin/subjects', icon: BookOpen },
    { name: 'Attendence Management', href: '/government/school-admin/attendance', icon: CalendarCheck },
    { name: 'Academic & Grading', href: '/government/school-admin/academic-grading', icon: Users },
    { name: 'General Schedule Management', href: '/government/school-admin/timetable', icon: BookOpen },
    { name: 'Grade Windows', href: '/government/school-admin/academic-grading/windows', icon: FileText },
  ]},
  { label: 'FINANCIAL', items: [
    { name: 'Financial / Fees', href: '/government/school-admin/financial', icon: UserPlus },
    { name: 'Record Payment', href: '/government/school-admin/financial/record-payment', icon: CreditCard },
  ]},
  { label: 'REPORTS', items: [
    { name: 'Reports', href: '/government/school-admin/reports', icon: FileText },
  ]},
  { label: 'COMMUNICATION', items: [
    { name: 'Notifications', href: '/government/school-admin/notifications', icon: Bell },
    { name: 'Messages', href: '/government/school-admin/messages', icon: MessageCircle },
  ]},
  { label: 'SYSTEM', items: [
    { name: 'School Settings', href: '/government/school-admin/settings', icon: Settings2Icon },
  ]},
];
```

- [ ] **Step 2: Write the failing test**

`apps/desktop/renderer/components/shell/Sidebar.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/government/school-admin' }));
vi.mock('../../lib/presentation/hooks', () => ({
  useSettingsViewModel: () => ({ store: { getState: () => ({ profile: { status: 'idle' } }) }, loadProfile: vi.fn() }),
}));

import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('renders every nav group and item with correct hrefs', () => {
    render(<Sidebar institutionName="Monrovia Central School" />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Students').closest('a')).toHaveAttribute('href', '/government/school-admin/students');
    expect(screen.getByText('Attendence Management')).toBeInTheDocument();
    expect(screen.getByText('School Settings')).toBeInTheDocument();
    expect(screen.getByText('Monrovia Central School')).toBeInTheDocument();
  });

  it('marks the active route', () => {
    render(<Sidebar institutionName="X" />);
    expect(screen.getByText('Overview').closest('a')).toHaveClass('bg-slate-800');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell/Sidebar.test.tsx`
Expected: FAIL — `Sidebar` not found.

- [ ] **Step 4: Implement the Sidebar**

`apps/desktop/renderer/components/shell/Sidebar.tsx` — port `Nemis/apps/portal-web/src/components/Sidebar.tsx` structure, replacing Redux/auth with a prop and disabling logout:
```tsx
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell/Sidebar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/shell/sidebar-config.ts apps/desktop/renderer/components/shell/Sidebar.tsx apps/desktop/renderer/components/shell/Sidebar.test.tsx
git commit -m "feat(renderer): school-admin sidebar with ported nav config"
```

---

## Task 11: Header (breadcrumb, search placeholder, notification bell, profile dropdown)

**Files:**
- Create: `apps/desktop/renderer/components/shell/Header.tsx`
- Create: `apps/desktop/renderer/components/shell/page-titles.ts`
- Create: `apps/desktop/renderer/components/shell/Header.test.tsx`

**Interfaces:**
- Consumes: `useViewModel`, `useCurrentUserViewModel`, `useNotificationStore`, `Breadcrumbs`, `Dropdown`, `DropdownItem`, `Avatar` from `@nemis-desktop/ui`, `usePathname`.
- Produces: `resolvePageTitle(pathname): { title: string; segments: string[] }`, `<Header />`. Consumed by Task 13.

- [ ] **Step 1: Write the title/breadcrumb resolver + test**

`apps/desktop/renderer/components/shell/page-titles.ts`:
```ts
const BASE = '/government/school-admin';

const TITLES: Readonly<Record<string, string>> = {
  [BASE]: 'Dashboard Overview',
  [`${BASE}/students`]: 'Students',
  [`${BASE}/teachers-staff`]: 'Teachers & Staff',
  [`${BASE}/parents-guardians`]: 'Parents & Guardians',
  [`${BASE}/classes`]: 'Classes Management',
  [`${BASE}/subjects`]: 'Subjects Management',
  [`${BASE}/attendance`]: 'Attendance Management',
  [`${BASE}/academic-grading`]: 'Academic & Grading',
  [`${BASE}/academic-grading/windows`]: 'Grade Windows',
  [`${BASE}/timetable`]: 'General Schedule Management',
  [`${BASE}/financial`]: 'Financial / Fees',
  [`${BASE}/financial/record-payment`]: 'Record Payment',
  [`${BASE}/reports`]: 'Reports',
  [`${BASE}/notifications`]: 'Notifications',
  [`${BASE}/messages`]: 'Messages',
  [`${BASE}/settings`]: 'School Settings',
};

const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function resolvePageTitle(pathname: string): { title: string; segments: string[] } {
  const title = TITLES[pathname] ?? 'School Admin';
  const segments = pathname.replace(BASE, '').split('/').filter(Boolean).map(titleCase);
  return { title, segments: ['School Admin', ...segments] };
}
```

`apps/desktop/renderer/components/shell/page-titles.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolvePageTitle } from './page-titles';

describe('resolvePageTitle', () => {
  it('resolves the dashboard root', () => {
    expect(resolvePageTitle('/government/school-admin')).toEqual({
      title: 'Dashboard Overview',
      segments: ['School Admin'],
    });
  });
  it('builds a breadcrumb trail for nested routes', () => {
    const r = resolvePageTitle('/government/school-admin/academic-grading/windows');
    expect(r.title).toBe('Grade Windows');
    expect(r.segments).toEqual(['School Admin', 'Academic Grading', 'Windows']);
  });
});
```
Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell/page-titles.test.ts` → after creating the file, expected PASS.

- [ ] **Step 2: Write the failing Header test**

`apps/desktop/renderer/components/shell/Header.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/government/school-admin/students' }));

const notificationStore = createStore(() => ({ notifications: [{ id: 'n1', kind: 'info', message: 'x', autoDismissMs: null, createdAt: 0 }] }));
const currentUserStore = createStore(() => ({ user: { status: 'success', data: { fullName: 'Joseph Boakai', roleLabels: ['Institution admin'] } } }));

vi.mock('../../lib/presentation/hooks', () => ({
  useCurrentUserViewModel: () => ({ store: currentUserStore, loadUser: vi.fn() }),
  useNotificationStore: () => ({ store: notificationStore }),
}));

import { Header } from './Header';

describe('Header', () => {
  it('shows the resolved title, breadcrumb, user, and notification count', () => {
    render(<Header />);
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText(/Home \/ School Admin \/ Students/)).toBeInTheDocument();
    expect(screen.getByText('Joseph Boakai')).toBeInTheDocument();
    expect(screen.getByLabelText(/1 unread notification/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell/Header.test.tsx`
Expected: FAIL — `Header` not found.

- [ ] **Step 4: Implement the Header**

`apps/desktop/renderer/components/shell/Header.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Search, ChevronDown, Bell, LogOut, User2, Settings } from 'lucide-react';
import { Avatar, Breadcrumbs, Dropdown, DropdownItem } from '@nemis-desktop/ui';
import { useCurrentUserViewModel, useNotificationStore } from '../../lib/presentation/hooks';
import { useViewModel } from '../../hooks/use-view-model';
import { resolvePageTitle } from './page-titles';

export function Header() {
  const pathname = usePathname();
  const { title, segments } = resolvePageTitle(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  const currentUser = useCurrentUserViewModel();
  const userState = useViewModel(currentUser.store, (s) => s.user);
  const fullName = userState.status === 'success' ? userState.data.fullName : 'User';
  const roleLabel = userState.status === 'success' ? (userState.data.roleLabels[0] ?? '—') : '—';

  const notifications = useNotificationStore();
  const unread = useViewModel(notifications.store, (s) => s.notifications.length);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-2 lg:px-6 py-2">
      <div className="flex items-center justify-between h-full w-full gap-8">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-primary-500 truncate">{title}</h2>
          <Breadcrumbs segments={segments} />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden md:block w-70 border-r border-gray-200">
            <input
              type="text"
              placeholder="Quick Search..."
              aria-label="Quick search (coming soon)"
              disabled
              className="peer w-full bg-gray-50 pl-11 pr-4 py-2 border-b border-gray-300 focus:outline-none disabled:cursor-not-allowed"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          <button
            type="button"
            className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={`${unread} unread notifications`}
          >
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>

          <Dropdown
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <>
                <Avatar firstName={fullName.split(' ')[0]} lastName={fullName.split(' ')[1]} role="generic" size="md" className="border border-gray-200" alt={fullName} />
                <div className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-sm font-semibold text-gray-900">{fullName}</span>
                  <span className="text-sm font-semibold text-gray-600">{roleLabel}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </>
            }
          >
            <DropdownItem icon={<User2 className="w-4 h-4 text-gray-600" />} onSelect={() => setMenuOpen(false)} disabled>
              Profile (coming soon)
            </DropdownItem>
            <DropdownItem icon={<Settings className="w-4 h-4 text-gray-600" />} onSelect={() => setMenuOpen(false)} disabled>
              Settings (coming soon)
            </DropdownItem>
            <div className="h-px bg-gray-200" />
            <DropdownItem icon={<LogOut className="w-4 h-4 text-gray-600" />} onSelect={() => setMenuOpen(false)} disabled>
              Sign Out (coming soon)
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell/Header.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/shell/Header.tsx apps/desktop/renderer/components/shell/page-titles.ts apps/desktop/renderer/components/shell/page-titles.test.ts apps/desktop/renderer/components/shell/Header.test.tsx
git commit -m "feat(renderer): header with breadcrumb, notification badge, profile menu"
```

---

## Task 12: StatusBar

**Files:**
- Create: `apps/desktop/renderer/components/shell/StatusBar.tsx`
- Create: `apps/desktop/renderer/components/shell/StatusBar.test.tsx`

**Interfaces:**
- Consumes: `useViewModel`, `useConnectivityStore`, `useSyncViewModel`, `selectSyncPresentation`/`selectConnectivityPresentation` from `@nemis-desktop/presentation`, `useAppVersion`.
- Produces: `<StatusBar />`. Consumed by Task 13.

- [ ] **Step 1: Write the failing test**

`apps/desktop/renderer/components/shell/StatusBar.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

const connectivityStore = createStore(() => ({ isOnline: true, syncStatus: 'idle', lastSyncAt: null }));

vi.mock('../../lib/presentation/hooks', () => ({
  useConnectivityStore: () => ({ store: connectivityStore }),
  useSyncViewModel: () => ({ store: connectivityStore }),
}));
vi.mock('../../hooks/useAppVersion', () => ({ useAppVersion: () => ({ version: '1.0.0', error: null }) }));

import { StatusBar } from './StatusBar';

describe('StatusBar', () => {
  it('shows online status, database ready, and app version', () => {
    render(<StatusBar />);
    expect(screen.getByText(/Online/i)).toBeInTheDocument();
    expect(screen.getByText(/Local database ready/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Not synced yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell/StatusBar.test.tsx`
Expected: FAIL — `StatusBar` not found.

- [ ] **Step 3: Implement the StatusBar**

`apps/desktop/renderer/components/shell/StatusBar.tsx`:
```tsx
'use client';

import { Wifi, WifiOff, Database, RefreshCw } from 'lucide-react';
import {
  selectConnectivityPresentation,
  selectSyncPresentation,
} from '@nemis-desktop/presentation';
import { useConnectivityStore } from '../../lib/presentation/hooks';
import { useViewModel } from '../../hooks/use-view-model';
import { useAppVersion } from '../../hooks/useAppVersion';

export function StatusBar() {
  const connectivity = useConnectivityStore();
  const isOnline = useViewModel(connectivity.store, (s) => s.isOnline);
  const connLabel = useViewModel(connectivity.store, (s) => selectConnectivityPresentation(s).label);
  const syncLabel = useViewModel(connectivity.store, (s) => selectSyncPresentation(s).label);
  const { version } = useAppVersion();

  return (
    <footer
      className="flex items-center justify-between h-7 px-4 bg-slate-100 border-t border-slate-200 text-[11px] text-slate-600"
      role="status"
      aria-label="Application status"
    >
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          {isOnline ? <Wifi className="w-3.5 h-3.5 text-active" /> : <WifiOff className="w-3.5 h-3.5 text-error" />}
          {connLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          {syncLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-active" />
          Local database ready
        </span>
        <span>0 pending changes</span>
      </div>
      <span>NEMIS Desktop v{version ?? '—'}</span>
    </footer>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell/StatusBar.test.tsx`
Expected: PASS. (Confirm `selectConnectivityPresentation` returns label `Online`/`Offline` and `selectSyncPresentation` returns `Not synced yet` for idle+null; if the actual labels differ, update the test assertions to the real strings from `present-status.ts`.)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/shell/StatusBar.tsx apps/desktop/renderer/components/shell/StatusBar.test.tsx
git commit -m "feat(renderer): status bar bound to connectivity store"
```

---

## Task 13: ComingSoon, RouteGuard, ToastHost, and the school-admin layout

**Files:**
- Create: `apps/desktop/renderer/components/shell/ComingSoon.tsx`
- Create: `apps/desktop/renderer/components/shell/RouteGuard.tsx`
- Create: `apps/desktop/renderer/components/shell/ToastHost.tsx`
- Create: `apps/desktop/renderer/components/shell/ToastHost.test.tsx`
- Replace: `apps/desktop/renderer/app/layout.tsx`
- Create: `apps/desktop/renderer/app/providers.tsx`
- Create: `apps/desktop/renderer/app/government/school-admin/layout.tsx`
- Delete: `apps/desktop/renderer/layouts/AppShell.tsx`, `layouts/Header.tsx`, `layouts/Sidebar.tsx`

**Interfaces:**
- Consumes: shell components, `PresentationProvider`, `createRendererPresentation`, `useNotificationStore`, `useSettingsViewModel`.
- Produces: `ComingSoon({ title })`, `RouteGuard({ children })`, `ToastHost`, `RootProviders`, the portal `<SchoolAdminLayout>`. Consumed by Tasks 14–16.

- [ ] **Step 1: ComingSoon**

`apps/desktop/renderer/components/shell/ComingSoon.tsx`:
```tsx
import { Construction } from 'lucide-react';
import { EmptyState } from '@nemis-desktop/ui';

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="p-8">
      <EmptyState
        icon={<Construction className="w-12 h-12" />}
        title={title}
        description="This page has not been migrated to the desktop client yet. It will follow the same Component → ViewModel → Presentation pattern as the Dashboard."
      />
    </div>
  );
}
```

- [ ] **Step 2: RouteGuard (pass-through seam)**

`apps/desktop/renderer/components/shell/RouteGuard.tsx`:
```tsx
'use client';

import type { ReactNode } from 'react';

/** Seam for the authentication phase. Today the mocked user is always present,
 * so this renders children unconditionally. Auth redirects land here. */
export function RouteGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 3: ToastHost + test**

`apps/desktop/renderer/components/shell/ToastHost.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

const store = createStore(() => ({ notifications: [{ id: 'n1', kind: 'success', message: 'Saved!', autoDismissMs: null, createdAt: 0 }] }));
vi.mock('../../lib/presentation/hooks', () => ({ useNotificationStore: () => ({ store, dismiss: vi.fn() }) }));

import { ToastHost } from './ToastHost';

describe('ToastHost', () => {
  it('renders notifications from the store', () => {
    render(<ToastHost />);
    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });
});
```

`apps/desktop/renderer/components/shell/ToastHost.tsx`:
```tsx
'use client';

import { X } from 'lucide-react';
import { useNotificationStore } from '../../lib/presentation/hooks';
import { useViewModel } from '../../hooks/use-view-model';

const KIND_STYLES: Record<string, string> = {
  success: 'border-l-active',
  info: 'border-l-secondary',
  warning: 'border-l-pending',
  error: 'border-l-error',
};

export function ToastHost() {
  const store = useNotificationStore();
  const notifications = useViewModel(store.store, (s) => s.notifications);

  if (notifications.length === 0) return null;
  return (
    <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 w-80" aria-live="polite">
      {notifications.map((n) => (
        <div key={n.id} className={`bg-white border border-slate-200 border-l-4 ${KIND_STYLES[n.kind] ?? 'border-l-slate-400'} rounded-md shadow-sm p-3 flex items-start gap-2`}>
          <p className="text-sm text-slate-800 flex-1">{n.message}</p>
          <button type="button" aria-label="Dismiss" onClick={() => store.dismiss(n.id)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Root providers (async composition on the client)**

`apps/desktop/renderer/app/providers.tsx`:
```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { PresentationLayer } from '@nemis-desktop/presentation';
import { PresentationProvider } from '../lib/presentation/presentation-provider';
import { createRendererPresentation } from '../lib/presentation/create-renderer-presentation';
import { Spinner } from '@nemis-desktop/ui';

export function RootProviders({ children }: { children: ReactNode }) {
  const [layer, setLayer] = useState<PresentationLayer | null>(null);

  useEffect(() => {
    let active = true;
    void createRendererPresentation().then((l) => {
      if (active) setLayer(l);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!layer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    );
  }
  return <PresentationProvider layer={layer}>{children}</PresentationProvider>;
}
```

- [ ] **Step 5: Replace the root layout**

`apps/desktop/renderer/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Crete_Round, Lato, Poppins } from 'next/font/google';
import '@/styles/globals.css';
import { RootProviders } from './providers';

const creteRound = Crete_Round({ subsets: ['latin'], weight: ['400'], variable: '--font-crete-round', display: 'swap' });
const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-lato', display: 'swap' });
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins', display: 'swap' });

export const metadata: Metadata = {
  title: 'NEMIS Desktop',
  description: 'Offline-first desktop client for the NEMIS platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${creteRound.variable} ${lato.variable} ${poppins.variable} font-sans antialiased bg-neutral-light text-slate-900`}>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Portal layout**

`apps/desktop/renderer/app/government/school-admin/layout.tsx`:
```tsx
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
```
Note: `@/` maps to `renderer/` (see `renderer/tsconfig.json` paths). Import the seed constants from `@/lib/presentation/seed-demo-data` — this is a type/constant-only import (no domain), so the ESLint guard allows it.

- [ ] **Step 7: Delete the Phase-1 scaffold layouts**

```bash
git rm apps/desktop/renderer/layouts/AppShell.tsx apps/desktop/renderer/layouts/Header.tsx apps/desktop/renderer/layouts/Sidebar.tsx
```

- [ ] **Step 8: Run the ToastHost test + typecheck + lint**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell/ToastHost.test.tsx && pnpm --filter @nemis-desktop/app typecheck && pnpm lint`
Expected: PASS. (`app/page.tsx` still imports the deleted `useAppVersion` layout? No — `useAppVersion` lives in `hooks/`, untouched. `app/page.tsx` is replaced in Task 14.)

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/renderer
git commit -m "feat(renderer): portal shell layout, providers, ComingSoon, ToastHost, RouteGuard"
```

---

## Task 14: Routing — root redirect, 404, and ComingSoon route pages

**Files:**
- Replace: `apps/desktop/renderer/app/page.tsx`
- Create: `apps/desktop/renderer/app/not-found.tsx`
- Create: 15 route pages under `apps/desktop/renderer/app/government/school-admin/**/page.tsx` (all ComingSoon except the dashboard root, which is Task 15)
- Create: `apps/desktop/renderer/public/` fallback avatar assets (copy from web `public/`)

**Interfaces:**
- Consumes: `ComingSoon`, `resolvePageTitle`, `next/navigation` `redirect`.
- Produces: navigable routes mirroring the web paths; unknown routes hit `not-found.tsx`.

- [ ] **Step 1: Root redirect**

`apps/desktop/renderer/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/government/school-admin');
}
```

- [ ] **Step 2: 404 page**

`apps/desktop/renderer/app/not-found.tsx`:
```tsx
import Link from 'next/link';
import { EmptyState, Button } from '@nemis-desktop/ui';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-screen bg-neutral-light">
      <EmptyState
        icon={<FileQuestion className="w-12 h-12" />}
        title="Page not found"
        description="The page you are looking for does not exist in the desktop client."
        action={
          <Link href="/government/school-admin">
            <Button variant="primary">Back to Dashboard</Button>
          </Link>
        }
      />
    </div>
  );
}
```
(Confirm `Button` accepts `variant="primary"`; if the ported prop differs, use the correct variant name.)

- [ ] **Step 3: Create the 15 ComingSoon route pages**

For each route below, create `app/government/school-admin/<path>/page.tsx`. Each file:
```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';
import { resolvePageTitle } from '@/components/shell/page-titles';

export default function Page() {
  return <ComingSoon title={resolvePageTitle('/government/school-admin/<path>').title} />;
}
```
Paths (replace `<path>` and the string literal for each):
`students`, `teachers-staff`, `parents-guardians`, `classes`, `subjects`, `attendance`, `academic-grading`, `academic-grading/windows`, `timetable`, `financial`, `financial/record-payment`, `reports`, `notifications`, `messages`, `settings`.

- [ ] **Step 4: Copy avatar fallback assets**

Copy these from `Nemis/apps/portal-web/public/` to `apps/desktop/renderer/public/` (Avatar references them): `avatar-placeholder.jpg`, `teacher-fallback.jpg`, `student-fallback.jpg`, `generic`/others as present. If a file is missing in web `public/`, ship a 1×1 transparent placeholder with the same name so `next build` does not 404 at runtime.
```bash
mkdir -p apps/desktop/renderer/public
cp ../../Nemis/apps/portal-web/public/avatar-placeholder.jpg apps/desktop/renderer/public/ 2>/dev/null || true
cp ../../Nemis/apps/portal-web/public/teacher-fallback.jpg apps/desktop/renderer/public/ 2>/dev/null || true
```
(Adjust to the assets that actually exist. The Avatar falls back to initials when `src` is absent, so for the mocked user with no photo this is non-fatal, but copy what exists.)

- [ ] **Step 5: Typecheck + build the renderer**

Run: `pnpm --filter @nemis-desktop/app typecheck && pnpm --filter @nemis-desktop/app build:renderer`
Expected: `next build` static export succeeds; all 16 school-admin routes + 404 emitted under `renderer/out/`.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer
git commit -m "feat(renderer): routing — redirect, 404, and ComingSoon route pages"
```

---

## Task 15: Dashboard sub-components

**Files:**
- Create: `apps/desktop/renderer/components/dashboard/StatCard.tsx`, `QuickActionCard.tsx`, `ActivityItem.tsx`, `RecentActivityFeed.tsx`, `TeachersListSection.tsx`, `DashboardGreeting.tsx`

**Interfaces:**
- Consumes: `@nemis-desktop/ui` (`Card`, `Spinner`, `EmptyState`, `Avatar`), lucide icons, `next/link`, `DashboardStat`.
- Produces: presentational components used by Task 16. `StatCard({ stat, icon })`, `QuickActionCard({ title, description, icon, href, variant? })`, `ActivityItem({ icon, title, description, time, variant? })`, `RecentActivityFeed` (static placeholder items), `TeachersListSection` (EmptyState placeholder), `DashboardGreeting({ name })`.

- [ ] **Step 1: Port QuickActionCard and ActivityItem verbatim**

Copy `Nemis/apps/portal-web/src/components/school_admin/QuickActionCard.tsx` and `ActivityItem.tsx` into `apps/desktop/renderer/components/dashboard/` unchanged (they use only `next/link` + lucide).

- [ ] **Step 2: StatCard (placeholder-aware)**

`apps/desktop/renderer/components/dashboard/StatCard.tsx`:
```tsx
import type { LucideIcon } from 'lucide-react';
import { Card } from '@nemis-desktop/ui';
import type { DashboardStat } from '@nemis-desktop/presentation';

export function StatCard({ stat, icon: Icon }: { stat: DashboardStat; icon: LucideIcon }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{stat.label}</p>
        {stat.placeholder && (
          <span className="text-[10px] font-semibold uppercase text-pending" title="Sample data — not yet backed by a workflow">
            sample
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-4xl font-bold text-slate-900">{stat.value}</p>
        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
          <Icon className="w-6 h-6 text-slate-600" />
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: RecentActivityFeed and TeachersListSection (static placeholders)**

`RecentActivityFeed.tsx` — render the web component's placeholder branch only (no data hook):
```tsx
import { Card } from '@nemis-desktop/ui';
import { Bell, CalendarCheck, BookOpen, Users } from 'lucide-react';
import ActivityItem from './ActivityItem';

export default function RecentActivityFeed() {
  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-dark flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" /> Recent Activity
        </h2>
        <p className="text-sm text-gray-600 mt-1">Sample activity — live feed arrives with sync</p>
      </div>
      <div className="space-y-0">
        <ActivityItem icon={CalendarCheck} title="Attendance Tracking Active" description="Daily attendance monitoring is enabled" time="Today" variant="info" />
        <ActivityItem icon={BookOpen} title="Academic Year in Progress" description="Classes are in session" time="Ongoing" variant="default" />
        <ActivityItem icon={Users} title="System Ready" description="All systems operational" time="Now" variant="success" />
      </div>
    </Card>
  );
}
```
`TeachersListSection.tsx` — render the EmptyState branch (no staff use case):
```tsx
import { Card, EmptyState } from '@nemis-desktop/ui';
import { Users } from 'lucide-react';

export default function TeachersListSection() {
  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-dark flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Teaching Staff
        </h2>
        <p className="text-sm text-gray-600 mt-1">Teacher management arrives in a later phase</p>
      </div>
      <EmptyState icon={<Users className="w-12 h-12" />} title="Teacher directory not available yet" description="Staff records will appear here once teacher management is migrated." />
    </Card>
  );
}
```

- [ ] **Step 4: DashboardGreeting**

`apps/desktop/renderer/components/dashboard/DashboardGreeting.tsx`:
```tsx
import { Avatar } from '@nemis-desktop/ui';

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  return 'Good evening,';
}

export function DashboardGreeting({ name }: { name: string }) {
  const now = new Date();
  const formattedDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
  const [first, last] = name.split(' ');
  return (
    <div className="bg-primary p-6 rounded-card">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar firstName={first} lastName={last} role="generic" size={64} className="border-2 border-slate-400" alt={name} />
          <div>
            <p className="text-sm text-slate-400 font-semibold">{greeting(now.getHours())}</p>
            <h2 className="text-xl font-bold text-slate-100">{name}</h2>
            <p className="text-sm text-slate-400 font-semibold">School Principal</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-600 self-start lg:self-auto rounded">
          <span className="text-sm font-semibold text-slate-100">{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @nemis-desktop/app typecheck`
Expected: PASS. (Confirm `Avatar` `size` accepts a number — it does per web props.)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/dashboard
git commit -m "feat(renderer): dashboard sub-components (stat card, greeting, placeholders)"
```

---

## Task 16: Dashboard page

**Files:**
- Create: `apps/desktop/renderer/app/government/school-admin/page.tsx`
- Create: `apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`

**Interfaces:**
- Consumes: `useDashboardViewModel`, `useCurrentUserViewModel`, `useViewModel`, dashboard sub-components, `Skeleton`/`ErrorState` from `@nemis-desktop/ui`.
- Produces: the migrated dashboard page at the portal root.

- [ ] **Step 1: Write the failing test**

`apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DashboardPage from './page';

describe('School Admin dashboard', () => {
  it('renders the real seeded student total', async () => {
    const layer = await createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <DashboardPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Total Students')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    // Placeholder tiles are marked
    expect(screen.getAllByText(/sample/i).length).toBeGreaterThan(0);
  });
});
```
Note: this test needs `next/navigation` mocked if the page imports it. The page below does not use `usePathname`, so no mock needed. If a sub-component uses `next/link`, jsdom renders it as an anchor — fine.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`
Expected: FAIL — page not implemented.

- [ ] **Step 3: Implement the dashboard page**

`apps/desktop/renderer/app/government/school-admin/page.tsx`:
```tsx
'use client';

import { useEffect } from 'react';
import { Users, UserCog2, Layers3, UserPlus, CalendarCheck, BookOpen, GraduationCap, Bell, Settings, Calendar } from 'lucide-react';
import { Skeleton, ErrorState } from '@nemis-desktop/ui';
import { useDashboardViewModel, useCurrentUserViewModel } from '@/lib/presentation/hooks';
import { useViewModel } from '@/hooks/use-view-model';
import { StatCard } from '@/components/dashboard/StatCard';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import QuickActionCard from '@/components/dashboard/QuickActionCard';
import RecentActivityFeed from '@/components/dashboard/RecentActivityFeed';
import TeachersListSection from '@/components/dashboard/TeachersListSection';

const STAT_ICONS: Record<string, typeof Users> = {
  'total-students': Users,
  'total-teachers': UserCog2,
  'total-classes': Layers3,
  'avg-class-size': Users,
  'male-students': Users,
  'female-students': Users,
};

export default function DashboardPage() {
  const dashboard = useDashboardViewModel();
  const currentUser = useCurrentUserViewModel();

  useEffect(() => {
    void dashboard.loadSummary();
  }, [dashboard]);

  const summary = useViewModel(dashboard.store, (s) => s.summary);
  const user = useViewModel(currentUser.store, (s) => s.user);
  const name = user.status === 'success' ? user.data.fullName : 'Principal';

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <DashboardGreeting name={name} />

        {summary.status === 'error' ? (
          <ErrorState message={summary.error.userMessage} onRetry={() => void dashboard.loadSummary()} />
        ) : summary.status === 'loading' || summary.status === 'idle' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-card" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {summary.data.stats.map((stat) => (
              <StatCard key={stat.key} stat={stat} icon={STAT_ICONS[stat.key] ?? Users} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-300 rounded-card p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuickActionCard title="Add Student" description="Enroll a new student" icon={UserPlus} href="/government/school-admin/students" variant="primary" />
              <QuickActionCard title="Record Attendance" description="Mark daily attendance" icon={CalendarCheck} href="/government/school-admin/attendance" variant="primary" />
              <QuickActionCard title="Manage Classes" description="View and edit classes" icon={BookOpen} href="/government/school-admin/classes" />
              <QuickActionCard title="Grade Records" description="View student grades" icon={GraduationCap} href="/government/school-admin/academic-grading" />
              <QuickActionCard title="Add Teacher" description="Register new staff" icon={UserCog2} href="/government/school-admin/teachers-staff" />
              <QuickActionCard title="Timetable" description="Manage schedules" icon={Calendar} href="/government/school-admin/timetable" />
              <QuickActionCard title="Notifications" description="Send announcements" icon={Bell} href="/government/school-admin/notifications" />
              <QuickActionCard title="Settings" description="School configuration" icon={Settings} href="/government/school-admin/settings" />
            </div>
          </div>
          <RecentActivityFeed />
        </div>

        <TeachersListSection />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`
Expected: PASS. (`summary.error.userMessage` — confirm `PresentationError` exposes `userMessage`; it does per `to-presentation-error.ts`/async-runner usage.)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/app/government/school-admin/page.tsx apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx
git commit -m "feat(renderer): migrate School Admin dashboard page"
```

---

## Task 17: Documentation

**Files:**
- Create: `docs/desktop-shell.md`
- Modify: `docs/conventions.md`

**Interfaces:**
- Produces: the 8 spec deliverables + a "how to add a page" convention section.

- [ ] **Step 1: Write `docs/desktop-shell.md`**

Cover all eight deliverables (headings): 1) Desktop Shell architecture (composition root → provider → hooks → useViewModel → ViewModel → fake application; the Phase-8 seam), 2) Component reuse report + the divergence table from the spec §7.2 (plus: dashboard data hooks → DashboardViewModel; sidebar mobile slide-over removed; Toast/Swal → ToastHost+NotificationStore; search/profile/settings/logout disabled), 3) Routing diagram (the §6 map), 4) Shared component inventory (15 ported + Breadcrumbs/Dropdown/Skeleton/ErrorState), 5) Desktop adaptations (StatusBar, min window already 1024×700, focus-visible, skip link, styled scrollbars, Escape-closes-dropdown), 6) Remaining pages to migrate (the 15 ComingSoon routes + Teacher/County/DEO portals), 7) Technical debt (placeholder stats; gender split needs an app count query; disabled search/logout/profile/settings; `NetworkUnavailableError` unmapped; Phase-5 `as never` adapter debt; demo data non-persistent), 8) Recommendations before Phase 8 (build the IPC facade shaped as `ApplicationLayer`; complete business repo adapters; add a real student-count/summary query; then swap only `create-renderer-presentation.ts`).

- [ ] **Step 2: Append a "Adding a desktop page" section to `docs/conventions.md`**

Document the pattern: add route under `app/government/school-admin/<path>/page.tsx` → replace `ComingSoon` with a `'use client'` page → `useXxxViewModel()` + `useViewModel(store, selector)` → render `AsyncState` (idle/loading→Skeleton, error→ErrorState, empty→EmptyState, success→data). Never import application/domain/electron. Add nav entry to `sidebar-config.ts` and title to `page-titles.ts`.

- [ ] **Step 3: Commit**

```bash
git add docs/desktop-shell.md docs/conventions.md
git commit -m "docs: desktop shell architecture, routing, reuse, and debt"
```

---

## Task 18: Full gate and production build

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole workspace**

Run: `pnpm typecheck`
Expected: PASS (all projects incl. renderer).

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS (renderer boundary guard clean; no `any`).

- [ ] **Step 3: Full test suite (both projects)**

Run: `pnpm rebuild:node && pnpm test`
Expected: PASS — node project (all prior + dashboard) and renderer project (UI, hook, shell, dashboard tests).

- [ ] **Step 4: Production renderer build (static export)**

Run: `pnpm --filter @nemis-desktop/app build:renderer`
Expected: `next build` succeeds; `renderer/out/` contains the dashboard, 15 ComingSoon routes, and 404.

- [ ] **Step 5: Electron package smoke + restore Electron ABI**

Run: `pnpm rebuild:electron && pnpm --filter @nemis-desktop/app package`
Expected: Forge `package` completes (app boots to the seeded dashboard when launched). Leave the native module on the Electron ABI for subsequent dev/run.

- [ ] **Step 6: Final verification commit (if any lockfile/config drift)**

```bash
git add -A
git commit -m "chore: Phase 7 gate green (typecheck, lint, tests, build, package)" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** Shell (Tasks 10–13), routing (14), UI library (4–5), theme (6), dashboard + DashboardViewModel (3, 15, 16), composition/binding/boundary (7–9), offline placeholders (12), accessibility (6 focus-visible + 13 skip link/landmarks + 5 Dropdown Escape), testing (1 + per-task), docs (17), gate (18). Min-window adaptation confirmed already-present (no task needed). Every spec §maps to a task.
- **Real vs placeholder honesty:** only `total-students` is real (Task 3); enforced in the ViewModel test and the dashboard test.
- **Boundary:** Task 7 guard proven by a probe; composition relaxation scoped to `lib/presentation/**` (Task 8 uses domain there).
- **Type consistency:** `DashboardStat`/`DashboardSummaryView` defined in Task 3 and consumed by Tasks 15–16; `useViewModel(store, selector)` signature stable across Tasks 9–16; `createRendererPresentation`/`DEMO_*` constants defined in Task 8, used in 13/16.
- **Verified against source:** `presentConnectivity` → `Online`/`Offline`, `presentSyncStatus(idle, null)` → `Not synced yet` (Task 12 assertions correct); `PresentationError.userMessage` exists (Task 16 correct); `StudentSummaryOutput` has no gender so only the total is real (Task 3); `Avatar.size` accepts a number, `EmptyState`/`Card`/`Spinner` prop shapes as ported (Tasks 15–16).
- **Assumptions to verify during execution (flagged inline, each with a fallback):** `Button` variant prop name (Task 14 — inspect ported `Button.tsx`); presence of specific web `public/` avatar assets (Task 14 — copy what exists, initials fallback otherwise).
