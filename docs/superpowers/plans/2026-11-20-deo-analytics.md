# DEO Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The DEO Analytics page shows only honest figures, built from the same data as the dashboard, Schools and Alerts pages. It works on the web and offline on the desktop, with one identical rules file per app.

**Architecture:**
- No server change.
- Web: a pure `lib/deo-analytics.ts` computes KPIs, insights and chart series from four existing queries (overview, chart data, school standings, incidents summary). The page renders the result.
- Desktop: the same rules in `deo-analytics-views.ts` take their input from the existing dashboard view model. A new page and three ported charts render it.

**Tech Stack:** Next.js + RTK Query + Recharts + Vitest (portal-web), and the Electron renderer + presentation layer + Vitest (desktop).

**Spec:** `docs/superpowers/specs/2026-11-20-deo-analytics-design.md` (desktop-client-nemis repo)

**Branches:** `feat/deo-analytics` in both repos, from `main`. Tasks 1–2 are in Nemis portal-web; Tasks 3–5 are in desktop-client-nemis.

## Global Constraints

### Rules interface (identical on both apps; names verbatim)

```ts
export interface AnalyticsSchool { id: string; name: string; students: number; teachers: number; attendanceRate: number | null; performanceStatus: string }
export interface AnalyticsInput {
  totalStudents: number;
  chartData: { enrollmentTrend: { period: string; enrollment: number }[]; attendanceTrend: { period: string; rate: number }[]; genderDistribution: { male: number; female: number } };
  schools: AnalyticsSchool[];
  openAlerts: number;
}
export interface AnalyticsKpis { totalStudents: number; enrollmentChangePct: number | null; attendanceRate: number | null; attendanceChange: number | null; malePct: number | null; femalePct: number | null; schoolsGood: number; schoolsWarningOrCritical: number; schoolsNoData: number }
export interface AnalyticsInsight { id: string; text: string; type: "success" | "warning" | "danger" | "info" }
export function analyticsKpis(input: AnalyticsInput): AnalyticsKpis;
export function analyticsInsights(input: AnalyticsInput): AnalyticsInsight[];
export function enrollmentBySchool(schools: AnalyticsSchool[]): { schoolId: string; name: string; students: number }[];      // top 10 by students desc, then name
export function attendanceBySchool(schools: AnalyticsSchool[]): { rows: { schoolId: string; name: string; rate: number }[]; withoutData: number }; // non-null only, lowest rate first, top 10; withoutData = null count
export function teacherAnalytics(schools: AnalyticsSchool[]): { total: number; schoolsWithTeachers: number; avgPerSchool: number; bySchool: { schoolId: string; name: string; teachers: number }[] }; // bySchool top 10 by teachers desc, then name
export function schoolComparison(schools: AnalyticsSchool[]): { schoolId: string; name: string; students: number; attendanceRate: number | null; teachers: number }[]; // top 12 by students desc, then name
```

### KPI rules

- **`enrollmentChangePct`:** taken from the last two `enrollmentTrend` points, `Math.round((latest − previous) / previous × 100)`. It is `null` when there are fewer than 2 points or `previous` is 0.
- **`attendanceRate`:** the latest `attendanceTrend` rate that is > 0, else `null`. A rate of 0 means "no records that month".
- **`attendanceChange`:** that rate minus the rate of the month **immediately before it**, only when that earlier rate is also > 0. Otherwise `null`.
- **Gender:** `malePct = Math.round(male / (male + female) × 100)` and `femalePct = 100 − malePct`. Both are `null` when the total is 0.
- **School counts:**
  - `schoolsGood` counts `performanceStatus === "Good"`;
  - `schoolsWarningOrCritical` counts `"Warning"` and `"Critical"`;
  - `schoolsNoData` counts `"No Data"`.

### Insights

The insights below appear in this order, each only when its condition holds. Ids are `insight-0`, `insight-1` and so on, in output order.

