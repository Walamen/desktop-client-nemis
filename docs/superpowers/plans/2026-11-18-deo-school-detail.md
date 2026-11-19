# DEO School detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real DEO School detail page on the web and the desktop. Every figure comes from an existing rule, and missing data says "No data" instead of a made-up value.

**Architecture:**
- **Server first.** New route `GET /districts/:id/schools/:schoolId/detail`. It reuses `computeSchoolStandings` (narrowed to one school) and `summarizeAcademicGrades`.
- **Web.** portal-web rewrites `deo/schools/[id]/page.tsx` against that route.
- **Desktop.** Computes the same figures offline: `buildDistrictSchoolRows`, three new SQLite reads, and the County academic reader with `districtOnly`. It is exposed through the usual DEO slice (use case → `DeoApplicationService` → `deo:get-school` → preload/bridge/lib-ipc → view model → page).

**Repo layout:** two repos, each on its own branch `feat/deo-school-detail` cut from `main`.
- Tasks 1–2 are in `Nemis`.
- Tasks 3–6 are in `desktop-client-nemis`.

**Tech Stack:**
- Server: NestJS + Prisma + Jest.
- Web: Next.js + RTK Query + Vitest.
- Desktop: Electron + better-sqlite3 + hexagonal application layer + vanilla-Zustand presentation + Next.js renderer, with Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-deo-school-detail-design.md` (desktop repo)

## Global Constraints

- **Copy (both apps):**
  - "No data" when attendance or the average score is missing.
  - "No fees billed this year" when `feeCollectionRate` is null.
  - "Not recorded" for a missing principal.
  - "Grade not set" for students with no grade.
  - "No enrollment data available" when there are no grade rows.
  - Reports caption: "`n`/3 months with a submitted report".
  - The caption "All required reports submitted" must not appear anywhere.
- **States:** loading, error and not-found are three distinct states.
  - Loading: "Loading school…".
  - Not found: "School not found in your district.".
  - No district: "No district is assigned to your account.".
  - Error: "Could not load this school." plus a "Retry" button.
- **Header line:**
  - levels, address and "Est. YYYY", joined with " · ";
  - each part is left out when absent;
  - "Est." appears only with a recorded year.
- **Banner chip:** shows `complianceStatus`. Dark-banner colours:
  - Compliant: `bg-emerald-900 text-emerald-300`
  - Needs Review: `bg-amber-900 text-amber-300`
  - Flagged: `bg-red-900 text-red-300`
- **Layout:** keep the existing web layout, icons and colours otherwise.
  - The banner's back button reads "Schools" and calls `router.back()`.
  - KPI captions:
    - Total Students: "District enrollment"
    - Total Teachers: "Active staff"
    - Attendance: "School average"
    - Performance Avg: "Academic metrics"
- **Grade order:** GradeLevel declaration order (KG, K1, K2, GRADE_1 … GRADE_12). Null grade comes last, never sorted as text.
- **Gender:** count MALE and FEMALE only; any other value counts in the total only. Bars are widths over total students. With 0 students, the bars are hidden and "No data" is shown.
- **Scope:**
  - Server: `ensureDistrictAccess`, then 404 when the school is not an active school of the district.
  - Desktop: the district comes from the session (`currentDistrictId`), never the renderer. An outside school gives `school: null`.
- **Repo rules:**
  - Never stage or commit `apps/desktop/package.json` (Alvin's version bump).
  - No pushes.
  - Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **`GRADE_10` vs `GRADE_2`, and a null grade:** the order must be GRADE_2, GRADE_10, then the null row. Tested in Task 1 Step 1 and Task 3 Step 1.
- **A school with students but no published grades this year:** the average must be null ("No data"), not 0. Tested in Task 1 Step 1, Task 4 Step 1, Task 2 Step 1 and Task 6 Step 1.
- **A school id from another district, typed into the URL:** server 404 (Task 1); desktop `school: null` and the not-found copy (Tasks 4 and 6).
- **Moving from one school's detail to another without leaving the page** (Finance → back → another school). The desktop view model outlives the page, so the page must not flash the previous school's figures or a false "not found". Tested in Task 6 Step 1.
- **Zero students:** no NaN-width bars and no division by zero (Tasks 2 and 6).

---

### Task 1: Server: the one-school detail route

**Files** (all paths in the `Nemis` repo):
- Modify: `packages/types/src/deo.ts`. After `DistrictSchoolStandingsResponse`, add `DistrictSchoolDetail`:

  ```ts
  export interface DistrictSchoolDetail extends DistrictSchoolStanding {
    /** Street and community joined with ", "; null when neither is recorded. */
    address: string | null;
    establishedYear: number | null;
    gender: { male: number; female: number };
    /** GradeLevel order; gradeLevel null = students with no grade, always last. */
    enrollmentByGrade: { gradeLevel: string | null; students: number }[];
    /** This academic year's published grades; averageScore null when none. */
    academic: { totalGrades: number; averageScore: number | null };
  }
  ```

- Modify: `apps/Server/src/common/district/class-lead-order.ts`. Add `export function compareGradeLevel(a: string | null, b: string | null): number`.
  - It reuses `GRADE_RANK`.
  - Null sorts last.
  - Unknown strings sort after known grades and before null.
- Modify: `apps/Server/src/districts/districts.service.ts`:
  - `computeSchoolStandings(districtId, now = new Date(), schoolId?: string)`. When `schoolId` is given, add `id: schoolId` to its `institution.findMany` where. Leave the three existing callers (l.1489, 1666, 2032) unchanged.
  - New `async getDistrictSchoolDetail(districtId: string, schoolId: string, user: UserContext): Promise<DistrictSchoolDetail>`, placed after `getDistrictSchoolStandings`:
    1. Call `ensureDistrictAccess` and `findOne(districtId)`.
    2. Take `const [row] = await this.computeSchoolStandings(districtId, new Date(), schoolId)`. If there is no row, throw `NotFoundException("School not found in this district")`.
    3. In parallel, read:
       - `institution.findUnique({ where: { id: schoolId }, select: { address, communityTown, establishedYear } })`
       - `student.findMany({ where: { institutionId: schoolId, isActive: true }, select: { gender, gradeLevel } })`
       - `grade.findMany` with `currentPublishedGradeWhere({ id: schoolId, districtId, isActive: true })` and the same `select` as `generateAcademicReport` (l.5093–5101)
       - `institutionGradingConfig.findMany({ where: { institutionId: schoolId }, select: { institutionId, passingMarks, maxMarks } })`
    4. Build the result:
       - `address`: trimmed non-empty `address` and `communityTown`, joined with ", ", else null.
       - `gender`: MALE and FEMALE counts.
       - `enrollmentByGrade`: grouped by `gradeLevel ?? null`, sorted with `compareGradeLevel`.
       - `academic`: from `summarizeAcademicGrades(grades, passThresholds(configs)).bySchool.get(schoolId)`. `averageScore` is null when there is no entry or `totalGrades === 0`.
- Modify: `apps/Server/src/districts/districts.controller.ts`. After `getSchoolStandings` (l.197–208), add:
  - `@Get(":id/schools/:schoolId/detail")`
  - `@Roles(SystemRole.DEO, SystemRole.SUPER_ADMIN, SystemRole.COUNTY_ADMIN)`
  - an `@ApiOperation` summary
  - `getSchoolDetail(@Param("id") id, @Param("schoolId") schoolId, @CurrentUser() user)` → `districtsService.getDistrictSchoolDetail(id, schoolId, user)`
- Create: `apps/Server/src/districts/districts.school-detail.spec.ts`. Build its Prisma mock the way `districts.school-standings.spec.ts` does.
- Modify: `apps/Server/src/common/district/class-lead-order.spec.ts` (create it if absent) for `compareGradeLevel`.

**Interfaces:**
- Produces: `DistrictSchoolDetail` (exported from `@nemis/types`), used by Task 2.
- Produces: `GET /districts/:id/schools/:schoolId/detail` → `DistrictSchoolDetail`, inside the standard response envelope.

- [ ] **Step 1: Branch.** In `Nemis`, run `git switch -c feat/deo-school-detail main`. Expected: a clean tree. If it isn't clean, stop and report.
- [ ] **Step 2: Write the failing tests.**
  - `class-lead-order.spec.ts`: `["GRADE_10", null, "GRADE_2", "KG", "WEIRD"].sort(compareGradeLevel)` equals `["KG", "GRADE_2", "GRADE_10", "WEIRD", null]`.
  - `districts.school-detail.spec.ts`, with a DEO of `d-1` as in the standings spec:
    - **Returns one school only.** The `institution.findMany` mock is called with a where containing `id: "s-1"`. The result has `id: "s-1"` and the standing fields (`complianceStatus`, `attendanceRate`, `feeCollectionRate`, `principalName`, `reportMonths`) as computed for that world.
    - **404 for a school that isn't in the district.** When standings return no rows (the `findMany` mock resolves `[]`), it throws `NotFoundException`.
    - **403 for another district.** A DEO of `d-2` gets `ForbiddenException`.
    - **Gender and total.** Students `[MALE, MALE, FEMALE, OTHER]` give `gender` `{ male: 2, female: 1 }`.
    - **Grade order.** Students with grades `GRADE_10, GRADE_2, GRADE_2, null` give `enrollmentByGrade` `[{ gradeLevel: "GRADE_2", students: 2 }, { gradeLevel: "GRADE_10", students: 1 }, { gradeLevel: null, students: 1 }]`.
    - **Address.**
      - `address: "  "` with `communityTown: "Sinkor"` gives `"Sinkor"`.
      - Both null gives null.
      - `"12 Broad St"` with `"Sinkor"` gives `"12 Broad St, Sinkor"`.
      - `establishedYear` passes through, null included.
    - **Academic.**
      - No grades: `{ totalGrades: 0, averageScore: null }`.
      - Two grades, 30/50 and 45/50 (`assessment.totalMarks` 50, subject `institutionId: "s-1"`): `{ totalGrades: 2, averageScore: 75 }`.
- [ ] **Step 3: Run them and make sure they fail.** From `apps/Server`, run `pnpm jest src/districts/districts.school-detail.spec.ts src/common/district/class-lead-order.spec.ts`. Expected: FAIL (`compareGradeLevel` / `getDistrictSchoolDetail` not defined).
- [ ] **Step 4: Implement** the type, the comparator, the service change and the method, and the controller route, as listed under Files.
- [ ] **Step 5: Verify.**
  - Run the same jest command. Expected: PASS.
  - Run `pnpm jest src/districts`. Expected: every district spec passes, including `districts.school-standings.spec.ts` unchanged.
  - Run `pnpm exec tsc --noEmit -p tsconfig.json` in `apps/Server`, plus `pnpm --filter @nemis/types build` if that package has a build script. Expected: no errors.
- [ ] **Step 6: Commit.** Run `git add packages/types apps/Server/src`, then commit `feat(deo): school detail route for one district school`, ending with the trailer.

### Task 2: Web: rewrite the School detail page against the route

**Files** (all paths in the `Nemis` repo):
- Modify: `apps/portal-web/src/store/deo/Api/deoApi.ts`.
  - After `getDistrictSchoolStandings` (l.320–332), add `getDistrictSchoolDetail: builder.query<DistrictSchoolDetail, { districtId: string; schoolId: string }>`.
    - URL: `/districts/${districtId}/schools/${schoolId}/detail`.
    - `transformResponse` uses `unwrapEnvelope`, like its neighbour.
    - `providesTags: ["DistrictSchoolPerformance"]`.
  - Export `useGetDistrictSchoolDetailQuery`, and add `DistrictSchoolDetail` to the type import and export lists, the same way the neighbouring types are listed.
- Rewrite: `apps/portal-web/src/app/government/deo/schools/[id]/page.tsx`.
- Create: `apps/portal-web/src/app/government/deo/schools/[id]/page.test.tsx`. Mock the hooks the way `deo/finance/page.test.tsx` does (`vi.mock("@/store/deo")`, `vi.mock("@/store/hooks")`), and mock `next/navigation` (`useParams` → `{ id: "s-1" }`, `useRouter` → `{ back }`).

**Interfaces:**
- Consumes: `DistrictSchoolDetail` and the route from Task 1.

- [ ] **Step 1: Write the failing page test.** Build a `DistrictSchoolDetail` fixture, `detail(overrides)`. Its base:
  - levels `["PRIMARY"]`, `address: "12 Broad St, Sinkor"`, `establishedYear: 1998`, principal "Ann First";
  - students 4, teachers 2, `attendanceRate: 88`;
  - `academic: { totalGrades: 2, averageScore: 75 }`, `feeCollectionRate: 60`;
  - gender `{ male: 2, female: 1 }`;
  - `enrollmentByGrade: [{ gradeLevel: "GRADE_2", students: 3 }, { gradeLevel: null, students: 1 }]`;
  - `reportMonths: [true, false, true]`, `complianceStatus: "Needs Review"`.

  Tests:
  - **Shows the real figures.**
    - Header text "Primary · 12 Broad St, Sinkor · Est. 1998".
    - "Principal: Ann First", "88%", "75%", "60%".
    - Chip "Needs Review".
    - "Grade 2" before "Grade not set".
    - "2/3 months with a submitted report".
    - `queryByText(/All required reports submitted/)` is null.
  - **Says "No data" instead of zeros.** With `attendanceRate: null`, `academic: { totalGrades: 0, averageScore: null }`, `feeCollectionRate: null`, `principalName: null`, `establishedYear: null` and `address: null`:
    - "No data" appears at least twice;
    - "No fees billed this year" and "Principal: Not recorded" appear;
    - the header is "Primary";
    - no text matches `/Est\./`.
  - **Zero students.** With `students: 0`, gender `{0, 0}` and `enrollmentByGrade: []`, "No enrollment data available" shows and the Gender panel shows "No data".
  - **Loading.** The hook returns `{ isLoading: true }`, and "Loading school…" shows.
  - **Not found.** The hook returns `{ isError: true, error: { status: 404 } }`, and "School not found in your district." shows.
  - **Error with retry.** The hook returns `{ isError: true, error: { status: 500 }, refetch }`. "Could not load this school." shows, and clicking "Retry" calls `refetch`.
  - **No district.** The auth user has no `districtId`, so the hook is called with `skip: true` and "No district is assigned to your account." shows.
- [ ] **Step 2: Run it and make sure it fails.** From `apps/portal-web`, run `pnpm vitest run "src/app/government/deo/schools/[id]/page.test.tsx"`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the endpoint and rewrite the page.
  - Keep the existing markup, classes and icons. Replace each value per the Global Constraints.
  - Grade labels come from `formatGradeLevel` (`@/lib/utils/formatGradeLevel`). Null shows "Grade not set".
  - Levels display as `level.replace(/_/g, " ")` in Title Case, joined with " / ".
  - The reports dots come from `reportMonths`.
  - Delete the `ExtendedInstitution` interface and the `institutionMetadata` imports if nothing else in the file uses them.
- [ ] **Step 4: Verify.**
  - Run the same test (expected: PASS), then `pnpm typecheck`, `pnpm lint` and `pnpm test` in `apps/portal-web`.
  - Expected: type-check clean, no new lint errors, and the whole suite passes. If stale `.next/types` break `tsc`, delete `apps/portal-web/.next` and rerun. Don't commit `tsconfig.tsbuildinfo` changes.
- [ ] **Step 5: Commit.** Run `git add apps/portal-web/src`, then commit `feat(deo): school detail page shows real figures`, ending with the trailer.

### Task 3: Desktop: types and the three SQLite reads

**Files** (all paths in the `desktop-client-nemis` repo):
- Modify: `packages/types/src/deo-dashboard.ts`. After `DeoSchoolsResult`, add:

  ```ts
  /** One school on the DEO School detail page (Nemis DistrictSchoolDetail). */
  export interface DeoSchoolDetail extends DeoSchoolRow {
    address: string | null;
    establishedYear: number | null;
    gender: { male: number; female: number };
    enrollmentByGrade: { gradeLevel: string | null; students: number }[];
    academic: { totalGrades: number; averageScore: number | null };
  }

  export interface DeoSchoolDetailResult {
    /** Null when the signed-in DEO has no district assigned. */
    districtId: string | null;
    /** Null when the school is not an active school of the district. */
    school: DeoSchoolDetail | null;
  }
  ```

- Modify: `packages/application/src/interfaces/deo/district-overview-read-model.ts`. Add three methods, each with a one-line doc comment:
  - `getSchoolProfile(schoolId: string): { address: string | null; establishedYear: number | null } | null`
  - `countSchoolStudentsByGender(schoolId: string): { gender: string; count: number }[]` (active students)
  - `countSchoolStudentsByGrade(schoolId: string): { gradeLevel: string | null; students: number }[]` (active students; GradeLevel order, null last)
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.ts`. Implement the three methods with `guarded(...)` and `this.#statements`, like their neighbours.
  - **`getSchoolProfile`** reads `street`, `communityTown` and `details` from `institutions`.
    - `address`: trimmed non-empty parts joined with ", ", else null.
    - `establishedYear`: `details.establishedYear` when it is an integer number, else null. Parse `details` with the file's existing `parseProfile` helper.
    - Returns null when no row exists.
  - **`countSchoolStudentsByGrade`** sorts in code with `GRADE_RANK`: unknown strings after known grades, null last.
