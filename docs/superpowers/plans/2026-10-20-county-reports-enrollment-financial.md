# County Reports Part 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the County "Generate Reports" page shell plus the Enrollment and Financial reports to the desktop, offline, and fix quirks R1–R8 on both sides.

**Architecture:**
- **Nemis:** the server enrollment generators get R1–R4; portal-web gets R5–R8.
- **Desktop:** the full hexagonal chain. The chain is:
  1. `ICountyReportsReadModel` and 3 use cases on `CountyApplicationService`
  2. `CountyReportsViewModel`, which also loads the existing finance use cases
  3. `SqliteCountyReportsReadModel`
  4. 3 IPC channels
  5. the Generate Reports page with the Enrollment view, the Financial section and 6 recharts charts

**Tech Stack:** NestJS/Prisma/Jest; Next.js/RTK/Vitest; Electron/better-sqlite3/Zustand/recharts/Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-county-reports-enrollment-financial-design.md`

## Global Constraints

- Branch `feat/county-reports` in both **main checkouts**. Native inline build: no worktrees, no subagents. The full hexagonal path; pages read ViewModels only.
- Never stage unrelated changes. The Nemis server path is `apps/Server` (capital S).
- Files are CRLF: edit with Edit or CRLF-normalising scripts. There's no python.
- Male = `MALE`, female = `FEMALE`; `OTHER` counts only in totals. genderRatio = `(male/female).toFixed(2)`, else `"N/A"`.
- Grade order: `KG, K1, K2, GRADE_1 … GRADE_12`, then anything else, with `UNKNOWN` last.
- Rate rule: `rateStatus` from County Finance (`≥70` on-track, `40–69` at-risk, `<40` below).
- Trend: the last 6 calendar months, oldest first. The label is `en-US {month:'short', year:'numeric'}`. The count is in-scope active students with `createdAt` ≤ that month's last day, 23:59:59.999 local time.
- **Test environment:**
  - desktop SQLite tests need a temporary Node-ABI `node_modules/better-sqlite3/build/Debug/better_sqlite3.node`, extracted from `%LOCALAPPDATA%/npm-cache/_prebuilds/726a00-better-sqlite3-multiple-ciphers-v12.11.1-node-v137-win32-x64.tar.gz` with `tar --force-local`. **Delete it at the end.**
  - Run server jest and desktop vitest one after the other.
- Commands:
  - desktop: `pnpm vitest run <path>`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @nemis-desktop/app build:renderer`
  - server (`Nemis/apps/Server`): `npx jest <path>`, `npx tsc --noEmit`
  - portal-web: `npx vitest run <path>`, `npx tsc --noEmit -p .` (restore `tsconfig.tsbuildinfo` after)
- Known pre-existing failures: desktop `renderer/app/page.test.tsx` and `teacher/timetable/timetable.test.tsx`.

## Review Focus

1. **A school with no district in a county-wide report.** It appears under "Unknown District", is counted in totals, and is listed last. The test is in Task 4.
2. **A student with `gender = OTHER` or a null `gradeLevel`.** They count in totals only; their grade is "UNKNOWN". The tests are in Tasks 1 and 4.
3. **Changing the district clears the school.** The report reloads once, with no `schoolId`. The test is in Task 7.
4. **A student whose `createdAt` is null** (older devices before full resync). They're excluded from the trend counts only. The test is in Task 4.
5. **Switching to an unbuilt report type.** It shows ComingSoon and never calls the enrollment channel. The test is in Task 7.

---

### Task 1: Server — enrollment generators (R1–R4)

**Files:**
- Modify: `Nemis/apps/Server/src/counties/counties.service.ts` (`generateCountyEnrollmentReport`)
- Modify: `Nemis/apps/Server/src/districts/districts.service.ts` (`generateEnrollmentReport`)
- Create: `Nemis/apps/Server/src/counties/counties.enrollment-report.spec.ts`
- Create: `Nemis/apps/Server/src/districts/districts.enrollment-report.spec.ts`

Mock Prisma like `counties.student-record.spec.ts`, and stub `ensureCountyAccess` / `ensureDistrictAccess` + `findOne` with `jest.spyOn`.

- [ ] **Step 1: Write the failing tests**
  - County `scopes schools by the institution's own county`: the `institution.findMany` where equals `{ countyId: 'c-1', isActive: true }`, with no `district` key.
  - County and District `counts OTHER in totals but neither male nor female`: students `[MALE, FEMALE, OTHER]` give `totalMale 1`, `totalFemale 1`, `totalStudents 3`.
  - County and District `the trend respects the school filter`: with `schoolId: 's-1'`, every `student.count` where has `institution` containing `id: 's-1'`.
  - District `grade level comes from the student, not the enrolment`: `student.findMany` select has `gradeLevel: true` and no `enrollments`; a student with `gradeLevel: null` lands in `UNKNOWN`.
