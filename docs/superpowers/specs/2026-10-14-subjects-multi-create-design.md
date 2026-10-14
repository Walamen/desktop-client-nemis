# Create Several Subjects at Once — Design

Date: 2026-10-14
Branch: `subjects-multi-create` (from `main` at f77e40d)
Scope: desktop-client-nemis — school-admin Subjects page (renderer) plus one new presentation-layer
ViewModel method.

## Goal

On the Subjects page (`app/government/school-admin/subjects/page.tsx` →
`components/subjects/SubjectsDirectoryPage.tsx`), a school admin can add several subjects in one go
from the existing **New Subject** drawer instead of reopening it once per subject.

**Why:** Alvin asked for it (2026-10-14). Setting up a school's subject list one drawer at a time is
slow.

**Decisions Alvin made:**
- Multi-row **drawer** on the same page — not a separate bulk page, no file upload.
- On partial failure, rows that saved leave the drawer and failed rows stay with their error so they
  can be fixed and resubmitted. The drawer closes only when every row saved.
- Codes that already exist on the device are caught by a **pre-check** before saving, with a clear
  message (chosen 2026-10-14 after finding that the use case's own "already exists" text never
  reaches the renderer — see Current state).

## Non-goals

- Editing stays one subject at a time; the edit drawer is unchanged.
- No .xlsx/.csv import, no template download.
- No all-or-nothing batch: no new use case, IPC channel or transaction. Each row is still one
  `CreateSubjectUseCase` call (one local write + outbox record, as today).
- No change to the application, electron, IPC, bridge or domain layers.
- No change to portal-web.
- `components/academic/AcademicFoundationPages.tsx` (an older duplicate subject form) is untouched.
- `BulkClassFormPage` has the same one-toast-per-row behaviour; it is noted, not fixed, here.
- No change to IPC error mapping. That `WorkflowException` / `UseCaseException` text does not cross
  IPC is an app-wide gap, recorded as a follow-up, not fixed here.

## Current state

- `SubjectsDirectoryPage` holds single-subject form state (`name`, `code`, `description`) and calls
  `vm.updateSubject` (edit) or `vm.createSubject` (create) on submit; closes the drawer when
  `result.ok`.
- `AcademicFoundationViewModel.createSubject(dto)`
  (`packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.ts`)
  runs through the private `command()` helper → `executeCommand`
  (`packages/presentation/src/core/async-runner.ts`), which shows a success or error toast per call,
  then reloads the subject list on success.
- `CreateSubjectUseCase` requires `name` and `code`, trims + uppercases the code, and rejects a code
  that already exists for the institution (`A subject with code "X" already exists.`).
