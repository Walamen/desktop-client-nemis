# Students Pages — Web Design Parity Redesign

Status: approved (pending plan)
Date: 2026-07-26

## Problem

The desktop renderer's student pages (`apps/desktop/renderer/components/students/StudentManagementPages.tsx`,
covering `students/page.tsx`, `create/page.tsx`, `edit/page.tsx`, `profile/page.tsx`) are functionally
complete (Phase 10 — see `docs/student-management.md`) but visually generic: plain bordered `<div>`s,
no stat tiles, a single always-table list view, filters that require an explicit "Search" click, and a
bare single-step create form. The production web app
(`Nemis/apps/portal-web/src/app/government/school-admin/students/`) has a considerably more polished,
purpose-built design (slate-900 header bands, stat cards, a filter sidebar, Table/Grid toggle, a 4-step
create wizard, a rich profile layout) that should become the desktop's visual and interaction language
for these pages, adapted to what the desktop's offline-first domain can actually support.

`inter-school-transfer` and `promote` are explicitly out of scope.

## Constraints discovered during research

These are hard facts about the two codebases, not preferences — they bound what "parity" can mean:

- **No photo/avatar data.** `Student` (domain, application DTOs, `StudentRowView`) has no `photoUrl`
  field anywhere in the desktop stack. All avatars render as initials via `@nemis-desktop/ui`'s `Avatar`
  (`role="student"`, using the already-present-but-unused `student-fallback.jpg` only as the no-initials
  fallback).
- **No student statistics capability exists.** No use case, IPC channel, or ViewModel returns
  total/male/female/recent-enrollment counts for students. The existing `GetDashboardOverview` gives
  `totalStudents` and a grade breakdown but no gender breakdown, and is scoped to the dashboard, not this
  page. `IStudentRepository` has no `countByGender` or "recent" count method.
- **Desktop's list is server-paginated (SQLite via IPC); the web's is client-paginated.** The web loads
  *all* students in one query and filters/paginates entirely client-side (`useMemo`, page size 12). The
  desktop's `StudentsViewModel` calls `student:list` with `limit/offset` + filter DTO and only ever holds
  one page of rows (`StudentRowView`, no `photoUrl`, no `email`). Stat tiles and "N students found" counts
  must come from a real count query, not `list.data.length`.
- **Filter commit is two-step today.** `StudentSearchViewModel.setFilters/setKeyword` only stage state;
  `search()` (→ `loadStudents()`) performs the actual fetch. The web has no equivalent step — every
  keystroke/selection re-filters instantly (in-memory).
- **`CreateStudentDto` cannot embed guardians, `nationalId`, or `admissionDate`.** These fields exist on
  the web's `CreateStudentDto` but not in the desktop domain. Guardians are added to an existing student
  via a separate `createGuardian` command with a thinner shape (`firstName, lastName, relationship,
  phoneNumber, isPrimary` — no email/address/occupation/isEmergencyContact).
- **No local account/credential provisioning.** The web's create flow can end in a "Login Credentials"
  screen (student/parent portal accounts, activation tokens). The desktop's CLAUDE.md forbids Electron
  from owning authentication logic — this entire screen and the "parent portal access" guardian-email
  check have no desktop equivalent and are dropped, not adapted.
- **The web's student profile page has no Edit/Enroll/Archive actions** (editing happens only from the
  list). The desktop profile page's Edit/Enroll/Archive-Restore buttons are load-bearing — Enroll in
  particular has no other entry point in this app — so they are kept, restyled, as an intentional
  deviation from the web reference.

## Goals

1. Restyle `StudentsDirectoryPage` (list) to the web's visual language: header band, 4 stat cards, a
   left filter sidebar (Search / Grade Level / Status only), a Table/Grid toggle, numbered pagination,
   and a right-side edit `Drawer` — all backed by the *existing* `StudentsListViewModel` /
   `StudentSearchViewModel` / `useAcademicFoundationViewModel`, with filter changes auto-triggering a
   refetch instead of requiring a separate "Search" click.
2. Add a `StudentStatistics` read slice (SQLite → application → IPC → presentation) providing
   `totalStudents`, `maleStudents`, `femaleStudents`, `recentEnrollments` (all active-student counts,
   `recentEnrollments` = active students admitted in the last 3 months — matching the production
   backend's real semantics, `Nemis/apps/Server/src/students/students.service.ts:633`), built as an
   isolated vertical slice mirroring the existing `GetDashboardOverview`/`DashboardViewModel` pattern.
3. Restyle `StudentFormPage` (create mode) into the web's 4-step wizard shell (vertical step indicator +
   step content), adapted to the desktop domain per the constraints above — including chaining
   `createGuardian` calls after `createStudent` succeeds for the guardian step.
4. Restyle `StudentProfilePage` to the web's profile header + fact-card grid layout, keeping the
   existing Edit/Enroll/Archive-Restore actions and Guardian/Enrollment-history sections.
