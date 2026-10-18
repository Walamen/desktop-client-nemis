# County Admin: Teachers list and teacher profile

Date: 2026-10-18. Repos: `desktop-client-nemis` (the port) and `Nemis` (server + portal-web fixes).
Branches: `feat/county-teachers` in both.

Page 5 of the County Admin migration, after Dashboard, Districts, Schools and Students. The Schools approvals queue
is still skipped.

## 1. Intent

A County Admin uses this page to see who teaches in the county, find a teacher, and open their profile.

Alvin's longer-term goal (2026-10-18): in Liberia **one teacher often teaches at several schools at the same time**.
The County Admin will eventually need a teacher's full teaching history across schools and subjects. The server cannot
record that today: a `Staff` row belongs to exactly one school, `userId` is unique, and a transfer overwrites
`institutionId`. That is a **later server project**. For now (decided by Alvin) this page is **exactly what the web
already has**, with the web's broken numbers fixed on both the desktop and the web.

## 2. What the County Admin sees (decided by Alvin)

- **The list** (`/government/county/teachers`): an exact port of portal-web's
  `app/government/county/teachers/page.tsx`:
  - a dark header band (county name, "Teachers", total);
  - four stat cards;
  - a filter sidebar (Search, Category, Subject, Status);
  - "N teachers found", and a cards/table toggle (cards by default);
  - 12 per page, with the web's pager.
