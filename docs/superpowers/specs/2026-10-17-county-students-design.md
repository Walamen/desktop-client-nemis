# County Admin: Students list and student detail

Date: 2026-10-17. Repos: `desktop-client-nemis` (most of the work) and `Nemis` (server, ships first).
Branches: `feat/county-students` in both.

Page 4 of the County Admin migration. It follows Dashboard, Districts and Schools. Alvin chose to skip the Schools
approvals queue for now.

## 1. Intent

A County Admin opens a student to answer one question: **"where has this child been, and are they progressing year
by year?"** (confirmed by Alvin, 2026-10-17).

The pieces:
- **The list.** The web's County Students page is a single list with stat cards and filters. It is ported exactly.
- **The detail page.** Neither portal-web nor the desktop has a County student detail page, or any view of a student's
  year-by-year record or transfer history. This page is a **new design**, not a port. Clicking a student in the list
  opens it.

## 2. What the County Admin sees (decided by Alvin)

**Students list** (`/government/county/students`)
- A port of `Nemis/apps/portal-web/src/app/government/county/students/page.tsx` (591 lines):
  - header band;
  - stat cards;
  - search;
  - filters: district, school, grade, performance, status;
  - table/cards toggle;
  - 12 per page.
- **One change:** each student opens the detail page (`/government/county/students/details?id=<studentId>`).

**Student detail page**: layout **B, tabs** (Alvin picked it from the mockups on 2026-10-17).
- **Header.**
  - Photo, name, NEMIS ID, current grade and school, active/inactive.
  - Same dark header band style as the County School detail page.
- **Overview tab.** The details the web's School Admin student page shows (`portal-web …/school-admin/students/[id]/page.tsx`):
  - Personal Information;
  - Contact Information;
  - Enrollment;
  - Guardian / Parent.
- **Academic record tab.** A table with one row per school year, newest first. Columns:

  | Column | Content |
  |---|---|
  | Year | |
  | Grade | |
  | School | |
  | Class | |
  | Outcome | Promoted / Retained / Graduated / In progress |
  | Average | |
  | Attendance | |

  - **Offline:** shows every year at this county's schools, straight from the device.
  - **Online:** also asks the server for the child's full record. It adds the years at schools **outside the county**,
    each marked "Other county". Those rows show grade, school, class, outcome and the average the school recorded at
    the decision. Attendance is left blank for them.
  - **Server unreachable:** the tab keeps the local years and shows one quiet line: *"Showing this county's records
    only — connect to see years at other schools."* No error and no endless spinner.
  - **Not cached:** fetched years are fetched fresh each time the tab opens online.
- **Transfers tab.** Every transfer, newest first. Columns:
  - date;
  - from school → to school;
  - status;
  - reason;
  - who reviewed it and when.

  Transfers in or out of the county are on the device. When online, the same server answer adds transfers between
  schools elsewhere.

**Who may see the fetched record** (Alvin agreed): the server returns a student's full record only to a County Admin
whose county currently has the child at one of its schools. A child who has since left the county shows only what
this county recorded.

## 3. Goals, non-goals, anti-goals

**Goals**
- The list looks and behaves like the web's, offline, from local data.
- The detail page answers "where has this child been, and are they progressing?" with no connection, then fills in
  the rest of the country when online.

**Non-goals**
- Editing students, transfers, enrolments or outcomes. The page is read-only, like the web's list.
- Per-subject grades and per-term breakdowns. One row per year is enough for the question.
- Caching the fetched national record on the device.
- Students outside the county: there is no national search.
- The Schools approvals queue (skipped for now).

**Anti-goals**
- **A child's other-county years shown to a county that no longer holds them.** That is a data-isolation breach.
- **Mixing up two students' years.** A row must always belong to the student shown.
- **The Academic record tab looking empty or broken offline.** It must always show the local years first.
- **A fetched year duplicating a local one.** The same year at the same school shows once.

## 4. Constraints

- **Alvin's standing County choices:**
  - compute offline from local SQLite, porting the server formulas;
  - close data gaps with server snapshot changes (server ships first);
  - full hexagonal path for reads;
  - server writes are online-only commands; this page has none, but the fetch follows the same online-only style;
  - `?id=` detail routes under `Suspense` (static export);
  - port web quirks as-is, except fake hard-coded fallbacks.
- **The County device already holds:**
  - **For every school in the county:** `students`, `enrollments`, `classes`, `academic_years`, `attendance`,
    `grade_completions` (with `averageAtDecision`), `guardians` and `student_guardians`, `institutions`, `districts`.
  - **Transfers:** `student_transfers` for transfers to or from the county's schools, with student, from and to names.
- **Data gaps (see 5.1):**
  - No term averages (they drive "performance" and the year average).
  - No student photo.