1. **Enrollment change:** when `enrollmentChangePct` > 0, `Enrollment increased by ${X}% compared to last month (${prev.period} → ${latest.period}).` (success). When it is < 0, `Enrollment decreased by ${|X|}% compared to last month (${prev.period} → ${latest.period}).` (warning).
2. **Attendance change:** when `attendanceChange` < −5, `Average attendance dropped by ${|d|} percentage points from ${prevPeriod} to ${latestPeriod}.` (danger). When it is > 5, `Average attendance improved by ${d} percentage points from ${prevPeriod} to ${latestPeriod}.` (success).
3. **District attendance:** when `attendanceRate` is not null and < 60, `District-wide attendance rate (${r}%) is below 60%.` (danger). Otherwise, when it is < 80, `District-wide attendance rate (${r}%) is below 80%.` (warning).
4. **Critical schools:** for n Critical > 0, `${n} school${n>1?"s":""} ${n>1?"are":"is"} in critical status (attendance below 60%).` (danger).
5. **Warning schools:** for n Warning > 0, `${n} school${n>1?"s":""} ${n>1?"have":"has"} warning status (attendance 60–80%).` (warning).
6. **No attendance data:** for n No Data > 0, `${n} school${n>1?"s have":" has"} no attendance recorded in the last 30 days.` (info).
7. **Open alerts:** for `openAlerts` = n > 0, `There ${n===1?"is":"are"} ${n} open alert${n>1?"s":""} requiring attention.` (danger when n > 3, else warning).
8. **Gender imbalance:** for gender gap = `|malePct − femalePct|` > 20, `Significant gender imbalance: ${malePct}% male, ${femalePct}% female (${gap}pt gap).` (warning).
9. **Fallback:** when none of the above apply, a single `All metrics are within normal ranges. No issues detected.` (success).

### Page

- **Header:** district · county.
- **No academic-year or term dropdowns.**
- **KPI "Warning + Critical"** has the subtitle `No data: ${n}` when n > 0.
- **Attendance-by-school chart** has a caption `${n} schools without attendance data` when n > 0.
- **"No data"** shows where a KPI is `null`.
- **Teacher analytics** shows total, schools with teachers, average per school and the top 10. There is no Active or Inactive figure.
- **School comparison** draws a null attendance as a gap.

### Sidebar (both apps)

`Analytics`, href `/government/deo/analytics`, Lucide `BarChart3`, right after Generate Reports. On the web, also add a `pageTitles` entry `"/government/deo/analytics": "Analytics"`.

### Repo rules

- Never commit `apps/portal-web/tsconfig.tsbuildinfo`.
- Stage files by name. No pushes.
- Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A district that recorded no attendance:** every trend month is 0 and every school is No Data. The page reads "No data" for attendance, makes no Critical, Warning or attendance-threshold claims, and shows the no-data insight. Tested in Tasks 1 and 3.
2. **A district with no schools or no pupils:** empty arrays. Nothing crashes, the KPIs read 0 or No data, and the fallback insight shows. Tested in Tasks 1 and 3.
3. **Two schools with the same name:** they stay separate rows in every by-school series. Tested in Tasks 1 and 3.
4. **Exactly one school or alert:** the singular copy is used. Tested in Tasks 1 and 3.
5. **An attendance change of exactly ±5:** no insight. Tested in Tasks 1 and 3.

---

### Task 1: Web analytics rules (Nemis portal-web)

**Files:**
- Create: `apps/portal-web/src/lib/deo-analytics.ts`
- Create: `apps/portal-web/src/lib/deo-analytics.test.ts`

**Interfaces:** produces the Global Constraints rules interface, verbatim.

