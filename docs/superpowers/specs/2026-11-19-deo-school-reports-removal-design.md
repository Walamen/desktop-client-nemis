# DEO sub pages, piece 4: School Reports Review removed, and the school-report figures with it

**Date:** 2026-11-19
**Repos:** Nemis (server, portal-web) and desktop-client-nemis
**Size:** project (small removals across many files in both repos)
**Release order:** server first, then web, then desktop

## Intent

The next sub page in the agreed order was School Reports Review. It is the screen where a DEO approves, rejects or escalates reports that schools submit.

The server has the whole school-report workflow:
- a school admin creates a report as DRAFT (`POST /school-reports`);
- the admin submits it (`POST /school-reports/:id/submit`);
- the DEO reviews it (`/districts/:id/school-reports/...`).

**No screen in either app ever creates or submits a school report.**
- The web's `useCreateSchoolReportMutation` and `useSubmitSchoolReportMutation` are defined and never used.
- The web school-admin "Reports" page only generates printable reports.
- The desktop has no submit screen. Its generic `reports` collection is read-only.
- The only `report` rows the server writes come from `generateDistrictReport`. Those have a district and no school.

So the review page can never have anything to review.

The same rows feed six figures on DEO screens. All six are permanently empty or "Missing" for every school, which is technically honest and of no use.

**Alvin's standing rule** (2026-11-18): a DEO page that receives no data is removed from the web and not added to the desktop. On 2026-11-19 Alvin chose to apply it here, and to also remove the six report-based figures from both apps (his "option 3", confirmed for all six).

## Goals

- **Web:** delete the School Reports Review page.
- **Both apps:** remove the six school-report figures from the DEO screens.
- **Both apps:** drop the client code that existed only for them. No dead queries, fields or types are left on the clients.
- **Server:** change only what decides what is shown:
  - Reports & Compliance goes back to two rows per school (Registration and Teacher Roster);
  - the Students dropout-alerts rule drops its report condition.

## Non-goals

- **No school-side "write and submit a report" screen.** If schools ever submit reports, that is its own project, and the figures come back with it.
- **No change to the server's school-report endpoints** (`/school-reports/*` and `/districts/:id/school-reports/*`). The same goes for `flagged-schools` and `attendance-summary`. They stay, unused, as piece 0 left the server.
- **No change to the server fields** `reportMonths`, `lastSubmissionAt` / `lastSubmissionDate`, `reportsThisMonth`, or the report-submissions endpoint. They stay in the server's responses, unused by both apps, so they are cheap to bring back.
- **No change to County, Ministry or School Admin screens.** The DEO Analytics page's "pending submissions" insight is handled in the Analytics piece.
- **No change to how the remaining columns, cards and rows of each page are computed**, with one exception: the Students dropout-alerts rule below.

## Anti-goals (a failure even if it "works")

- A school-report figure left on any DEO screen of either app, or a layout gap where one was removed. For example, an empty table column, or an empty card slot that still takes up space.
- A remaining number on any of these pages that changes value because of this piece.
- Dead client code left behind: a hook, read-model method, use-case field, view-model field or type used only by a removed element.
- Breaking the page that consumed a removed field. For example, School detail and Reports & Compliance read `buildDistrictSchoolRows`.

## Decided content (Alvin, 2026-11-19)

**Removed on both apps:**

| # | Screen | Element removed |
|---|---|---|
| 1 | Dashboard (`/government/deo`) | the "Last Submission" column of the schools table, and the whole "Data Submission Monitoring" card, with its pager |
| 2 | Schools | the 3 report-month dots column |
| 3 | School detail | the Reports panel (dots, "n/3 submitted", "n/3 months with a submitted report") |
| 4 | Students & Enrollment | the "Last Submission" column |
| 5 | School Admins | "Submitted N reports this month" on each admin card |
| 6 | Reports & Compliance | the "Monthly Reports" row. Each school then has Registration and Teacher Roster, the type chips become All / Registration / Teacher Roster, and the summary counts two rows per school. |

