# DEO Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder desktop DEO dashboard with the web's dashboard, computed offline from synced SQLite with real numbers, and make the web dashboard show the same numbers.

**Architecture:** A DEO-owned slice parallel to County: `IDistrictOverviewReadModel` + `IDistrictAlertStore` (SQLite) → `GetDeoDashboardUseCase` / `ResolveDistrictAlertUseCase` → `DeoApplicationService` → `deo:*` IPC behind a `DEO_CHANNELS` gate → `DeoDashboardViewModel` → renderer page. One "school standing" rule is implemented on the server and again in the desktop application layer, pinned by the same case table.

**Tech Stack:** TypeScript, Electron, better-sqlite3, Next.js (static export), Zustand vanilla, Recharts, Vitest (desktop, portal-web), NestJS + Prisma + Jest (server).

**Spec:** `docs/superpowers/specs/2026-11-15-deo-dashboard-design.md`. Layout: `docs/superpowers/specs/2026-11-14-deo-portal-web-design-reference.md` §4.1 and §3.

## Global Constraints

- Branch `feat/deo-dashboard` in both repos. Never commit to `main`; never push.
- Server path is `Nemis/apps/Server` (capital S). `git add apps/server/...` stages nothing.
- Files in both repos are CRLF; edit with the Edit tool, not string-replace scripts.
- After editing `@nemis/types` in Nemis: `pnpm --filter @nemis/types build` before portal-web sees it.
- Desktop: no `any`; `noUncheckedIndexedAccess` is on; renderer may not import `@nemis-desktop/application` internals or touch `window.nemis` outside `services/nemis-bridge` (ESLint guards both).
- A new `ApplicationLayer` key must be added to `deferredApplication` in `apps/desktop/electron/main/main.ts` or IPC sees `undefined`.
- Attended = status `PRESENT` or `LATE`. Teaching staff = position `TEACHER` or `ASSISTANT_TEACHER`, `isActive`. Students counted are `isActive` in an `isActive` institution.
- Cut-offs, verbatim: attendance 60 and 80; days since attendance 3 and 7; pupils per teacher 40; attendance window 30 days; trends 6 months; alerts at most 50; submissions at most 50; table pages of 10.
- Greeting: "Good morning" before 12:00, "Good afternoon" before 17:00, otherwise "Good evening" (device local time).
- No placeholder text is ever printed for a missing name: the part is left out.
- Desktop Node tests need a Node-ABI `better-sqlite3`; the checkout's binary is Electron-ABI. Put a Node prebuild in `node_modules/better-sqlite3/build/Debug/` for the run and delete it afterwards. Do not run `pnpm rebuild:node`.
- Run server jest and desktop vitest serially, never at the same time.

## Review Focus

1. **Device synced from an older server** (no `counties` row, no own `districts` row): the banner omits the missing name; nothing throws. → Task 7 (read-model test), Task 10 (banner-line test).
2. **DEO with no district in the session scope:** `getDashboard` returns `districtId: null` with empty collections; `resolveAlert` returns `false`; the page shows the No District card. → Task 6, Task 10.
3. **District-scale attendance** (hundreds of thousands of rows): the three attendance aggregates finish quickly using the `(classId, date)` index. → Task 7 scale guard.
4. **Resolving twice, or an alert that is not the district's** (a county-level alert is on the device): returns `false`, changes no row, queues nothing. → Task 7.
5. **Division by zero and empty windows:** a school with pupils and no teachers, no pupils at all, or no attendance in 30 days yields a defined standing, never `NaN`/`Infinity`. → Task 1 and Task 5 case table.

---

## File map

**Nemis**

| File | Responsibility |
|---|---|
| `apps/Server/src/common/district/school-standing.ts` (+ `.spec.ts`) | The rule |
| `apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` | Own district + county row for DISTRICT scope |
| `apps/Server/src/districts/districts.service.ts`, `districts.controller.ts` | Standings, report submissions, corrected formulas, school-level incidents |
| `apps/Server/src/districts/districts.school-standings.spec.ts` | Service tests for the above |
| `apps/portal-web/src/store/deo/Api/deoApi.ts`, `store/deo/index.ts` | Two new queries, changed row types |
| `apps/portal-web/src/lib/deo-dashboard.ts` (+ `.test.ts`) | `greetingFor`, `bannerLine`, `formatLevels` |
| `apps/portal-web/src/app/government/deo/page.tsx`, `components/deo/DEOBanner.tsx`, `SchoolsAtGlance.tsx` | Use the real data |

**desktop-client-nemis**

