# County Students (list + detail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The County Admin desktop gets portal-web's Students list (offline) and a new tabbed student detail page whose Academic record adds the child's other-county years when online.

**Architecture:**
- **Server (ships first):** closes the snapshot gaps (term averages over a two-year window, student photo and national ID), fixes the web's always-zero stat cards, and adds one authenticated read endpoint for a student's national record.
- **Desktop reads:** the full hexagonal path over SQLite. The online record is a bridge-only call, merged by a pure presentation function.

**Tech Stack:** Electron 42.7.0 + Next 15 static export + React 19 + Zustand vanilla ViewModels + better-sqlite3/SQLCipher + Vitest; Nemis server NestJS + Prisma + Jest; portal-web Next + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-17-county-students-design.md` (read §2 for copy, §5 for every formula).

## Global Constraints

- Branch `feat/county-students` in both repos. **Nemis tasks (1–3) land first.**
- **Copy, verbatim:**
  - tab names `Overview`, `Academic record`, `Transfers`;
  - row marker `Other county`;
  - outcomes `Promoted`, `Retained`, `Graduated`, `In progress`, `Not recorded`;
  - unreachable line `Showing this county's records only — connect to see years at other schools.`
- **The list is a port** of `Nemis/apps/portal-web/src/app/government/county/students/page.tsx`. Its only change is that rows open `/government/county/students/details?id=<id>`.
- **The detail page is read-only.** Detail route `?id=` under `Suspense`.
- **Performance label:** ≥ 85 `Excellent`, ≥ 70 `Good`, ≥ 50 `Average`, else `Below Avg`. It is the mean `percentage` of the 5 most recent term averages by `calculatedAt`.
- **Performance filter quirk (ported):** it runs after paging. `total` becomes the filtered page's length; `totalPages = ceil(total / 12)`.
- **Stats:**
  - `total` counts students at active county schools;
  - `active` counts those with `isActive`;
  - `inactive` counts the rest;
  - "Schools" is the active county schools count.
- **Year outcome:** the completion's outcome if stamped; else `In progress` for the current year; else `Not recorded`. Never inferred.
- **Year average:** the completion's `averageAtDecision`; else the mean of that year's term averages; else blank.
- **Year attendance:** PRESENT ÷ all recorded rows. This matches `SqliteAttendanceRepository` (PRESENT only).
- **Other-county record:** only for a student whose **current** institution is in the caller's county (404 otherwise), and only to a caller with access to that county (403 otherwise).
- SQLite tests use the Electron runner (`ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>`); the server uses `npx jest` in `Nemis/apps/Server`; portal-web uses `pnpm vitest run` in `Nemis/apps/portal-web`.
- **Pre-existing failures, left alone:**
  - `renderer/app/page.test.tsx`;
  - `renderer/app/government/teacher/timetable/timetable.test.tsx`;
  - the `Sidebar.test.tsx` unhandled error.
- Batched Bash heredocs with many files fail to parse here: write one file per Write call.

## Review Focus

1. **Other students' years.** Two students' records must never mix. The merge keys on the URL's student id and drops rows for any other id (Task 7).
2. **The tab offline or unreachable.** It shows the local years at once and the unreachable line, never an endless spinner. A slow request doesn't block the local rows (Task 10).
3. **Duplicates and blanks.** A year at a county school that is both local and fetched shows once. A local blank average or outcome is filled from the fetched row (Task 7).
4. **Missing data.** A student with no enrolments, no term averages or no attendance gives blank cells, not NaN or an error (Task 6).
5. **A transferred-out student.** Once their current school is outside the county, the endpoint answers 404 (Task 3). On the desktop the student is no longer on the device, so the detail page shows not-found (Task 10).

---

## Stage A — Server (Nemis)

### Task 1: Snapshot closes the gaps (term averages, photo, national ID)

**Files:**
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` (the students query and mapping near line 842; add a termAverages query in the `$transaction` list; `restrictTeacherSnapshot` near line 1287; the empty-data object near line 1378)
- Modify: `Nemis/packages/types/src/desktop-provisioning.ts` (`DesktopProvisioningData` gains `termAverages: Record<string, unknown>[]`)
- Test: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`

