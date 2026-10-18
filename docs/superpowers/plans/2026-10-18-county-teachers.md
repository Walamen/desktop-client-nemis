# County Teachers (list + profile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The County Admin desktop gets portal-web's Teachers list and teacher profile, working offline. The web's
broken teacher numbers are fixed on both sides, the dashboard's Total Teachers is aligned, and the three no-login
teacher endpoints are locked down.

**Architecture:**
- **Nemis (Tasks 1–3):** guards on the three teacher routes; real stats, list and profile on the server; portal-web
  reads them.
- **Desktop (Tasks 4–9):** the full hexagonal read path over data already on the device: no snapshot change, no
  migration, no online call.
- The desktop needs nothing new from the server, so the two repos can ship in either order.

**Tech Stack:** Electron 42.7.0 + Next 15 static export + React 19 + Zustand vanilla ViewModels +
better-sqlite3/SQLCipher + Vitest; Nemis server NestJS + Prisma + Jest; portal-web Next + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-county-teachers-design.md`. §2 has the copy and the decisions; §5 has
every formula. Read both before any task.

## Global Constraints

- Branch `feat/county-teachers` in both repos. Create the Nemis branch from `main` at Task 1.
- **Teaching staff:** `position IN ('TEACHER','ASSISTANT_TEACHER')`. On the server this is
  `getTeachingPositions()`.
- **Base set:** teaching staff at an `isActive` institution in the county, active and inactive teachers alike.
- **Stats:**
  - `total` is the base set;
  - `active` counts `isActive = true`;
  - `inactive` counts `isActive = false`;
  - `unassigned` counts `isActive = true` with no `class_teachers` and no `class_subject_teachers` row whose class
    has `institutionId` = the teacher's `institutionId` and belongs to an academic year with `isCurrent = true`.
- **A teacher's subjects (spec §5.0):**
  - the distinct subject ids from `subject_teachers` ∪ `class_subject_teachers` (any year);
  - a subject's `assignedAt` is the earliest across both tables;
  - `primarySubject` is the name of the subject with the earliest `assignedAt`, then the lowest name.
- **Subject names:**
  - grouped by `lower(trim(name))`;
  - the display name is the alphabetically lowest `trim(name)` in the group;
  - the list is sorted ascending;
  - the filter matches the group (case-insensitive, trimmed equality), never `contains`.
- **Qualifications:** a JSON array gives its string entries; an object gives its `summary` when that is a non-empty
  string (one entry); anything else, including invalid JSON, gives `[]`.
- **List order:** `lastName`, then `firstName`, then `id`. 12 per page. Search is a case-insensitive substring on
  `firstName`, `lastName` or `employeeNumber`. The category filter matches the school's levels.
- **Profile:** any `staff` row whose school is in the county, any position, and the school need not be active.
  `classAssignments` covers all years.
- **Dashboard `totalTeachers`:** active teaching staff at active county schools, on both sides.
- **Copy, verbatim:**

  | Card label | Sub-line |
  |---|---|
  | `Total Teachers` | `Registered county-wide` |
  | `Active` | `Currently active` |
  | `Inactive` | `Not currently active` |
  | `Unassigned` | `No class this year` |

  All other text is ported from the web pages.
- **Guards:** `@Roles(SystemRole.COUNTY_ADMIN, SystemRole.SUPER_ADMIN)` plus `ensureCountyAccess(countyId, user)` on
  `GET /counties/:id/teachers`, `…/teachers/stats` and `…/teachers/:teacherId`.
- **Tests:**
  - SQLite and renderer: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe
    ./node_modules/vitest/vitest.mjs run <paths>`;
  - server: `npx jest <paths>` in `Nemis/apps/Server`;
  - portal-web: `pnpm vitest run` in `Nemis/apps/portal-web`.
- **Pre-existing failures, left alone:**
  - `renderer/app/page.test.tsx`;
  - the timetable test;
  - the `Sidebar.test.tsx` unhandled error.
