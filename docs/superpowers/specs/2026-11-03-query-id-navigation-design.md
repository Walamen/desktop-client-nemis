# Query ids that survive in-app navigation — design

Date: 2026-11-03 · Repo: desktop-client-nemis (renderer only) · Server: no change

## Why

Pages that take their record id from the address (`/…/profile/?id=…`) read
it from `window.location.search`. When the user reaches such a page through
an in-app link, Next.js renders the new page **before** it updates the
browser address, so a read during render sees the **previous** page's
address.

Found while testing a mid-year transfer: on Evelyna Sawah's profile
(`/students/profile/?id=<studentId>`) the admin clicked "Match prior record"
(`/students/match-prior-record/?id=<carryOverId>`). The Match page read
`?id=` during render, got the **student** id, and asked the server for
`GET /transfer-carry-overs/<studentId>`; the server answered 404 "Prior
record not found." and the page stayed on "Something went wrong". The record
could not be matched, so the receiving teacher's gradebook kept showing her
as "Waiting for the prior record to be matched" instead of her Period 1
marks from the old school. Fixing the id read unblocks both symptoms; the
carry-over and gradebook logic themselves are correct (verified against the
dev database and by calling the preview service directly).

The same profile visit also logged
`report-cards:list-for-student … Expected a non-empty string for "id"`:
`ReportCardList` fires its IPC call while the profile's `id` state is still
`''`.

## Goals

1. Every renderer page that reads a record id (or other key) from the query
   string gets the value of **its own** address, whether reached by a full
   load, a reload, or an in-app link from any other page — including a page
   that has its own `?id=`.
2. When the address changes while the page stays mounted (same route, new
   `?id=`), the page follows the new value.
3. No IPC call is made with an empty id because a page had not read its id
   yet (`ReportCardList` and any similar caller found while converting).
4. The desktop log shows the server's own message for a rejected request, so
   the next problem of this kind is diagnosable from the desktop log alone.

## Non-goals

- Switching to dynamic `[id]` route segments (static export; the `?id=`
  convention stays).
- Any server change.
- County pages: they already use `useSearchParams` under `<Suspense>`.
- `AcademicGradingPage`: already reads via `useSearchParams`; its
  `window.history.replaceState` calls only *clear* the query and stay.
- Deleting `components/teachers/TeacherManagementPages.tsx` (imported
  nowhere). Leave it untouched; note it as dead code in the final report.

## Anti-goals

- A fix that only works on a full reload, or that only patches the Match
  page while the other pages keep the same flaw.
- A page that briefly fires a request with the previous page's id before
  correcting itself (that request can 404, 403 or load the wrong record).
- Changing `RemoteRejectedError.message`: `FeeReversalSyncService` branches
  on `status` and embeds the existing message text; only logging changes.

## Decided approach

- Read query values with Next's `useSearchParams()` (the pattern the county
  pages and `AcademicGradingPage` already use). Its value is the new page's
  address on the first render after an in-app navigation, and it updates
  when the address changes.
- `useSearchParams()` in a statically exported route must sit under a
  `<Suspense>` boundary or `next build` fails. Each affected route's
  `page.tsx` wraps its component in `<Suspense fallback={null}>`, as
  `app/government/county/students/details/page.tsx` does.
- The three shared helpers (`queryId` in `components/students/shared.tsx`,
  `components/classes/shared.tsx`, and `queryId`/`queryParam` in
  `components/teachers/shared.tsx`) are replaced by one hook (e.g.
  `useQueryParam(name)`) so the window-based read cannot be reintroduced by
  copying a helper. The inline `queryId` copies in `MatchPriorRecordPage`,
  `ReviewTransferPage`, `CloseWorkflowPage` (`yearId`) and `CorrectionsPage`
  (`yearId`) go too.
- Pages that copy the id into state from a mount-only effect
  (`useEffect(() => setId(queryId()), [])`) read the hook value directly and
  key their loads on it, so goal 2 holds.
- Logging: where IPC handler failures are logged (`bind` in the main
  process), a `RemoteRejectedError` is logged with its `status`,
  `remoteMessage` and `remoteErrorCode`.