| File | Responsibility |
|---|---|
| `packages/types/src/deo-dashboard.ts`, `ipc.ts`, `api.ts`, `index.ts` | Wire types, channel names, `DeoApi` |
| `packages/application/src/use-cases/deo/school-standing.ts` (+ test) | The rule (desktop copy) |
| `packages/application/src/interfaces/deo/district-overview-read-model.ts`, `district-alert-store.ts`, `index.ts` | Ports |
| `packages/application/src/testing/deo/in-memory-district-overview.ts` | Fakes |
| `packages/application/src/use-cases/deo/get-deo-dashboard.ts`, `resolve-district-alert.ts` (+ tests) | Use cases |
| `packages/application/src/services/deo-application-service.ts` | Service |
| `packages/application/src/factories/create-application-layer.ts`, `src/index.ts` | Wiring, exports |
| `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.ts`, `SqliteDistrictAlertStore.ts` (+ tests) | Adapters |
| `apps/desktop/electron/data/factories/createDataLayer.ts`, `data/adapters/createApplicationComposition.ts`, `workspace/WorkspaceManager.ts` | Wiring, district id |
| `apps/desktop/electron/ipc/handlers/deo/dashboard.ts`, `index.ts` (+ test), `ipc/registrar.ts`, `ipc/authorizeChannel.ts`, `preload/deo/index.ts`, preload root, `main/main.ts` | IPC |
| `packages/presentation/src/view-models/deo/deo-dashboard-view-model.ts`, `deo-dashboard-views.ts` (+ tests), `factories/create-presentation-layer.ts`, `testing/create-test-application.ts` | Presentation |
| `apps/desktop/renderer/services/nemis-bridge/deo/`, `lib/ipc/deo.ts`, `lib/ipc/index.ts`, `lib/presentation/hooks/deo.ts` | Renderer plumbing |
| `apps/desktop/renderer/components/deo/*`, `app/government/deo/page.tsx` (+ test), `app/government/deo/communications/page.tsx` | UI |

---

### Task 1: Server — the school-standing rule

**Files:**
- Create: `Nemis/apps/Server/src/common/district/school-standing.ts`
- Test: `Nemis/apps/Server/src/common/district/school-standing.spec.ts`

**Interfaces:**
- Produces:

```ts
export type AlertSeverityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type SchoolComplianceStatus = "Compliant" | "Needs Review" | "Flagged";
export type SchoolPerformanceStatus = "Good" | "Warning" | "Critical" | "No Data";
export interface SchoolStandingInput {
  records30: number;            // attendance records in the last 30 days
  attended30: number;           // of those, PRESENT or LATE
  daysSinceAttendance: number | null; // whole calendar days; null = never recorded
  termRunning: boolean;
  worstOpenAlert: AlertSeverityLevel | null;
  activeStudents: number;
  teachingStaff: number;
}
export interface SchoolStanding {
  attendanceRate: number | null;
  performanceStatus: SchoolPerformanceStatus;
  complianceStatus: SchoolComplianceStatus;
}
export function schoolStanding(input: SchoolStandingInput): SchoolStanding;
/** Whole calendar days from a YYYY-MM-DD date to `today` (also YYYY-MM-DD). */
export function daysBetween(dateIso: string, todayIso: string): number;
/** Highest of a list of severities, or null. */
export function worstSeverity(severities: readonly string[]): AlertSeverityLevel | null;
```

- [ ] **Step 1: Write the failing test.** One `it.each` over this table (base input: `records30: 100, attended30: 90, daysSinceAttendance: 0, termRunning: true, worstOpenAlert: null, activeStudents: 80, teachingStaff: 4`), each row overriding fields and asserting all three outputs:

| Override | rate | performance | compliance |
|---|---|---|---|
| none | 90 | Good | Compliant |
| attended30 80 | 80 | Good | Compliant |
| attended30 79 | 79 | Warning | Needs Review |
| attended30 60 | 60 | Warning | Needs Review |
| attended30 59 | 59 | Critical | Flagged |
| records30 0, attended30 0 | null | No Data | Compliant |
| records30 0, attended30 0, daysSinceAttendance null | null | No Data | Flagged |
| records30 0, attended30 0, daysSinceAttendance null, termRunning false | null | No Data | Compliant |
| daysSinceAttendance 3 | 90 | Good | Compliant |
| daysSinceAttendance 4 | 90 | Good | Needs Review |
| daysSinceAttendance 7 | 90 | Good | Needs Review |
| daysSinceAttendance 8 | 90 | Good | Flagged |
| daysSinceAttendance 8, termRunning false | 90 | Good | Compliant |
| worstOpenAlert CRITICAL | 90 | Good | Flagged |
| worstOpenAlert HIGH | 90 | Good | Needs Review |
| worstOpenAlert MEDIUM | 90 | Good | Compliant |
| activeStudents 160 (40:1) | 90 | Good | Compliant |
| activeStudents 161 | 90 | Good | Needs Review |
| teachingStaff 0 | 90 | Good | Needs Review |
| activeStudents 0, teachingStaff 0 | 90 | Good | Compliant |
| attended30 59, worstOpenAlert HIGH | 59 | Critical | Flagged |

