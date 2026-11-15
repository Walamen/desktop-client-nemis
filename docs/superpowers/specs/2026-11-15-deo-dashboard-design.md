# DEO dashboard on the desktop — design

**Date:** 2026-11-15
**Branch:** `feat/deo-dashboard` (desktop-client-nemis and Nemis)
**Piece:** 1 of 10 in the DEO sidebar-page port. Layout reference: `2026-11-14-deo-portal-web-design-reference.md`, section 4.1.

## Why

A District Education Officer oversees every school in one district. Many of those schools have poor or no internet, and so does the DEO's office. The desktop DEO portal is a set of placeholders today: a generic "authorized workspace" card and raw tables. The DEO needs the same dashboard the web has, working with no connection, from the data already synced to the device.

Alvin's direction (2026-11-15):

- Build the 11 pages in the web sidebar; this is the first.
- The portal must be offline-first like the rest of the desktop.
- Where the web shows numbers the server never fills in, compute **real numbers** offline and fix the web to match (option A).
- For decisions not spelled out: "decide for me". Those are listed under **Calls made**.

## What the web does today

`portal-web/src/app/government/deo/page.tsx` makes seven requests. Several return less than the page expects:

| Part of the page | Web source | Problem |
|---|---|---|
| Banner | hard-coded | Says "Good afternoon" at any hour; prints the words "District" and "County" instead of names; prints the word "Date," before the date |
| Fee Compliance card | average of `feeCompliance` on `GET /institutions?districtId=` | The server never sends `feeCompliance`: always 0% |
| Schools at a Glance | same list | The server never sends `attendanceRate` or `complianceStatus`: always 0% and "Compliant" |
| Attendance figures | `getDistrictChartData`, `getDistrictSchoolPerformance` | Count only PRESENT; LATE is treated as absent. A school with no records shows 0% and "Critical" |
| Teachers column | `_count.staff` | Counts every staff member, not teachers |
| Enrollment column | `_count.students` | Counts inactive students too |
| Status filter | applied after paging | Filters only the 10 rows on the current page |
| Last Submission, Data Submission Monitoring | `enrollmentApplication` rows | Nothing in the system creates these rows any more (`createApplication` has no caller): always empty |
| "View All →", "Send Broadcast" | no handler / `/communications` | Dead control; link to a route that does not exist |

## Goals

1. The desktop DEO dashboard matches the web layout (reference doc 4.1) and works fully offline.
2. Every number on it is real, computed from synced data by one stated rule.
3. "Mark Reviewed" works offline and syncs later.
4. The web dashboard shows the same numbers by the same rules.
5. The DEO-scoped foundation (application service, IPC group, authorisation, district identity) exists for the next nine pieces to build on.

## Non-goals

- The other ten sidebar pages, the school detail page, and every non-sidebar page.
- Reworking the web's quick-action targets, or building a Communications page.
- Changing how alerts are raised.
- Changing County pages or County channels.

## Anti-goals

- A dashboard that shows a zero or "Compliant" because data is missing. Missing data must look missing.
- Any dashboard read that needs the network.
- Opening County-only channels (assign DEO, create users, register schools) to a DEO.

## Approaches

**A. A DEO-owned slice, parallel to County (chosen).** A new `DeoApplicationService` with its own read-model port, use cases, view model, `deo:*` IPC channels and a `DEO_CHANNELS` authorisation set. It reuses the existing County finance read model for fee figures, since a district device holds only its district's fee ledger.
*Trade-off:* more files than B, but each role's channels stay separately authorised, and it follows the repo rule to design by scope rather than bolt one role onto another.

**B. Reuse County use cases and open County channels to DEO.** Least code now. Rejected: County use cases assume the device holds exactly one county and group by district; the DEO pages show different content; and widening `COUNTY_ADMIN_CHANNELS` risks exposing County-only commands.

**C. Refactor County into a scope-neutral "area" service first.** Cleanest end state. Rejected for now: it rewrites thirteen merged County pages before delivering anything for the DEO.

## Design

### 1. District identity

The DEO's district is the signed-in user's scope (`scope.districtId`, equal to `scope.scopeId` for a DISTRICT device). The read model takes that id from the session; it does not guess from whichever district rows are present.

- **District name:** the `districts` row for that id.
- **County name:** the `counties` row that district points at.

Two server gaps make these unreliable today, both fixed in this piece:

- A district with no schools sends no `districts` row at all (the snapshot only sends districts that some school points at).
- DISTRICT devices never receive a `counties` row.

When either is missing (older server), the banner leaves that part out. It never prints a placeholder word.

### 2. The school-standing rule

One rule, implemented once on the server (`common/district/school-standing.ts`) and once in the desktop application layer (`use-cases/deo/school-standing.ts`), with the same test table on both sides.

Inputs per active school:

