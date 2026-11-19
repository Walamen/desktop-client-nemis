# DEO School Reports Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the School Reports Review page from the web. Remove the six school-report figures from the DEO screens of both apps. Drop the Students dropout-alerts "no report submitted" condition. No school can submit a report, so all of these are permanently empty.

**Architecture:**
- **Server:** changes only the two rules that decide what is shown. Reports & Compliance goes to two rows per school, and the dropout alerts lose their report condition. The report fields stay in the server's responses, unused.
- **Clients:** the elements are removed, along with every client query, field and type that fed only them.
- **Desktop order:** the screens are changed first, then the data plumbing, so each commit compiles.

**Tech Stack:**
- Nemis: NestJS + Jest, Next.js + RTK Query + Vitest.
- desktop-client-nemis: Electron + better-sqlite3, the application and presentation layers, the Next.js renderer, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-deo-school-reports-removal-design.md` (desktop-client-nemis repo)

**Branches:** `feat/deo-school-reports-removal` in both repos, created from `main`. Tasks 1–3 are in Nemis and Tasks 4–5 in desktop-client-nemis.

## Global Constraints

The six elements removed on both apps:
1. Dashboard: the "Last Submission" column of the schools table, and the "Data Submission Monitoring" card with its pager.
2. Schools: the 3 report-month dots column.
3. School detail: the Reports panel.
4. Students & Enrollment: the "Last Submission" column.
5. School Admins: "Submitted N reports this month".
6. Reports & Compliance: the "Monthly Reports" row. The rows per school become `Registration`, `Teacher Roster`.

Other rules:
- **Dropout alerts:** a school with pupils is listed when its attendance is low **or** its `complianceStatus` is `Flagged`. The `!lastSubmissionAt` condition and the reason `No report submitted yet` go.
- **Web only:** delete `app/government/deo/school-reports/page.tsx`, its `pageTitles` entry, and the seven hooks/endpoints:
  - `getSchoolReportsForReview`
  - `getSchoolReportForReview`
  - `reviewSchoolReport`
  - `escalateSchoolReport`
  - `getFlaggedSchools`
  - `getDistrictAttendanceSummary`
  - `getDistrictReportSubmissions`
- **Leave untouched:**
  - the server's `/school-reports/*` and `/districts/:id/school-reports|flagged-schools|attendance-summary|report-submissions` endpoints and fields;
  - the web school-admin `schoolReportsApi`;
  - web Analytics (`useAnalyticsInsights.ts`) and the web type field `lastSubmissionDate` it reads.
- **Nothing else changes value.** The remaining columns, cards, rows, counts and orders are untouched. When a removed element sat in a grid or table, the rest closes up with no empty cell.
- **No dead client code:** delete a helper, hook, field or type once nothing reads it. Check before deleting.
- **Repo hygiene:**
  - Never commit `apps/desktop/package.json` or `apps/portal-web/tsconfig.tsbuildinfo`.
  - Stage files by name. No pushes.
  - Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - After deleting a web route, clear the stale `apps/portal-web/.next/types` before running `tsc`.
  - Desktop SQLite tests: on NODE_MODULE_VERSION, run `pnpm rebuild:node` first and `pnpm rebuild:electron` when done.

## Review Focus

1. **A school with good attendance, not Flagged, and no report.** It must disappear from dropout alerts on both apps; before, it was listed as "No report submitted yet". Tested in Tasks 1 and 5.
2. **The School detail grid after removing the Reports panel** has no empty cell, and the Fee and Gender panels still render. Tested in Tasks 3 and 4.
3. **Reports & Compliance summary** counts two rows per school. For 2 schools with nothing recorded, `missing` is 4. Tested in Task 1 (server) and Task 5 (desktop).
4. **The dashboard still shows its other cards** (alerts, schools table, charts) after the submissions card goes. Tested in Tasks 2 and 4.
5. **Nothing still requests the deleted endpoints.** Removing the RTK hooks must not leave a component calling a now-undefined hook. Typecheck plus a grep in Task 2.

---

### Task 1: Server rules (Nemis)

**Files:**
- Modify: `apps/Server/src/common/district/compliance-rows.ts` and its `.spec.ts`. `complianceRows` returns `[Registration, Teacher Roster]`, and `ComplianceSchoolInput` drops `reportMonths` and `lastSubmissionAt`.
- Modify: `apps/Server/src/districts/districts.service.ts`:
  - `getDistrictReportsCompliance` stops passing those fields;
  - in the `getDistrictStudentEnrollment` dropout alerts (~l.1483–1505), drop the `!lastSubmissionAt` condition and the `"No report submitted yet"` branch.
- Modify: `apps/Server/src/districts/districts.reports-compliance.spec.ts` and `apps/Server/src/districts/districts.student-enrollment.spec.ts`.
- Modify: `packages/types/src/deo.ts`. The `DistrictComplianceItem.reportType` comment lists `Registration | Teacher Roster`.

- [ ] **Step 1: Write the failing tests.**
  - `compliance-rows.spec.ts`:
    - `returns Registration then Teacher Roster`: ids `s-1:registration` and `s-1:teachers` only.
    - Delete the Monthly Reports cases.
    - The summary case for a school with nothing recorded gives `{ total: 2, approved: 0, pending: 0, rejected: 0, missing: 2 }`.
  - `districts.reports-compliance.spec.ts`:
    - two schools give four rows, Alpha's two first;
    - remove the "monthly reports follow the standings dots" case;
    - two schools with nothing recorded give `summary.missing` 4.
  - `districts.student-enrollment.spec.ts`:
    - `a school with pupils, good attendance, not Flagged and no report is not a dropout alert`;
    - remove or rewrite any case expecting `"No report submitted yet"`;
    - low-attendance and Flagged schools are still listed with their reasons.
- [ ] **Step 2:** From `apps/Server`, run `pnpm jest src/common/district/compliance-rows.spec.ts src/districts/districts.reports-compliance.spec.ts src/districts/districts.student-enrollment.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm jest src/districts src/common/district` and `pnpm exec tsc --noEmit -p tsconfig.json`. Expected: all pass, no errors.
- [ ] **Step 5: Commit:** `feat(districts): drop school-report signals from compliance and dropout alerts`.

### Task 2: Web — delete School Reports Review and the dashboard submissions (Nemis portal-web)

**Files:**
- Delete: `apps/portal-web/src/app/government/deo/school-reports/page.tsx`.
- Modify: `apps/portal-web/src/components/sidebarConfig.ts` (remove the `"/government/deo/school-reports"` pageTitles entry).
- Modify: `apps/portal-web/src/store/deo/Api/deoApi.ts`. Remove the seven endpoints and their exported hooks, plus any types and tags only they used. If `store/deo/index.ts` re-exports them, update it too.
- Modify: `apps/portal-web/src/app/government/deo/page.tsx` (the dashboard). Remove the "Last Submission" column (header and cell), the "Data Submission Monitoring" card, `submissionPage` state and `useGetDistrictReportSubmissionsQuery`.
- Create: `apps/portal-web/src/app/government/deo/page.test.tsx`, mocked the way `deo/reports/page.test.tsx` is: every `@/store/deo` hook the page uses, plus `@/store/hooks`.

- [ ] **Step 1: Write the failing dashboard test**, `dashboard has no report-submission figures`:
  - no text `Data Submission Monitoring`;
  - no `Last Submission` column header;
  - the schools table still shows one school name from the fixture.
- [ ] **Step 2:** From `apps/portal-web`, run `pnpm vitest run src/app/government/deo/page.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the deletions and the dashboard edit.
- [ ] **Step 4: Verify.**
  - Remove `apps/portal-web/.next/types` if present, then run `pnpm typecheck`, `pnpm lint` and the new test. Expected: PASS.
  - Run `grep -rn "school-reports\|SchoolReportsForReview\|ReviewSchoolReport\|EscalateSchoolReport\|FlaggedSchools\|DistrictAttendanceSummary\|ReportSubmissions" src --include=*.ts --include=*.tsx`. Expected: matches only in `store/school-admin/Api/schoolReportsApi.ts`, `store/school-admin/Api/index.ts` and `app/government/school-admin/infrastructure/*`.
- [ ] **Step 5: Commit:** `feat(deo): remove School Reports Review and the dashboard submission figures`.

### Task 3: Web — Schools, School detail, Students, School Admins, Reports & Compliance (Nemis portal-web)

**Files:**
- Modify: `app/government/deo/schools/page.tsx` (remove the dots column and its header).
- Modify: `app/government/deo/schools/[id]/page.tsx` (remove the Reports panel and `reportsSubmitted`, and close up the grid) and its `page.test.tsx`.
- Modify: `app/government/deo/students/page.tsx` (remove the "Last Submission" column, and `formatSubmissionDate` if it is then unused).
- Modify: `app/government/deo/school-admins/page.tsx` (remove the "Submitted … reports this month" line).
- Modify: `app/government/deo/reports/page.test.tsx` (the fixture drops its Monthly Reports row; the chips test expects `All`, `Registration`, `Teacher Roster` and no `Monthly Reports`).
- Create:
  - `app/government/deo/schools/page.test.tsx`
  - `app/government/deo/students/page.test.tsx`
  - `app/government/deo/school-admins/page.test.tsx`

  Mock them like the reports test.

- [ ] **Step 1: Write the failing tests:**
  - schools: no `Reports` dots column header (use the column's existing header text), and the school row still shows its name and students;
  - school detail: no `months with a submitted report` text and no `submitted` dots; the `Fee Compliance` panel and the gender panel still render;
  - students: no `Last Submission` header;
  - school admins: no text matching `/reports this month/`;
  - reports: chips `All`, `Registration`, `Teacher Roster`, and no `Monthly Reports`.
- [ ] **Step 2:** Run `pnpm vitest run src/app/government/deo`. Expected: the new assertions FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm typecheck`, `pnpm lint` and `pnpm test`. Expected: all pass.
- [ ] **Step 5: Commit:** `feat(deo): remove school-report figures from the DEO pages`.

### Task 4: Desktop — screens (desktop-client-nemis)

**Files:**
- `apps/desktop/renderer/components/deo/DeoDashboardPage.tsx`: remove the "Last Submission" column and the "Data Submission Monitoring" card. Also remove its pager state and the `submissions` paging.
- `DeoSchoolsPage.tsx`: remove the dots column.
- `DeoSchoolDetailPage.tsx`: remove the Reports panel and close up the grid.
- `DeoStudentsPage.tsx`: remove the column and its date helper if unused.
- `DeoSchoolAdminsPage.tsx`: remove the line.
- Update the tests:
  - `apps/desktop/renderer/app/government/deo/page.test.tsx`
  - `schools/page.test.tsx`
  - `schools/details/page.test.tsx`
  - `students/page.test.tsx`
  - `school-admins/page.test.tsx`
- Leave `packages/presentation/src/view-models/deo/deo-dashboard-views*` untouched unless a helper there only served the removed card. If one did, delete it and its test.

The types still carry the fields in this task; Task 5 removes them.

- [ ] **Step 1: Write the failing absence assertions**, mirroring Tasks 2–3:
  - dashboard: no `Data Submission Monitoring` and no `Last Submission`, while the schools table still lists a school;
  - schools: no dots column;
  - school detail: no `months with a submitted report`, and the Fee and Gender panels still render;
  - students: no `Last Submission`;
  - school admins: no `/reports this month/`.
- [ ] **Step 2:** Run `pnpm vitest run apps/desktop/renderer/app/government/deo`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests, then `pnpm --filter @nemis-desktop/app typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(deo): remove school-report figures from the desktop DEO pages`.

### Task 5: Desktop — data plumbing, compliance rows and dropout alerts (desktop-client-nemis)

**Files:**
- `packages/types/src/deo-dashboard.ts`:
  - `DeoSchoolRow` loses `lastSubmissionAt` and `reportMonths`;
  - `DeoDashboardResult` loses `submissions`, and `DeoSubmissionRow` is deleted;
  - the school-admin item loses `reportsThisMonth`;
  - the `DeoComplianceItem.reportType` comment lists two values;
  - check `DeoStudents*` types for `lastSubmissionAt`.
- `packages/application/src/interfaces/deo/district-overview-read-model.ts`, `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.ts` (and its test) and `packages/application/src/testing/deo/in-memory-district-overview.ts`:
  - delete `listSubmittedReports`, `lastSubmissionBySchool` and `reportMonthsBySchool`, plus `DistrictReportRow` if it becomes unused;
  - `listSchoolAdmins(districtId: string)` drops its two month parameters and the `reportsThisMonth` subquery;
  - `DistrictSchoolAdminRow` loses `reportsThisMonth`.
- `packages/application/src/use-cases/deo/`:
  - `district-school-rows.ts`: stop reading report months and last submission, and delete `reportMonthKeys` and `REPORT_MONTHS`. Keep `localDateIso` and `attendanceWindowStart`.
  - `get-deo-dashboard.ts`: no `submissions`.
  - `get-deo-students.ts`: no `lastSubmissionAt`. `dropoutAlerts` keeps only the low-attendance and Flagged conditions and reasons.
  - `get-deo-school-admins.ts`: no month window.
  - `compliance-rows.ts`: two rows, mirroring Task 1.
  - `get-deo-reports-compliance.ts`: stops passing the two fields.
- Update every test file that seeds or asserts these fields. Find them with `grep -rln "reportMonths\|lastSubmissionAt\|reportsThisMonth\|listSubmittedReports\|lastSubmissionBySchool\|reportMonthsBySchool\|DeoSubmissionRow\|submissions" packages apps/desktop`, and handle only the DEO matches; assignment `submissions` are unrelated.

**Interfaces:**
- Consumes: Task 4's screens, which no longer read these fields.
- Produces: `IDistrictOverviewReadModel.listSchoolAdmins(districtId: string): DistrictSchoolAdminRow[]`.

- [ ] **Step 1: Write the failing tests:**
  - `compliance-rows.test.ts`: two rows, and a nothing-recorded school summary of `{ total: 2, …, missing: 2 }`; Monthly Reports cases deleted.
  - `get-deo-reports-compliance.test.ts`: no Monthly Reports row, and two nothing-recorded schools give `summary.missing` 4.
  - `get-deo-students.test.ts`: `a school with pupils, good attendance, not Flagged and no report is not a dropout alert`; the `No report submitted yet` expectations removed; low and Flagged still listed.
  - `SqliteDistrictOverviewReadModel.test.ts`: `listSchoolAdmins('d-1')` with no month arguments returns the admin rows without `reportsThisMonth`.
- [ ] **Step 2:** Run `pnpm vitest run packages/application/src/use-cases/deo apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the removals.
- [ ] **Step 4: Verify.**
  - Run `pnpm typecheck`, `pnpm lint`, then `pnpm vitest run packages apps/desktop/electron apps/desktop/renderer/app/government/deo`. Expected: PASS.
  - Run `grep -rn "reportMonths\|lastSubmissionAt\|reportsThisMonth\|listSubmittedReports\|lastSubmissionBySchool\|reportMonthsBySchool\|DeoSubmissionRow\|No report submitted yet" packages apps/desktop --include=*.ts --include=*.tsx`. Expected: no matches.
- [ ] **Step 5: Commit:** `refactor(deo): drop school-report plumbing; dropout alerts without the report condition`.