- **Housekeeping:**
  - `Nemis/packages/types` changes need `pnpm --filter @nemis/types build` before the server tsc sees them;
  - `git checkout -- apps/portal-web/tsconfig.tsbuildinfo` before every portal-web commit;
  - Nemis files are CRLF: edit them with the Edit tool, not sed or perl.

## Review Focus

1. **The same subject counted twice.** A teacher with Maths both on their own list and in two classes has Subjects
   = 1 and counts once under Maths (Tasks 2, 5).
2. **Subject names that differ by case or spaces across schools.** "Mathematics" and "mathematics " give one dropdown
   entry, and choosing it finds teachers from both schools (Tasks 2, 5).
3. **Bad qualifications data.** Invalid JSON, `null`, a number, or an object without `summary` shows "No
   qualifications recorded.", never a crash (Tasks 3, 5).
4. **A teacher at a deactivated school.** They are absent from the list and the stats, but a direct link still opens
   their profile, as on the web (Tasks 2, 5).
5. **Changing a filter on page 3.** The page resets to 1, as on the web, so the admin never sees an empty page with
   results elsewhere (Task 8).

---

## Stage A — Nemis

### Task 1: Lock down the three teacher routes

**Files:**
- Modify: `Nemis/apps/Server/src/counties/counties.controller.ts` (the routes near lines 140–190); `counties.service.ts`
  (`getCountyTeachers`, `getTeacherStats`, `getCountyTeacherById` each gain a `user: UserContext` last parameter
  and call `ensureCountyAccess` first)
- Test: `Nemis/apps/Server/src/counties/counties.teachers.spec.ts` (new; mock Prisma the way
  `counties.student-record.spec.ts` does)

**Interfaces:**
- **Produces:**
  - `getCountyTeachers(id, filters, user)`;
  - `getTeacherStats(id, user)`;
  - `getCountyTeacherById(countyId, teacherId, user)`.

- [ ] **Step 1: Write failing tests**, for each of the three methods:
  - `it('refuses another county's admin with 403')`;
  - `it('refuses a MINISTRY_ADMIN with 403')`;
  - `it('serves this county's admin')`.

  Also `it('the three teacher routes are not @Public')`: read the `isPublic` metadata with `Reflector` on the
  controller methods and expect it to be undefined.
- [ ] **Step 2: Run** `npx jest src/counties/counties.teachers.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Replace `@Public()` with the Global Constraints guard, inject `@CurrentUser() user`, and
  pass it through.
- [ ] **Step 4: Run** the spec and `npx tsc --noEmit -p .`. Expected: PASS, exit 0.
- [ ] **Step 5: Commit:** `fix(counties): teacher endpoints require the county's admin`.

### Task 2: Real teacher stats, list, profile and dashboard count (server)

**Files:**
- Modify: `Nemis/apps/Server/src/counties/counties.service.ts`:
  - `getStats` (`totalTeachers`, near line 138);
  - `getTeacherStats` (line 505);
  - `getCountyTeachers` (line 1665);
  - `getCountyTeacherById` (line 1839);
  - a private `teacherSubjects(staff)` helper.
- Test: `Nemis/apps/Server/src/counties/counties.teachers.spec.ts`

**Interfaces:**
- **Consumes:** Task 1 signatures.
- **Produces:**
  - `getTeacherStats` returns `{ total, active, inactive, unassigned, male, female, byDistrict, byDistrictId,
    bySchool, byQualification, bySubject }`, without `activeAssigned` or `onLeave`. `bySubject` maps each display
    name to the count of distinct base-set teachers.
  - The list and profile response shapes are unchanged. Profile `subjectAssignments` items are
    `{ id: subjectId, subject: { id, name, code } }`, built from both tables.
  - Private `teacherSubjects(row): Array<{ id; name; code; assignedAt }>` merges `subjectAssignments` and
    `classSubjectTeachers` (both selected with `assignedAt` and `subject { id, name, code }`), dedupes by subject id
    keeping the earliest `assignedAt`, and sorts by `assignedAt`, then name.
  - Unassigned and the subject groups are computed in TypeScript over the selected base-set rows. Prisma cannot
    compare `class.institutionId` to `staff.institutionId`.