## Sites in scope

| Component / page | Reads | Route page(s) |
|---|---|---|
| `components/transfers/MatchPriorRecordPage.tsx` | `id` in render | `school-admin/students/match-prior-record` |
| `components/transfers/ReviewTransferPage.tsx` | `id` in render | `school-admin/students/inter-school-transfer/review` |
| `components/academic-year-close/CloseWorkflowPage.tsx` | `yearId` | `school-admin/academic-years/close` |
| `components/academic-year-close/CorrectionsPage.tsx` | `yearId` | `school-admin/academic-years/corrections` |
| `components/academic-grading/WindowGradesPage.tsx` | `id` in render | `school-admin/academic-grading/windows/grades` |
| `components/classes/ClassDetailPage.tsx` | `id` in effect | `school-admin/classes/detail` |
| `components/students/EnrollmentPage.tsx` | `id` in effect | `school-admin/students/enroll` |
| `components/students/StudentFormPage.tsx` | `id` in effect | `school-admin/students/create`, `…/edit` |
| `components/students/StudentProfilePage.tsx` | `id` in effect | `school-admin/students/profile` |
| `components/students/add-student/AddStudentWizard.tsx` | `nemisId`, `dob` in effect | via `StudentFormPage` (create) |
| `components/teachers/TeacherFormPage.tsx` | `id` in effect | `school-admin/teachers-staff/create`, `…/edit` |
| `components/teachers/TeacherProfilePage.tsx` | `id` in effect | `school-admin/teachers-staff/profile` |
| `app/government/teacher/assignment/detail/page.tsx` | `id` in effect | itself |
| `app/government/teacher/assignment/edit/page.tsx` | `id` in effect | itself |
| `app/government/teacher/assignment/submission/page.tsx` | `assignmentId`, `studentId` | itself |
| `app/government/teacher/my-classes/classes/detail/page.tsx` | `id` in effect | itself (its doc comment cites `queryId()`; update it) |
| `components/report-cards/ReportCardList.tsx` | — (gets `studentId` prop) | must not call IPC with `''` |

The builder re-runs
`grep -rn "window.location.search" renderer` and
`grep -rn "queryId\|queryParam" renderer` before finishing; in non-test
source the only remaining hits allowed are `AcademicGradingPage`'s clearing
calls and the dead `TeacherManagementPages.tsx` (test files may mock
`useSearchParams` from `window.location.search`, as
`AcademicGradingPage.test.tsx` already does — my call).

Already true, no change needed: the `close` and `corrections` routes wrap
their page in `<Suspense>` today. Errors that reach `bind` wrapped by a use
case are unwrapped via `cause` for logging (builder's call).

## Testing

- The bug's own reproduction as a test: render the Match page after
  navigating from `/…/profile/?id=student-1` to
  `/…/match-prior-record/?id=co-1` and assert `getCarryOver` is called with
  `co-1` only (never `student-1`). Existing renderer tests set the address
  with `window.history.pushState`; with `useSearchParams` the tests need
  `next/navigation` mocked or driven consistently — the builder picks one
  way and uses it across the converted tests.
- For each converted page: it loads the record named by its own query
  value, and (goal 2) follows a changed value.
- `ReportCardList`: no IPC call while `studentId` is `''`.
- Logging: a rejected request's log entry includes the remote message.
- `pnpm --filter @nemis-desktop/app build:renderer` (`next build renderer`,
  static export) must pass — it is what
  catches a missing `<Suspense>`. Full renderer test suite green except the
  known pre-existing failures (timetable staffId test, `app/page.test.tsx`
  fresh-login test).

## Left to the builder

Hook name and file location; whether pages with two query values read them
through one hook call or two; how tests drive `useSearchParams`; ordering of
the conversion.

## Manual check (Alvin)

On First Demo School's desktop: open Evelyna Sawah's profile → "Match prior
record" → the matching screen loads → save → the banner disappears and the
Period 1 gradebook shows her marks as "From Second Demo School · Carried".
