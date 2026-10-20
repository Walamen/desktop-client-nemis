# County Reports, parts 2–5: Attendance, Academic, Staff & Compliance, Exports — design

Date: 2026-10-20 · Repos: `desktop-client-nemis` + `Nemis` · Branch: `feat/county-reports-2` (both, main checkouts)
Builds on part 1 (`2026-10-20-county-reports-enrollment-financial-design.md`, merged): the Generate Reports page, filters, Enrollment, Financial, and the ComingSoon panels this work replaces.

## Intent

Finish the County Admin Generate Reports page on the desktop:
- the three remaining report types (Attendance, Academic, Staff & Compliance)
- the web's PDF / Excel / Word exports with the official letterhead, saved through the app

The web's design and behaviour are copied, and web quirks are fixed on both sides.

## How it gets made (unchanged from part 1)

- Native inline build in the main checkouts; no worktrees, no subagents.
- The full hexagonal path for report data:
  1. read-model port and use cases
  2. ViewModel
  3. SQLite adapter
  4. IPC
- Offline compute from synced SQLite. The County device already receives every attendance record, grade, assessment, grading period, grading config and staff row for its schools; there's no snapshot change.

## Alvin's decisions (2026-10-20)

- **Academic pass mark:** each school's own `institution_grading_configs` (`passingMarks / maxMarks × 100`); 50% only when a school has no config.
- **Academic years:** only grades in each school's **current** academic year (the same rule as Finance).
- **Academic grades counted:** **published** grades only (`isPublished`), the same rule as the end-of-year outcome guidance.

## The quirks and their fixes (server and desktop alike)

| # | Report | Quirk | Fix |
|---|---|---|---|
| A1 | Attendance | The county-wide report scopes schools by `district.countyId`. | Use `institution.countyId` (the part 1 rule). |
| A2 | Attendance | LATE counts against the rate (rate = present / total), unlike the parent and guardian portals. | Rate = (PRESENT + LATE) / total, for the summary, each school, and the trend. EXCUSED and SICK stay in the total. |
| AC1 | Academic | County scope via `district.countyId`. | `institution.countyId`. |
| AC2 | Academic | Pass mark is hard-coded at 50%. | Each school's own pass mark (decision above). |
| AC3 | Academic | Counts all years. | Current academic year only, through the grade's grading period (or its assessment's grading period). |
| AC4 | Academic | Counts drafts. | Published only. |
| AC5 | Academic | County-wide "by subject" lists one row per school's copy of a subject (every school has its own "Mathematics"). | Group by `lower(trim(name))`; show the first spelling. |
| AC6 | Academic | A grade is credited to the student's **current** school, so a child who moved takes their grades along. | Credit the school of the grade's subject (`subjects.institutionId`). |
| S1 | Staff | County scope via `district.countyId`. | `institution.countyId`. |
| S2 | Staff | "Qualified" means `qualifications` is a non-empty array, so the desktop teacher form's `{ summary }` object counts as unqualified. | Qualified = a non-empty string array **or** a non-blank `summary`, the same parse County Teachers uses. |
| E1 | Exports | A failed export only logs to the console. | Show "Export failed. Please try again." in the toolbar. |
| E2 | Exports (desktop) | The web decides county-wide-vs-district from the rows; desktop rows always carry `districtId`. | The page passes `countyWide` explicitly. |

Kept as on the web:
- The Attendance trend shows the last 14 dates with records.
- The Staff compliance limit is ≤ 40 students per teacher.
- Teaching staff = TEACHER and ASSISTANT_TEACHER.
- The attendance period windows are DAILY = last 7 days, WEEKLY = 28 days, MONTHLY = 3 months, ending today.

## Report shapes (mirror portal-web's `AttendanceReportData`, `AcademicReportData`, `StaffComplianceReportData`)

- **Attendance**:
  - `reportType`, `generatedAt`, `district`, `period {start, end, type}`
  - `summary {totalSchools, totalRecords, presentCount, absentCount, lateCount, overallAttendanceRate}`
  - `bySchool[{schoolId, schoolName, schoolCode, totalStudents, recordsCount, present, absent, late, attendanceRate, districtId, districtName}]`
  - `trendData[{date, rate, present, absent}]`
