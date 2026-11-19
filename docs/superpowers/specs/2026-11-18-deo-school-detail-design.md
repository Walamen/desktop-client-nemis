# DEO sub pages, piece 1: School detail

**Date:** 2026-11-18
**Repos:** Nemis (server, `packages/types`, portal-web) and desktop-client-nemis
**Size:** project (server route + web rewrite + desktop slice)
**Release order:** server first, then web, then desktop

## Intent

A District Education Officer opens one school from the Schools or Finance page and needs that school's real picture in one screen: who leads it, how many pupils and teachers it has, whether pupils come to school, how they score, how pupils spread across grades and gender, whether fees are collected, and whether the school keeps reporting.

The web page at `/government/deo/schools/[id]` has this layout today, but most of its numbers are invented. It picks the school out of the district school list (`GET /institutions?districtId=`), which carries none of these figures. The page then fills in fake values:
- the "Compliant" chip is always shown
- level "Primary", address "Buchanan City", "Est. 2001"
- male = 51% of total
- attendance, performance and fees fall back to 0%
- reports default to "0/3", with the caption "All required reports submitted"

The desktop route `/government/deo/schools/details?id=` is a `ComingSoon`, although the DEO Schools and Finance pages already link to it.

This piece keeps the web layout. It replaces every invented value with a real figure or an honest "No data", and brings the same page to the desktop, computed offline from SQLite.

## Goals

- **Server:** add one route that returns everything the page shows for one school of the district.
- **Web:** rewrite `schools/[id]/page.tsx` to call that route. Same layout; no fake fallbacks; separate loading, error and not-found states.
- **Desktop:** add a DEO use case, a `deo:get-school` channel, a view model and a `DeoSchoolDetailPage` at `deo/schools/details`. Same layout and figures as the web, from local data.
- Every figure follows a rule that already exists, so the detail page agrees with the Schools, Finance and Generate Reports pages (the full list is under "Decided content").

## Non-goals

- No new figures beyond what the web layout shows.
- No editing or actions on the page; it is read-only.
- No change to the County school detail page (a different profile-style screen).
- No change to how the Schools, Finance or Reports pages compute their numbers.
- The parked server `actionUrl` fixes belong to the Alerts piece, not this one.

## Anti-goals (a failure even if it "works")

- Any figure shown as `0` or `0%` when the truth is "nothing recorded".
- A number on this page that disagrees with the same school's row on the Schools page, the Finance page, or Generate Reports → Academic → by school.
- A DEO reaching a school outside their district, on either app. On the desktop, the district comes from the session, never from the renderer.
- Grade rows sorted as text (`GRADE_10` before `GRADE_2`).

## Decided content (agreed with Alvin, 2026-11-18)

| Element | Source / rule | When missing |
|---|---|---|
| Banner chip | `complianceStatus` from the standings rule (Compliant / Needs Review / Flagged), same colours as the Schools page | always present |
| Header line | levels · address · "Est. YYYY" | each part is left out when not recorded; "Est." only with a recorded `establishedYear` |
| Principal | active School Admin, else the metadata principal (standings rule) | "Not recorded" |
| Total Students | active students (standings rule) | 0 is a real count |
| Total Teachers | active teaching staff (standings rule) | 0 is a real count |
| Attendance % | 30-day window (standings rule) | "No data" when `attendanceRate` is null |
| Performance Avg % | **option (a), Alvin's pick:** this academic year's published grades for the school, averaged exactly as Generate Reports → Academic by school does (`summarizeAcademicGrades`) | "No data" when the school has no published grades this year |
| Enrolment by Grade | active students grouped by **their own `gradeLevel`**, the district enrolment report's rule; sorted in code by GradeLevel declaration order | existing empty text "No enrollment data available"; students with no grade go in a final "Grade not set" row |
| Gender Distribution | active students MALE / FEMALE; any other value counts in the total only (enrolment report rule) | bars hidden and "No data" shown when there are 0 students |
| Fee Compliance | current-year collection rate (Finance rule) | "No fees billed this year" when `feeCollectionRate` is null |
| Reports | the 3 report-month dots (standings rule), caption "`n`/3 months with a submitted report" | dots shown empty; the fake caption "All required reports submitted" is removed |

