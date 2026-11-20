# DEO sub pages, piece 7 (last): Analytics

**Date:** 2026-11-20
**Repos:** Nemis (portal-web only; no server change) and desktop-client-nemis
**Size:** project (a web page rewrite onto shared rules, plus a new desktop page)
**Release order:** web and desktop are independent; neither needs a server release

## Intent

The web page `/government/deo/analytics` ("Analytics Dashboard") gives a District Education Officer a fuller analytical view than the dashboard:
- KPI cards;
- enrollment, attendance and gender charts;
- enrollment and attendance by school;
- auto-generated "Performance Insights";
- teacher analytics and a school comparison.

It is reachable only by URL, and the desktop has no route.

Several of its figures are not true:
- **The dropdowns do nothing.** No query reads the academic-year or term selection.
- **Schools with no attendance recorded count as 0% and "Critical"** (`asLegacyPerformance`). This inflates the Critical KPI and the Critical insight, while the Schools page says "No data".
- **Three insights can never be right:**
  - "N schools have not submitted data in the past 7 days" reads school-report dates no school can produce, so it lists every school;
  - "N enrollment submissions pending review" counts the retired enrolment applications;
  - "N unresolved incidents" reads `overview.openIncidents`, an older count (district-tagged only, teacher requests included, cached) that disagrees with the dashboard and Alerts.
- **One threshold disagrees:** an insight warns below **75%** attendance, where every other page uses 60% and 80%.
- **Teacher analytics is wrong in two ways.** "Inactive" is always 0, because the teacher list holds active teachers only. Teachers are also grouped by school **name**, so two schools with the same name merge.

Alvin chose (2026-11-20) to port the page with every figure made honest, built from data both apps already compute.

## Goals

- **Web:** the page keeps its sections and layout, but reads only figures the other DEO pages already compute by the agreed rules. All KPI, chart-series, insight and teacher figures come from one pure rules file.
- **Desktop:** a `DeoAnalyticsPage` at `deo/analytics` with the same layout and figures, computed offline from the dashboard data the device already has, with the same rules file mirrored.
- Every number on the page agrees with the dashboard, Schools and Alerts pages for the same data.

## Non-goals

- No server change. The server keeps `overview.openIncidents` and `overview.pendingSubmissions`; the Analytics page simply stops reading them.
- No academic-year or term filtering. The dead dropdowns are removed, not wired up.
- No new figures beyond the one insight that replaces the dead "not submitted" insight.
- No change to the dashboard, Schools, Teachers or Alerts pages.

## Anti-goals (a failure even if it "works")

- A school with no attendance recorded counted as Critical or 0% anywhere on the page.
- A count on this page that differs from the same count on the dashboard, Schools page or Alerts page.
- A control that does nothing.
- A figure that is always 0, or always "every school", whatever the data.

## Decided content (agreed with Alvin, 2026-11-20)

### Inputs

Both apps use the same input shape, `AnalyticsInput`:

| Input | Web source | Desktop source |
|---|---|---|
| `totalStudents` | `useGetDistrictOverviewQuery` → `totalStudents` | dashboard `stats.totalStudents` |
| `chartData` | `useGetDistrictChartDataQuery` | dashboard `chartData` (same shape) |
| `schools[]` | `useGetDistrictSchoolStandingsQuery` → `schools`, each with `id`, `name`, `students`, `teachers`, `attendanceRate` (number or null) and `performanceStatus` (`Good` / `Warning` / `Critical` / `No Data`) | dashboard `schools` (`DeoSchoolRow`, same fields) |
| `openAlerts` | `useGetDistrictIncidentsQuery` → `summary.total` (now uncapped; same rule as Alerts) | dashboard `alertSummary.total` |

The web page stops using `useGetDistrictSchoolPerformanceQuery`, `asLegacyPerformance` and `useGetDistrictTeachersQuery`.

### KPIs

- **Total Students:** `totalStudents`. The month-over-month change comes from the last two `enrollmentTrend` points, as today, and is hidden when there are fewer than 2 points.
- **Attendance:** the latest `attendanceTrend` rate above 0, with its change from the month before when that month is also above 0. Shown as "No data" when no month is above 0. (See "Facts and calls": a rate of 0 means no records that month.)
- **Gender:** the male and female split from `genderDistribution`. Shown as "No data" when there are 0 students.
- **Schools at 80%+:** the count of schools with `performanceStatus === "Good"`.
- **Warning + Critical:** the count of `Warning` and `Critical` schools. Its subtitle reads `No data: n` when n > 0. No Data schools are never counted as Warning or Critical.

### Charts