- **Academic**:
  - `summary {totalSchools, totalGrades, averageScore, passRate, passCount, failCount}`
  - `bySubject[{subjectId, subjectName, totalGrades, averageScore, passRate}]`
  - `bySchool[{schoolId, schoolName, schoolCode, totalGrades, averageScore, passRate, districtId, districtName}]`
  - Percentage = `marksObtained / (assessment.totalMarks || grade.maxMarks || 100) × 100`.
- **Staff & Compliance**:
  - `summary {totalSchools, totalStudents, totalStaff, totalTeachers, qualifiedTeachers, qualificationRate, overallTeacherStudentRatio}`
  - `complianceStatus {compliant, nonCompliant, total, complianceRate}`
  - `bySchool[{schoolId, schoolName, schoolCode, totalStudents, totalStaff, totalTeachers, qualifiedTeachers, teacherStudentRatio, isCompliant, districtId, districtName}]`

Same scope as Enrollment:
- active own-county schools, optionally one district and one school
- active students
- active staff
- school order: district name, school name, district-less last

## Page

- The Time Period filter returns (Attendance only, default WEEKLY).
- The three views are a markup port of the web's `AttendanceReportView`, `AcademicReportView` and `StaffComplianceReportView`.
- The remaining seven charts are ported to `ReportCharts.tsx`.
- **Export panel** (PDF, Excel, Word) returns for all five report types, disabled until the report has loaded and while exporting. While exporting, the toolbar says "Preparing export with official letterhead…". On success it says "Saved to <path>"; E1 covers failure. Cancelling the save dialog says nothing.
- `generatedBy` is the signed-in user's name (fallback: email, then "County CEO").

## Exports (desktop)

- **Dependencies:** pinned exactly to portal-web's versions — `jspdf@4.2.1`, `jspdf-autotable@5.0.7`, `docx@9.6.0` — plus the existing `xlsx`.
- `renderer/lib/reports/automatedReportExport.ts` ports the web file. Every builder returns `{ filename, bytes: Uint8Array, mimeType }` instead of downloading:
  - PDF: `doc.output('arraybuffer')`
  - Excel: `XLSX.write(wb, {type:'array', bookType:'xlsx'})`
  - Word: `Packer.toBuffer` (or `toBlob` → `arrayBuffer`)
- **Saving:** a new `system:save-file` IPC channel. Main shows `dialog.showSaveDialog` with the suggested name in the user's Downloads folder and a filter for the file's extension, then writes the bytes, and returns `{ saved: false }` or `{ saved: true, path }`.
- **Validation:**
  - the file name is a bare name (no path separators, no `..`) ending in `.pdf`, `.xlsx` or `.docx`
  - the bytes are a `Uint8Array` of at most 50 MB
- Any signed-in role may use the channel (it's generic); writing happens only after the user picks a place.
- The page calls it through a `ReportExportViewModel`-free path: the save goes renderer bridge → preload → main. It's a device file operation, not report data. (Claude's call: the hexagonal rule covers business data; the bytes are built in the renderer from data the ViewModel already holds.)

## Server (Nemis)

- `CountiesService.generateCountyAttendanceReport` / `generateCountyAcademicReport` / `generateCountyStaffComplianceReport`, and the matching `DistrictsService` generators, get A1–A2, AC1–AC6 and S1–S2 (the district versions skip the scope fixes they don't need).
- Jest specs with mocked Prisma, one per fix.

## portal-web

- E1 on `generate/page.tsx`: an export error state shown in the toolbar.
- No other UI change: the numbers change through the server.

## Non-goals

- The DEO's own reports page, beyond the shared district generators.
- Chart images inside exports (the web's `includeCharts`/`chartImages` options are unused).
- Snapshot changes.

## Release order

None. The desktop computes from already-synced data. Server and web ship together.