| Input | Definition |
|---|---|
| `records30` | Attendance records dated in the last 30 days, for classes of the school |
| `attended30` | Those with status PRESENT or LATE |
| `attendanceRate` | `round(attended30 / records30 × 100)`; **null** when `records30` is 0 |
| `daysSinceAttendance` | Whole calendar days between today and the most recent attendance date; null when the school has never recorded attendance |
| `termRunning` | Today falls inside any of the school's terms (start date to end date, inclusive) |
| `worstOpenAlert` | Highest severity among unresolved alerts whose `institutionId` is the school |
| `pupilsPerTeacher` | Active students ÷ active teaching staff (TEACHER, ASSISTANT_TEACHER); "no teachers" when there are students and no teachers |

**Compliance status** (first match wins):

1. **Flagged** — `attendanceRate` below 60; or `termRunning` and (`daysSinceAttendance` above 7, or never recorded); or `worstOpenAlert` is CRITICAL.
2. **Needs Review** — `attendanceRate` below 80; or `termRunning` and `daysSinceAttendance` above 3; or `worstOpenAlert` is HIGH; or more than 40 pupils per teacher; or pupils and no teachers.
3. **Compliant** — otherwise.

**Performance status** (the "Detailed School Performance" table):

- **No Data** — `attendanceRate` is null.
- **Critical** — below 60. **Warning** — below 80. **Good** — 80 and above.

The 60 and 80 cut-offs, the 3 and 7 day windows and the 40:1 ratio are the values already in `districts.service.ts` (`getDistrictSchoolPerformance`, `getDistrictFlaggedSchools`, `generateStaffComplianceReport`).

### 3. What each part of the page shows

| Part | Content and rule |
|---|---|
| **Banner** | Avatar; greeting by local time — "Good morning" before 12:00, "Good afternoon" before 17:00, otherwise "Good evening"; full name; "District Education Officer · {district} · {county} · {Saturday, November 14, 2026}" |
| **Total Schools** | Active institutions |
| **Total Students** | Active students in active institutions |
| **Total Teachers** | Active teaching staff in active institutions |
| **Fee Compliance** | Mean of the collection rates of active schools that have fees billed in their current academic year, rounded. 0% when no school bills. Rates come from the existing County finance read model |
| **Alerts & Actions** | Unresolved alerts for the district or any of its schools; highest severity first, then newest; at most 50. The chip shows the count |
| **Schools at a Glance** | Every active school, by name: name, level, active students, attendance % ("—" when null), compliance status. "View All →" opens the Schools page |
| **Enrollment Trend (6 Months)** | Cumulative active students by `createdAt`, the server's existing formula; students with no `createdAt` count in the starting figure |
| **Gender Distribution** | Active students, MALE and FEMALE |
| **School Performance** | Attendance rate per month for the same six months (PRESENT + LATE over all records); a month with no records plots 0, as today. Titles kept as on the web |
| **Detailed School Performance** | School, Enrollment (active students), Attendance % (30 days, "—" when null), Teachers (teaching staff), Last Submission, Status (performance status). Search by name; status filter (Good / Warning / Critical) applied to the whole list, then 10 per page |
| **Data Submission Monitoring** | The newest school reports submitted to the district: School, Report (title), Type, Date submitted. 10 per page, at most 50 |
| **Incident Monitoring** | The same unresolved alerts, with the severity filter and count chips, and **Mark Reviewed** |
| **Quick Actions** | Send Broadcast → `/government/deo/communications` (a Coming Soon page on the desktop); Generate Report → `/government/deo/reports`; Schedule Visit → `/government/deo/schools` |
| **Year closures** | The existing `YearClosuresPanel` stays, below Quick Actions. It is a desktop feature with no web equivalent and must not be lost |

"Last Submission" is the date of the school's most recent submitted report. "No Data" uses the neutral grey chip (`bg-gray-100 text-gray-700`).

Two definitions used above:

- **An alert belongs to the district** when its `districtId` is the district, or its `institutionId` is one of the district's schools. A DISTRICT device also receives county-level alerts (the snapshot matches on `countyId`); those are not shown and cannot be resolved here.
- **A submitted report** is a `reports` row with a `submittedAt` date whose `schoolId` is one of the district's schools.

### 4. Mark Reviewed, offline

`deo:resolve-alert` takes an alert id. The use case checks the alert is unresolved and belongs to this district or one of its schools, then sets `isResolved`, `resolvedAt`, `resolvedBy` (the signed-in user) and `updatedAt` on the local row. The existing outbox trigger on `alerts` queues the change, and the server already accepts alert changes pushed by a DEO. The dashboard then reloads. Nothing waits for the network.

### 5. Desktop architecture

Full path, as for County:

```
renderer page (app/government/deo/page.tsx)
  → DeoDashboardViewModel (packages/presentation)
  → lib/ipc/deo.ts → deoBridge → window.nemis.deo
  → preload/deo → ipcMain  deo:get-dashboard / deo:resolve-alert   [DEO_CHANNELS]
  → DeoApplicationService → GetDeoDashboardUseCase / ResolveDistrictAlertUseCase
  → IDistrictOverviewReadModel + ICountyFinanceReadModel + IDistrictAlertStore
  → SQLite
```