5. Move student editing's primary entry point from the standalone `/students/edit` route to a `Drawer`
   opened from the list (matching the web's interaction model), without deleting the `/edit` route.

## Non-goals

- No changes to `StudentFormPage` in edit mode's underlying update flow, `EnrollmentPage`, or the
  `/edit` route's existence — `/edit` keeps working as a deep link, it's just no longer the list's
  primary edit path.
- No photo/avatar upload feature. No `email` added to `StudentRowView`/table rows.
- No change to `inter-school-transfer` or `promote` pages (excluded per original request).
- No bulk-create ("Create Many") button/page — the web's second header action has no desktop
  counterpart in scope.
- No backend/auth changes — no student or parent portal account creation, ever.
- No change to `IStudentRepository.findPage`'s existing filter set (gender, academicYearId, classId,
  enrollmentStatus, sort) — those filters' ViewModel plumbing stays; only the *UI* for them is removed
  from the sidebar.

## Architecture — Statistics slice (new)

```text
StudentsDirectoryPage
  -> useStudentStatisticsViewModel()            (new, isolated — does NOT share StudentsViewModel's store)
  -> StudentStatisticsViewModel.loadStatistics() (packages/presentation, modeled 1:1 on DashboardViewModel)
  -> GetStudentStatisticsUiQuery.execute()       (packages/presentation/queries)
  -> ApplicationLayer.reporting.getStudentStatistics()  (renderer's IPC-backed facade)
  -> nemisBridge.getStudentStatistics()          (apps/desktop/renderer/services/nemis-bridge.ts)
  -> window.nemis.student.getStatistics()        (preload)
  -> ipcMain 'student:get-statistics' handler    (apps/desktop/electron/ipc/handlers/students.ts)
  -> app.reporting.getStudentStatistics()        (main-process ApplicationLayer, real repositories)
  -> GetStudentStatisticsUseCase                 (packages/application/use-cases/reporting)
  -> IStudentRepository.countByGender() / countRecentAdmissions(3)
  -> SqliteStudentRepository (new SQL, isActive = 1 filtered)
```

New/changed files, by layer:

- `packages/application/src/interfaces/students/student-repository.ts` — add
  `countByGender(): { gender: Gender; studentCount: number }[]` and
  `countRecentAdmissions(monthsBack: number): number`.
- `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts` — implement both,
  mirroring `countByGradeLevel()`'s style (`WHERE isActive = 1 ... GROUP BY gender` /
  `WHERE isActive = 1 AND admissionDate >= ?`).
- `packages/application/src/dto/students/student-dto.ts` (or `dto/reporting/reporting-dto.ts`) — add
  `StudentStatisticsOutput { totalStudents, maleStudents, femaleStudents, recentEnrollments }`.
- `packages/application/src/use-cases/reporting/get-student-statistics.ts` — new use case, same shape as
  `get-dashboard-overview.ts`, depending only on `students: IStudentRepository` + `clock` + `logger`.
- `packages/application/src/services/reporting-application-service.ts` — add `getStudentStatistics()`.
- `packages/application/src/factories/create-application-layer.ts` — construct the new use case inside
  the `reporting` block.
- `packages/types/src/ipc.ts` — add `'student:get-statistics'` to both `IpcContract` and `IpcChannels`
  (`STUDENT_GET_STATISTICS`).
- `packages/types/src/api.ts` — add `getStatistics(): Promise<StudentStatisticsResult>` to `StudentApi`.
- `apps/desktop/electron/ipc/handlers/students.ts` — register the handler with `assertNoArgs`.
- `apps/desktop/electron/preload/preload.ts` — add `getStatistics: () => invoke(IpcChannels.STUDENT_GET_STATISTICS)` to the `student` block.
- `apps/desktop/renderer/services/nemis-bridge.ts` — add `getStudentStatistics()`.
- `apps/desktop/renderer/lib/presentation/create-ipc-application-layer.ts` — add
  `getStudentStatistics: () => query(() => nemisBridge.getStudentStatistics())` to the `reporting` group.
- `packages/presentation/src/queries/reporting/get-student-statistics-ui-query.ts` — new, copy of
  `get-dashboard-overview-ui-query.ts`.
- `packages/presentation/src/view-models/students/student-statistics-view-model.ts` — new, copy of
  `dashboard-view-model.ts` (one `AsyncState<StudentStatisticsView>`, one `loadStatistics()`).
- `packages/presentation/src/factories/create-presentation-layer.ts` — add
  `studentStatistics: new StudentStatisticsViewModel({ reporting: app.reporting, notifications })` to
  `PresentationViewModels`/`viewModels`, independent of the shared `students` core.
- `apps/desktop/renderer/lib/presentation/hooks.ts` — add `useStudentStatisticsViewModel`.

## Architecture — List page redesign

`StudentsDirectoryPage` (`StudentManagementPages.tsx`) keeps using
`useStudentsListViewModel`/`useStudentSearchViewModel`/`useAcademicFoundationViewModel`/
`useSettingsViewModel`, plus the new `useStudentStatisticsViewModel`, plus `useStudentProfileViewModel`
(for `setStudentActive` and `loadDetails`, needed by the archive action and the edit drawer).

- **Header band**: slate-900 bar, school name (`settings.profile`) + "Students", one action —
  `Link` to `/students/create` styled as "Add Single Student".