- [ ] **Step 2: Run, expect FAIL.** `npx jest src/counties/counties.enrollment-report src/districts/districts.enrollment-report`
- [ ] **Step 3: Implement.** The trend uses `{ ...schoolWhere }` as its `institution` filter.
- [ ] **Step 4: Run, expect PASS.** Then `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `fix(reports): enrollment reports count genders honestly and respect the school filter`

### Task 2: portal-web — grade order, finance badge, Refresh, loaded-at (R5–R8)

**Files:**
- Modify: `Nemis/apps/portal-web/src/components/reports/ReportCharts.tsx` (export `gradeLevelOrder`)
- Create: `Nemis/apps/portal-web/src/components/reports/ReportCharts.test.ts`
- Modify: `Nemis/apps/portal-web/src/app/government/county/reports/generate/page.tsx`

**Interfaces:**
- Produces `gradeLevelOrder(level: string): number`. It's reused on the desktop in Task 6.

- [ ] **Step 1: Write the failing test.** `gradeLevelOrder sorts KG, K1, K2, grades 1–12, then others, UNKNOWN last`: sort `['GRADE_10','UNKNOWN','K1','GRADE_2','KG','K2','GRADE_1']` by it and expect `['KG','K1','K2','GRADE_1','GRADE_2','GRADE_10','UNKNOWN']`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/components/reports`
- [ ] **Step 3: Implement**
  - `GradeLevelChart` sorts with `gradeLevelOrder`.
  - Page R6: the badge class comes from `rateStatus(s.collectionRate)` (on-track → `bg-active`, at-risk → `bg-pending`, below → `bg-error`).
  - Page R7: `handleRefresh` for FINANCIAL calls both finance queries' `refetch`.
  - Page R8: the toolbar time for FINANCIAL is `financeDashboardQuery.fulfilledTimeStamp`.
- [ ] **Step 4: Run, expect PASS.** Then `npx tsc --noEmit -p .`.
- [ ] **Step 5: Commit** `fix(county): Reports grade order, finance badge rule, Refresh and time for Financial`

### Task 3: Desktop — types, port, use cases

**Files:**
- Create: `packages/types/src/county-reports.ts` (export from index)
- Modify: `packages/types/src/ipc.ts` (3 channels + `IpcContract`), `packages/types/src/api.ts` (`CountyApi`)
- Create: `packages/application/src/interfaces/county/county-reports-read-model.ts` (export from `interfaces/county/index.ts`)
- Create: `packages/application/src/use-cases/county/get-county-reports.ts` (export from `index.ts`)
- Create: `packages/application/src/testing/county/in-memory-county-reports-read-model.ts` (export from the testing index)
- Modify: `county-application-service.ts`, `create-application-layer.ts` (port `countyReports`), `create-application-layer.test.ts`, `packages/presentation/src/testing/create-test-application.ts`
- Test: `packages/application/src/use-cases/county/county-reports.test.ts`

**Interfaces:**
```ts
export interface CountyReportOptions { county: { id: string; name: string; code: string | null } | null; districts: { id: string; name: string }[] }
export interface CountyReportSchool { id: string; name: string }
export interface CountyEnrollmentReportQuery { districtId?: string; schoolId?: string }
export interface CountyEnrollmentSchoolRow { schoolId: string; schoolName: string; schoolCode: string; totalStudents: number; male: number; female: number; districtId: string | null; districtName: string | null }
export interface CountyEnrollmentDistrictRow { districtId: string; districtName: string; totalSchools: number; totalStudents: number; totalMale: number; totalFemale: number; genderRatio: string }
export interface CountyEnrollmentReport {
  reportType: 'ENROLLMENT'; generatedAt: string; district: { id: string; name: string };
  summary: { totalSchools: number; totalStudents: number; totalMale: number; totalFemale: number; genderRatio: string };
  byDistrict?: CountyEnrollmentDistrictRow[]; bySchool: CountyEnrollmentSchoolRow[];
  byGradeLevel: { gradeLevel: string; male: number; female: number; total: number }[];
  trendData: { month: string; count: number }[];
}
```
- Channels:
  - `COUNTY_REPORT_OPTIONS: 'county:report-options'`, with args `[]`
  - `COUNTY_REPORT_SCHOOLS: 'county:report-schools'`, with args `[districtId: string]`
  - `COUNTY_ENROLLMENT_REPORT: 'county:enrollment-report'`, with args `[query]`