- [ ] **Step 1: Write failing tests:**
  - `it('getTeacherStats counts teaching positions only, active and inactive')`: a PRINCIPAL and a LIBRARIAN are
    ignored; 3 active plus 1 inactive teachers give `total: 4, active: 3, inactive: 1`.
  - `it('unassigned: current-year class at own school counts as assigned, by either table')`. Three teachers: one with
    a class-teacher row only (current year); one with a class-subject row only (current year); one with past-year rows
    only. That gives `unassigned: 1`.
  - `it('bySubject merges both tables and groups names by case and spaces')`: "Mathematics" on one school and
    "mathematics " on another give `{ Mathematics: 2 }`. A teacher with Maths in both tables counts once.
    (Review Focus 1, 2.)
  - `it('getCountyTeachers lists teaching staff only and matches subject through either table')`. The `where` gets
    `position: { in: [...] }` and an `OR` of `subjectAssignments.some` / `classSubjectTeachers.some` with
    `equals`, `mode: 'insensitive'` on the trimmed name. `orderBy` is `[lastName, firstName, id]`.
  - `it('primarySubject is the earliest assigned subject across both tables')`.
  - `it('getCountyTeacherById merges subjects from both tables, one per subject')`.
  - `it('getStats totalTeachers counts active teaching staff only')`.
  - `it('a teacher at an inactive school is outside the list and stats')`: assert the `where` has
    `institution.isActive: true` for the list and stats, but not for the profile. (Review Focus 4.)
- [ ] **Step 2: Run** the spec. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx jest src/counties` and `npx tsc --noEmit -p .`. Expected: PASS, exit 0.
- [ ] **Step 5: Commit:** `fix(counties): real teacher stats, teaching staff only, subjects from both assignments`.

### Task 3: portal-web reads the real numbers

**Files:**
- Modify: `Nemis/apps/portal-web/src/store/county/Api/teachersApi.ts`:
  - the `TeacherStats` type;
  - the fallback becomes a thrown error;
  - two new exported helpers.
- Modify: `Nemis/apps/portal-web/src/app/government/county/teachers/page.tsx` (cards at lines 96–99 and 172–215; the
  Subject options at line 101).
- Modify: `Nemis/apps/portal-web/src/app/government/county/teachers/[id]/page.tsx`: `safeQualifications` is replaced
  by `qualificationList`.
- Test: `Nemis/apps/portal-web/src/store/county/Api/teachersApi.test.ts` (new)

**Interfaces:**
- **Produces:**
  - `teacherCardCounts(stats?: TeacherStats): { total; active; inactive; unassigned }`, with zeros when `stats` is
    undefined;
  - `teacherSubjectOptions(stats?: TeacherStats): string[]`, the sorted `bySubject` keys;
  - `qualificationList(raw: unknown): string[]`, implementing the Global Constraints rule.

- [ ] **Step 1: Write failing tests:**
  - the card mapping;
  - the subject options are sorted;
  - `qualificationList`: `['B.Ed', 3]` → `['B.Ed']`; `{ summary: 'B.Sc Physics' }` → `['B.Sc Physics']`;
    `{ summary: '' }`, `null`, `7`, `{ certified: true }` → `[]`. (Review Focus 3.)
- [ ] **Step 2: Run** `pnpm vitest run src/store/county/Api/teachersApi.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The four cards use the Global Constraints copy and colours: Active `text-active`,
  Inactive `text-pending`, Unassigned `text-red-500`.
- [ ] **Step 4: Run** `pnpm typecheck` and `pnpm vitest run`. Expected: PASS.
- [ ] **Step 5: Commit**, after discarding the tsbuildinfo change: `fix(portal-web): real teacher cards, subject
  filter and qualifications`.

## Stage B — Desktop

### Task 4: Types and application layer

**Files:**
- Create: `packages/types/src/county-teachers.ts`, exported from `packages/types/src/index.ts`.
- Create, under `packages/application/src/`:
  - `interfaces/county/county-teachers-read-model.ts`;
  - `use-cases/county/get-county-teachers.ts`;
  - `use-cases/county/get-county-teacher-detail.ts`;
  - `testing/county/in-memory-county-teachers-read-model.ts`;
  - `use-cases/county/county-teachers.test.ts`.
