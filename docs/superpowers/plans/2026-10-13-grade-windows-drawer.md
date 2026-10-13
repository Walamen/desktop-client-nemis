# Grade Entry Windows Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone Grade Entry Windows page with a drawer on the school-admin Academic Grading page, keep the View Grades results page, and make `?open=` deep links (including the sidebar's) work even when the page is already showing.

**Architecture:** A new `GradeEntryWindowsDrawer` follows the existing `AcademicYearsDrawer` pattern: a `Drawer` wrapper around a manager keyed by `useOpenSession`, with `list | create | unpublish` views swapped in the drawer body and `useEscapeCapture` returning Escape to the list. `AcademicGradingPage` gains a `windows` drawer target and switches its deep-link read from a mount-only `queryParam` to `useSearchParams()` (route wrapped in `<Suspense>`), so soft navigations from the persistent sidebar open drawers too.

**Tech Stack:** Next.js 15 (static export) renderer in Electron, React, TypeScript, Tailwind, `@nemis-desktop/ui` (`Drawer`, `Input`), Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-13-grade-windows-drawer-design.md`

## Global Constraints

- Desktop renderer, School Admin only. No view-model / IPC / bridge / data changes. No portal-web changes.
- The View Grades results page **stays**: route `app/government/school-admin/academic-grading/windows/grades/page.tsx` and `WindowGradesPage` are kept; only its "Back to Windows" link target changes.
- Deleted: `app/government/school-admin/academic-grading/windows/page.tsx` and `components/academic-grading/GradeWindowsPage.tsx`.
- Drawer: `size="xl"`, title `"Grade Entry Windows"`.
- Deep link: `academicSetupHref('windows')` → `/government/school-admin/academic-grading?open=windows`.
- Sidebar TEACHING item: `{ name: 'Grade Entry & Results', href: academicSetupHref('windows'), icon: ClipboardCheck, alsoActiveOn: ['/government/school-admin/academic-grading/windows'] }`.
- Lifecycle saves (collection `grade_entry_windows`, unchanged): DRAFT→Open Window `{ status: 'OPEN', openedAt }`; OPEN→Close Window `{ status: 'CLOSED', closedAt }`; CLOSED→Publish Grades `{ status: 'PUBLISHED', publishedAt }`; CLOSED/PUBLISHED→Reopen `{ status: 'OPEN', openedAt }`; PUBLISHED→Unpublish (confirmed) `{ status: 'CLOSED' }`. Timestamps are `new Date().toISOString()`.
- Create save (unchanged): `{ gradingPeriodId, name, description: description || null, openDate, closeDate, status: 'DRAFT', allowedRoles: JSON.stringify(['TEACHER']) }`.
- Unpublish confirmation phrase (verbatim): `unpublish this window`.
- View Grades href (verbatim): `` `/government/school-admin/academic-grading/windows/grades?id=${win.id}` ``, shown for CLOSED and PUBLISHED.
- All UI copy in the cards, create form and unpublish confirmation is carried over verbatim from `GradeWindowsPage.tsx`.
- Tests touching `window.nemis` use the cast `(window as unknown as { nemis: unknown }).nemis` (via `setup-test-support.tsx`). ui `Input`/`Select` labels have no `htmlFor`; reach controls with `field(label)` from `setup-test-support.tsx`.
- Commit trailer: end every commit message with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Commands** (from repo root `desktop-client-nemis/`):
- Tests: `pnpm exec vitest run --project renderer <paths…>`
- Typecheck: `pnpm --filter @nemis-desktop/app typecheck`
- Lint: `pnpm lint` (must exit 0 — it does on `main` at 458afad)
- Build: `pnpm --filter @nemis-desktop/app build:renderer`

**Baseline** (`main` at 458afad): `pnpm lint` exit 0; typecheck passes; renderer suite 336 pass / 2 known failures (`app/page.test` login, teacher `timetable.test`) + 1 known unhandled error (Sidebar logout `.finally`).

## Review Focus

1. **Sidebar "Grade Entry & Results" clicked while already on Academic Grading** — expected: the Windows drawer opens (soft navigation, no remount). Pinned in Task 2 (simulated URL change + re-render).
2. **Sidebar clicked again after switching drawers in-page** (e.g. arrived via `?open=windows`, then clicked the Years card) — expected: the Windows drawer opens again. If the stale `?open=windows` stayed in the URL, the second click would be a same-URL no-op. Fixed by clearing the query in `navigate` too; pinned in Task 2.
3. **Create form offering another year's terms** — the academic-foundation view model is an app-wide singleton, so `terms` can briefly hold another year's rows. Expected: the Term select lists only the current year's terms. Pinned in Task 1.
4. **Escape inside Create or Unpublish** — expected: back to the list with the drawer still open; a second Escape closes it. Pinned in Task 1.
5. **Being on the View Grades results page** — expected: the sidebar highlights "Grade Entry & Results", not "Academic Grading". Pinned in Task 3.

---

## File Structure

Create:
- `apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.tsx` — the drawer (list / create / unpublish views).
- `apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx`

Modify:
- `apps/desktop/renderer/lib/academic-setup.ts` (+ `.test.ts`) — `windows` target.
- `apps/desktop/renderer/components/academic-grading/AcademicGradingPage.tsx` (+ `.test.tsx`) — card → drawer, `useSearchParams` effect, `navigate` clears query.
- `apps/desktop/renderer/app/government/school-admin/academic-grading/page.tsx` — `<Suspense>`.
- `apps/desktop/renderer/components/academic-grading/WindowGradesPage.tsx` — back link.
- `apps/desktop/renderer/components/shell/sidebarConfig.ts` (+ `Sidebar.test.tsx`, `page-titles.test.ts`).

Delete:
- `apps/desktop/renderer/app/government/school-admin/academic-grading/windows/page.tsx`
- `apps/desktop/renderer/components/academic-grading/GradeWindowsPage.tsx`

---

### Task 1: `GradeEntryWindowsDrawer`

**Files:**
- Create: `apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.tsx`
- Test: `apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx`

**Interfaces:**
- Consumes (existing): `SetupDrawerProps`, `useOpenSession` from `./setup-drawers`; `useEscapeCapture` from `./use-escape-capture`; `formatDateShort`, `listAllWindows`, `listPeriodsForTerm`, `WINDOW_STATUS_CHIP`, `WINDOW_STATUS_RAIL` from `./shared`; `useAcademicFoundationViewModel`, `useAcademicYearViewModel` from `@/lib/presentation/hooks/school-admin`; test support `CURRENT_YEAR`, `termRow`, `stubNemis`, `clearNemis`, `renderWithLayer`, `field` from `./setup-test-support`.
- Produces: `export function GradeEntryWindowsDrawer(props: SetupDrawerProps): JSX.Element` (consumed by Task 2).

- [ ] **Step 1: Write the failing tests**

`apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const data = vi.hoisted(() => ({
  windows: [] as Record<string, unknown>[],
  periods: [] as Record<string, unknown>[],
}));

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async ({ collection }: { collection: string }) => ({
      items: collection === 'grade_entry_windows' ? data.windows : collection === 'grading_periods' ? data.periods : [],
      total: 0,
    })),
    saveSchoolAdminRecord: vi.fn(async () => ({})),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { sharedBridge } from '@/services/nemis-bridge/shared';