- Tests use the Electron runner for SQLite (`ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe
  ./node_modules/vitest/vitest.mjs run <paths>`) and jest in `Nemis/apps/Server`.
- Known pre-existing failures:
  - `renderer/app/page.test.tsx`;
  - `renderer/app/government/teacher/timetable/timetable.test.tsx`;
  - an unhandled error from `Sidebar.test.tsx`.

## 5. How it works (my technical calls, for the builder)

Every item here is my call. The builder may change one if it keeps §2 and §3.

### 5.1 Closing the data gaps (server snapshot, desktop migration 035)

- **Term averages.**
  - Ship a new `termAverages` collection for the scope's schools, limited to the **current and previous academic
    years**. Send these columns: `id, studentId, subjectId, termId, classId, percentage, calculatedAt, updatedAt`.
  - Desktop table `term_averages`, pull-only (no outbox triggers), imported like any snapshot table.
  - The two-year window keeps the volume bounded. The web's "last 5 term averages" are always within it for an
    enrolled child.
  - Apply the snapshot to the INSTITUTION and COUNTY scopes. TEACHER stays restricted as today.
- **National ID.** The Overview shows it, but it is not shipped. Add `nationalId` to the snapshot's student rows and a
  desktop column `students.nationalId` *(my call, under the standing "close data gaps" rule)*.
- **Student photo.** Add `photoUrl` to the snapshot's student rows, resolved the way `getCountyStudents` does it
  (`resolvePersonPhotoUrl`). Desktop column `students.photoUrl`. The CSP already allows `res.cloudinary.com`; use the
  `SchoolPhoto`-style fallback when the image fails.
- Bump the importer specs, and force a full resync once (as migration 029 does) so existing devices get the new data
  at once.

### 5.2 List formulas (ported from `counties.service.ts`)

- **Stat cards (decided by Alvin, 2026-10-17: real numbers on both the desktop and the web).**
  - **The web bug.** The web's cards always show 0. `counties.service.ts` `getStudentStats` computes its counts and
    then returns `{ success, resolvedAt }`. The web store then falls back to zeros, and the page reads
    `status.active` / `status.inactive`, which nothing computes.
  - **The definitions, for both apps:**
    - **Total:** every student at the county's **active** schools.
    - **Active:** those with `isActive` true (the card says "Currently enrolled").
    - **Inactive:** the rest ("Not currently enrolled").
  - **"Schools"** stays the web's `schools.length`.
  - **The web fix (server + portal-web).**
    - `getStudentStats` returns `{ total, male, female, newThisYear, status: { active, inactive }, … }`, with
      `status.active` / `status.inactive` as numbers and its other computed fields as before.
    - The web store's `StudentStats` type follows.
    - The zero fallback stays only for a genuinely missing endpoint.
    - Add a jest test for the returned shape.
- **List (`getCountyStudents`):**
  - Students at active county schools.
  - **Filters:**
    - district: the school's district;
    - school;
    - status: `active` / `inactive` on the student;
    - search: case-insensitive "contains" on first name, last name or NEMIS ID;
    - grade: an ACTIVE enrolment in a class of that grade.
  - **Order and paging:** ordered by last name, 12 per page.
  - **Current class:** the latest ACTIVE enrolment's class (name, grade).
  - **`avgPercentage`:** the mean `percentage` of the student's 5 most recent term averages, by `calculatedAt`.
  - **Performance label:** ≥ 85 Excellent, ≥ 70 Good, ≥ 50 Average, otherwise Below Avg; null when there are no term
    averages.
  - **Quirk ported as-is:** the performance filter runs **after** paging, so a page can show fewer than 12 and the
    total becomes the filtered page's size.
- Computed in a SQLite read model through the hexagonal path, as the Schools list is.

### 5.3 Detail: local data

`getStudent(id)` returns the student only if the device holds them (own county).

- **Overview:** student fields, current school/district/county, current enrolment, guardians (primary first).
- **Academic record, local:**
  - **Rows:** one per (academic year, school) from the student's enrolments in this county's classes, joined to
    `grade_completions` for that student and year.
  - **Row:** one per year. Enrolments are stored per term, so where a child moved classes within a year, the row shows
    the **latest** class that year *(my call)*.
  - **Outcome (decided by Alvin, 2026-10-17):**
    - **Recorded:** the completion's outcome (`PROMOTED` / `RETAINED` / `GRADUATED`).
    - **No completion, current year:** "In progress".
    - **No completion, past year:** **"Not recorded"**. It is never guessed from the next year's grade.
  - **Average (decided by Alvin, 2026-10-17):**
    - **Completed year:** the completion's `averageAtDecision`.
    - **Otherwise:** the mean of that student's `term_averages` in that year, for **any** year that has them (the
      two-year window means the previous year's are on the device).
    - **Neither:** blank.
  - **Attendance:** present ÷ recorded `attendance` rows for that student in that year's class, as a percentage.
    Present counts PRESENT and LATE, matching how the dashboard counts attendance (check its formula and reuse it).
