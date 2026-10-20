# County Reports Parts 2–5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Attendance, Academic and Staff & Compliance reports and letterhead exports (PDF, Excel, Word) saved through a native dialog to the desktop County Generate Reports page, and fix the quirks on both sides.

**Architecture:**
- **Server:** the six generators (county and district) get the fixes.
- **portal-web:** gets the export error message.
- **Desktop:** extends part 1's chain. The chain is:
  - `ICountyReportsReadModel` gains three methods, each with its own use case and `CountyApplicationService` method
  - `CountyReportsViewModel` gains three loaders
  - `SqliteCountyReportsReadModel` gains three queries
  - three IPC channels
- **Exports (desktop):** a renderer library builds file bytes, and a generic `system:save-file` channel saves them with `dialog.showSaveDialog`.

**Tech Stack:** NestJS/Prisma/Jest; Next/Vitest; Electron/better-sqlite3/Zustand/recharts; jspdf 4.2.1, jspdf-autotable 5.0.7, docx 9.6.0, xlsx.

**Spec:** `docs/superpowers/specs/2026-10-20-county-reports-remaining-design.md`

## Global Constraints

- Branch `feat/county-reports-2` in both **main checkouts**. Native inline build. The pages read ViewModels for report data.
- Nemis server path is `apps/Server`. Files are CRLF: use Edit or CRLF-normalising node scripts. There's no python.
- **Rules:**
  - Attendance rate = round((PRESENT + LATE) / total × 100).
  - Pass threshold per school = `passingMarks / maxMarks × 100` from `institution_grading_configs`, else 50. A pass is percentage ≥ threshold.
  - Academic counts published grades in a current-year grading period only (the grade's own `gradingPeriodId`, else its assessment's).
  - A grade's school = its subject's `institutionId`.
  - Subjects group by `lower(trim(name))`.
  - Qualified = non-empty string array or non-blank `{summary}`.
  - Teaching = TEACHER, ASSISTANT_TEACHER.
  - Compliant = teachers > 0 and students / teachers ≤ 40.
- **Attendance period:** `end = now`; `start = end − 7 days` (DAILY), `− 28 days` (WEEKLY, the default) or `− 3 months` (MONTHLY). Compare on `substr(date, 1, 10)` between the local start and end dates, inclusive. The trend shows the last 14 dates.
- **Test env:**
  - Temporary Node-ABI binary in `node_modules/better-sqlite3/build/Debug/` (copy from scratchpad `prebuild/build/Release/better_sqlite3.node`). Delete it at the end.
  - Run server jest and desktop vitest one after the other; background long suites.
- **Commands:**
  - desktop: `pnpm vitest run <path>`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @nemis-desktop/app build:renderer`
  - server: `npx jest <path>`, `npx tsc --noEmit`
  - portal-web: `npx vitest run`, `npx tsc --noEmit -p .` (restore `tsconfig.tsbuildinfo`)
- Known pre-existing failures: desktop `renderer/app/page.test.tsx` and `teacher/timetable/timetable.test.tsx`.

## Review Focus

1. **A school with grades but no grading config.** It uses the 50% threshold. The test is in Task 7.
2. **An unpublished grade, or a grade in last year's period.** It's excluded from every academic figure. The test is in Task 7.
3. **Attendance dates stored as `YYYY-MM-DD` and as ISO timestamps.** Both fall in the window. The test is in Task 6.
4. **The save dialog cancelled.** Nothing is written and no message is shown. The tests are in Tasks 12 and 14.
5. **A bad file name** (`../x.pdf`, `a/b.pdf`, `x.exe`). Refused before any dialog opens. The test is in Task 12.

---

### Task 1: Server — attendance generators (A1, A2)

- Modify: `Nemis/apps/Server/src/counties/counties.service.ts` (`generateCountyAttendanceReport`), `districts/districts.service.ts` (`generateAttendanceReport`)
- Test: `counties/counties.attendance-report.spec.ts` and `districts/districts.attendance-report.spec.ts`, mocked Prisma as in part 1's specs
- [ ] Failing tests:
  - county `scopes schools by the institution's own county`: the `institution.findMany` where equals `{countyId:'c-1', isActive:true}`
  - county and district `late counts as attended`: records `[PRESENT, LATE, ABSENT, EXCUSED]` give `overallAttendanceRate 50`, the school `attendanceRate 50`, and the trend `rate 50`
- [ ] RED → implement → GREEN (`npx jest src/counties src/districts`, `npx tsc --noEmit`) → commit `fix(reports): attendance rate counts late arrivals as attended`

