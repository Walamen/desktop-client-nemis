# Year Status Guard and Setup Save Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable an academic year's status actions while its edit form has unsaved changes (with a warning), and give every direct-bridge save on the Academic Grading setup screens success/error toast feedback.

**Architecture:** A tiny renderer helper (`save-feedback.ts`) formats readable save errors and runs a save with toast feedback through the existing `NotificationStore` (the same store the view-model command pipeline already uses for Years/Terms). The Windows drawer and Periods panel route their bridge saves through it; Grading Configuration keeps its inline error box but shows readable text and a success toast. The year guard is a derived `dirty` flag in `AcademicYearsDrawer`.

**Tech Stack:** React, TypeScript, Next.js renderer in Electron, `@nemis-desktop/presentation` NotificationStore + `ToastHost`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-13-year-status-and-save-feedback-design.md`

## Global Constraints

- Renderer only; Academic Grading setup screens only. No change to save payloads, lifecycle rules, view models, IPC or bridge. Years/Terms save feedback (command pipeline) is untouched.
- Year guard warning text (verbatim): `Save or cancel your changes before changing this year's status.` — rendered as `<p role="status" className="text-sm text-amber-700">`.
- Toast messages (verbatim). Windows: Create `Grade entry window created.` / `Couldn't create the window.`; Open `Window opened.` / `Couldn't open the window.`; Close `Window closed.` / `Couldn't close the window.`; Publish `Grades published.` / `Couldn't publish the grades.`; Reopen `Window reopened.` / `Couldn't reopen the window.`; Unpublish `Grades unpublished.` / `Couldn't unpublish the grades.`. Periods: save `Period saved.` / `Couldn't save the period.`; delete `Period deleted.` / `Couldn't delete the period.`; auto setup `Assessment periods created.` / `` `Couldn't finish setting up periods — ${n} of ${count} were created.` `` (em dash). Grading config: success toast `Grading configuration saved.`; inline fallback `Unable to save configuration.`.
- Error toast text = `failure` + (`detail` ? `' ' + detail` : `''`), where `detail = describeSaveError(error)`.
- `describeSaveError(error)`: `parseIpcError(error)` → its `message.trim()`; else an `Error` whose message does not start with `[` → `message.trim()`; else `''`.
- On a failed save every screen stays where it is (form / confirmation view still open, values intact).
- The repo owner's commit 41934c3 (Active/Inactive year badge; `xl` Grading Config drawer) is already on the branch — keep both changes.
- Commit trailer: end every commit message with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Commands** (repo root `desktop-client-nemis/`): tests `pnpm exec vitest run --project renderer <paths…>`; typecheck `pnpm --filter @nemis-desktop/app typecheck`; lint `pnpm lint` (exits 0 on `main` at 3f0e5dc).

**Baseline** (`main` 3f0e5dc + 41934c3): lint 0; typecheck passes; renderer suite 361 pass / 2 known failures (`app/page.test` login, teacher `timetable.test`) + 1 known unhandled error (Sidebar logout `.finally`).

**Toast assertions in component tests:** render `<ToastHost />` (from `@/components/shell/ToastHost`) next to the component inside the same `PresentationProvider`, then `await screen.findByText('<exact toast text>')`. `ToastHost` renders each message in a `<p>` and is wired to the layer's real notification store.

## Review Focus

1. **Retry after a failure** — a failed Create followed by a successful one must work (no stuck `creating`, values kept, then back to the list). Pinned in Task 3.
2. **A failure with no readable detail** (unrecognised `[CODE]`, non-`Error` throw) — the toast shows only the plain failure sentence, never raw bracket text. Pinned in Task 1.
3. **Auto Setup stopping partway** — the admin must learn how many periods were created, and the created ones must appear (reload happens on failure too). Pinned in Task 4.
4. **Year guard reacts to the dates, not just the code** — changing only the End date must also disable the status actions. Pinned in Task 2.
5. **A failed lifecycle action must not reload or change the list** — the window keeps its status and buttons. Pinned in Task 3.

---

## File Structure