import { GradeEntryWindowsDrawer } from './GradeEntryWindowsDrawer';
import { CURRENT_YEAR, clearNemis, field, renderWithLayer, stubNemis, termRow } from './setup-test-support';

const win = (over: Record<string, unknown> = {}) => ({
  id: 'w1', name: 'Period 1 Entry', description: null, status: 'DRAFT',
  openDate: '2026-01-05', closeDate: '2026-01-20', gradingPeriodId: 'p1', ...over,
});
const props = () => ({ isOpen: true, onClose: vi.fn(), onNavigate: vi.fn() });
const save = () => vi.mocked(sharedBridge.saveSchoolAdminRecord);

const ACTIONS = ['Open Window', 'Close Window', 'Publish Grades', 'Reopen', 'Unpublish', 'View Grades'];
const shown = () => ACTIONS.filter((name) => screen.queryByRole('button', { name }) ?? screen.queryByRole('link', { name }));

async function renderDrawer(windows: Record<string, unknown>[], p = props()) {
  data.windows = windows;
  data.periods = [{ id: 'p1', termId: 't1', name: 'Period 1' }, { id: 'p9', termId: 't9', name: 'Other Term Period' }];
  stubNemis({ currentYear: CURRENT_YEAR, terms: [termRow(), termRow({ id: 't0', academicYearId: 'y0', name: 'Old Year Term' })] });
  await renderWithLayer(<GradeEntryWindowsDrawer {...p} />);
  return p;
}

afterEach(() => {
  clearNemis();
  vi.clearAllMocks();
  data.windows = [];
  data.periods = [];
});

describe('GradeEntryWindowsDrawer list view', () => {
  it('lists windows under the drawer title', async () => {
    await renderDrawer([win()]);
    expect(screen.getByRole('heading', { level: 2, name: 'Grade Entry Windows' })).toBeInTheDocument();
    expect(await screen.findByText('Period 1 Entry')).toBeInTheDocument();
  });

  it('shows the empty state when there are no windows', async () => {
    await renderDrawer([]);
    expect(await screen.findByText('No grade entry windows found.')).toBeInTheDocument();
  });

  it.each([
    ['DRAFT', ['Open Window']],
    ['OPEN', ['Close Window']],
    ['CLOSED', ['Publish Grades', 'Reopen', 'View Grades']],
    ['PUBLISHED', ['Reopen', 'Unpublish', 'View Grades']],
  ])('offers exactly the %s actions', async (status, expected) => {
    await renderDrawer([win({ status })]);
    await screen.findByText('Period 1 Entry');
    expect(shown().sort()).toEqual([...expected].sort());
  });

  it.each([
    ['DRAFT', 'Open Window', 'OPEN', 'openedAt'],
    ['OPEN', 'Close Window', 'CLOSED', 'closedAt'],
    ['CLOSED', 'Publish Grades', 'PUBLISHED', 'publishedAt'],
    ['CLOSED', 'Reopen', 'OPEN', 'openedAt'],
  ])('a %s window: %s saves status %s with %s', async (status, button, next, stamp) => {
    await renderDrawer([win({ status })]);
    fireEvent.click(await screen.findByRole('button', { name: button }));
    await waitFor(() =>
      expect(save()).toHaveBeenCalledWith({
        collection: 'grade_entry_windows',
        record: { id: 'w1', status: next, [stamp]: expect.any(String) },
      }),
    );
  });

  it('links View Grades to the results page for that window', async () => {
    await renderDrawer([win({ status: 'CLOSED' })]);
    expect(await screen.findByRole('link', { name: 'View Grades' })).toHaveAttribute(
      'href',
      '/government/school-admin/academic-grading/windows/grades?id=w1',
    );
  });
});