### Task 2: Server — academic generators (AC1–AC6)

- Modify both academic generators. Test: `counties/counties.academic-report.spec.ts`, `districts/districts.academic-report.spec.ts`
- **Approach:**
  - `grade.findMany` where:
    - `isPublished: true`
    - `subject: { institution: schoolWhere }`
    - `student: { isActive: true }`
    - `OR: [{ gradingPeriod: { academicYear: { isCurrent: true } } }, { gradingPeriodId: null, assessment: { gradingPeriod: { academicYear: { isCurrent: true } } } }]`
  - It also selects `subject.institutionId` and `subject.name`.
  - Thresholds: `institutionGradingConfig.findMany({ where: { institutionId: { in: schoolIds } } })`.
- [ ] Failing tests:
  - `counts only published current-year grades`: assert on the where
  - `uses each school's pass mark, 50% without a config`: school A config 70/100, school B none; marks 60 → fail at A, pass at B
  - `groups subjects by name across schools`: two schools' "Mathematics " / "mathematics" give one bySubject row
  - `credits the grade's subject school`
  - county `scopes schools by the institution's own county`
- [ ] RED → implement → GREEN → commit `fix(reports): academic report uses each school's pass mark, current year, published grades`

### Task 3: Server — staff generators (S1, S2)

- Modify both staff generators. Test: `counties/counties.staff-report.spec.ts`, `districts/districts.staff-report.spec.ts`
- [ ] Failing tests:
  - `a teacher with a {summary} qualification is qualified`: qualifications `[['B.Ed'], {summary:'Diploma'}, [], {summary:'  '}, null]` give `qualifiedTeachers 2`
  - county `scopes schools by the institution's own county`
- [ ] Add a shared `isQualified(raw: unknown): boolean` in `Nemis/apps/Server/src/common/utils/staff-qualifications.ts`.
- [ ] RED → implement → GREEN → commit `fix(reports): staff report counts summary qualifications`

### Task 4: portal-web — export error (E1)

- Modify `generate/page.tsx`: `exportError` state, set in `handleExport`'s catch and cleared on each export. The toolbar shows `Export failed. Please try again.` in `text-error`.
- [ ] `npx tsc --noEmit -p .` and `npx vitest run src/app/government/county` → commit `fix(county): Reports tell the user when an export fails`

### Task 5: Desktop — types, port, use cases

- `packages/types/src/county-reports.ts` adds:
  - `CountyAttendancePeriod = 'DAILY'|'WEEKLY'|'MONTHLY'`
  - `CountyAttendanceReportQuery {districtId?, schoolId?, period?}`
  - `CountyAttendanceReport`, `CountyAcademicReport`, `CountyStaffComplianceReport`, with the spec's shapes. Use `reportType: 'ATTENDANCE' | 'ACADEMIC' | 'STAFF_COMPLIANCE'`; `districtId` and `districtName` are `string | null`.
- Channels and `IpcContract` entries:
  - `COUNTY_ATTENDANCE_REPORT: 'county:attendance-report'` with args `[query]`
  - `COUNTY_ACADEMIC_REPORT: 'county:academic-report'` with args `[query: CountyEnrollmentReportQuery]`
  - `COUNTY_STAFF_REPORT: 'county:staff-report'` with args `[query: CountyEnrollmentReportQuery]`
- `CountyApi` adds `getAttendanceReport`, `getAcademicReport` and `getStaffComplianceReport`.
- The port adds:
  - `getAttendanceReport(query, nowIso)`
  - `getAcademicReport(query)`
  - `getStaffComplianceReport(query)`
  - Each returns the report without `generatedAt`/`district`, plus `scopeName`.
  - Export `CountyReportData<T> = Omit<T,'generatedAt'|'district'> & { scopeName: string | null }`, and redefine `CountyEnrollmentReportData` with it.
- Use cases: `GetCountyAttendanceReportUseCase`, `GetCountyAcademicReportUseCase`, `GetCountyStaffComplianceReportUseCase`.
  - They share a private `stampReport(data, query, county, nowIso)` helper with the enrollment use case (the existing `district` rule).
  - Attendance passes `period ?? 'WEEKLY'`.
- In-memory read model: settable `attendance`/`academic`/`staff`, recording the last queries.
- [ ] Failing tests in `county-reports.test.ts`:
  - `attendance defaults the period to WEEKLY and is stamped by the clock`
  - `academic and staff name the district when one is chosen`
