# Window grades per-assessment matrix — design

**Date:** 2026-11-14
**Repos:** desktop-client-nemis (the page rebuild) and Nemis `apps/portal-web` (two label changes only; no server change)
**Status:** approved in conversation by Alvin 2026-11-14 ("mirror the web exactly"; labels "NEMIS ID" and subject name only, on both apps)

## Intent

The School Admin "View Grades" page for a grade entry window
(`components/academic-grading/WindowGradesPage.tsx`) must show, per class and
subject, one column per assessment with each student's marks, then the final
grade and status — exactly as portal-web's
`academic-grading/windows/[id]/grades/page.tsx` does — so the admin can see how
every final grade was derived.

## Why

Today the desktop page shows fixed CA / Test / Exam columns. Since the weighted
assessment-templates feature, teachers on desktop no longer write those fields
for regular periods, so the columns are always "—" and the admin cannot see the
component scores. The file comment claiming the assessments repo is unbuilt is
stale: the `assessments` and `assessment_templates` tables exist and the teacher
gradebook writes one `grades` row per student × assessment (`assessmentId` set)
plus one final row (`assessmentId` null), the same shape as the server.

## Bugs fixed on the way

- `gradeFor` picks the first matching `grades` row regardless of
  `assessmentId`, so a per-assessment row can be shown as the final grade.
- The summary strip counts per-assessment rows as finals.
- `listGradesForPeriod` takes only the first 250 rows of the whole `grades`
  collection; with per-assessment rows one class can exceed that in one period.

## Goals

1. Same table as the web: Student, NEMIS ID, one column per assessment
   (header: name, `/totalMarks`, `· weight%` when set), Final Grade, Status.
2. Same semantics as the server's `getWindowGrades`:
   - classes = distinct `classId` among grades in the window's period;
   - subjects per class = union of subjects seen in that period's assessments
     and grades, sorted by name;
   - assessments per subject = `assessments` rows for class + subject + period,
     ordered by `date`;
   - a student's assessment cell = `marksObtained` of the grade row whose
     `assessmentId` matches; "—" when absent;
   - final = the grade row with `assessmentId` null; shows `percentage.toFixed(1)%`
     when present, else `marksObtained/maxMarks`, plus `(letterGrade)`;
     "Not submitted" when absent;
   - summary: Students Graded = distinct students with a final row;
     Finals Submitted = final rows with status SUBMITTED; Finals Published =
     final rows with status PUBLISHED.
3. Exam-type periods mirror the web exactly: no assessment rows exist, so the
   table has only Student, NEMIS ID, Final Grade, Status. No "Exam" column.
4. CSV export mirrors the web: Student, NEMIS ID, one column per assessment
   (`Name (/total)`), Final %, Grade, Status.
5. Read every `grades` row for the period (page through the collection, as the
   teacher gradebook's `listAllGrades` does) instead of the first 250.
6. Labels identical on both apps (Alvin's decision):
   - the student-identifier column header is **"NEMIS ID"** (web today says
     "Adm #"); the search placeholder is "Search student name or NEMIS ID…"
     (web today says "admission #");
   - subject tabs show the **subject name only** (desktop today shows
     `code — name`; web already shows the name).
7. The class roster shows every active student of the class. The Students
   ViewModel pages at 25 by default, so the page asks for 100 (the IPC list
   cap, `MAX_LIMIT` in `electron/security/validateIpc.ts`).

## Non-goals

- No new IPC channel, SQL read model or ViewModel; the page keeps using the
  generic `listSchoolAdminRecords` collections like the rest of the file.
- No change to the teacher gradebook or the server. portal-web changes are
  limited to the two labels in goal 6.
- No change to who may open the page (route already requires TEACHING, whose
  read set covers `grades`, `assessments`, `assessment_templates`).
- The student roster still comes from the Students ViewModel filtered by class
  and `isActive`, as today (page size aside, goal 7).
- The teacher gradebook keeps its own `listAllGrades`; folding it into the
  shared helper is a follow-up.

## Approaches considered

1. **Build the matrix in the renderer from the generic collections** (chosen).
   Fits how this page and the teacher gradebook already work; one file plus
   small helpers in `shared.tsx`/`assessments.ts`; tests stay in the existing
   renderer test file.
2. A main-process SQL read model + IPC query returning the web's
   `WindowGradesResponse` shape. Better for volume, but a port, use case,
   ViewModel, adapter and channel for a read-only page; rejected as
   disproportionate here.
3. Keep CA/Test/Exam columns and add assessment columns beside them. Rejected:
   CA/Test are dead fields on desktop and Alvin chose to mirror the web.

## Design

- `shared.tsx`: `listGradesForPeriod` pages through the whole `grades`
  collection (limit 250, offset loop) before filtering by `gradingPeriodId`.
  Add `listAssessmentsForPeriodAll(gradingPeriodId)` (all classes/subjects) in
  `assessments.ts` with the same paging.
- A pure helper `buildWindowGrades(grades, assessments)` (new
  `window-grades.ts` next to the page) returns `{ classIds, subjectsByClass,
  assessmentsBySubject, finalFor(student, class, subject), marksFor(student,
  assessmentId), summary }` — the server algorithm, unit-tested directly.
- `WindowGradesPage.tsx` loads window → grades + assessments in parallel,
  feeds the helper, renders the web table. Subject tab label is the subject
  name from the foundation ViewModel (falls back to the id if unknown).
- Status badge shows the final row's `status` only (web shows no
  "· Published" suffix; PUBLISHED is a status).
- Delete the stale file comment.
- portal-web `windows/[id]/grades/page.tsx`: header "Adm #" → "NEMIS ID",
  placeholder "…or admission #…" → "…or NEMIS ID…". Nothing else.

## Tests

- `window-grades.test.ts`: classes/subjects derivation, assessment ordering by
  date, final vs per-assessment row selection, summary counts (SUBMITTED vs
  PUBLISHED vs DRAFT), exam-period window with no assessments.
- `WindowGradesPage.test.tsx`: existing three tests keep passing; add one that
  renders assessment column headers and a per-assessment cell, and one that
  shows the final from the null-`assessmentId` row when a per-assessment row
  for the same student sorts first.
- `shared` paging: a test that `listGradesForPeriod` requests a second page
  when the first page is full.
- portal-web: no new test; the file has none and the change is two strings.
  The portal-web typecheck and existing Vitest suite must stay green.

## Left to the builder

Exact Tailwind classes (copy the web's), column widths, and whether the
helper's return shape is a class or plain object.