**Interfaces:**
- **Produces:**
  - Each snapshot `students` row gains `photoUrl` (`row.user?.imageUrl ?? row.photoUrl ?? null`; the raw `imageUrl`, as the Schools principal ruling did) and `nationalId`.
  - New collection `termAverages`: rows `{ id, studentId, subjectId, termId, classId, percentage, calculatedAt, updatedAt }`.
  - Selection:
    - students at the scope's institutions;
    - terms whose academic year is the scope institution's current year or the one that started most recently before it;
    - `sinceFilter(since)`.
  - TEACHER scope gets `[]`.

- [ ] **Step 1: Write failing tests**
  - `it('ships each student row with photoUrl and nationalId')`: a user `imageUrl` wins over `photoUrl`, and null when neither is set.
  - `it('ships term averages of the current and previous academic year only')`: years Y-2, Y-1 and Y (current), with one average each. Expect Y-1 and Y, with the six fields.
  - `it('ships no term averages to a TEACHER device')`.
- [ ] **Step 2: Run** `npx jest src/desktop-provisioning`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Include `user: { select: { imageUrl: true } }` on the students query.
  - Add the termAverages query: per institution, pick its `isCurrent` year plus the latest-starting year before it. Use those years' terms.
  - Add `termAverages` to the manifest and to the empty object.
- [ ] **Step 4: Run** `npx jest src/desktop-provisioning` and `npx tsc --noEmit -p .`. Expected: PASS, exit 0.
- [ ] **Step 5: Commit:** `feat(desktop-provisioning): ship term averages, student photo and national ID`.

### Task 2: Real student stat cards (server + portal-web)

**Files:**
- Modify: `Nemis/apps/Server/src/counties/counties.service.ts` `getStudentStats` (line 323)
- Modify: `Nemis/apps/portal-web/src/store/county/Api/studentsApi.ts` (`StudentStats` type, the fallback)
- Modify: `Nemis/apps/portal-web/src/app/government/county/students/page.tsx` lines 128–130
- Test: `Nemis/apps/Server/src/counties/counties.student-stats.spec.ts` (new); `Nemis/apps/portal-web/src/store/county/Api/studentsApi.test.ts` (new)

**Interfaces:**
- **Produces:**
  - `getStudentStats(id)` returns `{ total, male, female, newThisYear, byDistrict, status: { active: number, inactive: number } }`.
  - `total`, `male` and `female` count **all** students at active county schools. `status.active` counts those with `isActive` true; `status.inactive` counts the rest. `newThisYear` and `byDistrict` keep their current definitions.

- [ ] **Step 1: Write failing tests.**
  - **Server** (mocked prisma, in the style of `institutions.create.spec.ts`): `it('returns real counts with status.active and status.inactive')`. Expect the shape above, with counts taken from the `student.count` calls.
  - **portal-web:** `it('passes real stats through and keeps zeros only when the endpoint is missing')`. Test the `transformResponse` as an exported pure function, `toStudentStats`.
- [ ] **Step 2: Run** jest and `pnpm vitest run src/store/county`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Server:** return the computed object instead of `{ success, resolvedAt }`.
  - **portal-web:** extract `toStudentStats(response)` and use it in `transformResponse`. `status` becomes `{ active: number; inactive: number }`. The page keeps reading `status.active` / `status.inactive`.
- [ ] **Step 4: Run** both test commands, then `npx tsc --noEmit -p .` in the server and `pnpm typecheck` in portal-web. Expected: PASS.
- [ ] **Step 5: Commit:** `fix(counties): student stat cards show real numbers`.

### Task 3: National academic record endpoint

**Files:**
- Modify: `Nemis/apps/Server/src/counties/counties.controller.ts`; `counties.service.ts` (new `getStudentAcademicRecord`)
- Modify: `Nemis/packages/types/src/` — add `county-student-record.ts` and export it
- Test: `Nemis/apps/Server/src/counties/counties.student-record.spec.ts`