- Create `apps/desktop/renderer/components/academic-grading/save-feedback.ts` (+ `save-feedback.test.ts`) — `describeSaveError`, `formatSaveFailure`, `useSaveFeedback`.
- Modify `apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.tsx` (+ test) — dirty guard.
- Modify `apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.tsx` (+ test) — toasts.
- Modify `apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.tsx` (+ test) — toasts, auto-setup summary.
- Modify `apps/desktop/renderer/components/academic-grading/GradingConfigDrawer.tsx`; create `GradingConfigDrawer.test.tsx`.

---

### Task 1: `save-feedback` helper

**Files:**
- Create: `apps/desktop/renderer/components/academic-grading/save-feedback.ts`
- Test: `apps/desktop/renderer/components/academic-grading/save-feedback.test.ts`

**Interfaces:**
- Consumes: `parseIpcError` from `@/lib/errors/parseIpcError`; `useNotificationStore` from `@/lib/presentation/hooks/shared` (returns a store with `success(message: string): string` and `error(message: string): string`).
- Produces:
  - `export type SaveMessages = { success: string; failure: string }`
  - `export type SaveOutcome<T> = { ok: true; value: T } | { ok: false }`
  - `export function describeSaveError(error: unknown): string`
  - `export function formatSaveFailure(failure: string, error: unknown): string`
  - `export function useSaveFeedback(): <T>(action: () => Promise<T>, messages: SaveMessages) => Promise<SaveOutcome<T>>`

- [ ] **Step 1: Write the failing tests**

`save-feedback.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/presentation/hooks/shared', () => ({ useNotificationStore: () => notifications }));

import { describeSaveError, formatSaveFailure, useSaveFeedback } from './save-feedback';

afterEach(() => vi.clearAllMocks());

describe('describeSaveError', () => {
  it('uses the IPC message without its code', () => {
    expect(describeSaveError(new Error('[VALIDATION_FAILED] Dates overlap'))).toBe('Dates overlap');
  });
  it('uses a plain error message', () => {
    expect(describeSaveError(new Error('Disk full'))).toBe('Disk full');
  });
  it('hides an unrecognised bracketed message', () => {
    expect(describeSaveError(new Error('[WEIRD] boom'))).toBe('');
  });
  it('has nothing to say about a non-Error', () => {
    expect(describeSaveError('nope')).toBe('');
    expect(describeSaveError(undefined)).toBe('');
  });
});

describe('formatSaveFailure', () => {
  it('appends the readable detail', () => {
    expect(formatSaveFailure("Couldn't open the window.", new Error('[CONFLICT] Window dates overlap'))).toBe(
      "Couldn't open the window. Window dates overlap",
    );
  });
  it('is just the failure sentence when there is no detail', () => {
    expect(formatSaveFailure("Couldn't open the window.", new Error('[WEIRD] x'))).toBe("Couldn't open the window.");
  });
});

describe('useSaveFeedback', () => {
  const messages = { success: 'Window opened.', failure: "Couldn't open the window." };

  it('toasts success and returns the value', async () => {
    const { result } = renderHook(() => useSaveFeedback());
    await expect(result.current(async () => 42, messages)).resolves.toEqual({ ok: true, value: 42 });
    expect(notifications.success).toHaveBeenCalledWith('Window opened.');
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('toasts the failure with the readable detail and does not throw', async () => {
    const { result } = renderHook(() => useSaveFeedback());
    const outcome = await result.current(async () => {
      throw new Error('[VALIDATION_FAILED] Window dates overlap');
    }, messages);
    expect(outcome).toEqual({ ok: false });
    expect(notifications.error).toHaveBeenCalledWith("Couldn't open the window. Window dates overlap");
    expect(notifications.success).not.toHaveBeenCalled();
  });

  it('toasts only the failure sentence when there is no readable detail', async () => {
    const { result } = renderHook(() => useSaveFeedback());
    await result.current(() => Promise.reject('nope'), messages);
    expect(notifications.error).toHaveBeenCalledWith("Couldn't open the window.");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/save-feedback.test.ts`
