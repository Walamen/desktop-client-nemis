# DEO sub pages, piece 2: Reports & Compliance

**Date:** 2026-11-19
**Repos:** Nemis (server, `packages/types`, portal-web) and desktop-client-nemis
**Size:** project (server rewrite of one endpoint + web page fix + desktop slice)
**Release order:** server first, then web, then desktop

## Intent

A District Education Officer wants one list that answers: "is each of my schools keeping up with what it owes the district?" The web page `/government/deo/reports` ("Reports & Compliance") tries to do this with four rows per school. Two of those rows can never hold real data:

- **Enrollment** reads enrolment applications. That flow is retired (the reason piece 0 removed Submissions), and the desktop doesn't sync it.
- **Infrastructure** reads inspection records. Nothing in either app creates them; only an unused server route can. The row is always "Missing".

A third row is misleading. **Teacher Roster** takes the approval status of whichever teacher was added last, so one new pending teacher turns a school "Pending".

The page also fakes things:
- the header always reads "Buchanan · Grand Bassa";
- the Download button only opens the school page.

On the desktop the route is a `ComingSoon`.

This piece keeps the page and its layout. Every row is real, and the new Monthly Reports row agrees with the report dots on the Schools page. The same page comes to the desktop, computed offline.

## Goals

- **Server:** rewrite `getDistrictReportsCompliance` in place. Same route (`GET /districts/:id/reports/compliance`, existing roles) and same response shape (`DistrictReportsComplianceResponse`). New row rules.
- **Web:** the page shows the real district and county, drops the Download button, and the eye button opens School detail. Layout, cards, tabs, filters and table are otherwise unchanged.
- **Desktop:** a DEO use case, a `deo:reports-compliance` channel, a view model and a `DeoReportsCompliancePage` at `deo/reports`, with the same rows from local data.

## Non-goals

- No sidebar entry on either app. The page stays reachable as it is today: by URL, and on the web by the server notification link (`actionUrl: "/government/deo/reports"`).
- No change to the Compliant / Needs Review / Flagged chip on the Schools page. That chip comes from attendance, alerts and staffing, not from this page's rows.
- No reviewing or approving from this page. School report review is the later School Reports Review piece.
- No export or download.

## Anti-goals (a failure even if it "works")

- A row that can never hold real data.
- A Monthly Reports status or note that disagrees with the same school's report dots on the Schools page or School detail.
- A DEO reaching another district's schools, on either app. On the desktop the district comes from the session, never from the renderer.
- A missing date shown as a real one, or a real date invented.

## Decided content (agreed with Alvin, 2026-11-19)

There are three rows per active school of the district. Schools are sorted by name, and the rows within a school come in this order. This replaces the old newest-date-first sort, which only made sense when one school's rows were scattered:

| Row (`reportType`) | `status` | `date` / `period` | `submittedBy` | `note` |
|---|---|---|---|---|
| `Registration` | the school's approval status, mapped as today: APPROVED → APPROVED; PENDING or UNDER_REVIEW → PENDING; REJECTED → REJECTED; anything else → MISSING | `approvedAt ?? createdAt` | the standings principal (`principalName`), else "Not recorded" | "School onboarding and approval record" (unchanged) |
| `Teacher Roster` | over **active** TEACHER / ASSISTANT_TEACHER staff of the school: none → **MISSING**; any with approval PENDING or UNDER_REVIEW → **PENDING**; otherwise **APPROVED**. Rejected teachers alone never make the row Rejected. | the newest of those teachers' `createdAt`; null when none | "`n` teachers" (`1 teacher` for one); "No teacher records" when none | "`p` of `n` awaiting approval" when p > 0; "No teachers awaiting approval" when p = 0 and n > 0 (true whether the others are approved or rejected); "No teacher records have been submitted" when none |
| `Monthly Reports` (new) | from the standings row's `reportMonths` (last 3 calendar months): 3 of 3 → **APPROVED**; 1–2 → **PENDING**; 0 → **MISSING** | the standings row's `lastSubmissionAt` (may be older than the 3 months, or null) | "School reports" | "`k`/3 months with a submitted report", the same caption as School detail |