- **Enrollment trend, attendance trend, gender:** `chartData` as today.
- **Enrollment by school:** `students` per school, top 10 by students, ties broken by name.
- **Attendance by school:** schools with a non-null `attendanceRate`, lowest first, top 10. A line under the chart reads `n schools without attendance data` when n > 0.
- **School comparison:**
  - top 12 by students;
  - each school shows `students`, `attendanceRate` and `teachers` from the same school row, so teachers come from the school's id, not its name;
  - a null attendance is plotted as a gap, not 0.

### Insights

The insights below appear in this order, each only when its condition holds. Copy for 1 to 6 is kept from today except where noted.

1. **Enrollment change:**
   - "Enrollment increased by X% compared to last month (A → B)." (success) when the change is greater than 0;
   - "Enrollment decreased by X%…" (warning) when it is less than 0;
   - X is rounded; only when the earlier month is greater than 0.
2. **Attendance change:**
   - "Average attendance dropped by N percentage points from A to B." (danger) when the drop is more than 5;
   - "…improved by N…" (success) when the rise is more than 5.
3. **District attendance:** using the latest trend rate, when that rate is above 0:
   - below 60: "District-wide attendance rate (R%) is below 60%." (danger);
   - otherwise, below 80: "District-wide attendance rate (R%) is below 80%." (warning).

   *(Replaces the 75% threshold.)*
4. **Critical schools:** "N school(s) is/are in critical status (attendance below 60%)." (danger). Counts `Critical` schools only.
5. **Warning schools:** "N school(s) has/have warning status (attendance 60–80%)." (warning). Counts `Warning` schools only.
6. **New: no attendance data:** "N school(s) has/have no attendance recorded in the last 30 days." (info). Counts `No Data` schools. *(Replaces the "not submitted data" insight.)*
7. **Open alerts:**
   - "There is/are N open alert(s) requiring attention." (danger when N > 3, else warning);
   - when N > 0, uses the Alerts count;
   - the word changes from "incident" to "alert", to match the page that lists them.
8. **Gender imbalance:** "Significant gender imbalance: M% male, F% female (Gpt gap)." (warning) when the gap is more than 20.
9. **Fallback:** "All metrics are within normal ranges. No issues detected." (success) when nothing else applies and the data has loaded.

The "N enrollment submissions pending review" insight is removed.

### Teacher analytics

All computed from the school rows:
- Total teachers: the sum of `teachers`.
- Schools with teachers: schools with `teachers` > 0.
- Average per school: total ÷ schools with teachers, rounded; 0 when there are none.
- Top 10 schools by teachers, ties broken by name.

The "Active" and "Inactive" figures are removed.

### Header and controls

- **Header place:** district · county, as on the other DEO pages (web: `useGetDistrictSettingsQuery`; desktop: dashboard `district`/`county`, or the source the Schools page uses).
- **Dropdowns:** the academic-year and term dropdowns are removed.
- **Refresh:** the "Refresh" button and the "Updated …" time stay, wired to the page's sources.

### Sidebar (Claude's call)

"Analytics" (Lucide `BarChart3`) goes in the reports group, after Generate Reports, on both apps. Otherwise the page stays unreachable by navigation.

## Approaches considered

1. **Compose the page from data that already exists, with one pure rules file per app, and no new server route or desktop channel (chosen).**
   - Every input is already computed by the agreed rules and has the same shape on both apps.
   - The numbers cannot drift from the other pages, and the desktop page is fully offline.
2. **A new server analytics route, mirrored by a desktop use case and channel.** One request per page, but it adds a route, a use case, a channel and a view model only to repeat figures other pages already compute. Rejected.

Alvin approved approach 1 on 2026-11-20.

## Design

### Web (portal-web)

- **Create `src/lib/deo-analytics.ts`** with pure, Vitest-tested functions over `AnalyticsInput`:
  - `analyticsKpis(input)`
  - `analyticsInsights(input): { id; text; type }[]`
  - `enrollmentBySchool(schools)`
  - `attendanceBySchool(schools)`, returning rows plus `withoutData`
  - `teacherAnalytics(schools)`
  - `schoolComparison(schools)`
- **Rewrite `app/government/deo/analytics/page.tsx`** onto these functions and the four sources:
  - remove the dropdowns, `useGetDistrictSchoolPerformanceQuery`, `useGetDistrictTeachersQuery` and `asLegacyPerformance`;
  - keep the section layout, chart components, classes and copy except where decided above;
  - use the existing loading skeletons, and an error with Retry if any source fails.