Plus: `daysBetween("2026-11-13", "2026-11-16")` is 3; `daysBetween("2026-11-16", "2026-11-16")` is 0; `worstSeverity(["LOW","HIGH","MEDIUM"])` is `"HIGH"`; `worstSeverity([])` is null; an unknown severity string is ignored.

- [ ] **Step 2: Run** `pnpm --filter server exec jest src/common/district/school-standing.spec.ts` (use the package name in `apps/Server/package.json`). Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three functions. `attendanceRate` is `Math.round(attended30 / records30 * 100)`, null when `records30` is 0. `daysBetween` parses both as UTC midnight so DST cannot shift it.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(districts): school standing rule`.

---

### Task 2: Server — DISTRICT snapshot carries its own district and county

**Files:**
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` (the `counties` block near line 320 and the `tx.district.findMany` near line 416)
- Test: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`

**Interfaces:**
- Produces: for `scopeType === "DISTRICT"`, `data.districts` always includes the row whose id is `scope.districtId` (even with no schools), and `data.counties` holds that district's county row. Other scopes unchanged.

- [ ] **Step 1: Write failing tests** in the existing spec, following its existing mock style: (a) DISTRICT scope whose district has no institutions still gets `where` containing `{ id: scope.districtId }` in the district query's `OR`; (b) DISTRICT scope gets `counties` with the one county of its district; (c) INSTITUTION and TEACHER scopes still get `counties: []`; (d) COUNTY scope's district and county queries are unchanged.
- [ ] **Step 2: Run** the spec. Expected: the new cases FAIL.
- [ ] **Step 3: Implement.** District `where` for DISTRICT becomes `OR: [{ id: scope.districtId }, { institutions: { some: { id: institutionWhere } } }]`. `counties` for DISTRICT: `tx.county.findMany({ where: { districts: { some: { id: scope.districtId } } } })`. Neither is `since`-filtered.
- [ ] **Step 4: Run** the spec. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop-sync): district devices receive their district and county rows`.

---

### Task 3: Server — standings, report submissions, corrected dashboard formulas

**Files:**
- Modify: `Nemis/apps/Server/src/districts/districts.service.ts`, `districts.controller.ts`
- Test: `Nemis/apps/Server/src/districts/districts.school-standings.spec.ts` (new; mock Prisma the way `districts.enrollment-report.spec.ts` does)

**Interfaces:**
- Consumes: Task 1.
- Produces:

```ts
// GET /districts/:id/school-standings   @Roles(DEO, COUNTY_ADMIN, SUPER_ADMIN) + enforceDistrictAccess
getDistrictSchoolStandings(districtId: string, user?: UserContext): Promise<{
  feeCompliance: number;                  // mean collectionRate of schools with totalExpected > 0, rounded; 0 if none
  schools: Array<{
    id: string; name: string; code: string; levels: string[];
    students: number; teachers: number;
    attendanceRate: number | null;
    lastSubmissionAt: string | null;      // newest report.submittedAt for the school
    performanceStatus: SchoolPerformanceStatus;
    complianceStatus: SchoolComplianceStatus;
    feeCollectionRate: number | null;     // null when the school bills nothing
  }>;
}>;
// GET /districts/:id/report-submissions?page&limit   same roles and access check
getDistrictReportSubmissions(districtId: string, options: { page?: number; limit?: number }, user?: UserContext): Promise<{
  data: Array<{ id: string; schoolId: string; schoolName: string; title: string; type: string; submittedAt: string }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}>;
```

- Changed (same routes): `getDistrictSchoolPerformance` rows gain `attendanceRate: number | null` and status `"No Data"`; `enrollment` = active students; `teachersCount` = teaching staff; `lastSubmissionDate` = newest report `submittedAt`; `status` filter is applied before `skip`/`take` and `meta.total` counts the filtered set. `getDistrictChartData.attendanceTrend` counts LATE as attended. `getDistrictIncidents` and `markIncidentReviewed` accept an alert whose `districtId` is the district **or** whose `institution.districtId` is the district.

- [ ] **Step 1: Write failing tests:**
  - standings: a school with 10 records / 9 attended (one of them LATE) reports `attendanceRate: 90`; a school with no records reports `null` and `"No Data"`; `teachers` ignores a `PRINCIPAL`; `students` ignores an inactive student; `feeCompliance` averages only schools with `totalExpected > 0` (rates 80 and 40 plus one non-billing school → 60); `lastSubmissionAt` is the newest `submittedAt`.
  - standings access: a DEO of another district is refused (`ForbiddenException`).
  - report submissions: rows with `submittedAt: null` are excluded; ordering newest first; `meta.total` matches.
  - performance: `status: "Critical"` with 25 schools where the only Critical school sorts 14th returns it on page 1 and `meta.total` 1.
  - chart data: a month with 4 records (2 PRESENT, 1 LATE, 1 ABSENT) plots 75.
  - incidents: an unresolved alert with `districtId: null` and an institution in the district is returned; `markIncidentReviewed` resolves it; an alert of another district's school throws `BadRequestException`.
