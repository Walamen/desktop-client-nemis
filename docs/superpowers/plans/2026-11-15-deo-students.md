# DEO Students — implementation plan (piece 5)

Spec: `docs/superpowers/specs/2026-11-15-deo-students-design.md`. Native inline execution, TDD (watch every new test fail first).

## Task 1 — Server (Nemis, ships first)
1. Types: `DistrictStudentEnrollment`, `DistrictEnrollmentSchool`, `DistrictDropoutAlert` in `packages/types/src/deo.ts`; `pnpm --filter @nemis/types build`.
2. Failing spec `districts.student-enrollment.spec.ts`:
   - weighted average, and null with no records;
   - the at-risk rule (5-record minimum, exact < 80%, LATE attends, inactive pupil ignored, counted at the pupil's school);
   - dropout listing, reasons and sort;
   - the no-pupils school excluded;
   - another district's DEO refused.
3. `getDistrictStudentEnrollment(districtId, user?)` in `districts.service.ts`. Reuse `computeSchoolStandings` and extract the trend and gender code from `getDistrictChartData` into a private helper used by both.
4. Route `GET :id/student-enrollment`. Run the district tests and the full server suite.

## Task 2 — Web (Nemis)
1. In `lib/deo-dashboard.ts`, add `attendanceColor(rate)`, `levelChipClass(label)` and `performanceChipClass(status)`, with tests.
2. In `deoApi.ts`, add `getDistrictStudentEnrollment`.
3. Rewrite `app/government/deo/students/page.tsx` to the new endpoint, using real names and levels. Run the web tests, tsc and eslint. Commit.

## Task 3 — Desktop
1. Types: `DeoStudentsResult` and friends, `DeoApi.listStudents`, and the IPC channel `deo:list-students`.
2. Read model: `countAtRiskStudentsBySchool`, with failing SQLite tests covering the same cases as the server, plus a query-plan check that it uses an attendance index.
3. `GetDeoStudentsUseCase`, with a failing test (same cases as the server), the service, the factory and the export. Export `enrollmentTrend` from the dashboard use case.
4. IPC handler and test, the DEO gate test, preload, bridge, ipc group and hook.
5. `DeoStudentsViewModel`, helpers (`attendanceColor`, `levelChipClass`, `performanceChipClass`) and tests.
6. `DeoStudentsPage` and the route, with a page test watched failing against the old page.
7. lint, typecheck, `build:renderer`, the full suite (with the temporary Node SQLite build, removed afterwards), commit.

## Task 4 — Review
A fresh reviewer, a fix pass, memory, the merge menu.
