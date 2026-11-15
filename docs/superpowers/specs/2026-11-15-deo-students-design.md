# DEO Students & Enrollment — design (piece 5 of 10)

Date: 2026-11-15. Repos: desktop-client-nemis and Nemis, branch `feat/deo-students` in both, cut from `main`.
Web layout reference: `2026-11-14-deo-portal-web-design-reference.md` §4.6.

## Goal

Replace the desktop's raw `students` table at `/government/deo/students` with the web's Students & Enrollment page, computed offline from this device's SQLite. Fix the web's numbers so both apps agree. The server ships first.

The page is a district enrolment overview by school. It lists no individual pupils.

## Decisions (Alvin approved the proposals on 2026-11-15)

1. **Level shows the school's real levels** (`formatLevels`, already shared with Schools). The web showed "Primary" for every school because `/institutions` sends no level.
2. **"N pupils at risk" counts pupils, not the whole enrolment.** A pupil is at risk when they are active, have at least 5 attendance records in the last 30 days, and `attended × 100 < 80 × records` (an exact comparison, not a rounded one). LATE counts as attended. Pupils are counted at their own school (`students.institutionId`). With fewer than 5 records, a pupil is not judged.
3. **The reason says what is true.**
   - "Attendance is X%" when the school's rate is below 80.
   - Otherwise "Flagged in district monitoring" when its compliance status is Flagged.
   - Otherwise "No report submitted yet".
4. **Avg Attendance is weighted:** all attended over all records in the last 30 days across the district's active schools, rounded. With no records it is "No Data" (shown as "—"). Schools with no data no longer count as 0%.
5. **The status chip is the shared standing rule's `performanceStatus`**: Good / Warning / Critical / No Data, the same value the Dashboard and Schools pages use.

## Which schools get a dropout alert

A school is listed when it has active pupils and any of these is true:
- its attendance rate is below 80 (not null);
- its compliance status is Flagged;
- it has no submitted report.

The web's old "Critical" condition is a subset of "rate < 80", so it is replaced by Flagged, which is what "flagged in district monitoring" means. The sort is worst rate first, then name. Schools with no data (null rate) go last.

## Data: one result, built the same on both sides

`DistrictStudentEnrollment` (Nemis `@nemis/types` deo.ts) / `DeoStudentsResult` (desktop types):

```
{ districtId, district, county,            // desktop only: the banner names
  summary: { totalEnrollment, male, female, avgAttendance: number | null },
  enrollmentTrend: { period, enrollment }[],   // the existing 6-month cumulative trend
  genderDistribution: { male, female },
  schools: [{ id, name, code, levels, students, teachers, attendanceRate | null,
              lastSubmissionAt | null, performanceStatus }],   // by name
  dropoutAlerts: [{ schoolId, schoolName, attendanceRate | null, reason, atRiskStudents }] }
```

- **totalEnrollment** is the sum of active pupils over the rows. **male / female** come from the existing gender split.
- **Server:** `GET /districts/:id/student-enrollment` (DEO, SUPER_ADMIN, COUNTY_ADMIN; `ensureDistrictAccess`). It builds on `computeSchoolStandings` and the existing chart-data trend and gender code. It adds one attendance aggregate for the weighted average and one per-pupil aggregate for at-risk counts.
- **Desktop:** `GetDeoStudentsUseCase` builds on `buildDistrictSchoolRows`, the dashboard's `enrollmentTrend` (now exported) and `countActiveStudentsByGender`. It uses `attendanceBySchool` for the weighted average. A new read-model method, `countAtRiskStudentsBySchool(districtId, sinceDate)`, does one grouped query.
- **Channel:** `deo:list-students`, DEO-only, no arguments. The district comes from the session.

## Page (both apps, same layout as web §4.6)

- **Banner:** "Students & Enrollment", plus the district and county.
- **Cards:** Total Enrollment, Male Students, Female Students, and Avg Attendance ("—" when there is no data).
- **Enrollment Trend bars and Gender Split ring:** unchanged from the web.
- **Enrollment by School table:**
  - School;
  - Level chip (purple when the label is "Primary", otherwise indigo);
  - Total;
  - Teachers;
  - Last Submission ("Mon DD, YYYY" or "No submission");
  - Attendance (coloured at 90 / 75, or "No Data");
  - Status chip (Good green, Warning amber, Critical red, No Data grey).
- **Dropout Alerts:** the reason, plus "N pupils at risk" in red when N > 0, otherwise "No pupil below 80%" in grey.
- **Desktop states:** loading, error with Retry, no district, and refresh on sync.

## Out of scope

Individual pupil lists, the school detail link (next task), and the web's other uses of `/chart-data` and `/school-performance`. Those endpoints stay as they are.
