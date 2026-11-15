# DEO Teachers page on the desktop — design

**Date:** 2026-11-15
**Branch:** `feat/deo-teachers` (both repos), cut from `feat/deo-school-admins`
**Piece:** 4 of 10. Layout reference: `2026-11-14-deo-portal-web-design-reference.md` §4.5.

## Why

The desktop DEO Teachers page is a raw table. The DEO needs the web's Teacher Monitoring page, offline, with real figures (option A).

## What the web does today

`GET /districts/:id/teachers` (`getDistrictTeachers`):

- **Attendance** comes from `StaffAttendance`, which nothing in the system writes. So every rate is 0%, and "Low Attendance" and "On Leave" are always 0.
- **Grades pending** is true only when the teacher's subjects have current-term assessments and *none* of them has a single grade. A teacher with one graded and nine ungraded assessments shows "Submitted".
- **Subjects** come from `subject_teachers` only. The web's class page writes `class_subject_teachers`, so most teachers show their first class's grade or "General".
- **Banner:** "Buchanan · Grand Bassa", hard-coded.

The same endpoint feeds the Analytics page and the school pop-up, so it is left alone.

## Goals

1. Desktop matches the web layout and works offline.
2. Every figure is real; anything with no source says so.
3. The web Teachers page shows the same.

## Non-goals

Recording teacher attendance (a feature of its own), Analytics, the school pop-up, teacher detail.

## Approaches

**A. Replace the attendance figures with real ones the data supports (chosen).** Attendance shows "Not recorded", with a note on the page. The two attendance-based cards and tabs are replaced by two real ones the County Teachers page already defines: Pending Approval, and Unassigned.
**B. Keep the attendance cards at 0.** Rejected: it presents missing data as a measured zero.
**C. Build teacher attendance recording first.** Rejected for this piece: it is a new feature with its own screens for School Admins.

## Design

### Who is listed

Active teaching staff (TEACHER, ASSISTANT_TEACHER) at active schools of the district, by last name then first name.

### Per teacher

| Field | Rule |
|---|---|
| Subjects | names from `subject_teachers` ∪ `class_subject_teachers` (the County rule), distinct, sorted |
| Subject column | the first subject (names trimmed in code, as JS `trim()`); else the grade level of their first current-year class at their own school, ordered by grade (KG, K1, K2, GRADE_1 … GRADE_12; never text order), then class name, then id, sorted in code on both sides; else "General" |
| Attendance | "Not recorded" (grey) |
| Grades | **Pending**: some current-term assessment they own has no grade. **Submitted**: they own current-term assessments and all have grades. **No assessments**: they own none this term. They own an assessment when they teach its class and subject (`class_subject_teachers`), or teach its subject at that school (`subject_teachers`). The current term is the school's `isCurrent` term, reached through the assessment's grading period. Both ownership routes require the class to be at the teacher's own school. A grade counts only when its student belongs to the district: the desktop holds only those grades, so the server counts the same. Teachers sort by last name, first name, then id. |
| Status | **Pending Approval** when `approvalStatus` is not APPROVED; otherwise **Active** |
| Unassigned | active and no `class_teachers` / `class_subject_teachers` row in a class of the school's current academic year (County Teachers rule) |

### Page

- **Banner:** "DEO Portal" / "Teacher Monitoring", plus the real district and county.
- **Cards:** Total Teachers, Grades Pending, Pending Approval, Unassigned.
- **Views:** Individual Teachers / By School.
- **Tabs:** All, Grades Pending, Pending Approval, Unassigned. They apply to both views.
- **Note** under the Teacher Overview heading: "Teacher attendance is not recorded in NEMIS yet."
- **Individual table:** Teacher (initials, name, employee number), School, Subject, Attendance ("Not recorded"), Grades chip (Pending amber, Submitted green, No assessments grey), Status chip.
- **By School table:** School (first three subjects, or "No subjects linked"), Teachers, Pending Grades, Pending Approval, Unassigned, Status ("Needs Attention" when any of the three is above zero, else "Stable").

### Desktop

- `IDistrictOverviewReadModel.listTeachers(districtId)` returns per teacher: id, names, employee number, school id and name, approvalStatus, subject names, first current-year class grade level, owned and ungraded current-term assessment counts, and an unassigned flag.
- `GetDeoTeachersUseCase` → `DeoTeachersResult { districtId, district, county, teachers, summary }`.
- Channel `deo:list-teachers` in `DEO_CHANNELS`.
- `DeoTeachersViewModel`; pure helpers `teacherTabCounts`, `filterTeachersByTab`, `groupTeachersBySchool`.
- The page replaces the raw table.

### Server and web

- `GET /districts/:id/teacher-monitoring`: the same rules and shape, with an access check.
- The web Teachers page reads it, and the settings query for the banner.

## Calls made

1. **Attendance shows "Not recorded"**, with a note. On Leave and Low Attendance are replaced by Pending Approval and Unassigned.
2. **Grades Pending means any ungraded current-term assessment** the teacher owns, not "nothing graded at all".
3. **A third grade state, "No assessments"**, instead of calling it "Submitted".
4. **Subjects come from both assignment tables**, as on the County pages.
5. **A new endpoint**, so Analytics and the school pop-up keep working unchanged.
