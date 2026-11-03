# Query Ids That Survive In-App Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every renderer page reads its own `?id=` (and other query keys) through Next's `useSearchParams`, never `window.location.search`, so an in-app link can no longer hand a page the previous page's id.

**Architecture:** One hook, `useQueryParam(name)`, wraps `useSearchParams()`. Each affected route's `page.tsx` wraps its component in `<Suspense fallback={null}>` (static export requires it). Pages key their loads on the hook value. Separately: `ReportCardList` skips IPC for an empty id, and the main process's IPC failure log includes a `RemoteRejectedError`'s server message.

**Tech Stack:** Next.js 15 app router (`output: 'export'`, `trailingSlash: true`), React, Vitest + Testing Library (jsdom project for renderer, node project for electron), Electron main process.

**Spec:** `docs/superpowers/specs/2026-11-03-query-id-navigation-design.md`

## Global Constraints

- Renderer only, plus one main-process logging change. No server change.
- The `?id=` static-route convention stays; no `[id]` segments.
- `RemoteRejectedError.message` must not change (`FeeReversalSyncService` embeds it); only what is logged changes.
- Out of scope, leave untouched: county pages, `AcademicGradingPage` (its `replaceState` clearing calls stay), `components/teachers/TeacherManagementPages.tsx` (dead; report it at the end).
- Every route that calls `useSearchParams` (directly or via the hook) sits under `<Suspense fallback={null}>`, as in `app/government/county/students/details/page.tsx`.
- Never fire a request with a stale or empty id: a page with an empty query value makes no IPC call for it.
- Never stage `apps/desktop/package.json` (Alvin's uncommitted change).
- Commands run from the repo root `desktop-client-nemis/`. Renderer tests: `pnpm vitest run --project renderer <path>`; electron tests: `pnpm vitest run --project node <path>` (node tests that touch better-sqlite3 need the Electron-as-Node runner — Task 5's test does not). Known pre-existing failures to ignore: timetable staffId test, `app/page.test.tsx` fresh-login test.

## Review Focus

1. **Arriving from a page that has its own `?id=`** (profile → match, class detail → student profile): the new page must use its own id. Pinned by the "stale window address" tests in Tasks 1–4.
2. **Same route, new `?id=` while mounted** (e.g. profile → another student's profile via an in-page link): the page must reload for the new id, not keep the old record. Pinned by the "follows a changed id" tests in Tasks 1, 3 and 4.
3. **Route opened with no `?id=`**: no IPC call with `''`; the page shows its existing not-found/empty state. Pinned by the "no id → no call" tests in Tasks 1 and 3 and the `ReportCardList` test.
4. **Missing `<Suspense>`** on a converted route: `next build` fails only at build time, never in tests. Pinned by the `build:renderer` run in Task 5.
5. **Wrapped errors in the log**: a `RemoteRejectedError` that reaches `bind` as the `cause` of another error must still log its server message. Pinned by the cause test in Task 5.

## Test technique (all renderer tasks)

Tests mock `next/navigation` so `useSearchParams` returns a controlled value **independent of `window.location`**:

```ts
const search = { value: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  useSearchParams: () => search.value,
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
```

The stale-address test sets `window.history.pushState({}, '', '<previous page>?id=stale')` **and** `search.value = new URLSearchParams('id=fresh')`, then asserts the load used `fresh` and never `stale`. Against today's code it fails (the component reads `window.location`). Existing tests that only `pushState` are updated to also set `search.value` to the same query. Keep `search` in a small shared helper if two or more files need it: `renderer/test-utils/search-params.ts` exporting `mockSearch(query: string): void` and the `vi.mock` factory value — the implementer of Task 1 decides whether the helper pays off; later tasks use whatever Task 1 produced.

---

### Task 1: `useQueryParam` hook + transfer pages (the reported bug)

**Files:**
- Create: `apps/desktop/renderer/hooks/use-query-param.ts`
- Modify: `apps/desktop/renderer/components/transfers/MatchPriorRecordPage.tsx:13-14,22` (drop inline `queryId`)
- Modify: `apps/desktop/renderer/components/transfers/ReviewTransferPage.tsx:19-20,73` (drop inline `queryId`)
- Modify: `apps/desktop/renderer/app/government/school-admin/students/match-prior-record/page.tsx`, `…/students/inter-school-transfer/review/page.tsx` (add Suspense)
- Test: `apps/desktop/renderer/hooks/use-query-param.test.tsx`, `components/transfers/MatchPriorRecordPage.test.tsx`, `components/transfers/ReviewTransferPage.test.tsx`

**Interfaces:**
- Produces: `useQueryParam(name: string): string` from `@/hooks/use-query-param` — `useSearchParams()?.get(name) ?? ''`. Later tasks import exactly this. (Plus the test helper if Task 1 creates one.)

- [ ] **Step 1: Write failing tests**
  - `use-query-param.test.tsx`: `returns the value of the named key` (search `id=co-1` → `'co-1'`); `returns '' when the key is absent`.
  - `MatchPriorRecordPage.test.tsx`: `loads the carry-over named by its own address, not the previous page's` — pushState `/government/school-admin/students/profile?id=student-1`, `search = id=co-1`; expect `getCarryOver` called with `'co-1'` and never with `'student-1'`. `follows a changed id` — rerender with `search = id=co-2`; expect a call with `'co-2'`. `makes no call without an id` — `search` empty; expect `getCarryOver` not called. Update existing tests to set `search` alongside their pushState.
  - `ReviewTransferPage.test.tsx`: the same stale-address test with its own load call (whatever the page calls with `id`, e.g. the record-preview bridge).
- [ ] **Step 2: Run them; the stale-address and hook tests FAIL** (`useQueryParam` missing / called with `student-1`).
- [ ] **Step 3: Implement the hook; switch both pages to `const id = useQueryParam('id')`; wrap both route pages in `<Suspense fallback={null}>`.** In `MatchPriorRecordPage`, clear `loadError`/`preview` when `id` changes so a corrected id is not hidden behind an old error.
- [ ] **Step 4: Run the three test files; all PASS.**
- [ ] **Step 5: Commit** — `fix(desktop): match and review pages read their own query id`.

### Task 2: Year-close and window-grades pages

**Files:**
- Modify: `components/academic-year-close/CloseWorkflowPage.tsx:23-24` and `CorrectionsPage.tsx:34-35` (inline `yearId` readers → `useQueryParam('yearId')`; routes already have Suspense)
- Modify: `components/academic-grading/WindowGradesPage.tsx:12,24` (`queryId` from classes/shared → `useQueryParam('id')`)
- Modify: `app/government/school-admin/academic-grading/windows/grades/page.tsx` (add Suspense)
- Test: `CloseWorkflowPage.test.tsx`, `CorrectionsPage.test.tsx`; create `components/academic-grading/WindowGradesPage.test.tsx`

**Interfaces:** Consumes `useQueryParam` (Task 1).

- [ ] **Step 1: Write failing stale-address tests** — Close and Corrections: pushState `…?yearId=old-year`, `search = yearId=year-1`; expect the page's year load called with `'year-1'` only. WindowGradesPage (new file): pushState `…?id=old-window`, `search = id=win-1`; expect the window fetch called with `'win-1'` only. Update existing pushState tests to set `search`.
- [ ] **Step 2: Run; new tests FAIL.**
- [ ] **Step 3: Convert the three components; add Suspense to the grades route.**
- [ ] **Step 4: Run the three files; PASS.**
- [ ] **Step 5: Commit** — `fix(desktop): year-close and window-grades pages read their own query id`.

### Task 3: Student pages + `ReportCardList` empty-id guard

**Files:**
- Modify: `components/students/StudentProfilePage.tsx:92-99`, `StudentFormPage.tsx:~42`, `EnrollmentPage.tsx:~33` — replace `useEffect(() => { const value = queryId(); setId(value); … }, [vm])` with `const id = useQueryParam('id')` and an effect keyed on `[vm, id]` that loads only when `id` is non-empty. Remove the `id` state.
- Modify: `components/students/add-student/AddStudentWizard.tsx:99-103` — derive the preset from `useQueryParam('nemisId')` / `useQueryParam('dob')` (`readLookupPreset` may take a `URLSearchParams`-like or the two strings; keep it applied once, as today).
- Modify: `components/students/shared.tsx:9-12` — delete `queryId`.
- Modify: `components/report-cards/ReportCardList.tsx:~76` — no `listReportCardsForStudent` call while `studentId === ''`.
- Modify route pages (add Suspense): `school-admin/students/profile`, `…/create`, `…/edit`, `…/enroll`.
- Test: `StudentProfilePage.test.tsx`, `StudentFormPage.test.tsx`, `EnrollmentPage.test.tsx`, `add-student/AddStudentWizard.test.tsx`, `report-cards/ReportCardList.test.tsx`

**Interfaces:** Consumes `useQueryParam` (Task 1).

- [ ] **Step 1: Write failing tests**
  - Profile: `loads the student named by its own address` (pushState `…/classes/detail?id=class-1`, `search = id=stu-1`; `loadDetails` called with `'stu-1'` only); `follows a changed id` (rerender `id=stu-2` → `loadDetails('stu-2')`); `makes no call without an id`.
  - Form (edit) and Enrollment: the stale-address test each.
  - Wizard: `applies the nemisId/dob preset from its own address` with a stale window address holding different values.
  - ReportCardList: `does not request report cards for an empty student id` — render with `studentId=""`; bridge not called.
- [ ] **Step 2: Run; new tests FAIL.**
- [ ] **Step 3: Convert the four components, add the ReportCardList guard, delete `queryId` from students/shared, add Suspense to the four routes.**
- [ ] **Step 4: Run the five files; PASS.**
- [ ] **Step 5: Commit** — `fix(desktop): student pages read their own query id; no report-card call without one`.

### Task 4: Class and teacher pages

**Files:**
- Modify: `components/classes/ClassDetailPage.tsx:~69`, `components/teachers/TeacherFormPage.tsx:~68`, `components/teachers/TeacherProfilePage.tsx:~63` — same conversion as Task 3.
- Modify: `components/classes/shared.tsx:12-15` (delete `queryId`), `components/teachers/shared.tsx:4-9` (delete `queryId` and `queryParam`).
- Modify (component lives in the route file): `app/government/teacher/assignment/detail/page.tsx`, `…/assignment/edit/page.tsx`, `…/assignment/submission/page.tsx` (`assignmentId`, `studentId`), `app/government/teacher/my-classes/classes/detail/page.tsx` — move the body into a non-exported inner component in the same file, convert it to `useQueryParam`, and make the default export `<Suspense fallback={null}><Inner /></Suspense>`. Update the class-detail doc comment (lines ~40-42) to cite `useQueryParam` instead of `queryId()`.
- Modify route pages (add Suspense): `school-admin/classes/detail`, `school-admin/teachers-staff/create`, `…/edit`, `…/profile`.
- Test: create `components/classes/ClassDetailPage.test.tsx`, `components/teachers/TeacherProfilePage.test.tsx`; update `app/government/teacher/my-classes/classes/detail/detail.test.tsx`; create `app/government/teacher/assignment/submission/page.test.tsx`.

**Interfaces:** Consumes `useQueryParam` (Task 1).

- [ ] **Step 1: Write failing stale-address tests** for ClassDetailPage, TeacherProfilePage (school-admin one, not county), teacher class detail (`detail.test.tsx`), and assignment submission (both keys: stale window `assignmentId=a-old&studentId=s-old`, `search = assignmentId=a-1&studentId=s-1`; load uses `a-1`/`s-1`). Add `follows a changed id` to ClassDetailPage. For new test files, mock the view models/bridges the page uses the way the nearest existing sibling test does.
- [ ] **Step 2: Run; new tests FAIL.**
- [ ] **Step 3: Convert, delete the two shared helpers, add Suspense.** Assignment detail/edit pages get the same conversion; they are covered by typecheck + build (no new test required beyond submission's).
- [ ] **Step 4: Run the four files plus `pnpm --filter @nemis-desktop/app typecheck`; PASS.**
- [ ] **Step 5: Commit** — `fix(desktop): class and teacher pages read their own query id`.

### Task 5: Server message in the IPC failure log + final sweep

**Files:**
- Create: `apps/desktop/electron/ipc/describeIpcFailure.ts`
- Modify: `apps/desktop/electron/ipc/registrar.ts:172`
- Test: `apps/desktop/electron/ipc/describeIpcFailure.test.ts`

**Interfaces:**
- Produces: `describeIpcFailure(error: unknown): Record<string, unknown> | undefined` — for a `RemoteRejectedError` (from `@nemis-desktop/shared`), found directly or by walking `cause` (stop after a few levels), returns `{ status, remoteMessage, remoteErrorCode }`; otherwise `undefined`. `bind` logs `logger.error(\`IPC handler failed for channel "${channel}"\`, error, details)` only adding `details` when defined, so other failures log as today.

- [ ] **Step 1: Write failing tests** — `returns status, remote message and code for a RemoteRejectedError` (`new RemoteRejectedError(404, 'Prior record not found.', { remoteErrorCode: 'NOT_FOUND' })` → `{ status: 404, remoteMessage: 'Prior record not found.', remoteErrorCode: 'NOT_FOUND' }`); `finds it as the cause of another error`; `returns undefined for other errors`.
- [ ] **Step 2: Run** `pnpm vitest run --project node apps/desktop/electron/ipc/describeIpcFailure.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement; use it in `bind`.**
- [ ] **Step 4: Run the test — PASS.**
- [ ] **Step 5: Final sweep**
  - `grep -rn "window.location.search" apps/desktop/renderer --include=*.ts --include=*.tsx | grep -v "\.test\."` → only `AcademicGradingPage.tsx` (clearing calls) and `TeacherManagementPages.tsx`.
  - `grep -rn "queryId\|queryParam" apps/desktop/renderer --include=*.ts --include=*.tsx | grep -v "\.test\."` → only `TeacherManagementPages.tsx`.
  - `pnpm --filter @nemis-desktop/app typecheck` → no errors.
  - `pnpm --filter @nemis-desktop/app build:renderer` → succeeds (catches any missing Suspense).
  - `pnpm vitest run --project renderer` → green except the two known pre-existing failures.
- [ ] **Step 6: Commit** — `fix(desktop): log the server's message when an IPC call is rejected`.