- **Stat cards**: 4-up grid reading `useViewModel(stats.store, s => s.stats)`.
- **Filter sidebar**: `Input` (keyword, debounced ~300ms → `search.setFilters` + `search.search()`),
  `Select` (grade level, `GradeLevel` enum via existing `human()` helper), segmented control (All /
  Active / Inactive → `isActive` filter) — each change stages via `setFilters` and immediately calls
  `search.search()` (replacing the old explicit Search button). Gender/academicYear/class/enrollmentStatus/
  sort filters are removed from the UI (their state/handlers in the ViewModel are unused, not deleted).
- **Toolbar**: `{p.totalCount} students found` + Table/Grid toggle (local `useState<'table'|'grid'>`).
- **Table view**: swaps the current raw `<table>` styling for the web's column set — Student (`Avatar`
  initials + `fullName`), Admission #, Grade badge, Gender, Status `Badge`, Actions (View → profile link,
  Edit → opens drawer). No archive/restore control is added to the table or `StudentCard` — that action
  remains only on the profile page's own Archive/Restore button (`profileVm.setStudentActive`), matching
  the original list, which didn't have one either. Row-selection checkboxes are kept
  (existing `toggleSelection`/`selectPage` capability), added as a column consistent with the web's
  design language even though the web reference doesn't have them — they're pre-existing desktop
  functionality, not new scope.
- **Grid view**: new `StudentCard` component (in the same file or a small sibling file) using `Card`/
  `Avatar`/`Badge` from `@nemis-desktop/ui`, laid out like the web's card (name/admission#/status header,
  grade/gender rows, View/Edit footer buttons).
- **Pagination**: numbered-button style (not just Prev/Next) computed from `p.page`/`totalPages(p)`,
  calling `vm.goToPage`; `vm.setPageSize(12)` called once on mount to match the web's page size.
- **Edit drawer**: opening it calls `profileVm.loadDetails(studentId)`; while `details.status` is
  `loading`/`idle` the drawer shows a `Skeleton`, then renders the same field set as `StudentFormPage`
  (edit mode) inline, submitting via `profileVm.updateStudent`. The standalone `/edit?id=` route and
  `StudentFormPage edit` are untouched — still reachable directly, just no longer linked from the table/
  grid row actions.

## Architecture — Create wizard redesign

`StudentFormPage({ edit: false })` becomes a 4-step wizard shell (local `currentStep` state, vertical
step indicator matching the web's, "Back"/"Next"/"Cancel"/"Create Student" footer):

1. **Student Information** — firstName, middleName, lastName, dateOfBirth, gender, admissionNumber,
   phoneNumber, email, address (no nationalId/admissionDate fields — not in the domain).
2. **Guardian Information** — repeatable guardian cards, fields limited to `firstName, lastName,
   relationship, phoneNumber, isPrimary` (no email/address/occupation/isEmergencyContact, no "portal
   access" messaging or email-existence lookups).
3. **Grade Level** — card-grid picker over `Object.values(GradeLevel)`, same interaction as the web.
4. **Review & Submit** — read-only summary of steps 1–3, no credentials block.

Submit handler: `await listVm.createStudent(dto)`; on `ok`, loop the entered guardians and
`await profileVm.createGuardian({ studentId: r.data.id, ...guardian })` for each; then show a plain
success view (no credentials) with "Go to student profile" and "Back to students list" links (no
"add another student" reset-and-repeat flow). Edit mode (`StudentFormPage({ edit: true })`) is
unchanged — it keeps its current single-page form; this redesign only touches the create path per
the wizard shell.

## Architecture — Profile page redesign

`StudentProfilePage` restyles to the web's layout: slate-900 header band context is inherited from the
shell (not re-added per-page, matching how the rest of the redesigned desktop pages behave), profile
header card (`Avatar size="xl"`, name, admission #, Status/Gender/Class pill badges), a
`grid lg:grid-cols-2` of fact cards (Personal Information, Contact Information — reusing a `DetailRow`
icon+label+value helper matching the web's), then Enrollment History and Guardians sections as today.
**Kept, restyled**: the Edit / Enroll / Archive-Restore action buttons in the header — intentional
deviation from the web reference, justified in Constraints above. Guardian-add and move-class modals
keep their current `Modal`-based implementation (no interaction change), just restyled to match.

## Testing

- Existing ViewModel/use-case unit tests for students remain valid (no contract changes to
  `StudentsViewModel`, `createStudent`, `updateStudent`, `createGuardian`, `setStudentActive`).
- New unit tests: `GetStudentStatisticsUseCase` (counts, active-only filtering, 3-month window
  boundary), `SqliteStudentRepository.countByGender`/`countRecentAdmissions`, `StudentStatisticsViewModel`
  (idle → loading → success/error transitions, reusing existing `AsyncState`/`trackQuery` test patterns).
- Component-level: verify auto-search-on-filter-change behavior (debounce for keyword, immediate for
  select/segmented control), Table/Grid toggle renders equivalent data, pagination page-size is 12,
  edit drawer's loading-then-populated sequence.