- [ ] RED → implement/wire (service, factory, index) → GREEN `pnpm vitest run packages/application packages/presentation` → commit `feat(county): attendance, academic and staff report use cases`

### Task 6: Desktop adapter — attendance

- `SqliteCountyReportsReadModel.getAttendanceReport(query, nowIso)`:
  - attendance `a JOIN classes c ON c.id = a.classId JOIN institutions i ON i.id = c.institutionId`
  - in scope, with `substr(a.date,1,10) BETWEEN ? AND ?`
  - schools via the shared `#schools(query)`, extracted from enrollment
  - active student counts
  - `period: {start, end, type}`, where start and end are ISO strings of the window
- [ ] Failing tests:
  - `rates count late as attended`
  - `the weekly window keeps 28 days back and drops older records; daily keeps 7; monthly keeps 3 months`
  - `dates stored as YYYY-MM-DD and ISO both count` (Review Focus 3)
  - `trend is the last 14 dates, oldest first`
  - `the school filter narrows records`
  - `inactive and other-county schools are excluded`
- [ ] RED → implement → GREEN → commit `feat(county): attendance report from synced records`

### Task 7: Desktop adapter — academic

- `getAcademicReport(query)`:
  - `grades g JOIN subjects sj ON sj.id = g.subjectId JOIN institutions i ON i.id = sj.institutionId JOIN students s ON s.id = g.studentId AND s.isActive = 1`
  - `LEFT JOIN assessments asm ON asm.id = g.assessmentId`
  - `JOIN grading_periods gp ON gp.id = COALESCE(g.gradingPeriodId, asm.gradingPeriodId)`
  - `JOIN academic_years y ON y.id = gp.academicYearId AND y.isCurrent = 1`
  - `WHERE g.isPublished = 1 AND scope`
  - Thresholds from `institution_grading_configs`.
- [ ] Failing tests:
  - `only published grades in a current-year period count, via the grade or its assessment period` (Review Focus 2)
  - `pass uses the school's config, 50% without one` (Review Focus 1)
  - `percentage uses the assessment total, else the grade max`
  - `subjects group by name across schools`
  - `a grade is credited to its subject's school`
  - `averages and pass rates round as the server does`
- [ ] RED → implement → GREEN → commit `feat(county): academic report from synced grades`

### Task 8: Desktop adapter — staff & compliance

- `getStaffComplianceReport(query)`:
  - active staff of scoped schools
  - `qualifications` parsed like `SqliteCountyTeachersReadModel.qualificationList`; export it from there and reuse it
  - active student counts
- [ ] Failing tests:
  - `teachers are TEACHER and ASSISTANT_TEACHER; staff are all active staff`
  - `summary qualifications count as qualified`
  - `compliance is at most 40 students per teacher; no teachers is non-compliant; ratio N/A`
  - `summary and complianceStatus totals`
- [ ] RED → implement → GREEN (`pnpm vitest run apps/desktop/electron/data`) → wire nothing new → commit `feat(county): staff and compliance report from synced staff`

### Task 9: Desktop IPC

- Handlers in `county/reports.ts`, using `assertCountyAttendanceReportQueryArgs` (keys `districtId`, `schoolId`, `period` ∈ the three values) and the existing enrollment validator for academic and staff.
- Authorize: COUNTY_ADMIN.
- Wire preload, bridge and the `countyIpc` facade.
- [ ] Failing tests:
  - `channels forward and return .data`
  - `attendance refuses an unknown period`
  - authorize list
- [ ] RED → implement → GREEN; `pnpm typecheck` clean → commit `feat(county): attendance, academic and staff report channels`

### Task 10: Desktop ViewModel

- `CountyReportsViewModel` adds:
  - `attendance`, `academic` and `staff` AsyncStates
  - `loadAttendance(query)`, `loadAcademic(query)` and `loadStaff(query)`
- [ ] Failing tests:
  - `each loader passes its query and fills its state`
  - `a failed academic load is an error`
- [ ] RED → implement → GREEN → commit `feat(county): reports ViewModel loads the remaining reports`

### Task 11: Desktop page — three views, period filter, seven charts