- Modify: `packages/application/src/testing/deo/in-memory-district-overview.ts`. Add settable data fields and the three methods, following the double's existing style (`#record`, public fields).
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.test.ts`.
  - Extend the `student` helper with an optional `gradeLevel`; the default stays NULL.
  - Extend the `school` helper with optional `street`, `communityTown` and `details`.
- If type-checking finds any other `IDistrictOverviewReadModel` implementer, add the three methods there too, returning empty values.

**Interfaces:**
- Produces: `DeoSchoolDetail` and `DeoSchoolDetailResult` (`@nemis-desktop/types`), plus the three read-model methods above. Tasks 4–6 consume them.

- [ ] **Step 1: Branch.** In `desktop-client-nemis`, run `git switch -c feat/deo-school-detail main`. Expected: only `apps/desktop/package.json` modified (Alvin's), plus the uncommitted spec and plan docs.
- [ ] **Step 2: Write the failing tests** in `SqliteDistrictOverviewReadModel.test.ts`, inside a `describe('school detail reads')`:
  - **Profile.**
    - `street "  "` with `communityTown "Sinkor"` and `details {"establishedYear":1998}` gives `{ address: 'Sinkor', establishedYear: 1998 }`.
    - Both null with `details {"establishedYear":"1998"}` gives `{ address: null, establishedYear: null }`.
    - An unknown id gives `null`.
  - **Gender.** For school `s-a`, active students MALE, MALE, FEMALE, OTHER, plus an inactive FEMALE and a MALE at `s-b`. Sorted by gender, the result is `[{FEMALE,1},{MALE,2},{OTHER,1}]`.
  - **Grade.** At `s-a`: active students `GRADE_10`, `GRADE_2`, `GRADE_2`, null, `KG`, and an inactive `GRADE_1`. The result is exactly `[{KG,1},{GRADE_2,2},{GRADE_10,1},{null,1}]`.
- [ ] **Step 3: Run them and make sure they fail.** Run `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.test.ts`. Expected: FAIL (methods missing). If better-sqlite3 reports a NODE_MODULE_VERSION mismatch, run `pnpm rebuild:node` first, and `pnpm rebuild:electron` when the task is done.
- [ ] **Step 4: Implement** the types, the port, the SQLite methods and the in-memory double.
- [ ] **Step 5: Verify.** Run the same test (expected: PASS), then `pnpm typecheck`. Expected: no errors.
- [ ] **Step 6: Commit.** Run `git add packages/types packages/application apps/desktop/electron`. Do NOT stage `apps/desktop/package.json`. Commit `feat(deo): local reads for the school detail page`, ending with the trailer.

### Task 4: Desktop: `GetDeoSchoolDetailUseCase` on the DEO service

**Files** (all paths in the `desktop-client-nemis` repo):
- Create: `packages/application/src/use-cases/deo/get-deo-school-detail.ts`.
- Create: `packages/application/src/use-cases/deo/get-deo-school-detail.test.ts`. Model its setup on `get-deo-schools.test.ts`, using `InMemoryDistrictOverviewReadModel` and `InMemoryCountyReportsReadModel` (`packages/application/src/testing/county/in-memory-county-reports-read-model.ts`).
- Modify: `packages/application/src/services/deo-application-service.ts`.
  - Add the `getSchool: GetDeoSchoolDetailUseCase` dep.
  - Add `getSchool(schoolId: string): Promise<ApplicationResponse<DeoSchoolDetailResult>>`, which returns `this.deps.getSchool.execute({ schoolId })`.
- Modify: `packages/application/src/factories/create-application-layer.ts`. In the DEO block (around l.751), add `getSchool: new GetDeoSchoolDetailUseCase({ readModel: ports.districtOverview, finance: ports.countyFinance, reports: ports.countyReports, currentDistrictId: ports.currentDistrictId, clock, logger })`.
- Export the use case wherever the other DEO use cases are exported from the package index (follow `GetDeoSchoolsUseCase`).

**Interfaces:**
- Consumes: Task 3's types and read-model methods; `buildDistrictSchoolRows` and `DistrictSchoolRowsDeps` (`use-cases/deo/district-school-rows.ts`); `ICountyReportsReadModel.getAcademicReport(query: CountyEnrollmentReportQuery)`.
- Produces:
  - `GetDeoSchoolDetailDeps extends DistrictSchoolRowsDeps { reports: Pick<ICountyReportsReadModel, 'getAcademicReport'>; currentDistrictId: string | null; clock: IClock; logger: IAppLogger }`.
  - `class GetDeoSchoolDetailUseCase implements QueryHandler<{ schoolId: string }, ApplicationResponse<DeoSchoolDetailResult>>`, with use-case name `'GetDeoSchoolDetail'`.
  - `DeoApplicationService.getSchool(schoolId)`.

- [ ] **Step 1: Write the failing tests.**
  - **No district.** With `currentDistrictId` null, the result is `{ districtId: null, school: null }`, and `getAcademicReport` is not called.
  - **Outside school.** A school id that isn't among `listActiveSchools('d-1')` gives `{ districtId: 'd-1', school: null }`.
  - **Same row as the Schools page.** For school `s-1`, the result's `DeoSchoolRow` fields deep-equal `GetDeoSchoolsUseCase`'s row for `s-1`, built over the same doubles and clock.
  - **Detail fields.**
    - `address` and `establishedYear` come from `getSchoolProfile`.
    - `gender` comes from `countSchoolStudentsByGender` `[{MALE,2},{FEMALE,1},{OTHER,1}]` and equals `{ male: 2, female: 1 }`.
    - `enrollmentByGrade` equals what `countSchoolStudentsByGrade` returns, in its order.
  - **Academic.**
    - The reports double's `lastAcademicQuery` equals `{ districtId: 'd-1', schoolId: 's-1', districtOnly: true }`.
    - A `bySchool` row `{ schoolId: 's-1', totalGrades: 2, averageScore: 75 }` gives `{ totalGrades: 2, averageScore: 75 }`.
    - A row with `totalGrades: 0` and no row both give `{ totalGrades: 0, averageScore: null }`.
- [ ] **Step 2: Run them and make sure they fail.** Run `pnpm vitest run packages/application/src/use-cases/deo/get-deo-school-detail.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Wrap the body in `invokeUseCase('GetDeoSchoolDetail', …)`.
  - Find the row with `buildDistrictSchoolRows(this.deps, districtId, new Date(clock.now()), readModel.listOpenAlerts(districtId))`, matching on `id === schoolId`.
  - When there is no row, return `school: null` before calling the other reads.
  - Wire it into the service and the factory.