- `CountyApi`: `getReportOptions()`, `listReportSchools(districtId)`, `getEnrollmentReport(query)`.
- `ICountyReportsReadModel`:
  - `getOptions(): { countyCode: string | null; districts: { id: string; name: string }[] }`
  - `listSchools(districtId: string): CountyReportSchool[]`
  - `getEnrollmentReport(query: CountyEnrollmentReportQuery, nowIso: string): Omit<CountyEnrollmentReport, 'generatedAt' | 'district'> & { scopeName: string | null }`. `scopeName` is the district name when one is given.
- Use cases:
  - `GetCountyReportOptionsUseCase` (deps `readModel`, `countyReadModel`, `logger`) returns `county: county ? { ...county, code: countyCode } : null`.
  - `GetCountyReportSchoolsUseCase` (deps `readModel`, `logger`).
  - `GetCountyEnrollmentReportUseCase` (deps `readModel`, `countyReadModel`, `clock`, `logger`):
    - `generatedAt = clock.now()`
    - `district` = `{ id: districtId, name: scopeName ?? 'Unknown District' }` when a district is given, else `{ id: county.id, name: county.name }` (both `''` when there's no county)

- [ ] **Step 1: Write the failing tests**
  - `options carry the county with its code`
  - `enrollment report is stamped with the clock and names the county when county-wide`
  - `enrollment report names the district when one is chosen`
  - `schools pass through for the district`
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement and wire.**
- [ ] **Step 4: Run, expect PASS.** `pnpm vitest run packages/application packages/presentation`
- [ ] **Step 5: Commit** `feat(county): reports read-model port and use cases`

### Task 4: Desktop — SQLite read model

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyReportsReadModel.ts` (+ `.test.ts`)
- Modify: `createDataLayer.ts`, `createApplicationComposition.ts`

**Approach:**
- Use `OWN_COUNTY` and `guarded` from `./support`.
- `getOptions`:
  - code from `SELECT code FROM counties LIMIT 1`
  - districts are active districts with `countyId` in counties, by name
- `listSchools(districtId)`: active own-county institutions of that district, by name.
- `getEnrollmentReport`:
  - Schools come from `institutions i LEFT JOIN districts d` (filters `i.isActive=1 AND OWN_COUNTY`, optional `i.districtId`/`i.id`), ordered `d.name IS NULL, d.name, i.name`.
  - Students come from active `students s` in those schools: `gender`, `gradeLevel`, `institutionId`, `createdAt`.
  - Aggregate in JS per the spec. `byDistrict` only when `!query.districtId`. `scopeName` is the chosen district's name.
  - Trend: build months from `nowIso` in local time. Count students with a non-null `createdAt` ≤ the month's end.

- [ ] **Step 1: Write the failing tests.** The fixture has 2 districts, a district-less school N, an inactive school, an other-county school, OTHER gender, a null grade, an inactive student, and students created in different months.
  - `summary counts male, female and OTHER only in totals`
  - `byGradeLevel uses the student grade, UNKNOWN when null`
  - `county-wide lists byDistrict with Unknown District for a school without one, schools ordered with it last` (Review Focus 1)
  - `a district report has no byDistrict and names the district`
  - `the school filter narrows schools, students and the trend`
  - `trend is six months oldest first, counting students created by each month end; null createdAt never counts` (Review Focus 4; `nowIso = '2026-10-20T12:00:00.000Z'`, labels `May 2026` … `Oct 2026`)
  - `inactive and other-county schools and inactive students are excluded`
  - `options list active own-county districts by name with the county code; schools list a district's active schools`
- [ ] **Step 2: Run, expect FAIL.** (Install the temporary binary first.)
- [ ] **Step 3: Implement and wire.**
- [ ] **Step 4: Run, expect PASS.** `pnpm vitest run apps/desktop/electron/data`
- [ ] **Step 5: Commit** `feat(county): reports read model over synced students`

### Task 5: Desktop — IPC

**Files:**
- Create: `apps/desktop/electron/ipc/handlers/county/reports.ts` (+ `.test.ts`); export from `county/index.ts`; register in `registrar.ts`
- Modify: `validateIpc.ts` (`assertCountyEnrollmentReportQueryArgs`: arity 1, keys `districtId`, `schoolId` as optional strings ≤ `ID_MAX_LENGTH`), `authorizeChannel.ts` (+ test list)
- Create: `apps/desktop/electron/preload/county/reports-api.ts` (spread in `preload/county/index.ts`)
- Create: `apps/desktop/renderer/services/nemis-bridge/county/reports-bridge.ts` (spread in `county/index.ts`)
- Modify: `apps/desktop/renderer/lib/ipc/county.ts`

- [ ] **Step 1: Write the failing tests**
  - channels forward and return `.data`
  - `county:report-options` refuses args
  - `county:report-schools` needs one id (`assertSingleIdArg`)
  - the enrollment query refuses unknown keys and non-objects
  - authorize allows COUNTY_ADMIN only
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.** Then `pnpm typecheck`, which should be clean.
- [ ] **Step 5: Commit** `feat(county): reports IPC channels`

### Task 6: Desktop — ViewModel

**Files:**
- Create: `packages/presentation/src/view-models/county/county-reports-view-model.ts` (+ `county-reports-view-models.test.ts`)
- Modify: `create-presentation-layer.ts` (`countyReports`), `renderer/lib/presentation/hooks/county.ts` (`useCountyReportsViewModel`)

**Interfaces:**
- `CountyReportsState`:
  - `options: AsyncState<CountyReportOptions>`
  - `schools: AsyncState<CountyReportSchool[]>`
  - `enrollment: AsyncState<CountyEnrollmentReport>`
  - `financeDashboard: AsyncState<CountyFinanceDashboard>`
  - `financeSchools: AsyncState<CountySchoolFinanceRow[]>`
  - `financeLoadedAt: string | null`
- Methods: `loadOptions()`, `loadSchools(districtId)`, `loadEnrollment(query)`, `loadFinance()`. `loadFinance` loads both in parallel and then sets `financeLoadedAt = new Date().toISOString()`.
- `loadSchools` with an empty id sets `schools` to `success` with `[]` without calling.

- [ ] **Step 1: Write the failing tests**
  - `loadEnrollment passes the query through`
  - `loadFinance fills both finance states and stamps the time`
  - `loadSchools('') clears without a call`
  - `a failed enrollment load is an error state`
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement and register.**
- [ ] **Step 4: Run, expect PASS.** `pnpm vitest run packages/presentation`
- [ ] **Step 5: Commit** `feat(county): reports ViewModel`

### Task 7: Desktop — Generate Reports page, charts, routes

**Files:**
- Create in `apps/desktop/renderer/components/county/reports/`:
  - `ReportCharts.tsx` (the 6 charts plus `gradeLevelOrder`, ported verbatim apart from R5)
  - `report-display.tsx` (`SummaryCard`, `ReportTable`, `DistrictDivider`, `groupByDistrict`)
  - `EnrollmentReportView.tsx`
  - `FinancialReportSection.tsx` (props: dashboard and schools)
  - `GenerateReportsPage.tsx`
- Test: `ReportCharts.test.ts` (the Task 2 order case) and `GenerateReportsPage.test.tsx`
- Replace: `app/government/county/reports/generate/page.tsx` (renders the page), `app/government/county/reports/page.tsx` (redirect via `useRouter().replace('/government/county/reports/generate')`)
- Modify: `components/shell/sidebarConfig.ts` (Reports href → `/government/county/reports/generate`); `app/government/county/quick-action-routes.test.tsx` (drop the ComingSoon case; keep the file only if other cases remain, else delete it)

**Approach:**
- A markup port of the web page, minus Time Period and Export.
- Filters:
  - district default `"ALL"`
  - changing district sets school `""` in the same handler
  - the School select appears for a single district
  - Financial hides the district and school filters
- Loading:
  - `useRevalidateOnSync` for options (once)
  - schools when a single district is chosen
  - enrollment when the type is ENROLLMENT and a district is chosen (`"ALL"` → no `districtId`)
  - finance when the type is FINANCIAL
- Refresh reloads the current type.
- Attendance, Academic and Staff & Compliance render `<ComingSoon title="<Name> Report" />` and load nothing.
- Toolbar time: `enrollment.generatedAt`, or `financeLoadedAt`, via `toLocaleString()`.
- The Financial badge uses `rateStatus`; money uses the web's `fmt` (`LRD 1,234.00`).

- [ ] **Step 1: Write the failing tests** (real presentation layer, `window.nemis.county` stubs; mock `next/navigation`):
  - `header shows the county name, code and title`
  - `county-wide enrollment shows the four cards, district sections and school tables`
  - `choosing a district shows its schools and the single-district cards with Gender Ratio`
  - `changing the district clears the school and reloads once without schoolId` (Review Focus 3)
  - `Financial shows the six cards and per-district tables with the 70/40 badge rule, hides district and school filters`
  - `Refresh reloads the current report`
  - `an unbuilt type shows Coming Soon and never calls the enrollment channel` (Review Focus 5)
  - `an enrollment error shows the Failed to load report panel`
  - `the old reports route redirects to generate`
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(county): Generate Reports page with Enrollment and Financial`

### Task 8: Verify both repos

- [ ] Desktop typecheck, lint, the full suite (only the 2 known failures), and the renderer build. Delete the temporary binary.
- [ ] Server `npx tsc --noEmit` + `npx jest`. portal-web tsc + vitest.
- [ ] Inline whole-branch self-review against the spec; fix findings test-first.
- [ ] Update the `county-portal-migration` memory; then finishing-a-development-branch.