- [ ] **Step 2: Run** `jest src/districts/districts.school-standings.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Per-school inputs come from grouped queries, not one query per school: `attendance.groupBy({ by: ["classId","status"] })` joined to class→institution for the 30-day window; latest attendance date per school; terms covering today; unresolved alerts by `institutionId`; active student and teaching-staff counts by institution. Fee figures from the existing `this.financeSummary.summarizeInstitutions(schoolIds)`. Levels from `institution.levels` (the relation the snapshot already includes). `today` is the server's local date.
- [ ] **Step 4: Run** the new spec and `jest src/districts`. Expected: PASS, no regressions.
- [ ] **Step 5: Commit** `feat(districts): real school standings and report submissions for the DEO dashboard`.

---

### Task 4: Web — dashboard uses the real figures

**Files:**
- Create: `Nemis/apps/portal-web/src/lib/deo-dashboard.ts`, `deo-dashboard.test.ts`
- Modify: `Nemis/apps/portal-web/src/store/deo/Api/deoApi.ts`, `store/deo/index.ts`, `app/government/deo/page.tsx`, `components/deo/DEOBanner.tsx`, `components/deo/SchoolsAtGlance.tsx`

**Interfaces:**
- Consumes: Task 3 routes.
- Produces:

```ts
export function greetingFor(hour: number): "Good morning" | "Good afternoon" | "Good evening";
/** "District Education Officer · Buchanan · Grand Bassa · Saturday, November 14, 2026" — missing parts are skipped. */
export function bannerLine(parts: { title: string; district?: string | null; county?: string | null; date: Date }): string;
/** ["PRIMARY","JUNIOR_HIGH"] → "Primary, Junior High"; [] → "—". */
export function formatLevels(levels: readonly string[]): string;
useGetDistrictSchoolStandingsQuery({ districtId })
useGetDistrictReportSubmissionsQuery({ districtId, page, limit })
```

- [ ] **Step 1: Write failing tests** for the three helpers: hours 0, 11, 12, 16, 17, 23; `bannerLine` with both names, with county missing, with both missing (no doubled separators, no placeholder words); `formatLevels` for one, two and zero levels.
- [ ] **Step 2: Run** `pnpm --filter portal-web exec vitest run src/lib/deo-dashboard.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers and the two RTK queries (tag `"Schools"` and `"Submissions"`).
- [ ] **Step 4: Update the page and components:**
  - Banner: greeting from `greetingFor(new Date().getHours())`; line from `bannerLine` with names from the existing `useGetDistrictSettingsQuery` (`profile.districtName`, `profile.countyName`); render the banner even while the overview is loading.
  - Fee Compliance card: `standings.feeCompliance`. Remove the `liveMetrics` memo.
  - `SchoolsAtGlance` takes standings rows: level via `formatLevels`, students, attendance (`—` when null), `complianceStatus`. "View All →" becomes a `Link` to `/government/deo/schools`.
  - Performance table: `—` for a null rate; a neutral `bg-gray-100 text-gray-700` chip for "No Data".
  - Data Submission Monitoring: `useGetDistrictReportSubmissionsQuery`; columns School, Report, Type, Date; `colSpan={4}` on the empty row.
  - KPI skeleton count 8 → 4.