- Modify: `services/county-application-service.ts`, `factories/create-application-layer.ts` (+ its test), `index.ts`,
  the barrels, `packages/presentation/src/testing/create-test-application.ts`, `apps/desktop/electron/main/main.ts`
  (`deferredApplication` keys, if the county service is listed by hand).

**Interfaces:**
- **Produces:**
  ```ts
  export interface CountyTeachersQuery {
    search?: string; category?: string; subject?: string; status?: 'active' | 'inactive';
    page?: number; limit?: number;
  }
  export interface CountyTeacherInstitution {
    id: string; name: string; level: string | null; districtName: string | null; countyName: string | null;
  }
  export interface CountyTeacherListItem {
    id: string; firstName: string; lastName: string; middleName: string | null; photoUrl: string | null;
    employeeNumber: string; position: string; isActive: boolean; gender: string;
    institution: CountyTeacherInstitution; primarySubject: string | null;
  }
  export interface CountyTeacherStats {
    total: number; active: number; inactive: number; unassigned: number; subjects: string[];
  }
  export interface CountyTeachersResult {
    county: { id: string; name: string } | null; stats: CountyTeacherStats;
    data: CountyTeacherListItem[]; total: number; page: number; limit: number; totalPages: number;
  }
  export interface CountyTeacherDetail extends CountyTeacherListItem {
    phoneNumber: string | null; email: string | null; employmentType: string | null;
    dateOfBirth: string | null; nationalId: string | null; address: string | null;
    dateOfJoining: string | null; dateOfLeaving: string | null; qualifications: string[];
    classAssignments: Array<{ id: string; isClassTeacher: boolean;
      class: { id: string; name: string; gradeLevel: string } }>;
    subjectAssignments: Array<{ id: string; subject: { id: string; name: string; code: string | null } }>;
  }
  export interface ICountyTeachersReadModel {
    listTeachers(query: CountyTeachersQuery): Omit<CountyTeachersResult, 'county'>;
    getTeacher(id: string): CountyTeacherDetail | null;
  }
  ```
  - Port: `countyTeachers`.
  - `CountyApplicationService.listTeachers(query)` returns `Promise<ApplicationResponse<CountyTeachersResult>>` and
    adds `county` from `countyAnalytics.getCounty()`.
  - `CountyApplicationService.getTeacher(teacherId)` returns
    `Promise<ApplicationResponse<CountyTeacherDetail | null>>`.

- [ ] **Step 1: Write failing tests:**
  - `it('listTeachers adds the county to the read model page')`;
  - `it('getTeacher is null for a teacher not on the device')`.
- [ ] **Step 2: Run** the Electron runner on `packages/application/src/use-cases/county`. Expected: FAIL.
- [ ] **Step 3: Implement**, and wire it through the factory and the composition. The composition port is a throwing
  stub until Task 5.
- [ ] **Step 4: Run** it, plus `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(application): county teachers list and teacher profile`.