Claude's calls on these rows:
- **Registration `submittedBy`:** use the standings principal on both apps, exactly as Schools and School detail show it. The old page read the metadata principal only.
- **Monthly Reports date:** a MISSING row still shows the last submission date when there is one, e.g. "March 2026" beside Missing. It tells the DEO how long the school has been silent. Null shows "Not submitted".
- **Month boundaries:** they follow each machine's calendar (server time on the web, device time on the desktop), the same as the Schools-page dots already do.

Rules shared by every row:
- `period` = the date formatted as "Month YYYY" (en-US long month), or "Awaiting submission" when the date is null. This is the existing `formatPeriod`.
- `id` = `${schoolId}:registration` / `:teachers` / `:monthly-reports`.
- `summary` counts the rows by status, as today. `rejected` can now only come from Registration.

**Page changes (both apps):**
- The header shows the district and county names: the web from the district settings, as the Schools page does; the desktop from the read model.
- The Download button is removed.
- The eye button opens School detail: the web `/government/deo/schools/[id]`, the desktop `/government/deo/schools/details?id=`.
- The date column still shows "Not submitted" for a null date.
- The report-type chips are built from the rows, so they become All / Registration / Teacher Roster / Monthly Reports.
- Loading, error and empty states are kept. The error state gets a Retry.

## Approaches considered

1. **Rewrite the existing endpoint in place, then build the desktop page from synced data (chosen).** Only this page calls the endpoint, so the route and response shape stay and the web page barely changes. Monthly Reports and the principal reuse `computeSchoolStandings` (server) and `buildDistrictSchoolRows` (desktop), so the dots rule keeps one copy per app.
2. **A new route with a new type.** That leaves a dead route behind for no gain. Rejected.
3. **The web stitches together the Schools-standings and Teachers endpoints.** That puts the row rules in the browser, and the desktop would still need them. Rejected.

Alvin picked option 2 of the page choices (trim, and add Monthly Reports) on 2026-11-19, and approved the row rules and approach 1 the same day.

## Design

### Server (Nemis `apps/Server/src/districts/districts.service.ts`)

- `getDistrictReportsCompliance(districtId, user)` keeps `findOne` + `enforceDistrictAccess`.
- It calls `computeSchoolStandings(districtId, now)` for the school list (active schools of the district), `principalName`, `reportMonths` and `lastSubmissionAt`. It sorts by name, as today.
- Two extra queries:
  - institutions `{ id, approvalStatus, approvedAt, createdAt }` for those ids;
  - staff `{ institutionId, approvalStatus, createdAt }` with `isActive: true` and `position in getTeachingPositions()`.
- The `enrollmentApplication` and `inspectionHistory` queries go. `mapApplicationStatus` and `mapInspectionComplianceStatus` are deleted if nothing else uses them.
- The row rules live in a small pure function next to `common/district/school-standing.ts`, e.g. `common/district/compliance-rows.ts`. It is unit-tested without Prisma.

### Shared type (Nemis `packages/types/src/deo.ts`)

The shape is unchanged. `reportType` stays `string`. Add a doc comment listing the three values.

### Web (portal-web `app/government/deo/reports/page.tsx`)

- It uses `useGetDistrictSettingsQuery` for the header place (district · county). The parts are left out when not loaded; there's no fake fallback.
- Remove the Download button. The eye button keeps `/government/deo/schools/${schoolId}`.
- The error state gets a Retry (`refetch`).
- Add a page test (Vitest):
  - the real header place;
  - no Download button;
  - "Not submitted" for a null date;
  - the type chips come from the rows;
  - the eye button routes to the school.

### Desktop (desktop-client-nemis)