Expected: FAIL — cannot resolve `./save-feedback`.

- [ ] **Step 3: Implement**

`save-feedback.ts`:

```ts
import { useCallback } from 'react';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { useNotificationStore } from '@/lib/presentation/hooks/shared';

export type SaveMessages = { success: string; failure: string };
export type SaveOutcome<T> = { ok: true; value: T } | { ok: false };

/** The readable part of a failed save: the IPC message without its `[CODE]`
 * prefix, else a plain error's message, else ''. An unrecognised bracketed
 * message is never shown raw. */
export function describeSaveError(error: unknown): string {
  const ipc = parseIpcError(error);
  if (ipc) return ipc.message.trim();
  if (error instanceof Error && !error.message.startsWith('[')) return error.message.trim();
  return '';
}

/** "<failure sentence> <readable detail>", or just the sentence. */
export function formatSaveFailure(failure: string, error: unknown): string {
  const detail = describeSaveError(error);
  return detail ? `${failure} ${detail}` : failure;
}

/** Runs a setup-screen save with toast feedback through the same notification
 * store the view-model command pipeline uses, so every setup drawer reports
 * success and failure the same way. Never throws: callers decide what to do
 * from `ok` and stay put on failure so the admin can retry. */
export function useSaveFeedback() {
  const notifications = useNotificationStore();
  return useCallback(
    async <T>(action: () => Promise<T>, messages: SaveMessages): Promise<SaveOutcome<T>> => {
      try {
        const value = await action();
        notifications.success(messages.success);
        return { ok: true, value };
      } catch (error) {
        notifications.error(formatSaveFailure(messages.failure, error));
        return { ok: false };
      }
    },
    [notifications],
  );
}
```

- [ ] **Step 4: Verify**

Run the test file again → PASS (9 tests). `pnpm --filter @nemis-desktop/app typecheck` → exit 0. `pnpm exec eslint apps/desktop/renderer/components/academic-grading/save-feedback.ts apps/desktop/renderer/components/academic-grading/save-feedback.test.ts` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/save-feedback.ts apps/desktop/renderer/components/academic-grading/save-feedback.test.ts
git commit -m "feat(academic-setup): save feedback helper for setup-screen saves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Year status guard