- [ ] **Step 5: Run** the helper test again plus `pnpm --filter portal-web exec vitest run` and `pnpm --filter portal-web exec tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 6: Commit** `fix(deo): dashboard shows real standings, names and submissions`.

---

### Task 5: Desktop — wire types and the rule

**Files:**
- Create: `packages/types/src/deo-dashboard.ts`, `packages/application/src/use-cases/deo/school-standing.ts`, `school-standing.test.ts`
- Modify: `packages/types/src/index.ts`, `ipc.ts`, `api.ts`

**Interfaces:**
- Produces (`packages/types/src/deo-dashboard.ts`):

```ts
export type SchoolComplianceStatus = 'Compliant' | 'Needs Review' | 'Flagged';
export type SchoolPerformanceStatus = 'Good' | 'Warning' | 'Critical' | 'No Data';
export interface DeoAlert { id: string; type: string; severity: string; title: string; description: string; institutionId: string | null; createdAt: string }
export interface DeoAlertSummary { total: number; critical: number; high: number; medium: number; low: number }
export interface DeoSchoolRow {
  id: string; name: string; code: string; levels: string[];
  students: number; teachers: number;
  attendanceRate: number | null; lastSubmissionAt: string | null;
  performanceStatus: SchoolPerformanceStatus; complianceStatus: SchoolComplianceStatus;
  feeCollectionRate: number | null;
}
export interface DeoSubmissionRow { id: string; schoolName: string; title: string; type: string; submittedAt: string }
export interface DeoChartData {
  enrollmentTrend: { period: string; enrollment: number }[];
  attendanceTrend: { period: string; rate: number }[];
  genderDistribution: { male: number; female: number };
}
export interface DeoDashboardResult {
  districtId: string | null;                 // null = no district assigned
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  stats: { totalSchools: number; totalStudents: number; totalTeachers: number; feeCompliance: number };
  alerts: DeoAlert[];                        // unresolved, worst first, max 50
  alertSummary: DeoAlertSummary;
  schools: DeoSchoolRow[];                   // active, by name
  chartData: DeoChartData;
  submissions: DeoSubmissionRow[];           // newest first, max 50
}
export interface DeoApi {
  getDashboard(): Promise<DeoDashboardResult>;
  resolveAlert(alertId: string): Promise<boolean>;
}
```

- `ipc.ts`: `DEO_GET_DASHBOARD: 'deo:get-dashboard'`, `DEO_RESOLVE_ALERT: 'deo:resolve-alert'`. `api.ts`: `NemisApi` gains `deo: DeoApi`.
- `school-standing.ts` exports the same names and signatures as Task 1 (`schoolStanding`, `daysBetween`, `worstSeverity`, `SchoolStandingInput`, `SchoolStanding`), using the status types from `@nemis-desktop/types`.

- [ ] **Step 1: Write the failing test** `school-standing.test.ts` with the **identical** case table and extra assertions as Task 1. Header comment: "Keep in step with Nemis/apps/Server/src/common/district/school-standing.spec.ts".
- [ ] **Step 2: Run** `pnpm vitest run packages/application/src/use-cases/deo/school-standing.test.ts`. Expected: FAIL.
- [ ] **Step 3: Add the types, channels and `DeoApi`; implement the rule.**
- [ ] **Step 4: Run** the test and `pnpm typecheck`. Expected: PASS; typecheck fails only where `NemisApi.deo` is not yet provided (preload) — note the file, Task 8 fixes it. If that blocks the commit, add `deo` to `NemisApi` in Task 8 instead and leave `DeoApi` exported here.
- [ ] **Step 5: Commit** `feat(deo): dashboard wire types and school standing rule`.

---

### Task 6: Desktop — ports, use cases, application service

**Files:**
- Create: `packages/application/src/interfaces/deo/district-overview-read-model.ts`, `district-alert-store.ts`, `index.ts`; `testing/deo/in-memory-district-overview.ts`; `use-cases/deo/get-deo-dashboard.ts`, `resolve-district-alert.ts`, `get-deo-dashboard.test.ts`, `resolve-district-alert.test.ts`; `services/deo-application-service.ts`
- Modify: `packages/application/src/factories/create-application-layer.ts` (+ its test), `src/index.ts`, `packages/presentation/src/testing/create-test-application.ts`

**Interfaces:**
- Consumes: Task 5; `ICountyFinanceReadModel.listSchools(): CountySchoolFinanceRow[]` (existing; fields `institutionId`, `totalExpected`, `collectionRate`).
- Produces:

```ts
export interface DistrictSchoolRef { id: string; name: string; code: string; levels: string[] }
export interface DistrictAlertRow { id: string; type: string; severity: string; title: string; description: string; institutionId: string | null; createdAt: string }
export interface DistrictReportRow { id: string; schoolId: string; schoolName: string; title: string; type: string; submittedAt: string }

/** Raw district rows and counts. No arithmetic: the use case owns it. Every
 * method is limited to active institutions whose districtId is the argument. */