- [ ] **Step 1: Write the failing tests**, one `describe` per function:
  - **KPIs:**
    - `enrollmentChangePct` is 10 for 100 → 110, `null` for a single point, `null` when the previous value is 0;
    - `attendanceRate` is 70 for trend `[0, 65, 70]`, and `attendanceChange` is 5 for the same trend;
    - trend `[60, 0, 70]` gives `attendanceRate` 70 and `attendanceChange` `null` (the month before is 0);
    - all-zero trend → `attendanceRate` `null`;
    - gender 30/70 → `malePct` 30, `femalePct` 70; gender 0/0 → both `null`;
    - school counts with Good, Warning, Critical and No Data each present.
  - **Insights**, each with its exact text and type:
    - enrollment up and down;
    - attendance change −6 → dropped, +6 → improved, ±5 → none;
    - district rate 55 → below-60 danger, 75 → below-80 warning, 85 → none, `null` → none;
    - 1 Critical → "1 school is in critical status (attendance below 60%)."; 2 Critical → "2 schools are…";
    - Warning singular and plural;
    - No Data singular "1 school has no attendance recorded in the last 30 days." and plural "…schools have…";
    - open alerts 1 → "There is 1 open alert requiring attention." (warning), 4 → "There are 4 open alerts…" (danger);
    - gender gap 22 → imbalance, 20 → none;
    - fallback when nothing applies;
    - ids `insight-0…` in order;
    - an all-zero trend with all No Data schools produces no attendance-threshold and no Critical insight.
  - **By-school series:**
    - two schools both named "St. Mary" with different ids stay as two rows in `enrollmentBySchool`, `teacherAnalytics.bySchool` and `schoolComparison`;
    - `attendanceBySchool` excludes nulls, sorts lowest first and counts `withoutData`;
    - top-N limits: 10, 10 and 12;
    - ties are broken by name;
    - `teacherAnalytics` on `[]` gives `{ total: 0, schoolsWithTeachers: 0, avgPerSchool: 0, bySchool: [] }`.
- [ ] **Step 2:** From `apps/portal-web`, run `pnpm vitest run src/lib/deo-analytics.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same run, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(deo): analytics rules built on the shared figures`.

### Task 2: Web Analytics page (Nemis portal-web)

**Files:**
- Modify: `apps/portal-web/src/app/government/deo/analytics/page.tsx`. Rewrite it onto the four queries and Task 1's functions, as follows:
  - **Queries:**
    - `useGetDistrictOverviewQuery` → `totalStudents`;
    - `useGetDistrictChartDataQuery`;
    - `useGetDistrictSchoolStandingsQuery({ districtId })` → `schools`, mapped to `AnalyticsSchool`;
    - `useGetDistrictIncidentsQuery({ districtId })` → `summary.total` as `openAlerts`;
    - `useGetDistrictSettingsQuery` for the header.
  - **Remove** the year/term state and dropdowns, `useGetDistrictSchoolPerformanceQuery`, `useGetDistrictTeachersQuery` and `asLegacyPerformance`.
  - **Keep** the section layout, skeletons and chart components. Map Task 1's series to each chart's existing props.
  - The Refresh button refetches all five queries.
  - **Error state:** "Failed to load analytics." with `Retry` (refetch all), shown when any query errors and data is missing.
- Delete: `apps/portal-web/src/components/deo/analytics/useAnalyticsInsights.ts`, if nothing else imports it (grep first).
- Modify: `apps/portal-web/src/components/sidebarConfig.ts`: add the nav item and the `pageTitles` entry, as in Global Constraints.
- Create: `apps/portal-web/src/app/government/deo/analytics/page.test.tsx`, mocked like `deo/reports/page.test.tsx`. Mock the chart components (`next/dynamic`) to simple stubs.

- [ ] **Step 1: Write the failing page tests:**
  - **Header and dropdowns:** the district · county header shows, and there is no `select` element.
  - **No Data school:** a fixture with one Good, one Critical and one No Data school shows "Warning + Critical" as 1 with the subtitle `No data: 1`. Insights include "1 school is in critical status…" and "1 school has no attendance recorded in the last 30 days.".
  - **Removed text:** no text matching `/pending review/` and none matching `/not submitted data/`.
  - **Open alerts:** the incidents summary total of 4 gives "There are 4 open alerts requiring attention.".
  - **Teacher analytics:** two same-named schools appear as two rows. There is no `Inactive` text.
  - **No attendance:** an all-zero attendance trend shows the attendance KPI as `No data`.
- [ ] **Step 2:** Run `pnpm vitest run src/app/government/deo/analytics/page.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm typecheck`, `pnpm lint` and `pnpm test` (full). Expected: PASS.
- [ ] **Step 5: Commit:** `feat(deo): honest Analytics page, reachable from the sidebar`.

### Task 3: Desktop analytics rules (desktop-client-nemis)