The address is the school's street (server `address`; desktop `street`) and `communityTown`, joined with ", ", leaving out empty parts. On the server, `establishedYear` is a column. On the desktop it is the synced `details.establishedYear`.

## Approaches considered

1. **A new server route for one school, then the desktop page (chosen).** The server reuses `computeSchoolStandings` (limited to one school), adds gender and grade counts, and reuses `currentPublishedGradeWhere` + `summarizeAcademicGrades` for the average. The desktop reuses `buildDistrictSchoolRows` and the academic report reader with `districtOnly`. Both apps use the same rules, the desktop works offline, and there is one request per page.
2. **No new route; the web page combines existing routes** (school list + academic report filtered to the school + finance). That's three requests per page, and gender and grade counts per school still don't exist, so the server changes anyway. Rejected.
3. **Reuse the County school detail page on the desktop.** That page is a profile, not this oversight view; the desktop would drift from the web. Rejected.

Alvin picked 1 on 2026-11-18.

## Design

### Server (Nemis `apps/Server`)

- **Route:** `GET /districts/:id/schools/:schoolId/detail`, with roles DEO, SUPER_ADMIN, COUNTY_ADMIN, the same as `:id/school-standings`. It goes under `/detail` because `:id/schools/performance` already exists, and a bare `:id/schools/:schoolId` would capture "performance".
- **Service:** `getDistrictSchoolDetail(districtId, schoolId, user)`.
  - Calls `ensureDistrictAccess` and `findOne(districtId)`.
  - Responds 404 (`NotFoundException`) when the school is not an active school of this district.
- **Reuse:** `computeSchoolStandings` gets an optional `schoolId` filter that narrows its institution query to that one school. All of its grouped queries already key off the resulting school ids. The district-wide callers are unchanged.
- **Additions**, all for this one school:
  - gender counts and grade groups from active students;
  - `address`, `communityTown` and `establishedYear` from the institution;
  - the academic average via `currentPublishedGradeWhere({ id: schoolId, districtId, isActive: true })` + grading configs + `summarizeAcademicGrades`.
- **Grade sorting:** in code, by GradeLevel declaration order. A small shared comparator goes next to `common/district/class-lead-order.ts`, reusing its `GRADE_RANK`.

### Shared type (Nemis `packages/types/src/deo.ts`)

```ts
export interface DistrictSchoolDetail extends DistrictSchoolStanding {
  address: string | null;          // street + community, null when neither
  establishedYear: number | null;
  gender: { male: number; female: number };
  /** Grade order; gradeLevel null = students with no grade, always last. */
  enrollmentByGrade: { gradeLevel: string | null; students: number }[];
  /** This academic year's published grades; averageScore null when none. */
  academic: { totalGrades: number; averageScore: number | null };
}
```

The desktop gets a mirrored `DeoSchoolDetail` in `@nemis-desktop/types`. Its field names are the same, so one renderer layout serves both.

### Web (portal-web)

- **RTK Query:** a new `getDistrictSchoolDetail` endpoint and hook in `store/deo/Api/deoApi.ts`, with arguments `{ districtId, schoolId }`.
- **Page:** rewrite `app/government/deo/schools/[id]/page.tsx` against `DistrictSchoolDetail`.
  - Same banner, header card, 4 KPI cards, Enrolment / Gender / Fee / Reports panels, colours and icons.
  - Every "When missing" rule in the table above applies.
  - Loading, error (with retry) and not-found are three distinct states. The shared "School not found or loading..." line goes.
- **Grade labels:** `GRADE_1` → "Grade 1", `KG`/`K1`/`K2` as is. Use the existing grade-label helper if portal-web has one.

### Desktop (desktop-client-nemis)