- [ ] **Step 4: Verify.** Run the same test, then `pnpm vitest run packages/application/src/use-cases/deo` and `pnpm typecheck`. Expected: all PASS, no errors.
- [ ] **Step 5: Commit.** Run `git add packages/application`, then commit `feat(deo): school detail use case from local data`, ending with the trailer.

### Task 5: Desktop: `deo:get-school` from IPC to the view model

**Files** (all paths in the `desktop-client-nemis` repo):
- Modify: `packages/types/src/ipc.ts`.
  - Channel map, next to `'deo:list-schools'` (l.267): `'deo:get-school': { args: [schoolId: string]; result: DeoSchoolDetailResult }`.
  - `IpcChannels`, next to `DEO_LIST_SCHOOLS` (l.556): `DEO_GET_SCHOOL: 'deo:get-school'`.
  - Import `DeoSchoolDetailResult`.
- Modify: `packages/types/src/deo-dashboard.ts`. In `DeoApi`, after `listSchools`, add `getSchool(schoolId: string): Promise<DeoSchoolDetailResult>`.
- Modify: `apps/desktop/electron/ipc/handlers/deo/schools.ts`. Add `handle(IpcChannels.DEO_GET_SCHOOL, assertSingleIdArg, async (schoolId: string) => (await app.deo.getSchool(schoolId)).data)`.
- Modify: `apps/desktop/electron/ipc/handlers/deo/schools.test.ts`. Assert the handler forwards the id, and that `assertSingleIdArg` rejects `[]`, `['']` and `[42]`. Follow how that file and `county/schools.test.ts` already test.
- Modify: `apps/desktop/electron/ipc/authorizeChannel.ts`. Add `IpcChannels.DEO_GET_SCHOOL` to `DEO_CHANNELS`, next to `DEO_LIST_SCHOOLS` (l.246).
- Modify: `apps/desktop/electron/ipc/authorizeChannel.test.ts`. Add it to the DEO channel list (l.150).
- Modify: `apps/desktop/electron/preload/deo/index.ts`. Add `getSchool: (schoolId) => invoke(IpcChannels.DEO_GET_SCHOOL, schoolId)`.
- Modify: `apps/desktop/renderer/services/nemis-bridge/deo/dashboard-bridge.ts`. Add `getSchool: (schoolId: string): Promise<DeoSchoolDetailResult> => api().deo.getSchool(schoolId)`.
- Modify: `apps/desktop/renderer/lib/ipc/deo.ts`. Add `getSchool: (schoolId: string) => query(() => deoBridge.getSchool(schoolId))`.
- Create: `packages/presentation/src/view-models/deo/deo-school-detail-view-model.ts`, plus `.test.ts` modelled on `deo-schools-view-model.test.ts`.
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts`. Add `readonly deoSchoolDetail: DeoSchoolDetailViewModel` and `deoSchoolDetail: new DeoSchoolDetailViewModel({ deo: app.deo })`.
- Modify: `apps/desktop/renderer/lib/presentation/hooks/deo.ts`. Add `export const useDeoSchoolDetailViewModel = () => usePresentation().viewModels.deoSchoolDetail;`.
- Export the view model wherever `DeoSchoolsViewModel` is exported.

**Interfaces:**
- Consumes: `DeoApplicationService.getSchool(schoolId)` (Task 4).
- Produces:
  - `window.nemis.deo.getSchool(schoolId)`.
  - `DeoSchoolDetailViewModel`, with:
    - `store: StoreApi<{ detail: AsyncState<DeoSchoolDetailResult>; requestedId: string | null }>`
    - `load(schoolId: string): Promise<void>`. It sets `requestedId` first, then calls `trackQuery` with `fetch: () => deo.getSchool(schoolId)` and identity `map`. There is no `isEmpty`: the page reads `school === null` itself.
  - `useDeoSchoolDetailViewModel()`.

- [ ] **Step 1: Write the failing tests.**
  - **View model.**
    - After `load('s-1')`, `requestedId` is `'s-1'` and `detail` is `{ status: 'success', data: result }`. Use a fake `deo` whose `getSchool` resolves `ok(result)`.
    - A failing `getSchool` gives `detail.status` `'error'`.
  - **IPC.**
    - The handler test described under Files.
    - The `authorizeChannel` list entry.
- [ ] **Step 2: Run them and make sure they fail.** Run `pnpm vitest run packages/presentation/src/view-models/deo apps/desktop/electron/ipc`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** every file listed above.
- [ ] **Step 4: Verify.** Run the same command (expected: PASS), then `pnpm typecheck` and `pnpm lint`. Expected: no errors. Lint includes the renderer boundary guard, which only allows `window.nemis` in the bridge.
- [ ] **Step 5: Commit.** Run `git add packages apps/desktop/electron apps/desktop/renderer/services apps/desktop/renderer/lib`. Do NOT stage `apps/desktop/package.json`. Commit `feat(deo): deo:get-school channel and view model`, ending with the trailer.

### Task 6: Desktop: the School detail page

**Files** (all paths in the `desktop-client-nemis` repo):
- Create: `apps/desktop/renderer/components/deo/DeoSchoolDetailPage.tsx`. It reproduces the web page's layout as Task 2 left it: the same markup structure, Tailwind classes, Lucide icons and copy, per the Global Constraints.
- Modify: `apps/desktop/renderer/app/government/deo/schools/details/page.tsx`. Replace the ComingSoon with a `<Suspense fallback={null}><DeoSchoolDetailPage /></Suspense>` wrapper, copying `county/schools/details/page.tsx` including its comment.
- Create: `apps/desktop/renderer/app/government/deo/schools/details/page.test.tsx`, modelled on `deo/schools/page.test.tsx` (`window.nemis` mock + `PresentationProvider` + `createRendererPresentation`).
  - Mock `next/navigation` with `useRouter: () => ({ back })` and `useSearchParams: () => new URLSearchParams(currentSearch)`, where `currentSearch` is a variable the test can change.

**Interfaces:**
- Consumes:
  - `useDeoSchoolDetailViewModel()` and `DeoSchoolDetailResult` (Tasks 3 and 5);
  - `useQueryParam('id')` (`@/hooks/use-query-param`);
  - `useViewModel` (`@/hooks/use-view-model`);
  - `useRevalidateOnSync` (`@/hooks/use-revalidate-on-sync`), used the same way the County `SchoolDetailPage` uses it.

**Page logic**, where `id = useQueryParam('id')`:
1. On mount and whenever `id` changes, call `vm.load(id)` if `id` is non-empty.
2. Decide what to show, in this order:
   - no `id` → not found;
   - `requestedId !== id`, or status `idle`/`loading` → loading;
   - status `error` → error with "Retry", which calls `vm.load(id)`;
   - data `districtId === null` → no district;
   - data `school === null` → not found, but only when status is `success`; during `refreshing` → loading;
   - `school.id !== id` → loading;
   - otherwise render.
3. Grade labels: KG → "Kindergarten", K1 and K2 as is, `GRADE_n` → "Grade n", null → "Grade not set". Put this in a small `deoGradeLabel(grade: string | null): string` in `components/deo/deo-grade-label.ts`, unless the renderer or `@nemis-desktop/ui` already exports an equivalent. Search first and reuse one if found.

- [ ] **Step 1: Write the failing tests.** Use the same fixture values as Task 2 Step 1, as `DeoSchoolDetailResult` `{ districtId: 'd-1', school }`. Tests:
  - **Shows the real figures.** Same assertions as Task 2's first test.
  - **"No data" instead of zeros.** Same assertions as Task 2's second test.
  - **Zero students.** Same as Task 2.
  - **Not found.** `school: null` shows "School not found in your district.".
  - **No district.** `districtId: null` shows "No district is assigned to your account.".
  - **Error with retry.** `getSchool` rejects once and then resolves. "Could not load this school." shows; clicking "Retry" shows the school name.
  - **No stale school when the id changes.**
    1. Render with `?id=s-1` and wait for "Alpha Academy".
    2. Change `currentSearch` to `id=s-2`, with a `getSchool` for `s-2` that stays pending, and rerender.
    3. "Alpha Academy" and "School not found in your district." are both absent, and "Loading school…" shows.
- [ ] **Step 2: Run them and make sure they fail.** Run `pnpm vitest run apps/desktop/renderer/app/government/deo/schools/details/page.test.tsx`. Expected: FAIL (the ComingSoon renders).
- [ ] **Step 3: Implement** the component, the label helper (if needed) and the route page.
- [ ] **Step 4: Verify.**
  - Run the same test, then `pnpm vitest run apps/desktop/renderer/app/government/deo`, `pnpm --filter @nemis-desktop/app typecheck` and `pnpm lint`. Expected: all PASS, no errors.
  - `fresh-login app/page.test.tsx` fails on `main` already; it is not part of this check.
- [ ] **Step 5: Commit.**
  - Run `git add apps/desktop/renderer docs/superpowers/specs/2026-11-18-deo-school-detail-design.md docs/superpowers/plans/2026-11-18-deo-school-detail.md`. Do NOT stage `apps/desktop/package.json`.
  - Commit `feat(deo): school detail page on the desktop`, ending with the trailer.