**Interfaces:**
- **Produces:**
  - `GET /counties/:id/students/:studentId/academic-record`, with `@Roles(COUNTY_ADMIN, SUPER_ADMIN, MINISTRY_ADMIN)`. Not `@Public`.
  - Calls `ensureCountyAccess(id, user)` (403). Answers 404 (`NotFoundException("Student not found in this county")`) unless `student.institution.countyId === id`.
  - Body type:
    ```ts
    interface StudentAcademicRecord {
      years: Array<{ academicYearId: string; academicYearName: string; academicYearStartDate: string;
        isCurrentYear: boolean; institutionId: string; institutionName: string; countyName: string | null;
        className: string | null; gradeLevel: string | null;
        outcome: 'PROMOTED' | 'RETAINED' | 'GRADUATED' | null; nextGradeLevel: string | null; average: number | null }>;
      transfers: Array<{ id: string; date: string; fromInstitutionName: string; toInstitutionName: string;
        status: string; reason: string; reviewedByName: string | null; reviewedAt: string | null }>;
    }
    ```
  - **Years:** one per (academicYearId, institutionId) from all of the student's enrolments. The class is the latest enrolment in that year (by `enrollmentDate`, then `createdAt`).
    - `outcome` comes from `GradeCompletion` (studentId, academicYearId).
    - `average` is the completion's `averageAtDecision`; else the mean `TermAverage.percentage` for that student over the year's terms; else null.
  - **Transfers:** all `StudentTransfer` rows for the student. `date` is `requestedDate ?? createdAt`; `reviewedByName` is the reviewer's full name.

- [ ] **Step 1: Write failing tests:**
  - `it('returns every year across counties with outcome and average')`: two schools in two counties. One year is stamped (averageAtDecision 71); one is unstamped with term averages 60 and 80 (average 70).
  - `it('takes the latest class within a year')`.
  - `it('404 when the student is currently outside the county')`.
  - `it('403 for another county admin')`.
  - `it('lists all transfers with names')`.
- [ ] **Step 2: Run** `npx jest src/counties`. Expected: FAIL.
- [ ] **Step 3: Implement** the service method and the route. Place the route before `":id/students"` matchers if ordering matters.
- [ ] **Step 4: Run** `npx jest src/counties src/desktop-provisioning` and `npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(counties): a student's national academic record for the county admin`.

## Stage B — Desktop

### Task 4: Types, migration 035, importer