**Files:**
- Create: `packages/presentation/src/view-models/deo/deo-analytics-views.ts` (+ `deo-analytics-views.test.ts`). It mirrors Task 1 exactly: the same exported names, types, rules and copy. Port Task 1's test file case for case.
- Add an `analyticsInputFromDashboard(result: DeoDashboardResult): AnalyticsInput`:
  - `totalStudents` = `stats.totalStudents`;
  - `chartData` = `chartData`;
  - `schools` from `schools`, each mapped to `{ id, name, students, teachers, attendanceRate, performanceStatus }`;
  - `openAlerts` = `alertSummary.total`.
- Export it from the presentation package index, as the other `deo-*-views` are.

- [ ] **Step 1:** Port the tests, and add one for `analyticsInputFromDashboard`.
- [ ] **Step 2:** Run `pnpm vitest run packages/presentation/src/view-models/deo/deo-analytics-views.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same run, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(deo): analytics rules on the desktop`.

### Task 4: Desktop chart components (desktop-client-nemis)

**Files:**
- Create in `apps/desktop/renderer/components/deo/charts/`: `EnrollmentBySchoolChart.tsx`, `AttendanceComparisonChart.tsx` and `SchoolComparisonChart.tsx`.
  - Port them from `Nemis/apps/portal-web/src/components/deo/charts/` (same props, markup and Recharts usage), following how the three existing desktop charts were ported, including any desktop import or theme differences.
  - `SchoolComparisonChart` must draw a null `attendanceRate` as a gap (Recharts `connectNulls={false}` on a line, or skip the bar).
- Test: a small render test per chart (mock `recharts`' `ResponsiveContainer` the way any existing desktop chart test does, if one exists). Each test asserts it renders with the given data and with empty data, without throwing.

- [ ] **Step 1:** Write the render tests.
- [ ] **Step 2:** Run them. Expected: FAIL (the modules are missing).
- [ ] **Step 3:** Port the charts.
- [ ] **Step 4:** Run them, then `pnpm --filter @nemis-desktop/app typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(deo): port the by-school analytics charts to the desktop`.

### Task 5: Desktop Analytics page and sidebar (desktop-client-nemis)

**Files:**
- Create: `apps/desktop/renderer/components/deo/DeoAnalyticsPage.tsx`.
  - It reproduces the web page as Task 2 leaves it (`Nemis/apps/portal-web/src/app/government/deo/analytics/page.tsx`).
  - The data comes from `useDeoDashboardViewModel()`, loaded through `useRevalidateOnSync` as `DeoDashboardPage` does, and from `analyticsInputFromDashboard`.
  - The header place comes from the result's `district` and `county`.
  - Refresh calls the view model's load.
  - The desktop charts include Task 4's three.
  - `districtId === null` shows "No district assigned to your account.".
- Create: `apps/desktop/renderer/app/government/deo/analytics/page.tsx`.
- Modify: `apps/desktop/renderer/components/shell/sidebarConfig.ts`: add `{ name: 'Analytics', href: '/government/deo/analytics', icon: BarChart3 }` right after Generate Reports.
- Create: `apps/desktop/renderer/app/government/deo/analytics/page.test.tsx`, modelled on `deo/page.test.tsx` (the dashboard page test).

- [ ] **Step 1: Write the failing page tests**, mirroring Task 2's assertions (with the dashboard fixture via `window.nemis.deo.getDashboard`):
  - no dropdowns;
  - No Data is not counted as Critical;
  - the no-attendance insight;
  - no "pending review";
  - the open alerts text comes from `alertSummary.total`;
  - same-named schools stay separate;
  - an all-zero trend shows `No data`;
  - no district;
  - the sidebar config has Analytics after Generate Reports.
- [ ] **Step 2:** Run `pnpm vitest run apps/desktop/renderer/app/government/deo/analytics`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm vitest run apps/desktop/renderer`, `pnpm --filter @nemis-desktop/app typecheck` and `pnpm lint`. Expected: PASS, apart from the known pre-existing fresh-login test.
- [ ] **Step 5: Commit:** `feat(deo): Analytics page on the desktop`.