export interface IDistrictOverviewReadModel {
  getDistrict(districtId: string): { id: string; name: string; countyId: string } | null;
  getCounty(countyId: string): { id: string; name: string } | null;
  listActiveSchools(districtId: string): DistrictSchoolRef[];                         // by name
  countActiveStudentsBySchool(districtId: string): { institutionId: string; count: number }[];
  countTeachingStaffBySchool(districtId: string): { institutionId: string; count: number }[];
  countActiveStudentsByGender(districtId: string): { gender: string; count: number }[];
  listActiveStudentCreations(districtId: string, sinceIso: string): { createdAt: string }[];
  attendanceBySchool(districtId: string, sinceDate: string): { institutionId: string; records: number; attended: number }[];
  lastAttendanceDateBySchool(districtId: string): { institutionId: string; date: string }[];  // YYYY-MM-DD
  attendanceByMonth(districtId: string, sinceDate: string): { month: string; records: number; attended: number }[]; // month = YYYY-MM
  schoolsWithRunningTerm(districtId: string, today: string): string[];
  listOpenAlerts(districtId: string): DistrictAlertRow[];                             // the district's or its schools'; unordered
  listSubmittedReports(districtId: string, limit: number): DistrictReportRow[];       // newest first
  lastSubmissionBySchool(districtId: string): { institutionId: string; submittedAt: string }[];
}
export interface IDistrictAlertStore {
  /** Marks an unresolved alert of this district (or one of its schools) resolved. False when nothing changed. */
  resolve(districtId: string, alertId: string, resolvedBy: string, at: string): boolean;
}
export class DeoApplicationService {
  getDashboard(): Promise<ApplicationResponse<DeoDashboardResult>>;
  resolveAlert(alertId: string): Promise<ApplicationResponse<boolean>>;
}
```

- `ApplicationPorts` gains `currentDistrictId: string | null`, `districtOverview: IDistrictOverviewReadModel`, `districtAlerts: IDistrictAlertStore`. `ApplicationLayer` gains `deo: DeoApplicationService`.

- [ ] **Step 1: Write failing use-case tests** (clock fixed at `2026-11-16T12:00:00.000Z`, the pattern of `get-county-dashboard.test.ts`):
  - no district: `currentDistrictId: null` → `districtId: null`, `district: null`, every list empty, all stats 0; the read model is never called.
  - names: district row present and county row present → both set; county row absent → `county: null`; district row absent → `district: null` with `districtId` still set.
  - stats: schools 2, students = sum of per-school counts, teachers = sum; `feeCompliance` 60 from finance rows `{totalExpected:100, collectionRate:80}`, `{totalExpected:50, collectionRate:40}`, `{totalExpected:0, collectionRate:0}`; 0 when no school bills.
  - school rows: joins counts by institution id; a school missing from a count list gets 0; `attendanceRate` and both statuses come from `schoolStanding` (assert one Flagged-by-staleness school: last date `2026-11-07`, term running → Flagged; same school with term not running → Compliant); `feeCollectionRate` null for a non-billing school.
  - alerts: ordered CRITICAL, HIGH, MEDIUM, LOW then newest first; capped at 50 while `alertSummary.total` counts all; `worstOpenAlert` uses only alerts with that school's `institutionId`.
  - enrollment trend: 6 points labelled `Jun 2026` … `Nov 2026`; cumulative; students created before the window (or with none in the list) form the base (`total − created.length`).
  - attendance trend: 6 points; a month absent from the read model plots 0; `{records:4, attended:3}` plots 75.
  - submissions: passes limit 50; maps rows through.
- [ ] **Step 2: Write failing tests for `ResolveDistrictAlertUseCase`:** no district → `false` and the store is not called; otherwise calls `resolve(districtId, alertId, currentUserId, clock.now())` and returns its result.
- [ ] **Step 3: Run** `pnpm vitest run packages/application/src/use-cases/deo`. Expected: FAIL.
- [ ] **Step 4: Implement** ports, fakes (public mutable fields, like `InMemoryCountyAnalyticsReadModel`), use cases, service, and the factory wiring. Trend month arithmetic copies `getDistrictChartData` (`setMonth(now.getMonth() - 5)` then `setDate(1)`), in device-local time. `today` is the local date as `YYYY-MM-DD`; the 30-day window starts at `today − 30 days`.
- [ ] **Step 5: Run** the folder plus `packages/application/src/factories`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(deo): dashboard use cases and application service`.

---

### Task 7: Desktop — SQLite adapters

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.ts`, `SqliteDistrictAlertStore.ts`, and a `.test.ts` for each
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts`, `data/adapters/createApplicationComposition.ts`, `workspace/WorkspaceManager.ts`

**Interfaces:**
- Consumes: Task 6 ports.
- Produces: `dataLayer.repositories.districtOverview`, `dataLayer.repositories.districtAlerts`; `createApplicationComposition(dataLayer, currentUserId, currentDistrictId, logger?)` where `WorkspaceManager` passes `user.scope.districtId ?? null`.

- [ ] **Step 1: Write failing read-model tests** on a real database (`createTestContext`, seed helpers as in `SqliteCountyAnalyticsReadModel.test.ts`, plus helpers for `classes`, `attendance`, `terms`/`academic_years`, `alerts`, `reports`, `counties`):
  - empty device: every list is `[]`, `getDistrict` and `getCounty` are null.
  - scoping: a school in another district, and an inactive school, appear in no result.
  - `listActiveSchools` orders by name and reads `levels` from `profile.levels`.
  - counts: inactive students and inactive or non-teaching staff are excluded.
  - `attendanceBySchool`: only records on or after `sinceDate`; PRESENT and LATE count as attended, ABSENT and EXCUSED do not; rows are attributed through `classes.institutionId`.
  - `lastAttendanceDateBySchool`: the max date per school; a school with none is absent from the list.
  - `attendanceByMonth`: groups by `YYYY-MM`.
  - `schoolsWithRunningTerm`: includes a school whose term spans today (inclusive on both ends); excludes one whose term ended yesterday.
  - `listOpenAlerts`: includes an alert with `districtId` = district and one with only `institutionId` of a district school; excludes resolved ones, a county-only alert, and another district's alert.
  - `listSubmittedReports` / `lastSubmissionBySchool`: skip rows with null `submittedAt`; newest first; respect the limit.
  - older server: with no `counties` row `getCounty` is null and nothing throws.