- **Delete `components/deo/analytics/useAnalyticsInsights.ts`**, because the rules file replaces it. Delete it only if nothing else imports it.
- **Sidebar entry:** add the Analytics item to `components/sidebarConfig.ts`.
- **Page test:**
  - no dropdowns;
  - a No Data school is not counted as Critical (KPI and insight);
  - the no-attendance insight;
  - no "pending review" text;
  - the open-alert count comes from the incidents summary;
  - teacher figures are grouped by school id, so two schools with the same name are not merged.

### Desktop (desktop-client-nemis)

- **Create `packages/presentation/src/view-models/deo/deo-analytics-views.ts`**, mirroring the web rules file with the same function names and the same tests. The input is built from `DeoDashboardResult`.
- **No new use case, channel or view model.** `DeoAnalyticsPage` reads the existing dashboard view model (`useDeoDashboardViewModel`) and loads it through `useRevalidateOnSync`, as the dashboard does.
- **Renderer:**
  - `components/deo/DeoAnalyticsPage.tsx` reproduces the web page as rewritten above, using the desktop's chart components (the ones the desktop dashboard already uses), or the same Recharts components if the web ones are not available;
  - the route is `app/government/deo/analytics/page.tsx`;
  - add a sidebar entry;
  - add a page test that mirrors the web test.

## Constraints

- **One copy of the analytics rules per app:** web `lib/deo-analytics.ts` and desktop `deo-analytics-views.ts`, with identical behaviour and test cases.
- **Agreement with other pages:** the inputs are exactly the sources the dashboard and Schools pages use, so no figure is recomputed differently.
- **Desktop:** the district only ever comes from the session (the dashboard view model already guarantees this).
- **Repo rules:** never commit `apps/portal-web/tsconfig.tsbuildinfo`; no pushes; commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Verification

- **Rules tests, identical on both apps:**
  - each KPI, including a No Data school excluded from Warning + Critical, with its `No data: n` subtitle;
  - every insight condition and its exact copy: thresholds 60 and 80, a change of exactly 5 producing no insight, singular and plural;
  - the fallback;
  - enrollment and attendance by school, including the `withoutData` count;
  - teacher analytics with two same-named schools kept apart;
  - school comparison with a null attendance kept null.
- **Web:** typecheck, lint, Vitest, and the page test.
- **Desktop:** typecheck, lint, the rules tests, and a renderer page test. The sidebar shows Analytics for a DEO.

## Facts and calls settled after the builder check (Claude)

- **Months with no attendance are reported as `rate: 0` by both apps.** The server `getDistrictChartData` and the desktop `attendanceTrend` both always return 6 months, and a month with no records gets `rate: 0`.

  **Call:** in the rules, a trend rate of 0 means "no data for that month". Concretely:
  - the Attendance KPI uses the latest month with rate > 0 and shows "No data" when there is none;
  - its change, and insight 2, compare only two consecutive months that both have rate > 0;
  - insight 3 already requires rate > 0.

  The cost: a month in which every recorded pupil was absent (a true 0%) reads as "No data". That is vanishingly rare, and it avoids a server change. **Amended during the build (2026-11-20, ruling):** on the Analytics page, the attendance trend chart draws those months as **gaps** (the page maps a rate of 0 to null; the chart sets `connectNulls={false}`), so the chart agrees with the "No data" KPI. The dashboard chart is unchanged and still plots 0. The desktop Analytics page does the same as the web.
- **The web standings rows** carry `performanceStatus: "No Data"` when `attendanceRate` is null, using the same `schoolStanding` rule the Schools page uses. The desktop `DeoSchoolRow` uses the same rule.
- **The desktop `alertSummary.total`** counts every unresolved alert by the Alerts rule (`listOpenAlerts`), not only the 50 listed, so it equals the desktop Alerts page's Open total. The web incidents `summary.total` is uncapped since the Incidents piece.
- **Header place:** `useGetDistrictSettingsQuery`, as every other DEO page does. On the desktop it comes from the source the Schools page uses (`getDistrict`/`getCounty`), surfaced through the dashboard data or the Schools view model, whichever already carries it.
- **Desktop charts:** the desktop has only 3 of the web's 6 chart components (enrollment trend, attendance trend, gender).

  **Call:** port the missing three (`EnrollmentBySchoolChart`, `AttendanceComparisonChart`, `SchoolComparisonChart`) into `apps/desktop/renderer/components/deo/charts/`, matching the web, with the comparison chart's null attendance drawn as a gap.

## Left to the builder

- Chart component reuse on the desktop.
- The exact Retry wiring when more than one source fails.

## Remaining after this piece

None. This completes the DEO sub pages.