- **Read model** (`IDistrictOverviewReadModel` + `SqliteDistrictOverviewReadModel`), one school at a time:
  - `getSchoolProfile(schoolId)` → `{ address, establishedYear } | null` (address = street and communityTown joined with ", ", null when neither)
  - `countSchoolStudentsByGender(schoolId)` → `{ male, female }`
  - `countSchoolStudentsByGrade(schoolId)` → `{ gradeLevel: string | null; students }[]`, sorted in code by the file's existing `GRADE_RANK`, null last (Claude's call: the rank table already lives in that file)
- **Use case:** `GetDeoSchoolDetailUseCase` (query `{ schoolId: string }`).
  - Takes the district from `currentDistrictId`.
  - Builds `buildDistrictSchoolRows(...)` and picks the row whose id matches. No match means `school: null` (not found / outside the district).
  - Adds the three read-model results.
  - Gets the academic figures from `ICountyReportsReadModel.getAcademicReport({ districtId, schoolId, districtOnly: true }).bySchool`. `averageScore` becomes null when `totalGrades` is 0.
  - Keeps the read model's grade order.
- **Result:** `DeoSchoolDetailResult = { districtId: string | null; school: DeoSchoolDetail | null }`.
- **Wiring** (the same as every earlier DEO slice):
  - `DeoApplicationService.getSchoolDetail`
  - `deo:get-school` (`IpcChannels.DEO_GET_SCHOOL`, matching `county:get-school`) in `DEO_CHANNELS`, validated with `assertSingleIdArg`
  - `deoBridge` / `deoIpc`
  - `useDeoSchoolDetailViewModel`
- **Renderer:**
  - `components/deo/DeoSchoolDetailPage.tsx` reproduces the web layout and its "When missing" rules.
  - `app/government/deo/schools/details/page.tsx` replaces the ComingSoon. It wraps the page in `<Suspense>` (it reads `?id=` via `useSearchParams`), the same as the County detail page.
  - The back button uses `router.back()`, as on the web.

## Constraints

- **Scope:**
  - The server checks `ensureDistrictAccess` and requires the school to belong to the district.
  - The desktop never accepts a district id from the renderer. A school outside the session's district returns `school: null`.
- **Rule copies:** there is one copy of each rule per app. Reuse `computeSchoolStandings`, `summarizeAcademicGrades`, `buildDistrictSchoolRows` and the County academic reader rather than re-deriving them. The standing rule already exists twice (server and desktop); this piece adds no third copy.
- **No speculative fields:** nothing goes in the response that the page doesn't show.
- **Repo rules:** never commit the desktop `apps/desktop/package.json` version bump. No pushes without asking. Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Verification

- **Server:**
  - Unit tests for the new service method:
    - one school only;
    - 404 for a school of another district and for an inactive school;
    - gender with an OTHER pupil;
    - grade order including `GRADE_10` vs `GRADE_2` and a null grade;
    - academic average null with no grades and equal to the academic report's by-school figure with grades.
  - The existing standings tests still pass.
- **Web:** type-check, lint and Vitest. A page test covers the "No data" states for attendance, performance, fees and gender with 0 students, and checks that "Est." is absent without a year.
- **Desktop:**
  - Use-case tests:
    - a school outside the district gives `null`;
    - figures equal the Schools-page row;
    - academic null vs value;
    - grade order.
  - A SQLite read-model test for the three new queries.
  - A renderer page test with the same "No data" cases.
  - An IPC validator test (empty / non-string `schoolId` rejected).

## Left to the builder

- Exact test file locations, following each repo's existing DEO tests.
- Whether the desktop Sqlite queries live in the existing overview read model file or a small companion. Follow the file's current size and shape.
- The grade-label helper: reuse one if it exists in each app, otherwise add a small one next to the page.

## Remaining order after this piece

Reports & Compliance, Alerts (plus the parked server `actionUrl` fixes), School Reports Review, Infrastructure, Incidents, Analytics.
