# Create Several Subjects at Once — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The New Subject drawer on the school-admin Subjects page accepts several subjects at once, pre-checks codes that already exist, saves them one at a time, and keeps only the failed rows open with their errors.

**Architecture:** A new `createSubjects(dtos)` method on the presentation-layer `AcademicFoundationViewModel` pre-checks existing codes (paging through `listSubjects`), calls the existing `createSubject` application service once per row in order, and emits one summary toast and at most one list reload. The renderer's `SubjectsDirectoryPage` gains a multi-row create mode that validates rows client-side and calls `createSubjects`; edit mode is unchanged. No application, electron, IPC or bridge changes.

**Tech Stack:** TypeScript, React 18 (Next.js renderer), vanilla Zustand ViewModels, Vitest + Testing Library, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-14-subjects-multi-create-design.md`

## Global Constraints

- Branch: `subjects-multi-create` (already created from `main` at f77e40d; spec committed at fa6dba8).
- No changes to `packages/application`, `apps/desktop/electron`, `apps/desktop/renderer/lib/ipc`, `apps/desktop/renderer/services`, `packages/domain`, or portal-web.
- Single `createSubject` and `updateSubject` keep their current behaviour.
- Codes are compared trimmed and uppercased (`code.trim().toUpperCase()`), matching `CreateSubjectUseCase`.
- Pre-check page size is `100` (`ListSubjectsUseCase` clamps `limit` to 1..100 and the IPC validator rejects more), with `includeInactive: true`.
- Exact copy:
  - `Subject created.` / `{n} subjects created.` (success)
  - `{ok} subject created, {failed} failed — see the drawer.` / `{ok} subjects created, {failed} failed — see the drawer.` (warning; "subject" singular only when ok = 1)
  - `No subjects were created — see the errors in the drawer.` (error)
  - `A subject with code "{CODE}" already exists.`
  - `A deactivated subject with code "{CODE}" already exists. Restore it instead.`
  - `Name and code are required`
  - `Duplicate code in this batch`
  - Drawer title `New Subjects` (create) / `Edit Subject` (edit); add button `Add another subject`; submit `Create subject` (≤ 1 counted row) / `Create {n} subjects`; `Saving...` while saving.
- Repo TS config has `noUncheckedIndexedAccess` on — index access returns `T | undefined`.
- Gate: `pnpm typecheck`, `pnpm lint`, `pnpm test` (run from the repo root) all green.
- Targeted tests run from the repo root with `pnpm exec vitest run <path>` (root `vitest.config.ts` has `node` and `renderer` projects). Expect ~60 s per run on this machine (jsdom startup).

## Review Focus

1. The same code typed twice in one batch reaches `createSubjects` (the renderer blocks this, but the ViewModel is public) → the second row fails with the clear "already exists" message instead of the server's generic one. Test: Task 1, Step 1, `catches a code repeated inside the batch`.
2. The list on screen is filtered (keyword set, or "Include deactivated" unchecked) when the user creates → the pre-check ignores those filters and still catches existing codes. Test: Task 1, Step 1, `pre-check ignores the on-screen filters`.
3. The user fixes a failed row (e.g. changes the code after "already exists") → the stale error under that row disappears as soon as they edit it. Test: Task 2, Step 1, `clears a row's save error when the row is edited`.
4. The user cancels after a partial failure and reopens the drawer → it starts fresh with one empty row and no errors. Test: Task 2, Step 1, `reopening the drawer starts with one empty row`.
5. The user opens Edit on an existing subject after using create mode → the edit form shows that subject's fields and no row controls, and saving calls update, not create. Test: Task 2, Step 1, `edit mode still edits one subject`.

---

### Task 1: ViewModel `createSubjects` with existing-code pre-check

**Files:**
- Modify: `packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.ts` (imports at lines 1–26; module helpers next to `identity` at line 54; new methods after `createSubject` at lines 177–179)
- Test: `packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.test.ts`

**Interfaces:**
- Consumes: `AcademicsApplicationService.createSubject(dto: CreateSubjectDto): Promise<ApplicationResponse<SubjectOutput>>`, `AcademicsApplicationService.listSubjects(dto: ListSubjectsDto): Promise<ApplicationResponse<PagedResult<SubjectOutput>>>` (result `{ items, total, limit, offset }`), `toPresentationError(err, 'command')` and `OperationFailedError` from `packages/presentation/src/errors`, `NotificationStore.success/warning/error(message: string)`.
- Produces: `AcademicFoundationViewModel.createSubjects(dtos: readonly CreateSubjectDto[]): Promise<readonly CommandOutcome<SubjectOutput>[]>` — one outcome per dto, same order; never throws. A failed outcome's `error.userMessage` is the text to show under the row. `SubjectRowView` is `SubjectOutput`. `CommandOutcome` is exported from `@nemis-desktop/presentation`.