**Files:**
- Modify: `apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.tsx` (manager state ~lines 30–40; Status section ~lines 90–111)
- Test: `apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

Add to the `describe('AcademicYearsDrawer status actions (edit view)', …)` block (it already has `openEdit` and `shown` helpers; `field` and `yearRow` are imported from `./setup-test-support`):

```tsx
  it('disables the status actions while the form has unsaved changes', async () => {
    stubNemis({ years: [yearRow({ id: 'y3', code: '2026/2027', isCurrent: false })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2026/2027');
    const warning = "Save or cancel your changes before changing this year's status.";
    const statusButtons = () => ['Set current', 'Close', 'Archive'].map((name) => screen.getByRole('button', { name }));

    statusButtons().forEach((b) => expect(b).toBeEnabled());
    expect(screen.queryByText(warning)).toBeNull();

    fireEvent.change(field('Academic year code'), { target: { value: '2026/27' } });
    statusButtons().forEach((b) => expect(b).toBeDisabled());
    expect(screen.getByText(warning)).toBeInTheDocument();

    fireEvent.change(field('Academic year code'), { target: { value: '2026/2027' } });
    statusButtons().forEach((b) => expect(b).toBeEnabled());
    expect(screen.queryByText(warning)).toBeNull();

    fireEvent.change(field('End date'), { target: { value: '2027-08-31' } });
    statusButtons().forEach((b) => expect(b).toBeDisabled());
    expect(screen.getByText(warning)).toBeInTheDocument();
  });
```

(`yearRow` defaults: start `2025-09-01`, end `2026-07-31`, status `ACTIVE`; so Set current / Close / Archive are shown for this non-current ACTIVE year.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.test.tsx`
Expected: the new test FAILS (buttons stay enabled; no warning). All existing tests pass.

- [ ] **Step 3: Implement**

In `AcademicYearsManager`, after the form state declarations add:

```tsx
  // A status change applies immediately and would silently drop unsaved edits
  // to the code or dates, so the status actions wait until the form is clean.
  const dirty =
    editing !== null &&
    (code !== editing.code || startDate !== editing.startDate || endDate !== editing.endDate);
```

In the edit view's Status section, insert directly above `<div className="flex flex-wrap gap-2">`:

```tsx
            {dirty && (
              <p role="status" className="text-sm text-amber-700">
                Save or cancel your changes before changing this year's status.
              </p>
            )}
```

and add `disabled={dirty}` to each of the four status `Button`s (Set current, Close, Archive, Restore). Their show/hide conditions and `onClick`s are unchanged.

(If `react/no-unescaped-entities` flags the apostrophe, write it as `this year&apos;s` — lint is the arbiter.)

- [ ] **Step 4: Verify**

Run the test file → all PASS. Typecheck → exit 0. `pnpm exec eslint apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.tsx` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.tsx apps/desktop/renderer/components/academic-grading/AcademicYearsDrawer.test.tsx
git commit -m "feat(academic-setup): hold year status changes while the edit form is unsaved

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Toast feedback in the Grade Entry Windows drawer

**Files:**
- Modify: `apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.tsx` (`createWindow`, `transition`, the four lifecycle helpers, `confirmUnpublish` — ~lines 84–142)
- Test: `apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx`

**Interfaces:**
- Consumes: `useSaveFeedback`, `SaveMessages` from `./save-feedback` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `GradeEntryWindowsDrawer.test.tsx`:
1. Add `import { ToastHost } from '@/components/shell/ToastHost';`.
2. In `renderDrawer`, render the toast host too:

```tsx
  await renderWithLayer(
    <>
      <GradeEntryWindowsDrawer {...p} />
      <ToastHost />
    </>,
  );
```

3. Add a new describe block:

```tsx
describe('GradeEntryWindowsDrawer save feedback', () => {
  const listCalls = () =>
    vi.mocked(sharedBridge.listSchoolAdminRecords).mock.calls.filter(([req]) => req.collection === 'grade_entry_windows').length;

  it('toasts a successful lifecycle change', async () => {
    await renderDrawer([win()]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Window' }));
    expect(await screen.findByText('Window opened.')).toBeInTheDocument();
  });

  it('toasts a failed lifecycle change with the reason and leaves the list alone', async () => {
    await renderDrawer([win()]);
    await screen.findByRole('button', { name: 'Open Window' });
    const before = listCalls();
    save().mockRejectedValueOnce(new Error('[VALIDATION_FAILED] Window dates overlap'));
    fireEvent.click(screen.getByRole('button', { name: 'Open Window' }));
    expect(await screen.findByText("Couldn't open the window. Window dates overlap")).toBeInTheDocument();
    expect(listCalls()).toBe(before);
    expect(screen.getByRole('button', { name: 'Open Window' })).toBeInTheDocument();
  });

  it('keeps the create form after a failed save, and a retry succeeds', async () => {
    await renderDrawer([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Create Window' }));
    await screen.findByRole('option', { name: 'Term 1' });
    fireEvent.change(field('Term'), { target: { value: 't1' } });
    await screen.findByRole('option', { name: 'Period 1' });
    fireEvent.change(field('Grading Period'), { target: { value: 'p1' } });
    fireEvent.change(field('Window Name'), { target: { value: 'Period 1 Entry' } });
    fireEvent.change(field('Open Date'), { target: { value: '2026-01-05' } });
    fireEvent.change(field('Close Date'), { target: { value: '2026-01-20' } });

    save().mockRejectedValueOnce(new Error('Disk full'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Window' }));
    expect(await screen.findByText("Couldn't create the window. Disk full")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create Grade Entry Window' })).toBeInTheDocument();
    expect(field('Window Name')).toHaveValue('Period 1 Entry');

    fireEvent.click(screen.getByRole('button', { name: 'Create Window' }));
    expect(await screen.findByText('Grade entry window created.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Grade Entry Window' })).toBeNull());
  });

  it('keeps the unpublish confirmation after a failed save', async () => {
    await renderDrawer([win({ status: 'PUBLISHED' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
    fireEvent.change(screen.getByPlaceholderText('unpublish this window'), { target: { value: 'unpublish this window' } });
    save().mockRejectedValueOnce(new Error('[CONFLICT] Grades are being synced'));
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(await screen.findByText("Couldn't unpublish the grades. Grades are being synced")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unpublish Grades' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeEnabled();
  });
});
```

(`[CONFLICT]` and `[VALIDATION_FAILED]` are known `IpcErrorCode`s, so `parseIpcError` strips them. The existing `vi.clearAllMocks()` in `afterEach` clears `mockRejectedValueOnce` queues and call history.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx`
Expected: the 4 new tests FAIL (no toasts; a failed save currently rejects unhandled). Existing tests pass.

- [ ] **Step 3: Implement**

Add `import { useSaveFeedback, type SaveMessages } from './save-feedback';` and, in `GradeEntryWindowsManager`, `const runSave = useSaveFeedback();`.

Replace `createWindow`, `transition`, the four lifecycle helpers and `confirmUnpublish` with:

```tsx
  const createWindow = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const result = await runSave(
        () =>
          sharedBridge.saveSchoolAdminRecord({
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
          }),
        { success: 'Grade entry window created.', failure: "Couldn't create the window." },
      );
      if (!result.ok) return;
      setForm(EMPTY_FORM);
      setSelectedTermId('');
      setView('list');
      await reload();
    } finally {
      setCreating(false);
    }
  };

  /** Saves a lifecycle change with toast feedback; reloads only on success. */
  const transition = async (win: SchoolAdminRecord, changes: SchoolAdminRecord, messages: SaveMessages): Promise<boolean> => {
    const result = await runSave(
      () => sharedBridge.saveSchoolAdminRecord({ collection: 'grade_entry_windows', record: { id: win.id!, ...changes } }),
      messages,
    );
    if (result.ok) await reload();
    return result.ok;
  };

  const now = () => new Date().toISOString();
  const openWindow = (win: SchoolAdminRecord) =>
    void transition(win, { status: 'OPEN', openedAt: now() }, { success: 'Window opened.', failure: "Couldn't open the window." });
  const closeWindow = (win: SchoolAdminRecord) =>
    void transition(win, { status: 'CLOSED', closedAt: now() }, { success: 'Window closed.', failure: "Couldn't close the window." });
  const publishGrades = (win: SchoolAdminRecord) =>
    void transition(win, { status: 'PUBLISHED', publishedAt: now() }, { success: 'Grades published.', failure: "Couldn't publish the grades." });
  const reopenWindow = (win: SchoolAdminRecord) =>
    void transition(win, { status: 'OPEN', openedAt: now() }, { success: 'Window reopened.', failure: "Couldn't reopen the window." });
```

and

```tsx
  const confirmUnpublish = async () => {
    if (!unpublishTarget || unpublishing) return;
    setUnpublishing(true);
    try {
      const ok = await transition(unpublishTarget, { status: 'CLOSED' }, { success: 'Grades unpublished.', failure: "Couldn't unpublish the grades." });
      if (!ok) return;
      setUnpublishTarget(null);
      setUnpublishInput('');
      setView('list');
    } finally {
      setUnpublishing(false);
    }
  };
```

(`beginUnpublish`, the views and the save payloads are unchanged.)

- [ ] **Step 4: Verify**

Run the test file → all PASS (existing + 4 new). Typecheck → exit 0. `pnpm exec eslint` on both files → exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.tsx apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx
git commit -m "feat(academic-setup): toast feedback for grade entry window saves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Toast feedback in Assessment Periods and Grading Configuration; full gate

**Files:**
- Modify: `apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.tsx` (`submit` ~87, `remove` ~118, `autoSetup` ~124)
- Modify: `apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.test.tsx`
- Modify: `apps/desktop/renderer/components/academic-grading/GradingConfigDrawer.tsx` (`submit` ~44–72)
- Create: `apps/desktop/renderer/components/academic-grading/GradingConfigDrawer.test.tsx`

**Interfaces:**
- Consumes: `useSaveFeedback`, `describeSaveError`, `formatSaveFailure` from `./save-feedback` (Task 1); `useNotificationStore` from `@/lib/presentation/hooks/shared`.

- [ ] **Step 1: Write the failing tests**

`GradingPeriodsPanel.test.tsx`:
1. Imports: add `fireEvent` to the testing-library import if missing; add
   `import { sharedBridge } from '@/services/nemis-bridge/shared';`,
   `import { ToastHost } from '@/components/shell/ToastHost';`,
   `import { field } from './setup-test-support';`.
2. `renderPanel` renders `<ToastHost />` inside the provider after `<GradingPeriodsPanel {...props} />`.
3. Extend `afterEach`:

```tsx
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  vi.mocked(sharedBridge.listSchoolAdminRecords).mockImplementation(async () => ({ items: [], total: 0 }));
  vi.mocked(sharedBridge.saveSchoolAdminRecord).mockReset();
  vi.mocked(sharedBridge.deleteSchoolAdminRecord).mockReset();
  vi.restoreAllMocks();
});
```

4. Add:

```tsx
describe('GradingPeriodsPanel save feedback', () => {
  const PERIOD = { id: 'gp1', termId: 'term-1', name: 'Period 1', sequence: 1, code: 'P1', startDate: '2025-09-01', endDate: '2025-10-15', weight: 100, periodType: 'REGULAR_PERIOD' };
  const CONFIG = { id: 'c1', periodsPerTerm: 3, maxMarks: 100, passingMarks: 50 };
  const serve = (byCollection: Record<string, unknown[]>) =>
    vi.mocked(sharedBridge.listSchoolAdminRecords).mockImplementation(async ({ collection }: { collection: string }) => ({
      items: (byCollection[collection] ?? []) as never,
      total: 0,
    }));

  it('keeps the period form open and toasts the reason when a save fails', async () => {
    stubNemis({ year: YEAR, terms: [TERM] });
    await renderPanel();
    fireEvent.click(await screen.findByText('Term 1'));
    fireEvent.click(await screen.findByRole('button', { name: /Add Period/ }));
    fireEvent.change(field('Period Name'), { target: { value: 'Midterm' } });
    fireEvent.change(field('Start Date'), { target: { value: '2025-09-01' } });
    fireEvent.change(field('End Date'), { target: { value: '2025-10-15' } });
    vi.mocked(sharedBridge.saveSchoolAdminRecord).mockRejectedValueOnce(new Error('[VALIDATION_FAILED] Dates overlap Period 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Period' }));
    expect(await screen.findByText("Couldn't save the period. Dates overlap Period 1")).toBeInTheDocument();
    expect(field('Period Name')).toHaveValue('Midterm');
  });

  it('toasts a failed delete', async () => {
    serve({ grading_periods: [PERIOD] });
    stubNemis({ year: YEAR, terms: [TERM] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderPanel();
    fireEvent.click(await screen.findByText('Term 1'));
    vi.mocked(sharedBridge.deleteSchoolAdminRecord).mockRejectedValueOnce(new Error('[CONFLICT] Grades exist for this period'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText("Couldn't delete the period. Grades exist for this period")).toBeInTheDocument();
  });

  it('reports how many periods auto setup created when it stops partway, and reloads', async () => {
    serve({ institution_grading_configs: [CONFIG] });
    stubNemis({ year: YEAR, terms: [TERM] });
    await renderPanel();
    fireEvent.click(await screen.findByText('Term 1'));
    vi.mocked(sharedBridge.saveSchoolAdminRecord)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('[CONFLICT] Code P2 already exists'));
    const periodListsBefore = vi.mocked(sharedBridge.listSchoolAdminRecords).mock.calls.filter(([r]) => r.collection === 'grading_periods').length;
    const autoSetupButton = await screen.findByRole('button', { name: /Auto Setup All Periods/ });
    await waitFor(() => expect(autoSetupButton).toBeEnabled()); // enabled once the grading config has loaded
    fireEvent.click(autoSetupButton);
    expect(
      await screen.findByText("Couldn't finish setting up periods — 1 of 3 were created. Code P2 already exists"),
    ).toBeInTheDocument();
    expect(sharedBridge.saveSchoolAdminRecord).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(
        vi.mocked(sharedBridge.listSchoolAdminRecords).mock.calls.filter(([r]) => r.collection === 'grading_periods').length,
      ).toBeGreaterThan(periodListsBefore),
    );
  });

  it('toasts when auto setup creates every period', async () => {
    serve({ institution_grading_configs: [CONFIG] });
    stubNemis({ year: YEAR, terms: [TERM] });
    await renderPanel();
    fireEvent.click(await screen.findByText('Term 1'));
    vi.mocked(sharedBridge.saveSchoolAdminRecord).mockResolvedValue({} as never);
    const autoSetupButton = await screen.findByRole('button', { name: /Auto Setup All Periods/ });
    await waitFor(() => expect(autoSetupButton).toBeEnabled()); // enabled once the grading config has loaded
    fireEvent.click(autoSetupButton);
    expect(await screen.findByText('Assessment periods created.')).toBeInTheDocument();
    expect(sharedBridge.saveSchoolAdminRecord).toHaveBeenCalledTimes(3);
  });
});
```

Notes: `YEAR`/`TERM` are this file's existing fixtures (`ay-1` / `term-1`, term dates `2025-09-01`–`2025-12-15`). The "Add Period" button contains an icon, hence the regex name. If the period form's date or name inputs don't resolve through `field()` (their label/input structure differs), inspect the markup and use an equivalent label-based lookup; report what you used.

`GradingConfigDrawer.test.tsx` (new):

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })),
    saveSchoolAdminRecord: vi.fn(async () => ({})),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { sharedBridge } from '@/services/nemis-bridge/shared';
import { ToastHost } from '@/components/shell/ToastHost';
import { GradingConfigDrawer } from './GradingConfigDrawer';
import { clearNemis, renderWithLayer, stubNemis } from './setup-test-support';

async function renderConfig(onClose = vi.fn()) {
  stubNemis();
  await renderWithLayer(
    <>
      <GradingConfigDrawer isOpen onClose={onClose} />
      <ToastHost />
    </>,
  );
  await screen.findByRole('button', { name: 'Save Configuration' });
  return onClose;
}

afterEach(() => {
  clearNemis();
  vi.clearAllMocks();
});

describe('GradingConfigDrawer save feedback', () => {
  it('shows the readable reason inline when the save fails, and stays open', async () => {
    const onClose = await renderConfig();
    vi.mocked(sharedBridge.saveSchoolAdminRecord).mockRejectedValueOnce(
      new Error('[VALIDATION_FAILED] Passing marks cannot exceed maximum marks'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }));
    expect(await screen.findByText('Passing marks cannot exceed maximum marks')).toBeInTheDocument();
    expect(screen.queryByText(/\[VALIDATION_FAILED\]/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('falls back to the generic message when there is no readable reason', async () => {
    await renderConfig();
    vi.mocked(sharedBridge.saveSchoolAdminRecord).mockRejectedValueOnce(new Error('[WEIRD] x'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }));
    expect(await screen.findByText('Unable to save configuration.')).toBeInTheDocument();
  });

  it('toasts and closes on success', async () => {
    const onClose = await renderConfig();
    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }));
    expect(await screen.findByText('Grading configuration saved.')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.test.tsx apps/desktop/renderer/components/academic-grading/GradingConfigDrawer.test.tsx`