- [ ] **Step 2: Write failing alert-store tests:** resolving an open district alert sets `isResolved = 1`, `resolvedAt`, `resolvedBy`, `updatedAt`, returns true and adds one outbox row for `alerts`; resolving it again returns false and adds none; a county-only alert and another district's alert return false and stay unresolved.
- [ ] **Step 3: Write the failing scale guard:** seed 100 schools × 4 classes and 200,000 attendance rows across the last 60 days in one transaction; assert `attendanceBySchool`, `lastAttendanceDateBySchool` and `attendanceByMonth` together finish in under 1,500 ms.
- [ ] **Step 4: Run** `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrict`. Expected: FAIL.
- [ ] **Step 5: Implement** both adapters (`StatementCache`, `guarded`, as the County read models do) and the wiring. If the scale guard fails, add a migration with an index on `attendance (date, classId)` and register it in `database/migrations/registry.ts`; otherwise add none.
- [ ] **Step 6: Run** the same command plus `apps/desktop/electron/workspace` and `apps/desktop/electron/data/adapters`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(deo): SQLite district overview read model and alert store`.

---

### Task 8: Desktop — IPC, authorisation, preload

**Files:**
- Create: `apps/desktop/electron/ipc/handlers/deo/dashboard.ts`, `index.ts`, `dashboard.test.ts`; `apps/desktop/electron/preload/deo/index.ts`
- Modify: `apps/desktop/electron/ipc/registrar.ts`, `ipc/authorizeChannel.ts` (+ `.test.ts`), the preload root that spreads `countyApi`, `apps/desktop/electron/main/main.ts`

**Interfaces:**
- Consumes: `app.deo` (Task 6), channels (Task 5).
- Produces: `registerDeoDashboardHandlers(handle: IpcHandle, app: ApplicationLayer): void`; `DEO_CHANNELS: ReadonlySet<IpcChannel>`; `window.nemis.deo: DeoApi`.

- [ ] **Step 1: Write failing tests:**
  - handler: `DEO_GET_DASHBOARD` rejects any argument and returns `app.deo.getDashboard()`'s data; `DEO_RESOLVE_ALERT` requires exactly one string id (rejects none, two, a number, an over-long string) and returns the boolean.
  - authorisation: both channels pass for `DEO`; each of `COUNTY_ADMIN`, `MINISTRY_ADMIN`, `INSTITUTION_ADMIN`, `INSTITUTION_STAFF`, `TEACHER` gets `ForbiddenError('This view requires a district education officer workspace.')`; a DEO is still refused on `COUNTY_GET_DASHBOARD`.
- [ ] **Step 2: Run** `pnpm vitest run apps/desktop/electron/ipc`. Expected: FAIL.
- [ ] **Step 3: Implement.** Validators `assertNoArgs` and `assertSingleIdArg`. Register next to `registerCountyDashboardHandlers`. Add `deo: deferredMember(get, 'deo')` to `deferredApplication`.
- [ ] **Step 4: Run** the folder and `pnpm typecheck`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(deo): dashboard IPC channels restricted to DEO`.

---

### Task 9: Desktop — presentation