describe('GradeEntryWindowsDrawer create view', () => {
  it('only offers the current year\'s terms, and periods only after a term is chosen', async () => {
    await renderDrawer([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Create Window' }));
    expect(screen.getByRole('heading', { name: 'Create Grade Entry Window' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Term 1' });
    expect(screen.queryByRole('option', { name: 'Old Year Term' })).toBeNull();
    expect(field('Grading Period')).toBeDisabled();
    fireEvent.change(field('Term'), { target: { value: 't1' } });
    expect(await screen.findByRole('option', { name: 'Period 1' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Other Term Period' })).toBeNull();
    expect(field('Grading Period')).toBeEnabled();
  });

  it('first Escape leaves the form, second Escape closes the drawer', async () => {
    const p = await renderDrawer([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Create Window' }));
    fireEvent.keyDown(field('Window Name'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Grade Entry Window' })).toBeNull());
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('saves a DRAFT window for TEACHER and returns to the list', async () => {
    await renderDrawer([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Create Window' }));
    await screen.findByRole('option', { name: 'Term 1' });
    fireEvent.change(field('Term'), { target: { value: 't1' } });
    await screen.findByRole('option', { name: 'Period 1' });
    fireEvent.change(field('Grading Period'), { target: { value: 'p1' } });
    fireEvent.change(field('Window Name'), { target: { value: 'Period 1 Entry' } });
    fireEvent.change(field('Open Date'), { target: { value: '2026-01-05' } });
    fireEvent.change(field('Close Date'), { target: { value: '2026-01-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Window' }));
    await waitFor(() =>
      expect(save()).toHaveBeenCalledWith({
        collection: 'grade_entry_windows',
        record: {
          gradingPeriodId: 'p1', name: 'Period 1 Entry', description: null,
          openDate: '2026-01-05', closeDate: '2026-01-20', status: 'DRAFT', allowedRoles: '["TEACHER"]',
        },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Grade Entry Window' })).toBeNull());
  });
});

describe('GradeEntryWindowsDrawer unpublish view', () => {
  it('needs the exact phrase, then moves the window back to CLOSED and returns to the list', async () => {
    await renderDrawer([win({ status: 'PUBLISHED' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
    expect(screen.getByRole('heading', { name: 'Unpublish Grades' })).toBeInTheDocument();
    const input = screen.getByPlaceholderText('unpublish this window');
    const confirm = screen.getByRole('button', { name: 'Unpublish' });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: 'unpublish' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: 'unpublish this window' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(save()).toHaveBeenCalledWith({ collection: 'grade_entry_windows', record: { id: 'w1', status: 'CLOSED' } }),
    );
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Unpublish Grades' })).toBeNull());
  });

  it('Escape leaves the confirmation without closing the drawer', async () => {
    const p = await renderDrawer([win({ status: 'PUBLISHED' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
    fireEvent.keyDown(screen.getByPlaceholderText('unpublish this window'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Unpublish Grades' })).toBeNull());
    expect(p.onClose).not.toHaveBeenCalled();
    expect(save()).not.toHaveBeenCalled();
  });
});
```

Notes:
- `field('Term')` matches the label whose own text is exactly `Term` (the option text "Term 1" is a different node). `field()` returns the first `input, select` under the label's parent `div`.
- `stubNemis` (from `setup-test-support.tsx`) serves `academicYear.getCurrent` → `CURRENT_YEAR` (id `y1`) and `term.list` → the terms given. `termRow()` is `t1` / `Term 1` / year `y1`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx`
Expected: FAIL — cannot resolve `./GradeEntryWindowsDrawer`.

- [ ] **Step 3: Write the drawer**

`apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle, Eye, FileText, Lock, Plus, RotateCcw, Unlock } from 'lucide-react';
import { Drawer, Input } from '@nemis-desktop/ui';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useAcademicFoundationViewModel, useAcademicYearViewModel } from '@/lib/presentation/hooks/school-admin';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { formatDateShort, listAllWindows, listPeriodsForTerm, WINDOW_STATUS_CHIP, WINDOW_STATUS_RAIL } from './shared';
import { useEscapeCapture } from './use-escape-capture';
import { useOpenSession, type SetupDrawerProps } from './setup-drawers';

const EMPTY_FORM = { gradingPeriodId: '', name: '', description: '', openDate: '', closeDate: '' };
const UNPUBLISH_PHRASE = 'unpublish this window';

/** Grade entry windows, managed from a drawer on the Academic Grading page —
 * mirrors portal-web's academic-grading/windows lifecycle (DRAFT -> OPEN ->
 * CLOSED -> PUBLISHED, with Reopen/Unpublish), all against the real, mutable
 * grade_entry_windows table via the generic offline collection API. Create and
 * Unpublish swap the drawer body (an overlay can't stack inside the
 * transformed Drawer); View Grades stays a page because its results table
 * needs the full width. */
export function GradeEntryWindowsDrawer({ isOpen, onClose }: SetupDrawerProps) {
  const session = useOpenSession(isOpen);
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Grade Entry Windows" size="xl">
      <GradeEntryWindowsManager key={session} />
    </Drawer>
  );
}

function GradeEntryWindowsManager() {
  const academicYear = useAcademicYearViewModel();
  const foundation = useAcademicFoundationViewModel();
  const year = useViewModel(academicYear.store, (s) => s.current);
  const terms = useViewModel(foundation.store, (s) => s.terms);

  const [windows, setWindows] = useState<SchoolAdminRecord[] | null>(null);
  const [view, setView] = useState<'list' | 'create' | 'unpublish'>('list');
  const [selectedTermId, setSelectedTermId] = useState('');
  const [periods, setPeriods] = useState<SchoolAdminRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [unpublishTarget, setUnpublishTarget] = useState<SchoolAdminRecord | null>(null);
  const [unpublishInput, setUnpublishInput] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const backToList = useCallback(() => setView('list'), []);
  useEscapeCapture(view !== 'list', backToList);

  const reload = async () => setWindows(await listAllWindows());

  useRevalidateOnSync(() => {
    void reload();
    void academicYear.loadCurrent();
  }, [academicYear]);

  useEffect(() => {
    if (year.status === 'success' || year.status === 'refreshing') void foundation.loadTerms(year.data.id);
  }, [year, foundation]);

  useEffect(() => {
    if (selectedTermId) void listPeriodsForTerm(selectedTermId).then(setPeriods);
    else setPeriods([]);
  }, [selectedTermId]);

  // The academic-foundation view model is app-wide, so `terms` can briefly hold
  // another year's rows; only offer the current year's terms.
  const currentYearId = year.status === 'success' || year.status === 'refreshing' ? year.data.id : '';
  const termOptions =
    terms.status === 'success' || terms.status === 'refreshing'
      ? terms.data.filter((term) => term.academicYearId === currentYearId)
      : [];

  const beginCreate = () => {
    setForm(EMPTY_FORM);
    setSelectedTermId('');
    setView('create');
  };

  const createWindow = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      await sharedBridge.saveSchoolAdminRecord({
        collection: 'grade_entry_windows',
        record: {
          gradingPeriodId: form.gradingPeriodId,
          name: form.name,
          description: form.description || null,
          openDate: form.openDate,
          closeDate: form.closeDate,
          status: 'DRAFT',
          // Matches the server's own default (grade-entry-window.service.ts) and the
          // desktop's JSON-stringified storage convention for array-shaped fields in
          // this generic collection API; the column is NOT NULL so this can't be null.
          allowedRoles: JSON.stringify(['TEACHER']),
        },
      });
      setForm(EMPTY_FORM);
      setSelectedTermId('');
      setView('list');
      await reload();
    } finally {
      setCreating(false);
    }
  };

  const transition = async (win: SchoolAdminRecord, changes: SchoolAdminRecord) => {
    await sharedBridge.saveSchoolAdminRecord({ collection: 'grade_entry_windows', record: { id: win.id!, ...changes } });
    await reload();
  };

  const now = () => new Date().toISOString();
  const openWindow = (win: SchoolAdminRecord) => void transition(win, { status: 'OPEN', openedAt: now() });
  const closeWindow = (win: SchoolAdminRecord) => void transition(win, { status: 'CLOSED', closedAt: now() });
  const publishGrades = (win: SchoolAdminRecord) => void transition(win, { status: 'PUBLISHED', publishedAt: now() });
  const reopenWindow = (win: SchoolAdminRecord) => void transition(win, { status: 'OPEN', openedAt: now() });

  const beginUnpublish = (win: SchoolAdminRecord) => {
    setUnpublishTarget(win);
    setUnpublishInput('');
    setView('unpublish');
  };

  const confirmUnpublish = async () => {
    if (!unpublishTarget) return;
    await transition(unpublishTarget, { status: 'CLOSED' });
    setUnpublishTarget(null);
    setUnpublishInput('');
    setView('list');
  };

  if (view === 'unpublish') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Unpublish Grades</h3>
          <p className="mt-1 text-sm text-slate-600">
            This will hide all grades from students and move the window back to{' '}
            <span className="font-medium">Closed</span> status. Grades remain saved and can be re-published at
            any time.
          </p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Type{' '}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-error">{UNPUBLISH_PHRASE}</span> to
            confirm
          </label>
          <Input
            type="text"
            value={unpublishInput}
            onChange={(e) => setUnpublishInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && unpublishInput === UNPUBLISH_PHRASE) void confirmUnpublish();
            }}
            placeholder={UNPUBLISH_PHRASE}
            autoFocus
            className="font-mono"
          />
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={backToList}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={unpublishInput !== UNPUBLISH_PHRASE}
            onClick={() => void confirmUnpublish()}
            className="rounded-full bg-error px-4 py-2 text-sm font-medium text-white hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Unpublish
          </button>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div>
        <h3 className="mb-4 text-xl font-semibold text-slate-900">Create Grade Entry Window</h3>
        <form onSubmit={(e) => void createWindow(e)} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Term</label>
            <select
              value={selectedTermId}
              onChange={(e) => {
                setSelectedTermId(e.target.value);
                setForm((f) => ({ ...f, gradingPeriodId: '' }));
              }}
              required
              className="w-full rounded-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
            >
              <option value="">Select term</option>
              {termOptions.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Grading Period</label>
            <select
              value={form.gradingPeriodId}
              onChange={(e) => setForm((f) => ({ ...f, gradingPeriodId: e.target.value }))}
              required
              disabled={!selectedTermId}
              className="w-full rounded-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
            >
              <option value="">Select period</option>
              {periods.map((period) => (
                <option key={String(period.id)} value={String(period.id)}>
                  {String(period.name)}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Window Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g., Period 1 Grade Entry"
            required
            autoFocus
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Open Date"
              type="date"
              value={form.openDate}
              onChange={(e) => setForm((f) => ({ ...f, openDate: e.target.value }))}
              required
            />
            <Input
              label="Close Date"
              type="date"
              value={form.closeDate}
              onChange={(e) => setForm((f) => ({ ...f, closeDate: e.target.value }))}
              required
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={backToList}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create Window'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Control when teachers can enter grades</p>
        <button
          type="button"
          onClick={beginCreate}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-400"
        >
          <Plus className="h-4 w-4" />
          Create Window
        </button>
      </div>

      {windows === null ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-transparent" />
        </div>
      ) : windows.length === 0 ? (
        <div className="py-8 text-center">
          <Lock className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <p className="text-slate-500">No grade entry windows found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {windows.map((win) => (
            <div
              key={String(win.id)}
              className={`border border-slate-200 border-l-[3px] p-4 ${
                WINDOW_STATUS_RAIL[String(win.status)] ?? 'border-l-slate-300'
              }`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-slate-900">{String(win.name)}</h4>
                  {win.description && <p className="text-sm text-slate-500">{String(win.description)}</p>}
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    WINDOW_STATUS_CHIP[String(win.status)] ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {String(win.status)}
                </span>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Open Date</p>
                  <p className="mt-0.5 font-medium text-slate-900">{formatDateShort(String(win.openDate))}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Close Date</p>
                  <p className="mt-0.5 font-medium text-slate-900">{formatDateShort(String(win.closeDate))}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {win.status === 'DRAFT' && (
                  <button
                    type="button"
                    onClick={() => openWindow(win)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-400"
                  >
                    <Unlock className="h-4 w-4" />
                    Open Window
                  </button>
                )}
                {win.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={() => closeWindow(win)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-secondary hover:text-secondary"
                  >
                    <Lock className="h-4 w-4" />
                    Close Window
                  </button>
                )}
                {win.status === 'CLOSED' && (
                  <>
                    <button
                      type="button"
                      onClick={() => publishGrades(win)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-400"
                    >
                      <Eye className="h-4 w-4" />
                      Publish Grades
                    </button>
                    <button
                      type="button"
                      onClick={() => reopenWindow(win)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-secondary hover:text-secondary"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reopen
                    </button>
                  </>
                )}
                {win.status === 'PUBLISHED' && (
                  <>
                    <span className="flex items-center gap-1 text-sm font-medium text-active">
                      <CheckCircle className="h-4 w-4" />
                      Grades Published
                    </span>
                    <button
                      type="button"
                      onClick={() => beginUnpublish(win)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-pending/30 bg-pending/10 px-2.5 py-1.5 text-xs font-semibold text-pending hover:bg-pending/20"
                    >
                      <Eye className="h-4 w-4" />
                      Unpublish
                    </button>
                    <button
                      type="button"
                      onClick={() => reopenWindow(win)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-secondary hover:text-secondary"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reopen
                    </button>
                  </>
                )}
                {(win.status === 'CLOSED' || win.status === 'PUBLISHED') && (
                  <Link
                    href={`/government/school-admin/academic-grading/windows/grades?id=${win.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-secondary hover:text-secondary"
                  >
                    <FileText className="h-4 w-4" />
                    View Grades
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Differences from `GradeWindowsPage.tsx`, all deliberate: the page header, the "Active Windows" section frame and the two `fixed inset-0` overlays are gone (the drawer is the frame; Create and Unpublish are views); window names are `h4` and view headings `h3` (the drawer title is the `h2`); `unpublishTarget` holds the record instead of its id; the term list is filtered to the current year; "Window Name" gets `autoFocus` so focus isn't dropped when the view swaps. `onNavigate` is part of `SetupDrawerProps` but unused (no cross-drawer link), so it is not destructured.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx`
Expected: PASS (all 16 tests). If a test fails because the brief's test itself is wrong (not the code), report it rather than weakening the assertion.

Run: `pnpm --filter @nemis-desktop/app typecheck` → exit 0. Run: `pnpm exec eslint apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.tsx apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.tsx apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx
git commit -m "feat(academic-setup): Grade Entry Windows drawer with create and unpublish views

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Wire the drawer into the page; react to `?open=` changes

**Files:**
- Modify: `apps/desktop/renderer/lib/academic-setup.ts` and `apps/desktop/renderer/lib/academic-setup.test.ts`
- Modify: `apps/desktop/renderer/components/academic-grading/AcademicGradingPage.tsx`
- Modify: `apps/desktop/renderer/components/academic-grading/AcademicGradingPage.test.tsx`
- Modify: `apps/desktop/renderer/app/government/school-admin/academic-grading/page.tsx`

**Interfaces:**
- Consumes: `GradeEntryWindowsDrawer` (Task 1).
- Produces: `SetupDrawerTarget = 'years' | 'terms' | 'periods' | 'windows'`; `academicSetupHref('windows')` → `/government/school-admin/academic-grading?open=windows` (consumed by Task 3).

- [ ] **Step 1: Write the failing tests**

`lib/academic-setup.test.ts` — in the first `it.each` table add the row:

```ts
    ['windows', '/government/school-admin/academic-grading?open=windows'],
```

and change the parser accept list to `it.each(['years', 'terms', 'periods', 'windows'])('accepts %s', …)`.

`components/academic-grading/AcademicGradingPage.test.tsx`:

1. Add `useState` and `next/navigation` mock at the top (after the vitest/testing-library imports, before the bridge mock):

```tsx
import { useState } from 'react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
```

2. Extend the card-opens-drawer table with the windows row:

```tsx
    ['Manage Windows', 'Grade Entry Windows'],
```

3. Add these tests inside `describe('AcademicGradingPage', …)`:

```tsx
  it('opens the Windows drawer from ?open=windows', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?open=windows');
    await renderWithLayer(<AcademicGradingPage />);
    expect(await drawerHeading('Grade Entry Windows')).toBeInTheDocument();
  });

  it('opens a drawer when ?open= changes while the page is already showing (sidebar click)', async () => {
    stubNemis();
    function Harness() {
      const [, setTick] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setTick((n) => n + 1)}>simulate navigation</button>
          <AcademicGradingPage />
        </>
      );
    }
    await renderWithLayer(<Harness />);
    expect(screen.queryByRole('heading', { level: 2, name: 'Grade Entry Windows' })).toBeNull();
    window.history.pushState({}, '', '/?open=windows');
    fireEvent.click(screen.getByRole('button', { name: 'simulate navigation' }));
    expect(await drawerHeading('Grade Entry Windows')).toBeInTheDocument();
  });

  it('drops the query when switching drawers in-page, so the same deep link works again', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?open=years');
    await renderWithLayer(<AcademicGradingPage />);
    await drawerHeading('Academic Years');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(await screen.findByRole('button', { name: '3 terms in 2024/2025' }));
    expect(await drawerHeading('Terms')).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(null, '', '/');
  });
```

(The existing card-order, guide, `?open=terms&yearId=`, `?open=` no-op, close-drops-query and Years→Terms tests stay as they are.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/lib/academic-setup.test.ts apps/desktop/renderer/components/academic-grading/AcademicGradingPage.test.tsx`
Expected: FAIL — `windows` href/parser rows; no "Manage Windows" button (the card is still a link); `?open=windows` opens nothing; the simulated-navigation test fails; the in-page-switch test fails (`replaceState` not called on switch).

- [ ] **Step 3: Implement**

`lib/academic-setup.ts`:

```ts
/** Academic years, terms, assessment periods and grade entry windows are
 * managed in drawers on the school-admin Academic Grading page. Links
 * elsewhere in the app open the right drawer through `?open=` (and
 * `?yearId=` for Terms). The app is a static export, so this is the only way
 * old links can land in the right place — there are no server redirects. */
export const ACADEMIC_GRADING_PATH = '/government/school-admin/academic-grading';

export type SetupDrawerTarget = 'years' | 'terms' | 'periods' | 'windows';

const TARGETS: readonly string[] = ['years', 'terms', 'periods', 'windows'];
```

(`academicSetupHref` and `parseSetupDrawerTarget` bodies unchanged.)

`components/academic-grading/AcademicGradingPage.tsx`:
- Imports: remove `import { queryParam } from '@/components/teachers/shared';` and `Link`'s other uses stay (FeatureCard still supports `href` — keep `Link` import). Add:

```tsx
import { useSearchParams } from 'next/navigation';
import { GradeEntryWindowsDrawer } from './GradeEntryWindowsDrawer';
```

- In the component doc comment, change "academic years, terms and assessment periods each open in a drawer" to "academic years, terms, assessment periods and grade entry windows each open in a drawer".
- Replace the mount-only effect

```tsx
  // Deep links (?open=terms&yearId=…) are read once on mount; in-page switches
  // go through `navigate`, since a Link to this same route would not remount.
  useEffect(() => {
    const target = parseSetupDrawerTarget(queryParam('open'));
    if (!target) return;
    setTermsYearId(queryParam('yearId'));
    setActiveModal(target);
  }, []);
```

with

```tsx
  // Deep links (?open=terms&yearId=…) open a drawer whenever the query changes —
  // not just on mount: the sidebar is a persistent layout, so its "Grade Entry &
  // Results" link is a soft navigation that never remounts this page. A missing
  // or unknown `open` does nothing (it must not close a drawer that is open).
  const searchParams = useSearchParams();
  const openParam = searchParams.get('open') ?? '';
  const yearIdParam = searchParams.get('yearId') ?? '';
  useEffect(() => {
    const target = parseSetupDrawerTarget(openParam);
    if (!target) return;
    setTermsYearId(yearIdParam);
    setActiveModal(target);
  }, [openParam, yearIdParam]);
```

- Replace `navigate` with a version that also drops the query (so a later click on the same deep link is a real URL change):

```tsx
  // In-page switches drop the query too, so following the same deep link later
  // (e.g. the sidebar item again) is a real URL change and reopens its drawer.
  const navigate: SetupNavigate = useCallback((drawer, opts) => {
    setTermsYearId(opts?.yearId ?? '');
    setActiveModal(drawer);
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);
```

(`close` is unchanged.)

- The Grade Entry Windows card: replace `href="/government/school-admin/academic-grading/windows"` with `onClick={() => navigate('windows')}` (icon, title, description and "Manage Windows" unchanged).
- After `<AssessmentPeriodsDrawer … />` add:

```tsx
      <GradeEntryWindowsDrawer isOpen={activeModal === 'windows'} onClose={close} onNavigate={navigate} />
```

- If `useEffect` is still used elsewhere in the file keep its import; otherwise remove it from the React import (lint will say).

`app/government/school-admin/academic-grading/page.tsx`:

```tsx
import { Suspense } from 'react';
import { AcademicGradingPage } from '@/components/academic-grading/AcademicGradingPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AcademicGradingPage />
    </Suspense>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/lib/academic-setup.test.ts apps/desktop/renderer/components/academic-grading`
Expected: PASS — all academic-grading tests including the new ones and Task 1's.

Run: `pnpm --filter @nemis-desktop/app typecheck` → exit 0.
Run: `pnpm exec eslint apps/desktop/renderer/components/academic-grading apps/desktop/renderer/lib apps/desktop/renderer/app/government/school-admin/academic-grading` → exit 0.
Run: `pnpm --filter @nemis-desktop/app build:renderer` → succeeds (proves the Suspense boundary). Report the `/government/school-admin/academic-grading` route line.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/lib/academic-setup.ts apps/desktop/renderer/lib/academic-setup.test.ts apps/desktop/renderer/components/academic-grading/AcademicGradingPage.tsx apps/desktop/renderer/components/academic-grading/AcademicGradingPage.test.tsx apps/desktop/renderer/app/government/school-admin/academic-grading/page.tsx
git commit -m "feat(academic-setup): Grade Entry Windows card opens its drawer; deep links follow ?open= changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Point the results page and sidebar at the drawer

**Files:**
- Modify: `apps/desktop/renderer/components/academic-grading/WindowGradesPage.tsx` (Back to Windows link, ~line 164)
- Modify: `apps/desktop/renderer/components/shell/sidebarConfig.ts` (TEACHING group, ~line 98)
- Modify: `apps/desktop/renderer/components/shell/Sidebar.test.tsx` (~line 73 and a new test)
- Modify: `apps/desktop/renderer/components/shell/page-titles.test.ts` (~lines 13–17)

**Interfaces:**
- Consumes: `academicSetupHref('windows')` (Task 2).

- [ ] **Step 1: Update the tests (they fail first)**

`Sidebar.test.tsx`, in "renders the school-admin groups in order, with correct hrefs" change the Grade Entry line to:

```tsx
    expect(href('Grade Entry & Results')).toBe('/government/school-admin/academic-grading?open=windows');
```

and add a test inside `describe('Sidebar', …)` (next to "forces open the group holding the current page"):

```tsx
  it('keeps Grade Entry & Results active on the View Grades results page', () => {
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/academic-grading/windows/grades');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Grade Entry & Results' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Academic Grading' })).not.toHaveAttribute('aria-current');
  });
```

`page-titles.test.ts`, replace the breadcrumb test with:

```ts
  it('builds a breadcrumb trail for nested school-admin routes', () => {
    const r = resolvePageTitle('/government/school-admin/academic-grading/windows/grades', SystemRole.INSTITUTION_ADMIN);
    expect(r.title).toBe('Grades');
    expect(r.segments).toEqual(['School Admin', 'Academic Grading', 'Windows', 'Grades']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell`
Expected: FAIL — the Grade Entry href assertion and the new active-item test. (The page-titles test may already pass — it doesn't depend on the sidebar change; that's fine. The pre-existing Sidebar logout unhandled error also appears; ignore it.)

- [ ] **Step 3: Implement**

`sidebarConfig.ts`: add `import { academicSetupHref } from '@/lib/academic-setup';` with the other imports, and replace the TEACHING item

```ts
          { name: 'Grade Entry & Results', href: '/government/school-admin/academic-grading/windows', icon: ClipboardCheck },
```

with

```ts
          {
            name: 'Grade Entry & Results',
            href: academicSetupHref('windows'),
            icon: ClipboardCheck,
            // Active-item matching ignores query strings; this keeps the item
            // highlighted on the View Grades results page under /windows/grades.
            alsoActiveOn: ['/government/school-admin/academic-grading/windows'],
          },
```

`WindowGradesPage.tsx`: add `import { academicSetupHref } from '@/lib/academic-setup';` and change the Back to Windows link's `href="/government/school-admin/academic-grading/windows"` to `href={academicSetupHref('windows')}` (text and classes unchanged).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/shell apps/desktop/renderer/components/academic-grading`
Expected: PASS (only the pre-existing Sidebar logout unhandled error).

Run: `pnpm --filter @nemis-desktop/app typecheck` → exit 0. Run: `pnpm lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/WindowGradesPage.tsx apps/desktop/renderer/components/shell/sidebarConfig.ts apps/desktop/renderer/components/shell/Sidebar.test.tsx apps/desktop/renderer/components/shell/page-titles.test.ts
git commit -m "feat(nav): Grade Entry & Results and Back to Windows open the windows drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Delete the windows page and verify the branch

**Files:**
- Delete: `apps/desktop/renderer/app/government/school-admin/academic-grading/windows/page.tsx`
- Delete: `apps/desktop/renderer/components/academic-grading/GradeWindowsPage.tsx`

- [ ] **Step 1: Delete**

```bash
git rm apps/desktop/renderer/app/government/school-admin/academic-grading/windows/page.tsx apps/desktop/renderer/components/academic-grading/GradeWindowsPage.tsx
rm -rf apps/desktop/renderer/.next/types
```

(`windows/grades/page.tsx` stays. `.next/types` is git-ignored generated output that the renderer tsconfig includes; it still references the deleted route until regenerated.)

- [ ] **Step 2: Confirm nothing links to the deleted page**

Run: `git grep -n -e "GradeWindowsPage" -e "academic-grading/windows" -- apps/desktop/renderer`
Expected: only
- `components/academic-grading/GradeEntryWindowsDrawer.tsx` — the View Grades link (`/academic-grading/windows/grades?id=…`)
- `components/academic-grading/GradeEntryWindowsDrawer.test.tsx` — the View Grades href assertion
- `components/shell/sidebarConfig.ts` — the `alsoActiveOn` prefix
- `components/shell/Sidebar.test.tsx` / `page-titles.test.ts` — `/windows/grades` paths
- `components/academic-grading/shared.tsx` — the existing portal-web reference comment

Anything else is a missed link; repoint it to `academicSetupHref('windows')`.

- [ ] **Step 3: Full verification**

1. `pnpm --filter @nemis-desktop/app typecheck` → exit 0.
2. `pnpm lint` → exit 0.
3. `pnpm exec vitest run --project renderer` → only the 2 known failures (`app/page.test` login, teacher `timetable.test`) + the known Sidebar logout unhandled error. Report exact counts.
4. `pnpm --filter @nemis-desktop/app build:renderer` → succeeds; the route list contains `/government/school-admin/academic-grading` and `/government/school-admin/academic-grading/windows/grades` and NOT a bare `/government/school-admin/academic-grading/windows`. Report those lines. `git status` must be clean afterwards (restore anything the build touched that is tracked).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(academic-setup): remove the standalone grade entry windows page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual GUI check (Alvin, in the Electron window)**

1. Academic Grading → "Manage Windows" opens the drawer; create a window (term → period → name → dates); it appears as DRAFT.
2. On one window: Open → Close → Publish → Unpublish (type the phrase) → Reopen.
3. View Grades opens the results page; "Back to Windows" returns with the drawer open; on the results page the sidebar highlights "Grade Entry & Results".
4. While on Academic Grading, click sidebar "Grade Entry & Results" → the drawer opens; close it and click again → it opens again; open Years via its card, then click the sidebar item → Windows opens.