Expected: the new periods tests FAIL (no toasts; failed saves reject unhandled; auto setup has no summary); the config tests FAIL on the readable-reason and success-toast cases (raw `[VALIDATION_FAILED]` text shown; no toast). The fallback test may already pass. Existing periods tests pass.

- [ ] **Step 3: Implement**

`GradingPeriodsPanel.tsx`:
- Imports: `import { useNotificationStore } from '@/lib/presentation/hooks/shared';` and `import { formatSaveFailure, useSaveFeedback } from './save-feedback';`.
- In the component: `const runSave = useSaveFeedback();` and `const notifications = useNotificationStore();`.
- `submit`: replace `await sharedBridge.saveSchoolAdminRecord({ … });` + `resetForm();` with

```tsx
    const result = await runSave(
      () =>
        sharedBridge.saveSchoolAdminRecord({
          collection: 'grading_periods',
          record: { /* unchanged record object */ },
        }),
      { success: 'Period saved.', failure: "Couldn't save the period." },
    );
    if (!result.ok) return;
    resetForm();
    await reloadPeriods(selectedTermId);
```

  (Move the existing `record` object into the closure verbatim.)
- `remove`:

```tsx
  const remove = async (period: SchoolAdminRecord) => {
    if (!window.confirm('Are you sure you want to delete this period?')) return;
    const result = await runSave(
      () => sharedBridge.deleteSchoolAdminRecord({ collection: 'grading_periods', id: String(period.id) }),
      { success: 'Period deleted.', failure: "Couldn't delete the period." },
    );
    if (result.ok) await reloadPeriods(selectedTermId);
  };
```