### Task 5: SQLite read model and the dashboard count

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyTeachersReadModel.ts` + `.test.ts`
- Modify: `SqliteCountyAnalyticsReadModel.ts` (`countActiveTeachers`) + its test; `createDataLayer.ts`;
  `createApplicationComposition.ts`

**Interfaces:**
- **Consumes:** the Task 4 port.
- **Produces:**
  - Every formula in Global Constraints, with the `OWN_COUNTY` clause of `SqliteCountyStudentsReadModel`.
  - `institution.level` is the first entry of `profile.levels` (parse it as `SqliteCountySchoolsReadModel.levelsOf`
    does).
  - `subjects` and `primarySubject` follow the Global Constraints rules.
  - `qualifications` is already reduced to `string[]`.
  - `countActiveTeachers` adds the teaching-positions clause.

- [ ] **Step 1: Write failing tests** (fixture style of `SqliteCountyStudentsReadModel.test.ts`):
  - `it('lists teaching staff at active county schools by last name, first name, id, 12 per page')`: a PRINCIPAL is
    absent.
  - `it('filters by search (name or employee #), category (school level), status and subject')`.
  - `it('finds a teacher whose subject comes only from class_subject_teachers')`.
  - `it('groups subject names by case and spaces, and counts a doubly assigned subject once')`. (Review Focus 1, 2.)
  - `it('primarySubject is the earliest assigned subject across both tables')`.
  - `it('counts total, active, inactive and unassigned')`. Unassigned covers:
    - a past-year-only assignment (unassigned);
    - a class-subject-only current assignment (assigned);
    - a current-year class at another school (unassigned);
    - a school with no current year (all unassigned).
  - `it('builds the profile: classes of all years with CT flag, merged subjects, qualifications')`:
    - qualifications `'["B.Ed"]'` → `['B.Ed']`;
    - `'{"summary":"B.Sc"}'` → `['B.Sc']`;
    - `'not json'`, `NULL`, `'7'` → `[]`. (Review Focus 3.)
  - `it('a teacher at an inactive school is absent from list and stats but their profile opens')`. (Review Focus 4.)
  - `it('returns null for staff outside the county or not on the device')`.
  - In the analytics test: `it('countActiveTeachers counts active teaching staff only')`.
- [ ] **Step 2: Run** both files with the Electron runner. Expected: FAIL.
- [ ] **Step 3: Implement** and wire it.
- [ ] **Step 4: Run** them, plus `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(data): SQLite county teachers read model; dashboard counts teaching staff`.

### Task 6: Presentation view models

**Files:**
- Create: `packages/presentation/src/view-models/county/county-teachers-view-model.ts`,
  `county-teacher-detail-view-model.ts`, `county-teachers-views.ts`, `county-teachers-view-models.test.ts`
- Modify: `factories/create-presentation-layer.ts`, `index.ts`; `apps/desktop/renderer/lib/presentation/hooks/county.ts`

**Interfaces:**
- **Produces:**
  - `CountyTeachersViewModel({ county })`: store `{ summary: AsyncState<CountyTeachersResult>, query:
    CountyTeachersQuery }`, `load(query): Promise<void>`. Hook `useCountyTeachersViewModel`.
  - `CountyTeacherDetailViewModel({ county })`: store `{ detail: AsyncState<CountyTeacherDetail>, requestedId:
    string | null }`. `load(id)` sets `requestedId` first, and a null result gives `isEmpty`. Hook
    `useCountyTeacherDetailViewModel`.
  - Both mirror the Students view models.

- [ ] **Step 1: Write failing tests:**
  - the list load passes the query through;
  - the detail load sets `requestedId` before resolving;
  - a null detail is empty.
- [ ] **Step 2: Run** the Electron runner on `packages/presentation/src/view-models/county`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it, plus a typecheck. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(presentation): county teachers view models`.

### Task 7: IPC — list and profile

**Files:**
- Modify: `packages/types/src/ipc.ts`, `api.ts`; `apps/desktop/electron/security/validateIpc.ts`;
  `ipc/authorizeChannel.ts` (+ test)
- Create: `apps/desktop/electron/ipc/handlers/county/teachers.ts` + `.test.ts`; `preload/county/teachers-api.ts`;
  `renderer/services/nemis-bridge/county/teachers-bridge.ts`
- Modify: the county `index.ts` files, `registrar.ts`, `renderer/lib/ipc/county.ts` (+ `index.test.ts`)

**Interfaces:**
- **Channels**, in `COUNTY_ADMIN_CHANNELS`:
  - `COUNTY_LIST_TEACHERS: 'county:list-teachers'`: `CountyTeachersQuery` → `CountyTeachersResult`;
  - `COUNTY_GET_TEACHER: 'county:get-teacher'`: id → `CountyTeacherDetail | null`.
- **Validator `assertCountyTeachersQueryArgs`:**
  - known keys only;
  - `page` and `limit` are ints, with `limit` ≤ 50;
  - strings are bounded;
  - `status` is `active` or `inactive`.
  - The id is a bounded string.
- **Facade:** `county.listTeachers(query)` and `county.getTeacher(id)`.

