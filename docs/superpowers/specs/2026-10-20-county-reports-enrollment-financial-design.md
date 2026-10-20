# County Reports, part 1: page shell + Enrollment + Financial — design

Date: 2026-10-20 · Repos: `desktop-client-nemis` + `Nemis` · Branch: `feat/county-reports` (both, main checkouts)

## Intent

Port the County Admin **Generate Reports** page (`portal-web/src/app/government/county/reports/generate/page.tsx`, 1,618 lines) to the desktop, one piece at a time. The web page is one screen with a filter panel and five report types:
- Enrollment
- Attendance
- Academic
- Staff & Compliance
- Financial

It also has charts (`components/reports/ReportCharts.tsx`) and letterhead exports (`lib/automatedReportExport.ts`: PDF, Excel, Word).

Split, as with Schools (Claude's proposal; Alvin skipped the questions, so the split and the order are Claude's calls):
1. **This spec:** the page shell and filter panel, plus the **Enrollment** and **Financial** reports and their charts.
2. Attendance.
3. Academic.
4. Staff & Compliance.
5. Exports (new deps `jspdf`, `jspdf-autotable` and `docx`, plus an Electron save path).

## How it gets made (carried over from County Finance, 2026-10-20)

- Native inline build in the main checkouts. No worktrees, no subagents.
- The full hexagonal path, as on County Teachers and County Finance:
  1. application read-model port + use cases
  2. presentation ViewModel
  3. SQLite read-model adapter
  4. IPC, preload, bridge, and the renderer `countyIpc` facade