- `autoSetup`: compute `start`, `end`, `count`, `span`, `dayMs`, `base` before `setSettingUp(true)` (same expressions as today), then:

```tsx
    setSettingUp(true);
    let created = 0;
    try {
      for (let i = 0; i < count; i += 1) {
        const periodStart = new Date(start + i * span);
        const periodEnd = new Date(i === count - 1 ? end : start + (i + 1) * span - dayMs);
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'grading_periods',
          record: { /* unchanged record object */ },
        });
        created += 1;
      }
      notifications.success('Assessment periods created.');
    } catch (error) {
      notifications.error(formatSaveFailure(`Couldn't finish setting up periods — ${created} of ${count} were created.`, error));
    } finally {
      setSettingUp(false);
    }
    await reloadPeriods(selectedTermId);
```

  (Saves stay one at a time and stop at the first failure; the reload runs either way so partially created periods appear.)

`GradingConfigDrawer.tsx`:
- Imports: `import { useNotificationStore } from '@/lib/presentation/hooks/shared';` and add `describeSaveError` to the `./shared`-adjacent imports: `import { describeSaveError } from './save-feedback';`.
- In the component: `const notifications = useNotificationStore();`.
- In `submit`: after the `await sharedBridge.saveSchoolAdminRecord({ … })` add `notifications.success('Grading configuration saved.');` before `onClose();`; replace the catch body with
  `setError(describeSaveError(cause) || 'Unable to save configuration.');`.
- Keep its `size="xl"` (from commit 41934c3) and everything else unchanged.

- [ ] **Step 4: Verify the task**

Run: `pnpm exec vitest run --project renderer apps/desktop/renderer/components/academic-grading`
Expected: all PASS.

- [ ] **Step 5: Full gate**

1. `pnpm --filter @nemis-desktop/app typecheck` → exit 0.
2. `pnpm lint` → exit 0.
3. `pnpm exec vitest run --project renderer` → only the 2 known failures + the known Sidebar logout unhandled error. Report exact counts.
4. `git diff --stat main...HEAD` (after committing) → only the 9 files named in this plan's File Structure + the spec/plan docs + commit 41934c3's two files.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.tsx apps/desktop/renderer/components/academic-grading/GradingPeriodsPanel.test.tsx apps/desktop/renderer/components/academic-grading/GradingConfigDrawer.tsx apps/desktop/renderer/components/academic-grading/GradingConfigDrawer.test.tsx
git commit -m "feat(academic-setup): toast feedback for assessment period and grading config saves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Manual GUI check (Alvin, in the Electron window)**

1. Edit a year and change its end date → the status buttons grey out with the warning; undo the change → they come back.
2. Open / Publish a window, save a period, save the grading configuration → a green toast each time.
3. Force a failure (e.g. a period whose end date is before its start date, if the backend rejects it) → a red toast with a readable reason and the form stays open.