**Students & Enrollment dropout alerts (Alvin, option 1):**
- The rule drops its "never submitted a report" condition, on the server (`getDistrictStudentEnrollment`, ~l.1483-1505) and on the desktop (`get-deo-students.ts` `dropoutAlerts`).
- A school with pupils is listed only when its attendance is low or it is Flagged. The reason "No report submitted yet" goes.
- This is the one intended value change of this piece: the list gets shorter.

**Removed on the web only:**
- the page `app/government/deo/school-reports/page.tsx`;
- its `pageTitles` entry in `components/sidebarConfig.ts`;
- its hooks and endpoints in `store/deo/Api/deoApi.ts`. Those are `getSchoolReportsForReview`, `getSchoolReportForReview`, `reviewSchoolReport`, `escalateSchoolReport`, `getFlaggedSchools` and `getDistrictAttendanceSummary`. Also `getDistrictReportSubmissions`, which only the dashboard card used.

The desktop has no School Reports route, so nothing is removed there.

**Layout after removal (Claude's call):**
- Tables simply lose the column.
- The School detail grid closes up around the removed panel. Its remaining panels keep their order, with no empty cell.
- The dashboard loses the card, and the cards that follow move up.
- These follow how each page already lays out a missing optional section.

## Approaches considered

1. **Remove in place; the server changes only for Reports & Compliance (chosen).** The removed elements, and the client code that fed only them, go away. The server's compliance helper drops the Monthly Reports row, since that row is built on the server. Everything else on the server stays.
2. **Hide the elements behind a switch.** That keeps dead code and empty figures one setting away, against the standing rule. Rejected.
3. **Also strip the unused fields from the server's responses.** That changes shared server types and four server methods for no visible gain, and makes bringing the figures back harder. Rejected.

Alvin approved approach 1 on 2026-11-19.

## Design

### Server (Nemis `apps/Server`)

- **`common/district/compliance-rows.ts`:** `complianceRows` returns two rows (Registration, Teacher Roster). `ComplianceSchoolInput` drops `reportMonths` and `lastSubmissionAt`.
- **`districts.service.ts` `getDistrictReportsCompliance`:** stops passing those two fields. It still uses `computeSchoolStandings` for the school list and principal.
- **`getDistrictStudentEnrollment` dropout alerts:** drop the `!lastSubmissionAt` condition and the "No report submitted yet" reason. Update its spec so that a school with pupils, an attendance rate at or above the threshold, a non-Flagged status and no report is **not** listed.
- **Specs:** `compliance-rows.spec.ts` and `districts.reports-compliance.spec.ts` lose the Monthly Reports cases. They assert two rows per school and the two-row summary.
- **`packages/types/src/deo.ts`:** the `DistrictComplianceItem.reportType` doc comment lists two values. All other types are unchanged, because the server still returns those fields.

### Web (portal-web)

- Delete `app/government/deo/school-reports/page.tsx`, its `pageTitles` entry, and the seven hooks/endpoints listed above. Delete their types only if nothing else imports them.
- **Dashboard `app/government/deo/page.tsx`:** remove the "Last Submission" column and the "Data Submission Monitoring" card, plus their state (`submissionPage`).
- **`schools/page.tsx`:** remove the dots column.
- **`schools/[id]/page.tsx`:** remove the Reports panel and `reportsSubmitted`.
- **`students/page.tsx`:** remove the column and `formatSubmissionDate` if nothing else uses it.
- **`school-admins/page.tsx`:** remove the "Submitted … this month" line.
- **`reports/page.tsx`:** no code change. The chips come from the rows. Its test fixture drops the Monthly Reports row.
- Update the existing page tests that assert removed elements, and add an assertion that each element is absent.
- Any stale `.next/types` from the deleted route must be cleared before running `tsc` (known gotcha).

### Desktop (desktop-client-nemis)

**Types** (`packages/types/src/deo-dashboard.ts`):
- `DeoSchoolRow` loses `lastSubmissionAt` and `reportMonths`. This flows into `DeoSchoolDetail` and the student school rows.
- `DeoDashboardResult` loses `submissions`, and `DeoSubmissionRow` goes.
- The School Admins item loses `reportsThisMonth`.
- `DeoComplianceItem.reportType`'s comment lists two values.

**Read model** (`IDistrictOverviewReadModel`, `SqliteDistrictOverviewReadModel`, the in-memory double):
- remove `listSubmittedReports`, `lastSubmissionBySchool` and `reportMonthsBySchool`;
- `listSchoolAdmins(districtId)` drops its `monthStartIso` / `nextMonthIso` parameters and the `reportsThisMonth` subquery.

**Application:**
- `buildDistrictSchoolRows` stops reading report months and last submissions.
- `GetDeoDashboardUseCase` stops building `submissions`.
- `GetDeoStudentsUseCase` stops copying `lastSubmissionAt`. Its `dropoutAlerts` drops the `!lastSubmissionAt` condition and the "No report submitted yet" reason, matching the server.
- `GetDeoSchoolAdminsUseCase` stops computing the month window.
- `use-cases/deo/compliance-rows.ts` mirrors the server's two-row helper.
- `GetDeoReportsComplianceUseCase` stops passing the two fields.

**Presentation and renderer:**
- Remove the six elements from `DeoDashboardPage` (column and card), `DeoSchoolsPage`, `DeoSchoolDetailPage`, `DeoStudentsPage`, `DeoSchoolAdminsPage` and `DeoReportsCompliancePage`.
- Remove any view-model state or helper that only served them, such as the dashboard's submission pager state.
- Update the existing tests, and assert absence.

## Constraints

- **Parity:** server and desktop compliance helpers stay identical, at two rows.
- **Nothing else changes value:** remaining counts, rates, statuses and orders on the six pages are untouched. Existing tests for them must pass unchanged, except where a fixture only carried a removed field.
- **Repo rules:**
  - Never commit desktop `apps/desktop/package.json` or portal-web `tsconfig.tsbuildinfo`.
  - No pushes.
  - Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Verification

- **Server:** the compliance helper and service specs show two rows per school. The dropout-alerts spec covers the dropped condition. `pnpm jest src/districts src/common/district` passes, and `tsc` is clean.
- **Web:**
  - typecheck, lint and the full Vitest suite pass;
  - page tests assert each removed element is absent on the dashboard, schools, school detail, students and school-admins pages, and the chips on Reports & Compliance;
  - a search finds no remaining `school-reports` route or hook in portal-web, apart from the school-admin `schoolReportsApi`, which belongs to the school admin and is out of scope.
- **Desktop:**
  - typecheck, lint and the full suite pass, apart from the known pre-existing fresh-login test;
  - a search finds no remaining `reportMonths`, `lastSubmissionAt`, `reportsThisMonth`, `listSubmittedReports`, `lastSubmissionBySchool`, `reportMonthsBySchool` or `DeoSubmissionRow` in `packages/` or `apps/desktop/`.

## Calls settled after the builder check (Claude)

- **Web Analytics** (`components/deo/analytics/useAnalyticsInsights.ts`) still reads `lastSubmissionDate`.
  - The web type for the dashboard schools row keeps that field, because the server still sends it.
  - Until the Analytics piece, that insight reports every school as stale.
  - The "no dead client code" rule applies to code with no remaining reader.
- **Report-window helpers on the desktop:** `localDateIso` and `attendanceWindowStart` stay, because the attendance window uses them. Only the report-month helper (`reportMonthKeys`) and its constant go.
- **`listSubmittedReports` / `DistrictReportRow`:** only `GetDeoDashboardUseCase` uses them today, so they go. A later piece that needs them adds them back.
- **Reports & Compliance:** nothing on the web or desktop page assumes three rows per school; the chips and counts come from the rows.
- **Hook count:** seven web hooks are removed (the six review-page hooks plus `getDistrictReportSubmissions`).

## Left to the builder

- The order of edits within each repo, and how tests are split.
- Whether a removed helper still has another user; check before deleting.

## Remaining order after this piece

Infrastructure, Incidents, Analytics (including its "pending submissions" insight).