- [ ] **Step 1: Write the failing tests**

Replace the top of `academic-foundation-view-model.test.ts` (the imports) and append a new `describe` block at the end of the file. The final file is:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { AcademicsApplicationService, CreateSubjectDto, ListSubjectsDto } from '@nemis-desktop/application';
import type { CommandOutcome } from '../../core/async-runner';
import { NotificationStore } from '../../stores/notification-store';
import { AcademicFoundationViewModel } from './academic-foundation-view-model';

function makeAcademics(): AcademicsApplicationService {
  return {
    listAcademicYears: vi.fn(async () => ({ data: [{
      id: 'year-1', institutionId: 'school-1', code: '2026/2027', startDate: '2026-09-01',
      endDate: '2027-07-31', isCurrent: true, status: 'ACTIVE', termCount: 0, classCount: 0,
    }] })),
    listClasses: vi.fn(async () => ({ data: { items: [], total: 0, limit: 25, offset: 0 } })),
    listSubjects: vi.fn(async () => ({ data: { items: [], total: 0, limit: 25, offset: 0 } })),
  } as unknown as AcademicsApplicationService;
}

describe('AcademicFoundationViewModel', () => {
  it('loads academic years through the ApplicationLayer facade', async () => {
    const vm = new AcademicFoundationViewModel({ academics: makeAcademics(), notifications: new NotificationStore() });
    await vm.loadAcademicYears();
    const state = vm.store.getState().academicYears;
    expect(state.status).toBe('success');
    if (state.status === 'success') expect(state.data[0]?.code).toBe('2026/2027');
  });

  it('represents an empty class page as an empty state', async () => {
    const vm = new AcademicFoundationViewModel({ academics: makeAcademics(), notifications: new NotificationStore() });
    await vm.loadClasses();
    expect(vm.store.getState().classes.status).toBe('empty');
  });
});

const subjectOut = (code: string, over: Record<string, unknown> = {}) => ({
  id: `id-${code}`, name: code, code, isActive: true, classCount: 0, ...over,
});

/** `existing` is what is already on the device; listSubjects pages through it
 * like the real use case. createSubject echoes the dto back as a saved row. */
function makeBatchAcademics(existing: ReadonlyArray<{ code: string; isActive: boolean }> = []) {
  return {
    listSubjects: vi.fn(async (dto: ListSubjectsDto) => {
      const offset = dto.offset ?? 0;
      const limit = dto.limit ?? 25;
      const items = existing.slice(offset, offset + limit).map((s) => subjectOut(s.code, { isActive: s.isActive }));
      return { data: { items, total: existing.length, limit, offset } };
    }),
    createSubject: vi.fn(async (dto: CreateSubjectDto) => ({
      data: subjectOut(dto.code.trim().toUpperCase(), { name: dto.name }),
    })),
  };
}

type BatchAcademics = ReturnType<typeof makeBatchAcademics>;

function makeBatchVm(academics: BatchAcademics) {
  // null auto-dismiss: toasts stay in the store for the assertions.
  const notifications = new NotificationStore({ success: null, info: null, warning: null, error: null });
  const vm = new AcademicFoundationViewModel({
    academics: academics as unknown as AcademicsApplicationService,
    notifications,
  });
  return { vm, notifications };
}

const toasts = (n: NotificationStore) => n.store.getState().notifications.map((t) => [t.kind, t.message]);
const messages = (outcomes: readonly CommandOutcome<unknown>[]) =>
  outcomes.map((o) => (o.ok ? 'ok' : o.error.userMessage));
/** The pre-check always asks for deactivated subjects; the list reload uses the on-screen filters. */
const preCheckCalls = (a: BatchAcademics) => a.listSubjects.mock.calls.filter(([dto]) => dto.includeInactive === true);
const reloads = (a: BatchAcademics) => a.listSubjects.mock.calls.filter(([dto]) => dto.includeInactive !== true).length;
const createdCodes = (a: BatchAcademics) => a.createSubject.mock.calls.map(([dto]) => dto.code);