- **The profile** (`/government/county/teachers/details?id=…`): an exact port of the web's
  `app/government/county/teachers/[id]/page.tsx`:
  - the header (back link, photo, name, employee # · school, Subject / Gender / District);
  - stat cards: Years of Service, Classes, Subjects, Status;
  - cards: Personal & Contact, School Assignment (with class chips and the "CT" badge), Subjects Taught,
    Qualifications;
  - "Teacher not found or you don't have access." with Back to Teachers.
- **Fixes (decided by Alvin: "fix them", on the desktop and the web):**
  1. **Teaching staff only.** The list, cards, subject list and stats count `position IN (TEACHER, ASSISTANT_TEACHER)`
     only, the same set as the server's `getTeachingPositions()`. Principals, librarians, counsellors, admin and
     support staff no longer appear.
  2. **The stat cards match the status filter:**
     - **Total Teachers:** all teaching staff at active schools in the county. Sub-line "Registered county-wide".
     - **Active:** `isActive = true`.
     - **Inactive:** `isActive = false`. Replaces the always-zero "On Leave"; there is no leave data.
     - **Unassigned:** active teachers with no class assignment this year (see 5.2).
  3. **The Subject filter works.** It lists the subject names actually taught by the county's teaching staff, and
     filtering by one returns teachers assigned that subject.
  4. **A teacher's subjects count both kinds of assignment (decided by Alvin, 2026-10-18).** These are the subjects
     on the teacher's own list (`subject_teachers`) plus the subjects they teach in a class
     (`class_subject_teachers`). The web's class page assigns teachers only the second way. This applies to the
     Subject dropdown, the filter, `primarySubject`, and the profile's "Subjects Taught" card and "Subjects" count,
     on both the desktop and the web.
  5. **The County Dashboard's "Total Teachers" is brought in line (decided by Alvin, 2026-10-18),** on the desktop and
     the web. Today it counts every active staff member, principals and librarians included.
- **Security fix (included by Alvin's "yes"):** the three web endpoints (`GET /counties/:id/teachers`, `…/stats`,
  `…/:teacherId`) are `@Public()` today. Anyone with a county id can read every teacher's date of birth, national
  ID, phone and address. They get the same guard as the academic-record endpoint.

## 3. Goals, non-goals, anti-goals

- **Goals:**
  - Desktop parity with the web's list and profile, working fully offline.
  - Real numbers on both sides.
  - The teacher endpoints closed to anyone but the county's admin.
- **Non-goals:**
  - Multi-school teaching or teaching history: that is the later server project (section 1).
  - Any write: no create, edit or transfer of teachers on this page. The web has no buttons for these either.
  - Changing the profile beyond fixes 4 and the qualifications rule in 5.3.
  - Other teacher numbers: the unused `GET /counties/:id/teacher-deployment`, the district pages, and county
    reports.
- **Anti-goals:**
  - Inventing leave data, or showing any zero that is not a real count.
  - Shipping more personal staff data to devices than today.

## 4. Constraints

- **Alvin's standing County choices:**
  - compute offline from local SQLite, porting the server formulas;
  - full hexagonal path for reads;
  - `?id=` detail routes under `Suspense` (static export);
  - port web quirks as-is, except fake fallbacks and the fixes in section 2.
- **The County device already holds everything** for every school in the county (no snapshot change, no migration):
  - `staff` (full rows: names, gender, `dateOfBirth`, `nationalId`, `phoneNumber`, `address`, `employeeNumber`,
    `position`, `employmentType`, `dateOfJoining`, `dateOfLeaving`, `qualifications` JSON, `isActive`, `photoUrl`);
  - `subject_teachers`, `class_teachers` (with `isClassTeacher`), `class_subject_teachers`;
  - `classes`, `subjects`, `academic_years` (`isCurrent`), `institutions` (`isActive`, `profile.levels`),
    `districts`, `counties`.
- **Release order:** the desktop page needs nothing new from the server, so the two repos can ship in any order.
  The portal-web fixes and the server fixes ship together (same repo).
- **Tests:**
  - SQLite and renderer tests run with the Electron runner (`ELECTRON_RUN_AS_NODE=1
    ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>`);
  - the server uses jest in `Nemis/apps/Server`;
  - portal-web uses `pnpm vitest run`.
- **Known pre-existing failures:**
  - `renderer/app/page.test.tsx`;
  - the timetable test (flaky);
  - an unhandled error from `Sidebar.test.tsx`.

## 5. How it works (my technical calls, for the builder)

Every item here is my call. The builder may change one if it keeps sections 2 and 3.

### 5.0 A teacher's subjects (fix 4)

- A teacher's subjects are the distinct subjects, by subject id, in the teacher's `subject_teachers` rows **plus**
  their `class_subject_teachers` rows (any year).
- Each subject's `assignedAt` is the earliest across both tables.
- `primarySubject` is the name of the subject with the earliest `assignedAt`, then the lowest name. The web takes
  an unordered first `subjectAssignments` row.
- Every subject use below (list filter, subject list, `bySubject`, `primarySubject`, the profile's subjects) uses
  this set.

### 5.1 List (ported from `counties.service.ts#getCountyTeachers`, plus the fixes)

- **Base set:** `staff` at an institution with `isActive = 1` in the device's county, and `position IN ('TEACHER',
  'ASSISTANT_TEACHER')`.
- **Filters (ported):**
  - **search:** case-insensitive substring on `firstName`, `lastName` or `employeeNumber`. The web's placeholder
    says "Name, ID, school…" but school is not searched; ported as-is.
  - **category:** the school's `profile.levels` contains the value (PRIMARY, SECONDARY, CERTIFICATE, DIPLOMA). The
    web's labels "Technical" and "Vocational" for CERTIFICATE and DIPLOMA are ported as-is.
  - **status:** `active` gives `isActive = 1`; `inactive` gives `isActive = 0`; `all` applies no filter.
  - **subject:** one of the teacher's subjects (5.0) has a name equal to the chosen name, case-insensitively. The web used `contains`; the dropdown now offers exact names, so equality avoids "Math"
    matching "Mathematics" *(my call)*.
- **Order:** `lastName` ascending, then `firstName`, then `id`. The tie-breakers keep paging stable.
- **Paging:** 12 per page.
- **Row:**
  - `id`, names, `photoUrl`, `employeeNumber`, `position`, `isActive`, `gender`;
  - `institution { id, name, level, districtName, countyName }`, where `level` is the first entry of
    `profile.levels` (the web takes `levels[0]`);
  - `primarySubject` (5.0).
- **Photo:** the raw `staff.photoUrl`, with `SchoolPhoto` and its `fallback="/teacher-fallback.jpg"`. The web
  prefers the linked user's image (`resolvePersonPhotoUrl`). That would need a snapshot change to a table school
  devices push back, so it is out of scope (section 7).

### 5.2 Stats (both sides)

All counts are over the base set's schools (active schools in the county) and teaching positions only:
- `total`: all of them, active and inactive.
- `active`: `isActive = true`.
- `inactive`: `isActive = false`.
- `unassigned`: `isActive = true`, and the teacher has **no** `class_teachers` and **no** `class_subject_teachers`
  row for a class in **its school's current academic year**.
  - A class-subject row can exist without a class-teacher row: the desktop's
    `SqliteTeacherRepository.removeAssignment` deletes the `class_teachers` row and leaves its
    `class_subject_teachers` rows, and the sync applier upserts those on their own. So both tables count. (The
    server's own flows always write the class-teacher row first.)
  - Assignments are never removed when a year ends, so without the current-year limit every teacher would look
    assigned forever.
  - A school with no current year has no assignable classes; all its active teachers count as unassigned.
- `subjects`: the distinct subject names (trimmed, deduplicated case-insensitively, sorted) across the base set's
  teachers' subjects (5.0). The Subject dropdown uses this list. On the server it is `bySubject` (name → number of
  distinct teachers).
- The header's "Total" and the card both show `total`.

### 5.3 Profile (ported from `getCountyTeacherById`)

- Any `staff` row whose school is in the county, regardless of position. The list only links to teachers, but the
  web endpoint serves any staff; ported as-is.
- **Fields:** everything in section 4's staff list, plus:
  - `institution { id, name, level, districtName, countyName }`;
  - `primarySubject` (same rule as the list);
  - `classAssignments`: `class_teachers` rows with `{ id, isClassTeacher, class { id, name, gradeLevel } }`, all
    years, as the web does;
  - `subjectAssignments`: the teacher's subjects (5.0) as `{ id, subject { id, name, code } }`, where `id` is the
    subject id, ordered as in 5.0. The "Subjects" stat card counts them.
- `qualifications` is parsed from JSON. The web's `safeQualifications` shows string-array entries only, but the
  desktop teacher form saves `{ summary: "…" }` (`renderer/components/teachers/TeacherFormPage.tsx`), so a recorded
  qualification would read "No qualifications recorded." *My call, under "fix them", on both the desktop and the web:*
  show string-array entries as today, plus a non-empty string `summary` of an object as one entry. Anything else
  shows the empty line.
- A missing id, or a staff row outside the county, shows the not-found state.

### 5.4 Web and server fixes (Nemis)

- **`counties.controller.ts`:** on the three teacher routes, replace `@Public()` with
  `@Roles(SystemRole.COUNTY_ADMIN, SystemRole.SUPER_ADMIN)`, inject `@CurrentUser()`, and call
  `ensureCountyAccess(countyId, user)` in the service first. That gives 403 for another county's admin. The
  academic-record endpoint also lists `MINISTRY_ADMIN`, but `ensureCountyAccess` refuses a ministry admin anyway, so
  it is left out here; a guard test expects 403 for one.
- **`getTeacherStats`:** teaching positions only. Return
  `{ total, active, inactive, unassigned, male, female, byDistrict, byDistrictId, bySchool, byQualification,
  bySubject }`.
  - The four counts follow 5.2.
  - `bySubject` is filled with name → count of teachers.
  - `male` and `female` keep their current meaning (active, by gender), restricted to teaching positions.
  - `activeAssigned` and `onLeave` are removed. The only consumer is this web page.
- **`getCountyTeachers`:** add the position filter, the tie-break order, and the subject rule of 5.0. The subject
  filter becomes `OR` of `subjectAssignments.some` and `classSubjectTeachers.some`, each with an exact
  case-insensitive name. `primarySubject` follows 5.0.
- **`getCountyTeacherById`:** add `ensureCountyAccess`. Build `subjectAssignments` from both tables as in 5.3 (same
  response shape, `id` = subject id). `primarySubject` follows 5.0. Apply the qualifications rule on the web page.
- **`getStats` (County Dashboard), fix 5:** `totalTeachers` counts active teaching staff (`isActive` and teaching
  positions) at active schools. It stays an active-only count, so it equals the Teachers page's **Active** card, the
  same way the dashboard's student total equals the Students page's active count *(my call)*.
- **portal-web:**
  - `teachersApi.ts`: the new `TeacherStats` shape. The fake zero fallback for a missing endpoint becomes an error.
  - The teachers page: cards read Total, Active (sub "Currently active"), Inactive (sub "Not currently active") and
    Unassigned (sub "No class this year"). The Subject dropdown is built from `bySubject` keys, now real.
  - A vitest for the card mapping, as was done for students.

### 5.5 Layers (desktop, same shape as Students)

- **types:** `CountyTeachersQuery`, `CountyTeacherListItem`, `CountyTeacherStats`, `CountyTeachersResult`,
  `CountyTeacherDetail`.
- **application:**
  - `ICountyTeachersReadModel` with `listTeachers(query)` and `getTeacher(id)`;
  - `GetCountyTeachersUseCase`, which adds the county (header);
  - `GetCountyTeacherDetailUseCase`;
  - `CountyApplicationService` methods, port `countyTeachers`, and an in-memory fake.
- **presentation:** `CountyTeachersViewModel` and `CountyTeacherDetailViewModel`, with hooks.
- **electron:**
  - `SqliteCountyTeachersReadModel`, wired in `createDataLayer` and the composition (check the hand-listed keys in
    `deferredApplication` in `apps/desktop/electron/main/main.ts`);
  - IPC channels `county:list-teachers` and `county:get-teacher`, with a validator (limit ≤ 50);
  - the handler, preload, bridge and facade;
  - fix 5: `SqliteCountyAnalyticsReadModel.countActiveTeachers` adds `t.position IN ('TEACHER','ASSISTANT_TEACHER')`.
    The dashboard use case and page are unchanged.
- **renderer:**
  - `app/government/county/teachers/page.tsx` replaces the `SchoolAdminCollectionPage` placeholder;
  - `components/county/teachers/TeacherProfilePage.tsx` behind `app/government/county/teachers/details/page.tsx`
    (under Suspense);
  - aria-labels "Card view" and "Table view" on the toggle, as on Students;
  - the table row and the card's "View Profile" link go to `details?id=`.

## 6. Testing

- **Server:**
  - stats: teaching-only counts, `inactive`, `unassigned` (current-year rule, with both assignment kinds), a real
    `bySubject`;
  - list: position filter, and the subject match through either table;
  - profile: subjects merged from both tables;
  - `getStats.totalTeachers`: teaching positions only;
  - the guard on all three routes: 403 for another county's admin, allowed for this county's admin.
- **portal-web:** the card mapping, the Subject options taken from `bySubject`, and the qualifications rule.
- **Desktop SQLite (read model):**
  - every filter;
  - order and paging;
  - the non-teaching positions excluded;
  - each stat, including unassigned with a past-year-only assignment, a class-subject-only assignment, and a school
    with no current year;
  - the subject list deduplicated;
  - a teacher whose subject comes only from `class_subject_teachers` appearing under it;
  - `primarySubject` order across both tables;
  - the profile with classes, merged subjects, and qualifications (array, `{ summary }`, other);
  - `countActiveTeachers` excludes non-teaching positions;
  - a non-county staff member gives null.
- **Renderer:**
  - list parity (cards, filters, toggle, paging, links);
  - profile sections;
  - the not-found state.

## 7. Known risks and open points

- **Photos:** teachers whose photo exists only on their user account show the fallback on the desktop. Same as the
  deferred Students minor.
- **Profile "Classes":** it counts class-teacher rows from all years, as the web does, so a long-serving teacher's
  number grows every year. Left unchanged, per section 3.
- **Dashboard vs Teachers page:** the dashboard's Total Teachers is active-only, so it equals the Teachers page's
  Active card, not its Total, which includes inactive teachers. Students already work this way.
- **Multi-school teaching:** the later server project should revisit this page's model (one school per teacher).