- Calling `vm.createSubject` in a loop would therefore produce N toasts and N list reloads.
- **Server error text does not reach the renderer.** `WorkflowException` extends
  `ApplicationException` (not `@nemis-desktop/shared`'s `ApplicationError`), so
  `apps/desktop/electron/ipc/errorMapping.ts` maps it to `[UNEXPECTED_ERROR] An unexpected error
  occurred.`; the renderer's `toPresentationError` then shows `Something went wrong. Please try
  again.` A duplicate code therefore shows that generic text today, even on single create.
- `ListSubjectsUseCase` clamps `limit` to 1..100 (IPC also rejects `limit` > 100); it accepts
  `offset` and `includeInactive`, and returns `{ items, total, limit, offset }`.
  `SqliteSubjectRepository.existsByCode` matches deactivated subjects too.

## Design

### 1. ViewModel: `createSubjects(dtos)`

New public method on `AcademicFoundationViewModel`, next to `createSubject`:

```ts
async createSubjects(dtos: readonly CreateSubjectDto[]): Promise<readonly CommandOutcome<SubjectOutput>[]>
```

- **Pre-check first.** Before any create, fetch every subject on the device, deactivated included:
  `academics.listSubjects({ limit: 100, offset, includeInactive: true })`, advancing `offset` by
  the page size until `offset >= total` or a page comes back empty. Build a map
  `code (trimmed, uppercased) → isActive`.
  - A dto whose normalized code is in the map is **not sent**; its outcome is
    `{ ok: false, error: new OperationFailedError(…) }` with message
    `A subject with code "MATH" already exists.` or, when that subject is deactivated,
    `A deactivated subject with code "MATH" already exists. Tick "Include deactivated subjects" to find and restore it.`
  - If the pre-check fetch fails, skip it and send every dto (the server still rejects duplicates,
    with the generic message). No extra toast for the failed pre-check.
- Calls `this.deps.academics.createSubject(dto)` for each remaining dto **sequentially**, in input order
  (same reason as `BulkClassFormPage`: honest per-row error attribution, one write at a time).
- Each failure is converted with `toPresentationError(err, 'command')`, the same conversion
  `executeCommand` uses, so `outcome.error.userMessage` matches what a single create would show.
  It never throws.
- Returns one `CommandOutcome` per dto, same order and length as the input.
- No per-row toasts. After the loop, **one** summary notification:
  - all saved, n = 1 → success `Subject created.`
  - all saved, n > 1 → success `{n} subjects created.`
  - some saved, some failed → warning `{ok} subject(s) created, {failed} failed — see the drawer.`
    (singular/plural per count)
  - none saved → error `No subjects were created — see the errors in the drawer.`
- Any `warnings` on a successful `ApplicationResponse` are still passed to
  `notifications.warning`, as `executeCommand` does.
- Reloads the subject list **once**, only if at least one row saved.
- Empty input → returns `[]`, no toast, no reload.
- `createSubject` (single) is unchanged.

### 2. Drawer: multi-row create mode (`SubjectsDirectoryPage.tsx`)

State: edit mode keeps today's single-subject fields. Create mode holds
`rows: { key: string; name: string; code: string; description: string; error?: string }[]`,
starting with one empty row each time the drawer opens for create.

Layout (create mode, inside the existing `md` drawer):
- Each row is a bordered block: **Subject Name** and **Subject Code** side by side, then a one-line
  **Description** input below. A remove (trash) button per row, hidden when only one row remains.
- Row-level error text (validation or server) shows under the row in red.
- Below the rows: a `+ Add another subject` button that appends an empty row.
- Drawer title: `New Subjects`. Footer submit: `Create subject` for one counted row,
  `Create {n} subjects` for more; `Saving...` while submitting. The page header's
  **New Subject** button is unchanged.

Validation (client-side, before any call):
- A row whose name, code and description are all blank is **skipped** (not an error). At least one
  non-blank row is required; otherwise submit is disabled.
- Submit is otherwise always enabled; pressing it with validation errors shows them and sends
  nothing.
- In a non-blank row, name and code are required: a row missing either shows
  `Name and code are required` and blocks submit. This is checked in code, **not** with the HTML
  `required` attribute — native validation would block submit on a blank row that should be skipped.
  (Edit mode keeps `required` as today. Note `@nemis-desktop/ui` `Input` does not forward `required`
  to the `<input>`, so it only draws the asterisk.)
- Row errors from validation appear only after the first submit attempt, so a freshly added empty row
  is not shown in red; after that they update as the user types.
- Duplicate codes within the batch — compared trimmed and uppercased, matching the use case — mark
  every row after the first with that code as `Duplicate code in this batch`.
- Codes that already exist on the device are checked by `vm.createSubjects` at submit time (see
  §1), not against the visible list, which may be filtered or paginated. Their message shows under
  the row like any other failure.

Submit:
- Sends the non-blank rows to `vm.createSubjects` (description `undefined` when blank, as today).
- Rows whose outcome is ok are removed; failed rows stay and show `outcome.error.userMessage`.
  Earlier errors on surviving rows are replaced by the new result.
- If every row saved, the drawer closes and the rows reset.

Edit mode and the deactivate/restore actions are unchanged. The component docblock is updated to
mention multi-row create.

## Testing

Presentation (`academic-foundation-view-model.test.ts`, Vitest, mocked `AcademicsApplicationService`):
- all rows save → outcomes all ok, in order; one success toast with the count; `listSubjects` called
  once after the batch.
- partial failure → outcomes in input order with the failed one `ok: false` and its message; one
  warning toast; one reload.
- all fail → no reload; one error toast.
- sequential: the second `createSubject` call does not start before the first resolves.
- single row → `Subject created.`; empty input → `[]`, no toast, no reload.
- pre-check: an existing active code (different case/spacing) → that row fails with the "already
  exists" message and `createSubject` is never called for it; an existing deactivated code → the
  "Restore it instead" message.
- pre-check pages: with `total` 150, `listSubjects` is called with offsets 0 and 100 and
  `includeInactive: true`; a code on the second page is caught.
- pre-check fetch failure → every dto is still sent.

Renderer (new `components/subjects/SubjectsDirectoryPage.test.tsx`, using `renderWithLayer` from
`components/academic-grading/setup-test-support.tsx` and a `window.nemis.subject` stub with `list`
and `create`):
- add a second row and create both → `subject.create` called twice in order, drawer closes.
- duplicate code in two rows → submit shows `Duplicate code in this batch`, `subject.create` not
  called.
- a row with a name but no code → submit shows `Name and code are required`, nothing sent.
- one row whose code already exists on the device → only that row remains, showing the "already
  exists" message; drawer stays open.
- blank extra row is ignored.

Gate: `pnpm typecheck`, `pnpm lint`, `pnpm test` all green.

## Risks

- A long batch runs sequentially over IPC; at school-setup sizes (tens of subjects) this is fine.
- If the app closes mid-batch, saved rows stay saved (each is its own transaction); the rest are
  simply not created. This matches today's single-create semantics.
