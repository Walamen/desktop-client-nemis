# DEO Generate Reports — implementation plan (piece 7)

Spec: `docs/superpowers/specs/2026-11-17-deo-generate-reports-design.md`. Native inline execution, TDD (watch every new test fail first).

## Task 1 — Web (Nemis): Refresh spinner
Add a page test: the Refresh icon spins while `isFetching` (not only `isLoading`). Fix the page. Run the web tests, tsc and eslint. Commit.

## Task 2 — Desktop application
1. Types, the five `deo:report-*` channels and the `DeoApi` additions.
2. Failing tests for `GetDeoReportScopeUseCase` and `GetDeoReportUseCase`:
   - scope: district, county and schools;
   - no district;
   - each report is called with the session's district;
   - a foreign `schoolId` is refused;
   - the attendance period is passed through.
3. Implement the use cases, the service methods, the factory and the exports.

## Task 3 — Desktop IPC, presentation and renderer
1. IPC handlers with validators and their tests (bad `schoolId` or `period` refused; district never taken from arguments); the DEO gate test; preload, bridge, ipc group and hook.
2. `DeoReportsViewModel` and its tests.
3. `DeoGenerateReportsPage` and the route `deo/reports/automated`. Point the sidebar at it. Make `deo/reports` a ComingSoon page. Page test (watched failing first):
   - banner;
   - tiles switch the report;
   - the Filters panel lists the district's schools;
   - Time Period appears only for Attendance;
   - the export buttons stay disabled until a report has loaded;
   - error with Retry;
   - no district.
4. lint, typecheck, `build:renderer`, the full suite (temporary Node SQLite build, removed afterwards), commit.

## Task 4 — Review
A fresh reviewer, a fix pass, memory, the merge menu.