- `ReportCharts.tsx` adds the web's AttendanceStatus, AttendanceTrend, PassFail, SubjectPerformance, ComplianceStatus, TeacherQualification and SchoolComplianceBar charts, verbatim.
- New view files: `AttendanceReportView.tsx`, `AcademicReportView.tsx` and `StaffComplianceReportView.tsx`, markup ports of the web views.
- `GenerateReportsPage`:
  - `BUILT` becomes all five types
  - the Time Period block (Attendance only) is restored with `periodLabels`
  - the report loads when its type is chosen and a district is set; Refresh is per type
  - the empty, loading and error panels apply to every district-scoped type
- [ ] Failing tests (extend `GenerateReportsPage.test.tsx`; remove the ComingSoon case):
  - `attendance shows six cards and the school table, and switching period reloads with it`
  - `academic shows pass and fail and by-subject rows`
  - `staff shows compliance and the school table`
  - `the period filter shows only for Attendance`
- [ ] RED → implement → GREEN → commit `feat(county): Attendance, Academic and Staff & Compliance reports`

### Task 12: Desktop save-file channel

- Types:
  - `SYSTEM_SAVE_FILE: 'system:save-file'`
  - `SaveFileRequest {fileName, bytes: Uint8Array}`
  - `SaveFileResult {saved:false} | {saved:true, path}`
  - `SystemApi.saveFile`
- Main: `electron/services/fileSaveService.ts` exports `saveFileWithDialog(request, deps: { showSaveDialog, writeFile, downloadsDir })`, so tests inject fakes. The handler uses `dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {defaultPath: join(downloads, fileName), filters:[{name, extensions:[ext]}]})` and `fs.promises.writeFile`.
- Validator `assertSaveFileArgs`:
  - `fileName` matches `^[^\\/:*?"<>|]+\.(pdf|xlsx|docx)$`, contains no `..`, and is ≤ 200 chars
  - `bytes instanceof Uint8Array`, length ≤ 50 MB
- Authorize: every signed-in role (follow how SYSTEM_GET_VERSION is treated).
- Wire preload `system.saveFile` and a bridge `system-bridge.saveFile`.
- [ ] Failing tests:
  - `writes the bytes where the user chose and returns the path`
  - `a cancelled dialog writes nothing and returns saved false` (Review Focus 4)
  - `refuses paths, traversal and other extensions before any dialog` (Review Focus 5)
  - `refuses non-bytes and oversize`
- [ ] RED → implement → GREEN → commit `feat(desktop): save a generated file through a native dialog`

### Task 13: Desktop export library

- Add deps in `apps/desktop/package.json`: `"jspdf": "4.2.1"`, `"jspdf-autotable": "5.0.7"`, `"docx": "9.6.0"`; then `pnpm install`.
- `renderer/lib/reports/automatedReportExport.ts` ports the web file:
  - the types come from `@nemis-desktop/types`
  - every builder returns `Promise<ExportedFile>`, where `ExportedFile = {fileName, bytes: Uint8Array}`
  - `isCountyWide` is replaced by `options.countyWide`
  - `triggerDownload` and the save calls are removed
  - The same file names as the web.
- [ ] Failing tests (`automatedReportExport.test.ts`; jsdom can run jspdf and docx, and the bytes start with the file signatures):
  - `PDF starts with %PDF and is named <County>-enrollment-report-county-<date>.pdf`
  - `Excel is a zip (PK) with a .xlsx name`
  - `Word is a zip with a .docx name`
  - `financial exports build for all three formats`
  - `single-district names use the district name`
- [ ] RED → implement → GREEN → commit `feat(county): letterhead report exports build PDF, Excel and Word files`

### Task 14: Desktop export panel

- `GenerateReportsPage` restores the Export block:
  - PDF, Excel and Word buttons, disabled while exporting or before the current report's data has loaded
  - `generatedBy` comes from the current-user ViewModel (`firstName lastName`, else email, else "County CEO")
  - export = build → `systemBridge.saveFile`
  - toolbar: preparing… / `Saved to <path>` / `Export failed. Please try again.`
- [ ] Failing tests:
  - `PDF export saves through the app and shows where`, with a stubbed `window.nemis.system.saveFile` and the export library mocked to a fixed file
  - `a cancelled save shows nothing`
  - `a failed export says so`
  - `export buttons wait for the report`
- [ ] RED → implement → GREEN → commit `feat(county): export reports to PDF, Excel and Word`

### Task 15: Verify

- [ ] Desktop typecheck, lint, the full suite (only the 2 known failures) and the renderer build; delete the temporary binary.
- [ ] Server tsc + jest; portal-web tsc + vitest.
- [ ] Inline self-review against the spec and Review Focus; fix findings test-first.
- [ ] Update memory; finishing-a-development-branch.