- **Transfers, local:** `student_transfers` for the student.
  - School names come from the stored display fields.
  - "Reviewed by" is a name when that user is on the device, otherwise blank.

### 5.4 Detail: the online fetch (new server endpoint)

- **Endpoint:** `GET /counties/:countyId/students/:studentId/academic-record`, roles `COUNTY_ADMIN` (plus
  `SUPER_ADMIN` and `MINISTRY_ADMIN`, like the other county endpoints).
  - Answer 404 unless the student's **current** institution is in `:countyId`.
  - Answer 403 unless the caller may access `:countyId` (the existing county access check).
- **Response:**
  - `years`: one item per (year, school) across all schools, using the latest class in the year, joined to the grade
    completion for that year. Each item:
    `{ academicYearId, academicYearName, academicYearStartDate, institutionId, institutionName, countyName, className,
    gradeLevel, outcome, nextGradeLevel, average }`.
    - `average` follows the same rule as 5.3: the completion's `averageAtDecision`, else the mean of the student's
      TermAverage `percentage` that year, else null.
    - `outcome` is null when there is no completion. The page shows "In progress" or "Not recorded" by the same rule
      as 5.3.
  - `transfers`: all of the student's transfers, with school names, status, reason, dates and reviewer name.
- **Desktop:** a bridge-only online call, like `settleSchoolRegistrations` and the DEO commands. It goes through a
  `BackendProvisioningGateway` method and an IPC channel in `COUNTY_ADMIN_CHANNELS`.
  - Offline it returns at once with "unavailable".
  - The page merges the result into the local rows (5.5).
- **Release:** server first. An older server answers 404; the page treats that like "unreachable".

### 5.5 Merging local and fetched rows

- **Years:** keyed by (academicYearId, institutionId).
  - The local row wins: it carries attendance. A local field that is blank (average or outcome) is filled from the
    fetched row *(my call)*.
  - A fetched row whose institution is not a local institution is marked **"Other county"**.
- **Transfers:** keyed by id. The local row wins.
- **Ordering:** newest first, by the academic year's start date (fetched rows carry the year name; the builder adds a
  start date to the response if needed for ordering).
- **Anti-goal guard:** the merge only ever runs on rows for the student whose id is in the URL. Test it with two
  students.

### 5.6 Layers

- **types:** `CountyStudentListItem`, `CountyStudentsResult` (+ stats), `CountyStudentDetail`, `StudentYearRecord`,
  `StudentTransferRecord`, `StudentAcademicRecord` (the fetched shape).
- **application:** `ICountyStudentsReadModel` (list + stats + detail), use cases, `CountyApplicationService` methods.
- **presentation:** `CountyStudentsViewModel`, `CountyStudentDetailViewModel`. The merge (5.5) is a pure function the
  detail view model or page uses, so it can be tested.
- **electron:**
  - SQLite read model;
  - importer/migration changes;
  - gateway method;
  - IPC channels, preload, bridge and facade;
  - hooks.
- **renderer:** the list page (port) and `components/county/students/StudentDetailPage.tsx`, behind
  `app/government/county/students/details/page.tsx`.

## 6. Testing

- **Server:**
  - `getStudentStats` returns real `total`, `male`, `female` and `status.active` / `status.inactive` counts (web fix);
  - snapshot ships `termAverages` (window), student `photoUrl`, and both scopes;
  - the academic-record endpoint:
    - full record across schools;
    - 404 for a student whose current school is outside the county;
    - 403 for another county's admin.
- **Desktop SQLite:**
  - migration 035;
  - the importer imports term averages and photoUrl;
  - the read model:
    - every list filter, the performance quirk, ordering and paging;
    - stats;
    - detail: years (latest class per year), averages from completions or term averages, attendance, "In progress" vs "Not recorded", transfers.
- **Pure:** the merge (dedupe, local wins and blank fields filled, "Other county" marking, two-students guard, ordering).
- **Renderer:**
  - list parity (filters, toggle, paging, click-through);
  - detail tabs;
  - Academic record:
    - offline;
    - online merged;
    - unreachable line;
  - Transfers tab.

## 7. Known risks and open points

- **Volume:** term averages for a whole county over two years can be large. The window is the mitigation. Measure
  snapshot size on real data before release.
- **Older history:** years before the two-year window show the completion's average only; those rows have no term
  averages.
- **Approval transfers:** the local `student_transfers` covers only transfers touching this county. Other-county
  transfers appear only online.