- **One read** returns the whole dashboard (`DeoDashboardResult` in `packages/types/src/deo-dashboard.ts`): district, county, stats, fee compliance, alerts with a severity summary, one row per school with both statuses, the three chart series, and the recent reports. Search, filters and paging run in the view model; a district is at most a few hundred schools.
- **The read model returns raw rows and counts.** All arithmetic and the standing rule live in the use case, as with `GetCountyDashboardUseCase`.
- **Authorisation:** a new `DEO_CHANNELS` set in `authorizeChannel.ts`; any other role is refused. `deferredApplication` in `main.ts` gains the `deo` key.
- **Renderer:** the page is ported from the web page with the banner, `AlertsAndActions`, `SchoolsAtGlance` and the three chart components moved to `components/deo/`. `ScopedPortalDashboard` is no longer used by the DEO page. `useRevalidateOnSync` reloads the dashboard after each sync.
- **Attendance queries** are grouped in SQL (per school over 30 days, per month over six months, latest date per school). They must use the existing `(classId, date)` index; a seeded test at district scale guards against a scan that would freeze the main process.

### 6. Server and web (Nemis)

| Change | Where |
|---|---|
| DISTRICT snapshot always includes the scope's own district row, and that district's county row | `desktop-provisioning.service.ts` |
| The school-standing rule as a shared module, with tests | `common/district/school-standing.ts` |
| `GET /districts/:id/school-standings` — per school: level, active students, teaching staff, attendance rate, last submission, both statuses, fee collection rate; plus the district fee-compliance figure. DEO of the district, County Admin of its county, Super Admin | `districts.controller.ts`, `districts.service.ts` |
| `getDistrictSchoolPerformance` and `getDistrictChartData`: count LATE as attended; active students; teaching staff; last submission from reports; null rate and "No Data"; status filter before paging | `districts.service.ts` |
| `GET /districts/:id/report-submissions` — paged newest school reports for the dashboard table | same |
| `getDistrictIncidents`: also return unresolved alerts raised against a school of the district (today it matches `districtId` only), and let `markIncidentReviewed` resolve them | same |
| Web dashboard: Fee Compliance and Schools at a Glance read `school-standings`; banner uses real names (from the existing district settings query), the time-based greeting and the real date; "View All →" links to Schools; submissions table shows reports; "—" and "No Data" states | `portal-web/.../deo/page.tsx`, `components/deo/*`, `store/deo` |

`getDistrictSubmissions` is left alone; the Submissions page (next task) still uses it.

### 7. Release order

Server first. The desktop works against an older server but then shows no county name, and no district name for a district without schools.

### 8. Testing

- **Rule:** one table of cases (each trigger alone, boundaries at 60, 80, 3, 7, 40, null rate, term not running), run against both implementations.
- **Desktop:** use-case tests on an in-memory read model; SQLite read-model tests on a real database, including the scale guard; IPC handler and `authorizeChannel` tests (DEO allowed, every other role refused); view-model tests for search, filter, paging and resolve-then-reload; a page test for the loaded, empty and no-district states.
- **Server:** jest for the rule, both new endpoints (including access refusal for another district's DEO), and the changed formulas.
- **Web:** vitest for the dashboard's derived values and the banner helper.
- **Gate:** desktop lint, typecheck and full suite; server tsc and jest; portal-web vitest and build.

## Calls made

Decisions taken under "decide for me". Any of these can be reversed before or after the build.

1. **Compliance rule** as in section 2, including: staleness only counts in term time; LATE counts as attended; fees are not part of compliance.
2. **Day counting** uses whole calendar days from the last attendance *date*, so a normal weekend (Friday to Monday) is 3 days and does not trip the "above 3" rule.
3. **A school with no attendance in the window shows "—" and "No Data"**, not 0% and Critical.
4. **"Submissions" on the dashboard means school reports.** Enrolment applications can no longer be created, so the web's table and "Last Submission" column are permanently empty. School reports are the one thing schools still submit to a district. The Submissions page in the next task will need the same decision.
5. **Fee Compliance** averages only schools that bill fees, in each school's current academic year (the County Finance rule).
6. **Teachers** means teaching staff, and **Enrollment** means active students, in every figure.
7. **Greeting and date** are real; no placeholder words.
8. **"View All →"** becomes a working link to Schools on both sides.
9. **"Send Broadcast"** keeps the web's target and lands on a Coming Soon page, per the standing rule that missing targets become placeholders rather than repointed buttons.
10. **Chart titles are kept as on the web**, although "School Performance (%)" is a chart of attendance.
11. **The Year Closures panel stays** on the desktop dashboard.
12. **No-district state:** the full "No District Assignment" card from the web.
13. **Build method:** inline in the main checkouts on `feat/deo-dashboard`, full hexagonal path, no worktrees or subagents (the method used since County Finance).

## Left to the builder

- Exact type and file names beyond those given here.
- Whether the alert write goes through an existing generic record writer or a small dedicated store, provided it fires the outbox trigger and is covered by a test.
- SQL shape of the attendance aggregates, provided the scale guard passes.
- How the district id reaches the read model (a `currentScope` port or a constructor argument), following whichever pattern `currentUserId` already uses.