- [ ] **Step 1: Write failing tests:**
  - the handlers forward to the service;
  - the validator rejects `limit: 51` and an unknown key;
  - authorize covers both channels;
  - the facade exposes both.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(ipc): county teachers channels`.

### Task 8: Teachers list page (port)

**Files:**
- Modify: `apps/desktop/renderer/app/government/county/teachers/page.tsx` (replaces the `SchoolAdminCollectionPage`
  placeholder)
- Test: `apps/desktop/renderer/app/government/county/teachers/page.test.tsx`

**Interfaces:**
- **Consumes:** the `useCountyTeachersViewModel` hook.
- **Produces:** a port of `Nemis/apps/portal-web/src/app/government/county/teachers/page.tsx` with these changes:
  - one `vm.load(query)` through `useRevalidateOnSync`;
  - cards from `stats`, using the Global Constraints copy;
  - Subject options from `stats.subjects`;
  - `SchoolPhoto` with `fallback="/teacher-fallback.jpg"` for the card image;
  - the toggle buttons get aria-labels `Card view` and `Table view`;
  - the table row and "View Profile" go to `/government/county/teachers/details?id=<id>`;
  - the error banner's Retry reloads.

- [ ] **Step 1: Write failing tests:**
  - `it('shows the four cards with real counts and the header total')`;
  - `it('shows cards by default and switches to the table')`;
  - `it('passes search, category, subject and status to the query')`;
  - `it('resets to page 1 when a filter changes')`: go to page 3, change status, and expect `page: 1`. (Review
    Focus 5.)
  - `it('links a teacher to details?id=')`.
- [ ] **Step 2: Run** the file with the Electron runner. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(county): port the Teachers list page`.

### Task 9: Teacher profile page (port)

**Files:**
- Create: `apps/desktop/renderer/components/county/teachers/TeacherProfilePage.tsx` + `.test.tsx`;
  `apps/desktop/renderer/app/government/county/teachers/details/page.tsx` (under `Suspense`, like Students)

**Interfaces:**
- **Consumes:** the `useCountyTeacherDetailViewModel` hook; `resolveSchoolDetail` for the not-found and
  previous-teacher guard, as `StudentDetailPage` does.
- **Produces:** a port of `Nemis/apps/portal-web/src/app/government/county/teachers/[id]/page.tsx`:
  - the id comes from `useSearchParams().get('id')`;
  - Back goes to `/government/county/teachers`;
  - the photo uses `SchoolPhoto` with the teacher fallback;
  - qualifications come already reduced from the read model.

- [ ] **Step 1: Write failing tests:**
  - `it('shows the header, the four stat cards and the four sections')`: Years of Service, Classes with the "Class
    teacher" sub-line, Subjects, Status.
  - `it('shows class chips with the CT badge and merged subjects with codes')`.
  - `it('shows the qualifications list, or "No qualifications recorded."')`.
  - `it('shows "Teacher not found or you don't have access." for a teacher not on the device')`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it, plus `pnpm --filter @nemis-desktop/app build:renderer`. Expected: PASS;
  `/government/county/teachers/details` is prerendered.
- [ ] **Step 5: Commit:** `feat(county): teacher profile page`.

### Task 10: Full gate

- [ ] **Step 1: Nemis.**
  - Server: `npx tsc --noEmit -p .` and `npx jest src/counties src/desktop-provisioning src/institutions`. Expected:
    exit 0, all pass.
  - portal-web: `pnpm typecheck` and `pnpm vitest run`. Expected: exit 0, all pass.
- [ ] **Step 2: Desktop:**
  - `pnpm lint` and `pnpm typecheck`;
  - `pnpm --filter @nemis-desktop/app build:renderer`;
  - the full suite with the Electron runner.

  Expected: only the known pre-existing failures.
- [ ] **Step 3: Ledger the GUI checks for Alvin:**
  - the cards against a county he knows;
  - the Subject dropdown and filter;
  - card and table views, and paging;
  - a teacher profile offline;
  - the dashboard's Total Teachers equals the Active card;
  - the web Teachers page signed out returns 401.