**Files:**
- Create: `packages/presentation/src/view-models/deo/deo-dashboard-view-model.ts`, `deo-dashboard-views.ts`, `deo-dashboard-view-model.test.ts`, `deo-dashboard-views.test.ts`
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts`, `src/index.ts`

**Interfaces:**
- Consumes: `DeoApplicationService` (Task 6).
- Produces:

```ts
export type DeoDashboardView = DeoDashboardResult;   // the page reads the wire shape
export interface DeoDashboardState { readonly summary: AsyncState<DeoDashboardView>; readonly resolvingAlertId: string | null }
export class DeoDashboardViewModel {
  readonly store: StoreApi<DeoDashboardState>;
  loadDashboard(): Promise<void>;
  /** Resolves, then reloads. Clears resolvingAlertId either way. */
  resolveAlert(alertId: string): Promise<void>;
}
// deo-dashboard-views.ts — pure helpers the page uses
export const PAGE_SIZE = 10;
export function filterPerformance(schools: readonly DeoSchoolRow[], search: string, status: '' | 'Good' | 'Warning' | 'Critical'): DeoSchoolRow[];
export function pageOf<T>(rows: readonly T[], page: number): { rows: T[]; page: number; totalPages: number; total: number };
export function filterAlerts(alerts: readonly DeoAlert[], severity: string): DeoAlert[];
export function greetingFor(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening';
export function bannerLine(parts: { title: string; district?: string | null; county?: string | null; date: Date }): string;
export function formatLevels(levels: readonly string[]): string;
```

- `PresentationLayer.viewModels.deoDashboard`.

- [ ] **Step 1: Write failing tests.** Helpers: search is case-insensitive on name and trims; status filter applies to the whole list; `pageOf` clamps a page past the end to the last page and returns `totalPages: 1` for an empty list; `filterAlerts('')` returns all; greeting, banner and levels cases as in Task 4. View model: `loadDashboard` moves idle → loading → ready with the data; an application failure lands in the error state; `resolveAlert` calls the service once, reloads, and leaves `resolvingAlertId` null, including when the service throws.
- [ ] **Step 2: Run** `pnpm vitest run packages/presentation/src/view-models/deo`. Expected: FAIL.
- [ ] **Step 3: Implement** with `trackQuery`, as `CountyDashboardViewModel` does.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(deo): dashboard view model and page helpers`.

---

### Task 10: Desktop — renderer

**Files:**
- Create: `apps/desktop/renderer/services/nemis-bridge/deo/dashboard-bridge.ts`; `components/deo/DEOBanner.tsx`, `AlertsAndActions.tsx`, `SchoolsAtGlance.tsx`, `charts/EnrollmentTrendChart.tsx`, `charts/GenderDistributionChart.tsx`, `charts/AttendanceTrendChart.tsx`, `DeoDashboardPage.tsx`; `app/government/deo/communications/page.tsx`; `app/government/deo/page.test.tsx`
- Modify: `services/nemis-bridge/deo/index.ts`, `lib/ipc/deo.ts`, `lib/ipc/index.ts`, `lib/presentation/hooks/deo.ts`, `app/government/deo/page.tsx`

**Interfaces:**
- Consumes: `window.nemis.deo` (Task 8), `DeoDashboardViewModel` and helpers (Task 9).
- Produces: `deoBridge.getDashboard()`, `deoBridge.resolveAlert(id)`; `deoIpc.deo` group on the IPC application layer; `useDeoDashboardViewModel()`.

- [ ] **Step 1: Write the failing page test** (the style of `app/government/county/page.test.tsx`):
  - loaded: renders the greeting, the DEO's name, district and county names, the four KPI values, a school row in Schools at a Glance with its compliance chip, and "—" for a school with a null rate.
  - `districtId: null`: renders "No District Assignment" and none of the KPI labels.
  - county missing: the banner line has no "County" word and no doubled separator.
  - Mark Reviewed: clicking it calls `resolveAlert` with the alert id.
  - performance filter: choosing "Critical" shows only Critical schools across what would have been page 2.
- [ ] **Step 2: Run** `pnpm vitest run apps/desktop/renderer/app/government/deo/page.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement the plumbing** (bridge, `lib/ipc/deo.ts` as a `group<DeoApplicationService>('deo', …)` using `query`, composed into `createIpcApplicationLayer`, hook).
- [ ] **Step 4: Port the UI** from `Nemis/apps/portal-web/src/app/government/deo/page.tsx` and `components/deo/*`, keeping class names from the reference doc §4.1, with these differences: data from `useViewModel(vm.store, …)`; `useRevalidateOnSync(() => void vm.loadDashboard(), [vm])`; search, status, severity and page state stay in `useState` and feed the Task 9 helpers; submissions table columns School, Report, Type, Date; the user's name and avatar from the same session source the County dashboard page uses; "View All →" and the quick actions are `next/link` links; `YearClosuresPanel` rendered after Quick Actions inside the same `px-6` body; `app/government/deo/page.tsx` renders `DeoDashboardPage` only. `communications/page.tsx` is `<ComingSoon title="Communications" />`.
- [ ] **Step 5: Run** the page test, then `pnpm lint`, `pnpm typecheck`, and `pnpm --filter @nemis-desktop/app build:renderer`. Expected: PASS, 0 errors, build succeeds.
- [ ] **Step 6: Commit** `feat(deo): offline dashboard page`.

---

### Task 11: Verification gate

- [ ] **Step 1 (desktop):** `pnpm lint` → 0 errors; `pnpm typecheck` → 0 errors; `pnpm test` → all pass except the known pre-existing failures (`county/page.test.tsx`, `teacher/timetable.test.tsx`); list any other failure and fix it.
- [ ] **Step 2 (server):** `tsc --noEmit` → 0 errors; `jest` → all pass.
- [ ] **Step 3 (web):** `vitest run` → all pass; `tsc --noEmit` → 0 errors.
- [ ] **Step 4:** Re-read the spec's section 3 table row by row against the built page and the Calls made list; fix any drift.
- [ ] **Step 5:** Remove the temporary Node-ABI `better-sqlite3` binary from `build/Debug`.
- [ ] **Step 6:** Report what passed, what could not be verified without the GUI (packaged build, a real synced district), and the release order (server first).