describe('AcademicFoundationViewModel.createSubjects', () => {
  it('creates every subject in order, then reloads once and shows one toast', async () => {
    const academics = makeBatchAcademics();
    const { vm, notifications } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }, { name: 'English', code: 'ENG' }]);
    expect(messages(outcomes)).toEqual(['ok', 'ok']);
    expect(createdCodes(academics)).toEqual(['MATH', 'ENG']);
    expect(reloads(academics)).toBe(1);
    expect(toasts(notifications)).toEqual([['success', '2 subjects created.']]);
  });

  it('uses the single-subject message for a batch of one', async () => {
    const academics = makeBatchAcademics();
    const { vm, notifications } = makeBatchVm(academics);
    await vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }]);
    expect(toasts(notifications)).toEqual([['success', 'Subject created.']]);
  });

  it('keeps outcomes in order on partial failure, with one warning and one reload', async () => {
    const academics = makeBatchAcademics();
    academics.createSubject.mockImplementation(async (dto: CreateSubjectDto) => {
      if (dto.code === 'BAD') throw new Error('boom');
      return { data: subjectOut(dto.code, { name: dto.name }) };
    });
    const { vm, notifications } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Bad', code: 'BAD' }, { name: 'English', code: 'ENG' }]);
    expect(messages(outcomes)).toEqual(['Something went wrong. Please try again.', 'ok']);
    expect(reloads(academics)).toBe(1);
    expect(toasts(notifications)).toEqual([['warning', '1 subject created, 1 failed — see the drawer.']]);
  });

  it('pluralises the warning when more than one subject saved', async () => {
    const academics = makeBatchAcademics([{ code: 'MATH', isActive: true }]);
    const { vm, notifications } = makeBatchVm(academics);
    await vm.createSubjects([{ name: 'A', code: 'A' }, { name: 'B', code: 'B' }, { name: 'M', code: 'MATH' }]);
    expect(toasts(notifications)).toEqual([['warning', '2 subjects created, 1 failed — see the drawer.']]);
  });

  it('does not reload and shows one error when nothing saved', async () => {
    const academics = makeBatchAcademics();
    academics.createSubject.mockRejectedValue(new Error('boom'));
    const { vm, notifications } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'A', code: 'A' }, { name: 'B', code: 'B' }]);
    expect(outcomes.every((o) => !o.ok)).toBe(true);
    expect(reloads(academics)).toBe(0);
    expect(toasts(notifications)).toEqual([['error', 'No subjects were created — see the errors in the drawer.']]);
  });

  it('does not start the next create until the previous one finished', async () => {
    const academics = makeBatchAcademics();
    let release: () => void = () => {};
    academics.createSubject.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ data: subjectOut('MATH') }); }),
    );
    const { vm } = makeBatchVm(academics);
    const pending = vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }, { name: 'English', code: 'ENG' }]);
    await vi.waitFor(() => expect(academics.createSubject).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(academics.createSubject).toHaveBeenCalledTimes(1);
    release();
    await pending;
    expect(createdCodes(academics)).toEqual(['MATH', 'ENG']);
  });

  it('returns nothing and does no work for an empty batch', async () => {
    const academics = makeBatchAcademics();
    const { vm, notifications } = makeBatchVm(academics);
    expect(await vm.createSubjects([])).toEqual([]);
    expect(academics.listSubjects).not.toHaveBeenCalled();
    expect(academics.createSubject).not.toHaveBeenCalled();
    expect(toasts(notifications)).toEqual([]);
  });

  it('rejects a code that already exists, ignoring case and spaces, without sending it', async () => {
    const academics = makeBatchAcademics([{ code: 'MATH', isActive: true }]);
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Maths', code: ' math ' }, { name: 'English', code: 'ENG' }]);
    expect(messages(outcomes)).toEqual(['A subject with code "MATH" already exists.', 'ok']);
    expect(createdCodes(academics)).toEqual(['ENG']);
  });

  it('points to restore when the existing subject is deactivated', async () => {
    const academics = makeBatchAcademics([{ code: 'ART', isActive: false }]);
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Art', code: 'art' }]);
    expect(messages(outcomes)).toEqual(['A deactivated subject with code "ART" already exists. Restore it instead.']);
    expect(academics.createSubject).not.toHaveBeenCalled();
  });

  it('pages through every subject for the pre-check', async () => {
    const existing = Array.from({ length: 150 }, (_, i) => ({ code: `S${i}`, isActive: true }));
    const academics = makeBatchAcademics(existing);
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Late page', code: 's120' }]);
    expect(messages(outcomes)).toEqual(['A subject with code "S120" already exists.']);
    expect(preCheckCalls(academics).map(([dto]) => [dto.limit, dto.offset])).toEqual([[100, 0], [100, 100]]);
  });

  it('still sends every row when the pre-check cannot read the list', async () => {
    const academics = makeBatchAcademics([{ code: 'MATH', isActive: true }]);
    academics.listSubjects.mockRejectedValueOnce(new Error('db down'));
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }]);
    expect(messages(outcomes)).toEqual(['ok']);
    expect(createdCodes(academics)).toEqual(['MATH']);
  });

  it('catches a code repeated inside the batch', async () => {
    const academics = makeBatchAcademics();
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }, { name: 'Maths', code: 'math' }]);
    expect(messages(outcomes)).toEqual(['ok', 'A subject with code "MATH" already exists.']);
    expect(createdCodes(academics)).toEqual(['MATH']);
  });

  it('pre-check ignores the on-screen filters', async () => {
    const academics = makeBatchAcademics([{ code: 'ART', isActive: false }]);
    const { vm } = makeBatchVm(academics);
    vm.setSubjectFilters({ keyword: 'zzz', includeInactive: false });
    const outcomes = await vm.createSubjects([{ name: 'Art', code: 'ART' }]);
    expect(messages(outcomes)).toEqual(['A deactivated subject with code "ART" already exists. Restore it instead.']);
    expect(preCheckCalls(academics).every(([dto]) => dto.keyword === undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.test.ts`
Expected: the two existing tests PASS; every `createSubjects` test FAILS with `vm.createSubjects is not a function` (typecheck is not part of vitest, so the file still runs).

- [ ] **Step 3: Implement `createSubjects`**

In `academic-foundation-view-model.ts`:

3a. Add to the imports (after the `async-runner` import line):

```ts
import { OperationFailedError, toPresentationError } from '../../errors';
```

3b. Directly below `const identity = <T>(value: T): T => value;` add:

```ts
/** ListSubjectsUseCase clamps `limit` to 100 and the IPC validator rejects more. */
const SUBJECT_PAGE_MAX = 100;

/** Same normalization CreateSubjectUseCase applies before its duplicate check. */
const normalizeSubjectCode = (code: string): string => code.trim().toUpperCase();

const subjectCount = (n: number): string => `${n} subject${n === 1 ? '' : 's'}`;
```

3c. Directly after the existing `createSubject` method add:

```ts
  /** Creates several subjects, one at a time and in order, for the
   * multi-row New Subject drawer. Codes that already exist on the device
   * (deactivated included) are rejected up front with a clear message —
   * the use case's own "already exists" text does not survive IPC. One
   * summary toast and at most one list reload for the whole batch.
   * Returns one outcome per dto, same order. Never throws. */
  async createSubjects(dtos: readonly CreateSubjectDto[]): Promise<readonly CommandOutcome<SubjectOutput>[]> {
    if (dtos.length === 0) return [];
    const existing = await this.existingSubjectCodes();
    const outcomes: CommandOutcome<SubjectOutput>[] = [];
    for (const dto of dtos) {
      const code = normalizeSubjectCode(dto.code);
      const existingIsActive = existing?.get(code);
      if (existingIsActive !== undefined) {
        outcomes.push({
          ok: false,
          error: new OperationFailedError(
            existingIsActive
              ? `A subject with code "${code}" already exists.`
              : `A deactivated subject with code "${code}" already exists. Restore it instead.`,
          ),
        });
        continue;
      }
      try {
        const res = await this.deps.academics.createSubject(dto);
        for (const warning of res.warnings ?? []) this.deps.notifications.warning(warning);
        existing?.set(code, true);
        outcomes.push({ ok: true, data: res.data });
      } catch (err) {
        outcomes.push({ ok: false, error: toPresentationError(err, 'command') });
      }
    }
    const created = outcomes.filter((o) => o.ok).length;
    const failed = outcomes.length - created;
    if (failed === 0) this.deps.notifications.success(created === 1 ? 'Subject created.' : `${created} subjects created.`);
    else if (created === 0) this.deps.notifications.error('No subjects were created — see the errors in the drawer.');
    else this.deps.notifications.warning(`${subjectCount(created)} created, ${failed} failed — see the drawer.`);
    if (created > 0) await this.loadSubjects();
    return outcomes;
  }
```

3d. Directly above the existing `private async command<T>(` method add:

```ts
  /** code → isActive for every subject on the device, ignoring the on-screen
   * filters; null when the list cannot be read (the batch then relies on the
   * use case's own duplicate check). */
  private async existingSubjectCodes(): Promise<Map<string, boolean> | null> {
    try {
      const codes = new Map<string, boolean>();
      let offset = 0;
      for (;;) {
        const { data } = await this.deps.academics.listSubjects({ limit: SUBJECT_PAGE_MAX, offset, includeInactive: true });
        for (const subject of data.items) codes.set(normalizeSubjectCode(subject.code), subject.isActive);
        offset += data.items.length;
        if (data.items.length === 0 || offset >= data.total) return codes;
      }
    } catch {
      return null;
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.test.ts`
Expected: all 15 tests PASS.

- [ ] **Step 5: Typecheck the presentation package**

Run: `pnpm --filter @nemis-desktop/presentation typecheck`
Expected: exits 0. (If the test file's `mockImplementationOnce` promise type complains, type the resolver as `(value: { data: ReturnType<typeof subjectOut> }) => void` — do not loosen the production code.)

- [ ] **Step 6: Commit**

```bash
git add packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.ts packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.test.ts
git commit -m "feat(subjects): createSubjects batch command with existing-code pre-check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Multi-row create mode in the New Subject drawer

**Files:**
- Modify (full rewrite shown below): `apps/desktop/renderer/components/subjects/SubjectsDirectoryPage.tsx`
- Create: `apps/desktop/renderer/components/subjects/SubjectsDirectoryPage.test.tsx`
- Reuses (no change): `apps/desktop/renderer/components/academic-grading/setup-test-support.tsx` (`stubNemis`, `clearNemis`, `renderWithLayer`)

**Interfaces:**
- Consumes: `vm.createSubjects(dtos: readonly CreateSubjectDto[]): Promise<readonly CommandOutcome<SubjectOutput>[]>` from Task 1 (dto fields `name: string`, `code: string`, `description?: string`); existing `vm.updateSubject`, `vm.setSubjectActive`, `vm.loadSubjects`, `vm.setSubjectFilters`.
- Produces: exported pure helper `validateDraftRows(rows: readonly SubjectDraftRow[]): Map<string, string>` (row key → message) and type `SubjectDraftRow`; nothing else depends on them.

- [ ] **Step 1: Write the failing renderer tests**

Create `apps/desktop/renderer/components/subjects/SubjectsDirectoryPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { SubjectsDirectoryPage, validateDraftRows } from './SubjectsDirectoryPage';
import { clearNemis, renderWithLayer, stubNemis } from '../academic-grading/setup-test-support';

const subjectRow = (over: Record<string, unknown> = {}) => ({
  id: 's1', name: 'Mathematics', code: 'MATH', isActive: true, classCount: 0, ...over,
});

/** stubNemis() covers bootstrap; the page itself only talks to window.nemis.subject. */
function stubSubjects(existing: unknown[] = []) {
  stubNemis();
  const subject = {
    list: vi.fn(async () => ({ items: existing, total: existing.length, limit: 100, offset: 0 })),
    create: vi.fn(async (req: { name: string; code: string }) =>
      subjectRow({ id: `new-${req.code}`, name: req.name, code: req.code.trim().toUpperCase() })),
    update: vi.fn(async (req: { id: string; name: string; code: string }) => subjectRow(req)),
    setActive: vi.fn(),
  };
  (window as unknown as { nemis: Record<string, unknown> }).nemis.subject = subject;
  return subject;
}

const drawerTitle = (name: string) => screen.queryByRole('heading', { level: 2, name });

async function openCreate() {
  await renderWithLayer(<SubjectsDirectoryPage />);
  fireEvent.click(screen.getByRole('button', { name: 'New Subject' }));
  await waitFor(() => expect(drawerTitle('New Subjects')).not.toBeNull());
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillRow = (row: number, name: string, code: string) => {
  type(`Subject Name (row ${row})`, name);
  type(`Subject Code (row ${row})`, code);
};
const addRow = () => fireEvent.click(screen.getByRole('button', { name: 'Add another subject' }));

afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
});

describe('validateDraftRows', () => {
  const row = (key: string, name: string, code: string, description = '') => ({ key, name, code, description });
  it('skips fully blank rows', () => expect(validateDraftRows([row('a', '', '', '')]).size).toBe(0));
  it('requires name and code on a started row', () =>
    expect(validateDraftRows([row('a', '', '', 'notes')]).get('a')).toBe('Name and code are required'));
  it('flags every repeat of a code after the first, ignoring case and spaces', () => {
    const errors = validateDraftRows([row('a', 'A', 'MATH'), row('b', 'B', ' math '), row('c', 'C', 'Math')]);
    expect([...errors]).toEqual([['b', 'Duplicate code in this batch'], ['c', 'Duplicate code in this batch']]);
  });
});

describe('SubjectsDirectoryPage — create several subjects', () => {
  it('creates every row in order and closes the drawer', async () => {
    const subject = stubSubjects();
    await openCreate();
    fillRow(1, 'Mathematics', 'MATH');
    addRow();
    fillRow(2, 'English', 'ENG');
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 subjects' }));
    await waitFor(() => expect(subject.create).toHaveBeenCalledTimes(2));
    expect(subject.create.mock.calls.map(([req]) => req.code)).toEqual(['MATH', 'ENG']);
    await waitFor(() => expect(drawerTitle('New Subjects')).toBeNull());
  });

  it('blocks a code repeated in the batch', async () => {
    const subject = stubSubjects();
    await openCreate();
    fillRow(1, 'Mathematics', 'MATH');
    addRow();
    fillRow(2, 'Maths', ' math ');
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 subjects' }));
    expect(await screen.findByText('Duplicate code in this batch')).toBeInTheDocument();
    expect(subject.create).not.toHaveBeenCalled();
  });

  it('blocks a row with a name but no code', async () => {
    const subject = stubSubjects();
    await openCreate();
    type('Subject Name (row 1)', 'Mathematics');
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }));
    expect(await screen.findByText('Name and code are required')).toBeInTheDocument();
    expect(subject.create).not.toHaveBeenCalled();
  });

  it('does not show errors on a fresh empty row before the first submit', async () => {
    stubSubjects();
    await openCreate();
    addRow();
    expect(screen.queryByText('Name and code are required')).toBeNull();
  });

  it('keeps only the row whose code already exists, with its message', async () => {
    const subject = stubSubjects([subjectRow()]);
    await openCreate();
    fillRow(1, 'English', 'ENG');
    addRow();
    fillRow(2, 'Maths', 'math');
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 subjects' }));
    expect(await screen.findByText('A subject with code "MATH" already exists.')).toBeInTheDocument();
    expect(subject.create).toHaveBeenCalledTimes(1);
    expect(screen.queryByDisplayValue('English')).toBeNull();
    expect(screen.getByDisplayValue('Maths')).toBeInTheDocument();
    expect(drawerTitle('New Subjects')).not.toBeNull();
  });

  it('clears a row\'s save error when the row is edited', async () => {
    stubSubjects([subjectRow()]);
    await openCreate();
    fillRow(1, 'Maths', 'MATH');
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }));
    expect(await screen.findByText('A subject with code "MATH" already exists.')).toBeInTheDocument();
    type('Subject Code (row 1)', 'MATH2');
    expect(screen.queryByText('A subject with code "MATH" already exists.')).toBeNull();
  });

  it('ignores a blank extra row', async () => {
    const subject = stubSubjects();
    await openCreate();
    fillRow(1, 'Mathematics', 'MATH');
    addRow();
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }));
    await waitFor(() => expect(subject.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(drawerTitle('New Subjects')).toBeNull());
  });

  it('reopening the drawer starts with one empty row', async () => {
    stubSubjects([subjectRow()]);
    await openCreate();
    fillRow(1, 'Maths', 'MATH');
    addRow();
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }));
    expect(await screen.findByText('A subject with code "MATH" already exists.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(drawerTitle('New Subjects')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'New Subject' }));
    await waitFor(() => expect(drawerTitle('New Subjects')).not.toBeNull());
    expect(screen.getByLabelText('Subject Name (row 1)')).toHaveValue('');
    expect(screen.queryByLabelText('Subject Name (row 2)')).toBeNull();
    expect(screen.queryByText('A subject with code "MATH" already exists.')).toBeNull();
  });

  it('edit mode still edits one subject', async () => {
    const subject = stubSubjects([subjectRow()]);
    await renderWithLayer(<SubjectsDirectoryPage />);
    fireEvent.click(await screen.findByTitle('Edit subject'));
    await waitFor(() => expect(drawerTitle('Edit Subject')).not.toBeNull());
    expect(screen.getByDisplayValue('Mathematics')).toBeInTheDocument();
    expect(screen.getByDisplayValue('MATH')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add another subject' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(subject.update).toHaveBeenCalledTimes(1));
    expect(subject.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/desktop/renderer/components/subjects/SubjectsDirectoryPage.test.tsx`
Expected: FAIL — `validateDraftRows` is not exported, and the create tests cannot find `Subject Name (row 1)` / the `New Subjects` heading.

- [ ] **Step 3: Rewrite `SubjectsDirectoryPage.tsx`**

Replace the whole file with:

```tsx
'use client';
import { useState, type FormEvent } from 'react';
import type { SubjectRowView } from '@nemis-desktop/presentation';
import { Card, Drawer, Input } from '@nemis-desktop/ui';
import { Plus, Trash2, Edit, BookOpen, RotateCcw } from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

/** One subject being typed in the multi-row create drawer. `error` is the
 * save result for this row; validation errors are computed, not stored. */
export interface SubjectDraftRow {
  key: string;
  name: string;
  code: string;
  description: string;
  error?: string;
}

const makeKey = () => Math.random().toString(36).slice(2, 10);
const emptyRow = (): SubjectDraftRow => ({ key: makeKey(), name: '', code: '', description: '' });
const isBlank = (row: SubjectDraftRow) => !row.name.trim() && !row.code.trim() && !row.description.trim();

/** Client-side checks for the create drawer: row key → message for rows that
 * cannot be sent. Fully blank rows are skipped, not errors. Codes compare
 * trimmed + uppercased, the same way CreateSubjectUseCase does. */
export function validateDraftRows(rows: readonly SubjectDraftRow[]): Map<string, string> {
  const errors = new Map<string, string>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (isBlank(row)) continue;
    const code = row.code.trim().toUpperCase();
    if (!row.name.trim() || !code) {
      errors.set(row.key, 'Name and code are required');
      continue;
    }
    if (seen.has(code)) errors.set(row.key, 'Duplicate code in this batch');
    seen.add(code);
  }
  return errors;
}

/** Subjects — mirrors portal-web's Subject Management page (dark header
 * band, all-subjects table, create/edit drawer). The create drawer takes
 * several subjects at once: rows are checked here, codes already on the
 * device are caught by vm.createSubjects, and only failed rows stay open.
 * Web's "Bulk Import" (.xlsx upload) has no equivalent here; edit and
 * deactivate stay single-subject. */
export function SubjectsDirectoryPage() {
  const vm = useAcademicFoundationViewModel();
  const state = useViewModel(vm.store, (s) => s.subjects);
  const filters = useViewModel(vm.store, (s) => s.subjectFilters);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectRowView | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<SubjectDraftRow[]>(() => [emptyRow()]);
  const [showValidation, setShowValidation] = useState(false);
  const [saving, setSaving] = useState(false);

  useRevalidateOnSync(() => {
    void vm.loadSubjects();
     
  }, []);

  const begin = (item?: SubjectRowView) => {
    setEditing(item ?? null);
    setName(item?.name ?? '');
    setCode(item?.code ?? '');
    setDescription(item?.description ?? '');
    setRows([emptyRow()]);
    setShowValidation(false);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  const validationErrors = showValidation ? validateDraftRows(rows) : new Map<string, string>();
  const countedRows = rows.filter((row) => !isBlank(row)).length;

  /** Editing a row drops its stale save error. */
  const updateRow = (key: string, patch: Partial<Pick<SubjectDraftRow, 'name' | 'code' | 'description'>>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch, error: undefined } : row)));
  const removeRow = (key: string) => setRows((prev) => prev.filter((row) => row.key !== key));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const submitEdit = async (item: SubjectRowView) => {
    setSaving(true);
    const result = await vm.updateSubject({ id: item.id, name, code, description: description || null });
    setSaving(false);
    if (result.ok) closeDrawer();
  };

  const submitCreate = async () => {
    setShowValidation(true);
    if (validateDraftRows(rows).size > 0) return;
    const toSend = rows.filter((row) => !isBlank(row));
    if (toSend.length === 0) return;
    setSaving(true);
    const outcomes = await vm.createSubjects(
      toSend.map((row) => ({ name: row.name, code: row.code, description: row.description || undefined })),
    );
    setSaving(false);
    const failedRows = toSend.flatMap((row, i) => {
      const outcome = outcomes[i];
      return outcome && !outcome.ok ? [{ ...row, error: outcome.error.userMessage }] : [];
    });
    if (failedRows.length === 0) closeDrawer();
    else setRows(failedRows);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void (editing ? submitEdit(editing) : submitCreate());
  };

  const isLoading = state.status === 'loading' || state.status === 'idle';
  const subjects = state.status === 'success' || state.status === 'refreshing' ? state.data : [];

  const submitLabel = saving
    ? 'Saving...'
    : editing
      ? 'Update'
      : countedRows <= 1
        ? 'Create subject'
        : `Create ${countedRows} subjects`;

  return (
    <div className="min-h-full bg-slate-100">
      <div className="bg-primary px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Subject Management</h1>
          <p className="text-sm text-slate-300">Create subjects, then assign them to classes to build each class&apos;s curriculum.</p>
        </div>
        <button
          onClick={() => begin()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-500 rounded-button hover:bg-slate-700"
        >
          <Plus className="w-4 h-4" />
          New Subject
        </button>
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="bg-white border border-slate-300 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            placeholder="Search by name or code"
            value={filters.keyword ?? ''}
            onChange={(e) => {
              vm.setSubjectFilters({ ...filters, keyword: e.target.value });
              void vm.loadSubjects();
            }}
          />
          <label className="text-sm flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={filters.includeInactive ?? false}
              onChange={(e) => {
                vm.setSubjectFilters({ ...filters, includeInactive: e.target.checked });
                void vm.loadSubjects();
              }}
            />
            Include deactivated subjects
          </label>
        </div>

        <Card bordered={false}>
          <h2 className="text-base font-semibold text-gray-900 mb-4">All Subjects</h2>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : subjects.length === 0 ? (
            <div className="text-center py-10">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No subjects yet. Create the first one above.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Classes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subjects.map((subject) => (
                  <tr key={subject.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{subject.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">{subject.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{subject.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{subject.classCount}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${subject.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {subject.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => begin(subject)} className="text-sky-700 hover:text-sky-900 p-1" title="Edit subject">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`${subject.isActive ? 'Deactivate' : 'Restore'} ${subject.name}?`)) void vm.setSubjectActive(subject.id, !subject.isActive);
                          }}
                          className="text-gray-500 hover:text-red-600 p-1"
                          title={subject.isActive ? 'Deactivate subject' : 'Restore subject'}
                        >
                          {subject.isActive ? <Trash2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Drawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        title={editing ? 'Edit Subject' : 'New Subjects'}
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={closeDrawer}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="subject-form"
              disabled={saving || (!editing && countedRows === 0)}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {submitLabel}
            </button>
          </>
        }
      >
        <form id="subject-form" onSubmit={submit} className="space-y-4">
          {editing ? (
            <>
              <Input
                label="Subject Name"
                type="text"
                required
                placeholder="e.g., Mathematics"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                label="Subject Code"
                type="text"
                required
                placeholder="e.g., MATH101"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  rows={3}
                  placeholder="Brief description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-sm"
                />
              </div>
            </>
          ) : (
            <>
              {rows.map((row, i) => {
                const rowNumber = i + 1;
                const error = validationErrors.get(row.key) ?? row.error;
                return (
                  <div
                    key={row.key}
                    className={`rounded-lg border p-3 space-y-3 ${error ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="grid flex-1 grid-cols-2 gap-3">
                        <Input
                          label="Subject Name"
                          aria-label={`Subject Name (row ${rowNumber})`}
                          type="text"
                          placeholder="e.g., Mathematics"
                          value={row.name}
                          onChange={(e) => updateRow(row.key, { name: e.target.value })}
                        />
                        <Input
                          label="Subject Code"
                          aria-label={`Subject Code (row ${rowNumber})`}
                          type="text"
                          placeholder="e.g., MATH101"
                          value={row.code}
                          onChange={(e) => updateRow(row.key, { code: e.target.value })}
                        />
                      </div>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          title="Remove row"
                          aria-label={`Remove row ${rowNumber}`}
                          className="mt-8 p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <Input
                      label="Description"
                      aria-label={`Description (row ${rowNumber})`}
                      type="text"
                      placeholder="Brief description (optional)"
                      value={row.description}
                      onChange={(e) => updateRow(row.key, { description: e.target.value })}
                    />
                    {error && (
                      <p role="alert" className="text-xs text-red-600">
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-900"
              >
                <Plus className="w-4 h-4" />
                Add another subject
              </button>
            </>
          )}
        </form>
      </Drawer>
    </div>
  );
}
```

Notes for the implementer:
- The table, filters and header are copied unchanged from the current file; only the state, handlers and the drawer body/footer changed. Diff against `main` to confirm nothing else moved.
- `Input` (`@nemis-desktop/ui`) renders its `<label>` without `htmlFor`, so the `aria-label` is what makes each row's field reachable by label in tests and screen readers. Keep the visible label text at the start of the `aria-label` (WCAG 2.5.3 label-in-name).
- `Input` takes `required` but does **not** forward it to the `<input>` (it only draws the asterisk), so edit mode's `required` is visual only — unchanged from today. Do not "fix" `Input` here; create mode's checks live in `validateDraftRows`.
- Keep the stray blank line inside the `useRevalidateOnSync` callback exactly as it is today (it was left by an earlier lint fix; removing it is unrelated churn).

- [ ] **Step 4: Run the renderer tests to verify they pass**

Run: `pnpm exec vitest run apps/desktop/renderer/components/subjects/SubjectsDirectoryPage.test.tsx`
Expected: all 12 tests PASS.

If `edit mode still edits one subject` cannot find `Edit subject`, the initial list load has not resolved yet — `findByTitle` already waits; check that `stubSubjects([subjectRow()])` ran before render.

- [ ] **Step 5: Run the full gate**

Run each from the repo root:
- `pnpm typecheck` → exits 0
- `pnpm lint` → 0 errors (warnings count unchanged from `main`)
- `pnpm test` → all files pass

If a failure is unrelated to this branch, confirm it also fails on `main` (`git stash; git switch main; …`) and report it rather than fixing it here.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/subjects/SubjectsDirectoryPage.tsx apps/desktop/renderer/components/subjects/SubjectsDirectoryPage.test.tsx
git commit -m "feat(subjects): add several subjects at once from the New Subject drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After both tasks

- Manual GUI check (Alvin, in the running desktop app): open Subjects → New Subject, add three rows, include one code that already exists and one deactivated code, press Create, confirm only those two rows stay with the right messages and one toast appears; then fix them and save.
- Follow-up to record (not in this branch): `WorkflowException` / `UseCaseException` text does not cross IPC (`apps/desktop/electron/ipc/errorMapping.ts` maps them to `UNEXPECTED_ERROR`), so every create/update in the app shows "Something went wrong. Please try again." for business-rule failures. `BulkClassFormPage` also shows one toast per row.