**Sync:** the desktop `institutions` table has no `approvedAt` or `createdAt`. The server's provisioning snapshot adds both to the institution's `details` JSON (`desktop-provisioning.service.ts`, next to `registrationDate`) as ISO strings or null.
- No SQLite migration is needed: `details` is already a JSON column that nothing filters on.
- Every sync pull downloads this same snapshot (`DesktopSyncWorker` → `downloadSnapshot` → `ProvisioningImporter`), and a full resync runs at least every 24 hours, so existing devices get the dates within a day of the server release. No sync-applier change is needed.
- Until then, the dates read null and the row shows "Awaiting submission" / "Not submitted". (Claude's call: this is the smallest correct path, and adding columns would also need a migration and an importer change.)

**Read model** (`IDistrictOverviewReadModel` + `SqliteDistrictOverviewReadModel`):
- `listSchoolRegistrations(districtId)` → `{ institutionId, approvalStatus, approvedAt: string | null, createdAt: string | null }[]` for active district schools. The two dates come from `details`.
- `teacherRosterBySchool(districtId)` → `{ institutionId, total, awaitingApproval, newestCreatedAt }[]` over active TEACHER / ASSISTANT_TEACHER staff. A school with none is absent.

**Use case:** `GetDeoReportsComplianceUseCase` (no query arguments).
- It takes the district from `currentDistrictId` and builds `buildDistrictSchoolRows(...)` for the school list, principal, `reportMonths` and `lastSubmissionAt`.
- It joins the two read-model results and applies the same row rules as the server, in one pure helper in the application layer.
- The header names come from the existing `getDistrict` / `getCounty` read-model methods, as on the Schools page. This adds no new query.
- Result: `DeoReportsComplianceResult = { districtId: string | null; district: { id; name } | null; county: { id; name } | null; summary; items }`, the same header shape as `DeoSchoolsResult`. The `items` and `summary` shapes mirror `DistrictReportsComplianceResponse`, and the period format matches.

**Wiring** follows every earlier DEO slice:
- `DeoApplicationService.getReportsCompliance`;
- `IpcChannels.DEO_REPORTS_COMPLIANCE = 'deo:reports-compliance'` in `DEO_CHANNELS`, which takes no arguments and rejects any;
- the preload / `deoBridge` / `lib/ipc/deo.ts`;
- `DeoReportsComplianceViewModel` and `useDeoReportsComplianceViewModel`.

**Renderer:** `components/deo/DeoReportsCompliancePage.tsx` reproduces the web layout with the changes above. `app/government/deo/reports/page.tsx` replaces the ComingSoon.

## Constraints

- **Scope:**
  - The server keeps `enforceDistrictAccess`.
  - The desktop never takes a district id from the renderer.
- **One copy of each rule per app:**
  - The report dots come only from `computeSchoolStandings` / `buildDistrictSchoolRows`.
  - The row rules exist once on the server and once on the desktop, the same as the standing rule.
- **No speculative fields:** nothing goes in a response that the page doesn't show.
- **Repo rules:**
  - Never commit the desktop `apps/desktop/package.json` version bump or portal-web `tsconfig.tsbuildinfo`.
  - No pushes without asking.
  - Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Verification

- **Server:**
  - Unit tests of the row helper:
    - Teacher Roster: none (MISSING), all approved (APPROVED), some pending (PENDING, "p of n awaiting approval"), only rejected (APPROVED, "No teachers awaiting approval");
    - Monthly Reports 0, 2 and 3 months;
    - Registration with and without `approvedAt`;
    - "Awaiting submission" for a null date.
  - Service tests:
    - only the district's active schools appear;
    - an inactive teacher is ignored;
    - Monthly Reports matches the standings `reportMonths` for the same school;
    - another district gives 403.
  - The provisioning spec asserts `details.approvedAt` and `details.createdAt`.
- **Web:** type-check, lint and Vitest with the page test above.
- **Desktop:**
  - Helper tests mirroring the server's.
  - A use-case test where Monthly Reports equals the Schools-page row's dots.
  - A SQLite read-model test for the two new queries, including the `details` dates and a pre-release null.
  - An IPC test that any argument is rejected.
  - A renderer page test: header place, no Download, eye link to `schools/details?id=`, "Not submitted".

## Left to the builder

- Exact file locations, following each repo's existing DEO tests.
- Whether the desktop row helper sits in `use-cases/deo/` or next to `district-school-rows.ts`.

## Remaining order after this piece

Alerts (plus the parked server `actionUrl` fixes), School Reports Review, Infrastructure, Incidents, Analytics.