- Offline compute from synced SQLite, porting the server's formulas.
- **Fix every web quirk on both sides** (Alvin's rule for County Finance, carried over because they skipped the questions).

## Routes

- The page lives at `/government/county/reports/generate`, the web's path. The County dashboard and Districts quick actions already push there.
- The desktop sidebar's REPORTS → Reports entry moves from `/government/county/reports` to `/government/county/reports/generate`.
- `/government/county/reports` becomes a client redirect to `generate` (`router.replace`, since the static export has no server redirects), matching the web's `/reports/enhanced` redirect.
- The `quick-action-routes.test.tsx` "Generate Report is a ComingSoon page" case is replaced by real page tests.

## Page (markup port of the web, with the fixes below)

- **Header band:** the county name, "Generate Reports", and the county code with a map pin.
- **Filter panel:**
  - Report Type: all five listed, as on the web.
  - District: "— Choose district —", All Districts, then active districts by name. Hidden for Financial.
  - School: shown when a single district is chosen; "All Schools", then the district's active schools by name.
  - Refresh.
  - Time Period (Attendance only) and Export: **not shown in part 1**. They arrive with parts 2 and 5. Claude's call: no dead buttons.
- **Toolbar:** "<Type> Report — <district name>", plus the report's `generatedAt`.
- **Report types not yet built** (Attendance, Academic, Staff & Compliance) show the existing `ComingSoon` panel in the content area, following Alvin's standing "missing targets become ComingSoon" rule.
- **Enrollment:** the county-wide view and the single-district view, exactly as on the web:
  - cards, Gender Distribution, By Grade Level, Enrollment Trend
  - County-wide adds "Enrollment by District" and per-district sections with stat cards and school tables
  - Single-district adds the Gender Ratio card and the "Enrollment by School" table
- **Financial:** the web's `FinancialReportSection`:
  - 6 summary cards
  - Student Payment Status and Collection by District charts
  - per-district school tables
  - It is built from the County Finance data the desktop already has (`county.getFinanceDashboard` and `county.listFinanceSchools`, current academic year).
- **Charts:** the six charts this part needs are ported to `renderer/components/county/reports/ReportCharts.tsx` with the same recharts config and colours: Gender, Grade Level, Enrollment Trend, Enrollment by District, Payment Status, Collection by District. The desktop already has recharts.

## Enrollment report (the server formula, ported)

`CountyEnrollmentReport` mirrors the web's `EnrollmentReportData` type:
- `reportType: "ENROLLMENT"`, `generatedAt`
- `district: {id, name}` (the county itself when county-wide)
- `summary {totalSchools, totalStudents, totalMale, totalFemale, genderRatio}`
- `byDistrict` (county-wide only)
- `bySchool[]`, `byGradeLevel[]`, `trendData[]`

Scope:
- active own-county schools
- optionally one district (`institutions.districtId`)
- optionally one school
- active students only

| Figure | Rule |
|---|---|
| per-school totalStudents | active students at the school |
| male / female | `gender = 'MALE'` / `gender = 'FEMALE'` |
| genderRatio | `(male / female).toFixed(2)`, `"N/A"` when female is 0 |
| byGradeLevel | the student's own `gradeLevel`, `"UNKNOWN"` when null |
| trendData | the last 6 calendar months, oldest first. Each month counts active in-scope students with `createdAt` ≤ that month's end. Label is `en-US {month:'short', year:'numeric'}` ("Oct 2026"). |
| byDistrict | per district: schools, students, male, female, genderRatio. Schools without a district go under `"unknown"` / "Unknown District", as on the server. |
| bySchool order | district name, then school name. Schools without a district come last. |

## The quirks and their fixes (both sides)

| # | Quirk | Fix |
|---|---|---|
| R1 | County-wide report finds schools by `district.countyId`, while the rest of County uses `institution.countyId` (they can drift). | Scope by `institution.countyId` (server); own-county clause (desktop). |
| R2 | Any gender other than MALE counts as female. | Male = MALE and female = FEMALE; OTHER counts only in totals. |
| R3 | The district report takes the grade from the latest ACTIVE enrolment's class, while the county report uses `student.gradeLevel`, so the two disagree. | Both use `student.gradeLevel` (kept current by promotions and completions). |
| R4 | The Enrollment Trend ignores the School filter. | The trend uses the same school scope as the rest of the report. |
| R5 | The Grade Level chart sorts by the trailing digit, so K1 sits with Grade 1 and KG and UNKNOWN land first. | Explicit order: KG, K1, K2, GRADE_1 … GRADE_12, then UNKNOWN. |
| R6 | The Financial school-rate badge uses 80/50 thresholds. | Use the County rule from Finance: ≥ 70 green, 40–69 amber, < 40 red (`rateStatus`). |
| R7 | Refresh does nothing on the Financial report. | Refresh reloads the finance data. |
| R8 | The toolbar shows no generated time for Financial. | It shows the time the finance data was loaded. |

Known, kept as-is (not a bug, a limitation of the data):
- The trend is "students registered by then who are active **now**". There's no historical enrolment snapshot.
- The `startDate`, `endDate` and `gradeLevel` query params the server accepts are never sent by the page. They're left alone.

## Server (Nemis) changes

- `CountiesService.generateCountyEnrollmentReport`: R1, R2, R4. The trend counts apply `schoolWhere`.
- `DistrictsService.generateEnrollmentReport`: R2, R3, R4.
- Jest specs with mocked Prisma for each.

## portal-web changes

- `ReportCharts.tsx` `GradeLevelChart`: R5, via an exported `gradeLevelOrder(level)` helper with a Vitest test.
- `generate/page.tsx`:
  - R6: the badge uses `rateStatus` from `county/finance/finance-display.ts`.
  - R7: Refresh calls the finance refetches.
  - R8: the toolbar shows a finance loaded-at time from `fulfilledTimeStamp`.

## Desktop changes

- **Types** (`packages/types/src/county-reports.ts`):
  - `CountyReportOptions {county: {id, name, code} | null, districts: {id, name}[]}`
  - `CountyReportSchool {id, name}`
  - `CountyEnrollmentReportQuery {districtId?, schoolId?}`
  - `CountyEnrollmentReport`
  - Channels `county:report-options`, `county:report-schools`, `county:enrollment-report`, with matching `IpcContract` entries and `CountyApi` methods.
- **Application:**
  - `ICountyReportsReadModel`:
    - `getOptions(): Omit<CountyReportOptions,'county'> & {countyCode: string | null}`
    - `listSchools(districtId)`
    - `getEnrollmentReport(query, now: Date)`
  - Use cases `GetCountyReportOptions`, `GetCountyReportSchools` and `GetCountyEnrollmentReport`. The last stamps `generatedAt` and `now` from the application clock.
  - `CountyApplicationService` gains `getReportOptions`, `listReportSchools` and `getEnrollmentReport`.
  - An in-memory read model for tests.
- **Presentation:** `CountyReportsViewModel`, holding:
  - options (with the county)
  - schools for the chosen district
  - the enrollment report
  - finance dashboard + schools for Financial (from the existing County Finance use cases), and a `financeLoadedAt`
  - loading and error state for each
- **Adapter:** `SqliteCountyReportsReadModel` over `institutions`, `districts`, `counties` and `students`.
- **IPC:** handlers in `county/reports.ts`, validators, the COUNTY_ADMIN allow-list, registrar, preload, bridge and `countyIpc`.
- **Pages:**
  - `app/government/county/reports/generate/page.tsx` renders `components/county/reports/GenerateReportsPage.tsx`, with views split into `EnrollmentReportView.tsx`, `FinancialReportSection.tsx` and `ReportCharts.tsx`, plus shared `SummaryCard` and `ReportTable`.
  - `/reports/page.tsx` is the redirect.
- **Tests:** adapter (fixtures: two districts, a district-less school, inactive and other-county schools, OTHER gender, null grade, students across months), use case, ViewModel, handler and validator, and page render tests.

## Non-goals

- Attendance, Academic, Staff & Compliance content (parts 2–4).
- Exports (part 5).
- The DEO reports page.
- Any snapshot change.

## Release order

None. The desktop reads already-synced students and finance data. Server and web ship together.

## Left to the builder

- SQL shape, fixture details, and the exact file split inside the renderer.