**Files:**
- Modify: `packages/types/src/provisioning.ts` (append `'termAverages'` to `PROVISIONING_COLLECTIONS`)
- Create: `packages/types/src/county-students.ts`; export it from `packages/types/src/index.ts`
- Create: `apps/desktop/electron/database/migrations/035-add-county-students-data.ts` + `.test.ts`; register it; add `termAverages: 'term_averages'` to `tableNames.ts`
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts` (specs: `students` gains `'nationalId','photoUrl'`; new `termAverages` spec); `ProvisioningImporter.test.ts`

**Interfaces:**
- **Produces** (`county-students.ts`):
  ```ts
  export interface CountyStudentsQuery { search?: string; institutionId?: string; districtId?: string; gradeLevel?: string;
    performance?: string; status?: 'active' | 'inactive'; page: number; limit: number }
  export interface CountyStudentListItem { id: string; firstName: string; lastName: string; middleName: string | null;
    photoUrl: string | null; nemisId: string | null; isActive: boolean; gender: string;
    institution: { id: string; name: string; districtName: string | null; countyName: string | null };
    currentClass: { name: string; gradeLevel: string } | null; performanceLabel: string | null; avgPercentage: number | null }
  export interface CountyStudentStats { total: number; male: number; female: number; active: number; inactive: number }
  export interface CountyStudentsResult { county: { id: string; name: string } | null;
    districts: Array<{ id: string; name: string }>; schools: Array<{ id: string; name: string }>;
    stats: CountyStudentStats; data: CountyStudentListItem[]; total: number; page: number; limit: number; totalPages: number }
  export type YearOutcome = 'PROMOTED' | 'RETAINED' | 'GRADUATED';
  export interface StudentYearRecord { academicYearId: string; academicYearName: string; academicYearStartDate: string | null;
    isCurrentYear: boolean; institutionId: string; institutionName: string; className: string | null; gradeLevel: string | null;
    outcome: YearOutcome | null; average: number | null; attendanceRate: number | null; otherCounty: boolean }
  export interface StudentTransferRecord { id: string; date: string; fromInstitutionName: string; toInstitutionName: string;
    status: string; reason: string; reviewedByName: string | null; reviewedAt: string | null }
  export interface CountyStudentDetail { student: { id: string; firstName: string; middleName: string | null; lastName: string;
      nemisId: string | null; nationalId: string | null; photoUrl: string | null; dateOfBirth: string; gender: string;
      gradeLevel: string | null; isActive: boolean; admissionDate: string | null; phoneNumber: string | null;
      email: string | null; address: string | null };
    institution: { id: string; name: string; districtName: string | null; countyName: string | null };
    currentEnrollment: { className: string; gradeLevel: string | null; academicYearName: string | null;
      enrollmentDate: string | null; status: string } | null;
    guardians: Array<{ firstName: string; lastName: string; relationship: string | null; phoneNumber: string | null;
      email: string | null; isPrimary: boolean }>;
    years: StudentYearRecord[]; transfers: StudentTransferRecord[] }
  export interface StudentAcademicRecord { /* exactly the Task 3 body type */ }
  export type StudentAcademicRecordResult = { status: 'ok'; record: StudentAcademicRecord } | { status: 'unavailable' };
  ```
- **Produces** (migration 035):
  - `CREATE TABLE term_averages (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, subjectId TEXT NOT NULL, termId TEXT NOT NULL, classId TEXT NOT NULL, percentage REAL NOT NULL, calculatedAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`, with an index on `(studentId, calculatedAt)`.
  - No outbox triggers.
  - `ALTER TABLE students ADD COLUMN nationalId TEXT; ADD COLUMN photoUrl TEXT;`
  - `UPDATE sync_metadata SET lastFullResyncAt = NULL` (guarded like migration 029).

- [ ] **Step 1: Write failing tests:**
  - **Migration:** `it('adds term_averages without outbox triggers, the two student columns, and forces a full resync')`.
  - **Importer:** `it('imports term averages and the student photoUrl and nationalId')`.
- [ ] **Step 2: Run** both files with the Electron runner. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them, plus `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(data): term averages, student photo and national ID on the device`.

### Task 5: Application layer

**Files:**
- Create: `packages/application/src/interfaces/county/county-students-read-model.ts`; `use-cases/county/get-county-students.ts`; `use-cases/county/get-county-student-detail.ts`; `testing/county/in-memory-county-students-read-model.ts`; `use-cases/county/county-students.test.ts`
- Modify: `services/county-application-service.ts`, `factories/create-application-layer.ts` (+ its test), `index.ts`, the barrels, `packages/presentation/src/testing/create-test-application.ts`

**Interfaces:**
- **Produces:**
  ```ts
  export interface ICountyStudentsReadModel {
    listStudents(query: CountyStudentsQuery): Omit<CountyStudentsResult, 'county' | 'districts'>;
    getStudent(id: string): CountyStudentDetail | null;
  }
  ```
  - Port: `countyStudents`.
  - `CountyApplicationService.listStudents(query: CountyStudentsQuery): Promise<ApplicationResponse<CountyStudentsResult>>` adds `county` from `countyAnalytics.getCounty()` and `districts` from `countyDistricts.listActiveDistricts()`, mapped to `{ id, name }`.
  - `CountyApplicationService.getStudent(id: string): Promise<ApplicationResponse<CountyStudentDetail | null>>`.

- [ ] **Step 1: Write failing tests:**
  - `it('listStudents adds the county and active districts to the read model page')`.
  - `it('getStudent is null for a student not on the device')`.
- [ ] **Step 2: Run** the Electron runner on `packages/application/src/use-cases/county`. Expected: FAIL.
- [ ] **Step 3: Implement**, and wire it through the factory and the composition. The composition port is a throwing stub until Task 6.
- [ ] **Step 4: Run** the same, plus a typecheck of the packages. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(application): county students list and student detail`.

### Task 6: SQLite read model

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyStudentsReadModel.ts` + `.test.ts`
- Modify: `createDataLayer.ts`, `createApplicationComposition.ts`

**Interfaces:**
- Consumes: Task 4 tables, Task 5 port.
- **Produces** the formulas in Global Constraints and spec §5.2/§5.3:
  - **List:** students at active county schools (`OWN_COUNTY` clause as in `SqliteCountySchoolsReadModel`), ordered by `lastName`, 12 per page by `limit`.
  - **Search:** case-insensitive `LIKE` on first name, last name and NEMIS ID.
  - **Current class:** the latest ACTIVE enrolment.
  - **Stats:** as in Global Constraints. `schools` lists the active county schools by name.
  - **Detail years:** one per (year, school) over the student's enrolments in local classes; the latest class per year.
    - `isCurrentYear` from `academic_years.isCurrent`.
    - `outcome` from `grade_completions`.
    - `average` per Global Constraints, using that year's terms' `term_averages`.
    - `attendanceRate` from that year's attendance.
    - `otherCounty: false`.
  - **Transfers:** from `student_transfers`.
    - `date` is `requestedDate ?? createdAt`.
    - `reviewedByName` is `users.firstName || ' ' || users.lastName` when that user is on the device.
  - **Guardians:** via `student_guardians`, primary first.

- [ ] **Step 1: Write failing tests** (fixture style of `SqliteCountySchoolsReadModel.test.ts`):
  - `it('lists active-school students by last name with current class and performance label')`: term averages 90, 88, 86, 84, 82 plus an older 10, so the mean of the 5 latest is 86 and the label is Excellent.
  - `it('filters by district, school, status, grade (active enrolment) and search on name or NEMIS ID')`.
  - `it('applies the performance filter after paging, as the web does')`: 13 students, 1 Excellent on page 2. Page 1 with `performance: 'Excellent'` returns `data: []`, `total: 0`.
  - `it('counts total, male, female, active and inactive at active county schools')`.
  - `it('builds one year row per school year with the latest class, outcome, average and attendance')`: a stamped year with averageAtDecision 71; an unstamped previous year with term averages 60 and 80, so average 70 and outcome null; the current year with no stamp, so outcome null and `isCurrentYear` true; attendance 3 PRESENT of 4, so 75.
  - `it('gives blank cells, not NaN, for a student with no enrolments, averages or attendance')`. (Review Focus 4.)
  - `it('lists transfers newest first with names and the reviewer when known')`.
  - `it('returns null for a student not on the device')`.
- [ ] **Step 2: Run** the file with the Electron runner. Expected: FAIL.
- [ ] **Step 3: Implement** and wire it.
- [ ] **Step 4: Run** it, plus `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(data): SQLite county students read model`.

### Task 7: Presentation — view models and the record merge

**Files:**
- Create: `packages/presentation/src/view-models/county/county-students-view-model.ts`, `county-student-detail-view-model.ts`, `county-students-views.ts`; `packages/presentation/src/mappers/county/student-record-merge.ts` + `.test.ts`; `view-models/county/county-students-view-models.test.ts`
- Modify: `factories/create-presentation-layer.ts`, `index.ts`; `apps/desktop/renderer/lib/presentation/hooks/county.ts`

**Interfaces:**
- **Produces:**
  - **List view model:** `CountyStudentsViewModel({ county })`. Store `{ summary: AsyncState<CountyStudentsResult>, query: CountyStudentsQuery }`. `load(query: CountyStudentsQuery): Promise<void>`. Hook `useCountyStudentsViewModel`.
  - **Detail view model:** `CountyStudentDetailViewModel({ county })`. Store `{ detail: AsyncState<CountyStudentDetail>, requestedId: string | null }`. `load(id)` sets `requestedId` first, like `CountySchoolDetailViewModel`. Hook `useCountyStudentDetailViewModel`.
  - **The merge:** `mergeStudentRecord(studentId: string, local: CountyStudentDetail, remote: StudentAcademicRecord | null, localInstitutionIds: ReadonlySet<string>): { years: StudentYearRecord[]; transfers: StudentTransferRecord[] }`.
    - **Years:** keyed by `academicYearId + institutionId`; the local row wins. A local `average` or `outcome` that is null is filled from the remote row.
    - A remote-only row has `otherCounty = !localInstitutionIds.has(institutionId)` and `attendanceRate: null`.
    - Years are sorted by `academicYearStartDate` descending (null last).
    - **Transfers:** keyed by id; the local row wins; sorted by `date` descending.
    - Returns local only when `local.student.id !== studentId` or `remote === null`.
  - `outcomeLabel(row: StudentYearRecord): string` returns `Promoted` / `Retained` / `Graduated` / `In progress` / `Not recorded`.

- [ ] **Step 1: Write failing tests:**
  - `it('keeps one row per year and school; local wins; blank local fields are filled')`. (Review Focus 3.)
  - `it('marks remote-only years at non-local schools as Other county')`.
  - `it('never merges a record into a different student')`: local for s-1 with studentId `s-2` returns local only. (Review Focus 1.)
  - `it('orders years and transfers newest first')`.
  - `it('outcomeLabel: stamped, In progress, Not recorded')`.
  - **View models:** the list load passes the query through; the detail load sets `requestedId` first.
- [ ] **Step 2: Run** the Electron runner on `packages/presentation/src`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it, plus a typecheck. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(presentation): county students view models and record merge`.

### Task 8: IPC — list, detail, online record

**Files:**
- Modify: `packages/types/src/ipc.ts`, `api.ts`; `apps/desktop/electron/security/validateIpc.ts`; `ipc/authorizeChannel.ts` (+ test); `provisioning/BackendProvisioningGateway.ts` (+ test)
- Create: `apps/desktop/electron/ipc/handlers/county/students.ts` + `.test.ts`; `preload/county/students-api.ts`; `renderer/services/nemis-bridge/county/students-bridge.ts`
- Modify: the county `index.ts` files, `registrar.ts`, `renderer/lib/ipc/county.ts` (+ `index.test.ts`)

**Interfaces:**
- **Channels**, all in `COUNTY_ADMIN_CHANNELS`:

  | Channel | Args | Result | Notes |
  |---|---|---|---|
  | `COUNTY_LIST_STUDENTS: 'county:list-students'` | `CountyStudentsQuery` | `CountyStudentsResult` | |
  | `COUNTY_GET_STUDENT: 'county:get-student'` | id | `CountyStudentDetail \| null` | |
  | `COUNTY_GET_STUDENT_RECORD: 'county:get-student-record'` | `studentId` | `StudentAcademicRecordResult` | handler below |

  - **The record handler:**
    1. If `!connectivity.isOnline()` → `{ status: 'unavailable' }`.
    2. Otherwise call `gateway.getStudentAcademicRecord(countyId, studentId)`. `countyId` is the workspace user's `scope.scopeId`.
    3. On any error (offline, 404, 5xx, timeout) → `{ status: 'unavailable' }`.
  - `getStudentAcademicRecord` sends `GET /counties/:countyId/students/:studentId/academic-record` with `ONLINE_COMMAND` and **a 10 s timeout** (`AbortSignal.timeout(10_000)` for this call only).
- **Validators:**
  - query keys are known; `page` and `limit` are ints with `limit` ≤ 50; strings are bounded; `status` is `active` or `inactive`;
  - ids are bounded strings.
- **Bridge-only:** `countyBridge.getStudentRecord(studentId)` is bridge-only. `listStudents` and `getStudent` go through the facade.

- [ ] **Step 1: Write failing tests:**
  - handlers forward;
  - the record handler returns `unavailable` when offline (gateway not called) and when the gateway throws;
  - the gateway builds the URL and parses the body;
  - authorize covers the 3 channels;
  - the facade covers the 2.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The registrar passes `networkMonitor` (or the worker's connectivity source) and `workspaces` into the handler.
- [ ] **Step 4: Run** the tests, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(ipc): county students channels and the online academic record`.

### Task 9: Students list page (port)

**Files:**
- Modify: `apps/desktop/renderer/app/government/county/students/page.tsx` (it replaces the `SchoolAdminCollectionPage` placeholder)
- Test: `apps/desktop/renderer/app/government/county/students/page.test.tsx`

**Port rules:**
- **Copy the web page verbatim:**
  - `PERFORMANCE_OPTIONS`, `GRADE_LEVELS`, `formatGradeLevel`, `getPerformanceStyle`;
  - header band, stat cards, filters, table/cards toggle, pagination markup.
- **Data:** a single `vm.load(query)` replaces the five web queries. Drop the `mounted` flag. `CountyAuthGuard` becomes a fragment.
- **Images and IDs:** `Image` becomes the `SchoolPhoto`-style fallback image, using the `/school-fallback.jpg`-style avatar fallback the Schools page uses. `formatNemisId` comes from `@nemis-desktop/shared`.
- **Rows:** each row and card is a `Link` to `details?id=<id>`.
- **Refresh:** reload on sync (`useRevalidateOnSync`). Changing a filter resets to page 1, as on the web.

- [ ] **Step 1: Write failing tests:**
  - stat cards show real numbers;
  - each filter calls `listStudents` with the web's params;
  - the performance filter passes through;
  - table/cards toggle;
  - pagination;
  - a row links to `/government/county/students/details?id=s-1`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(county): port the Students list page`.

### Task 10: Student detail page (tabs)

**Files:**
- Create: `apps/desktop/renderer/components/county/students/StudentDetailPage.tsx` + `.test.tsx`; `apps/desktop/renderer/app/government/county/students/details/page.tsx` (wrapped in `Suspense`)

**Interfaces:**
- Consumes: Task 7 (detail view model, `mergeStudentRecord`, `outcomeLabel`) and Task 8 (`countyBridge.getStudentRecord`).
- **Behaviour:**
  - **Header:** the dark band of `SchoolDetailPage`, with photo, name, formatted NEMIS ID, grade, school and an Active/Inactive pill.
  - **Tabs:** `Overview` | `Academic record` | `Transfers (n)`.
  - **Overview:** ports the web School Admin student page's four sections (`portal-web …/school-admin/students/[id]/page.tsx` lines 290–439):
    - Personal Information (including National ID);
    - Contact Information;
    - Enrollment;
    - Guardian / Parent.
  - **Academic record:**
    - It renders the local years at once.
    - On first open it calls `getStudentRecord(id)` once per page visit. `ok` merges the record in (an `Other county` pill on those rows); `unavailable` shows the unreachable line.
    - Columns: Year, Grade, School, Class, Outcome (`outcomeLabel`), Average (`71%` or `—`), Attendance (`75%` or `—`).
  - **Transfers:** the merged transfers, with date, from → to, status, reason, and reviewed by/at.
  - **Not found:** the same not-found state as the School detail page (`resolveSchoolDetail`-style pure function for the one-frame flash).

- [ ] **Step 1: Write failing tests:**
  - `it('shows the header and the Overview sections')`.
  - `it('Academic record shows local years at once, then adds Other county years when online')`: the record call resolves after a delay, and local rows are visible before it.
  - `it('shows the unreachable line when the record is unavailable')`. (Review Focus 2.)
  - `it('shows In progress and Not recorded correctly')`.
  - `it('Transfers tab lists merged transfers newest first')`.
  - `it('a student not on the device shows not found')`. (Review Focus 5.)
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(county): student detail page with academic record and transfers`.

### Task 11: Full gate

- [ ] **Step 1: Nemis.**
  - Server: `npx tsc --noEmit -p .` and `npx jest src/counties src/desktop-provisioning src/institutions`. Expected: exit 0, all pass.
  - portal-web: `pnpm typecheck` and `pnpm vitest run`. Expected: exit 0, all pass.
- [ ] **Step 2: Desktop:**
  - `pnpm lint` and `pnpm typecheck`;
  - `pnpm --filter @nemis-desktop/app build:renderer` (`/government/county/students` and `/students/details` prerendered);
  - the full suite with the Electron runner. Expected: only the known pre-existing failures.
- [ ] **Step 3: Ledger the GUI checks for Alvin:**
  - list filters and the paging quirk;
  - open a student offline: local years only, plus the unreachable line;
  - online: Other county rows;
  - the Transfers tab;
  - stat cards on the web show real numbers.
