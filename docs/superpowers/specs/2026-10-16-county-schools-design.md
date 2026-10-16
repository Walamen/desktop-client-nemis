# County Schools list + School detail — design

Date: 2026-10-16
Repos: desktop-client-nemis (main work), Nemis (server snapshot change)
Sub-project 1 of 4 of the County Schools section (then: approvals, create school, bulk import)
Entry points: `apps/desktop/renderer/app/government/county/schools/page.tsx` (today a simple
table over `SchoolsViewModel`) and a new detail page
Source of truth for design/behaviour:
`Nemis/apps/portal-web/src/app/government/county/schools/page.tsx` (list) and
`Nemis/apps/portal-web/src/app/government/county/schools/[id]/page.tsx` (detail; renders
everything inline — the `[id]/components/*.tsx` cards are not imported and are out of scope)

## Goal

Port portal-web's County Schools list and School detail pages — same design, same
behaviour — reading offline from the County device's synced SQLite.

Success: a County Admin can search/filter/page the county's schools in grid or table view
and open any school's detail page (identity, stats, information, leadership, enrollment &
compliance, facilities) exactly as on the web, with no connection; real school and people
photos appear whenever the device is online.

## Decisions (agreed in brainstorming)

| # | Decision |
|---|---|
| 1 | The Schools section is split into 4 sub-projects, each its own spec→plan→build→review→merge: **(1) list + detail (this spec)**, (2) approvals queue, (3) create school, (4) bulk import. |
| 2 | Photos: **allow `https://res.cloudinary.com` in the production CSP `img-src`** (images only) and fall back on load failure — school images to `/school-fallback.jpg`, people to `Avatar`'s role icon. Also enables DEO, principal and teacher photos app-wide when online. |
| 3 | The ~25 detail-only school fields travel as **one JSON object `details`** on each snapshot institution row and are stored in one column `institutions.details`. `profile` (metadata + levels) is untouched. |
| 4 | Standing County-migration decisions apply: compute offline from synced data, close data gaps with a server snapshot change (server ships first), full hexagonal read path, missing routes become `ComingSoon`, port web quirks as-is. |
| 5 | Detail route `/government/county/schools/details?id=<id>` (static export). |

## Background: what the web pages read

**List** (`SchoolsPage`): `GET /institutions?countyId=` (institutions.service `findAll`):
**active** institutions of the county of **type `SCHOOL`** (portal-web always sends `type: "SCHOOL"`), ordered by name, with `district`,
`levels`, `_count.students` (all students, no `isActive` filter) and `photoUrl`. Plus
`GET /counties/:id` (header name) and `GET /districts?countyId=` (Districts card = active
districts of the county). Client-side: search over name/code/district name; "School Type"
filter matches any `levels[].level` (`PRIMARY`, `SECONDARY`, `CERTIFICATE` labelled
"Technical", `PRE_PRIMARY`); Status filter active/inactive (the inactive branch never matches
because the list is active-only — ported as-is); 10 per page; Total Enrollment = Σ
`_count.students`; Active Schools = count `isActive`.

**Detail** (`SchoolDetailPage`): `GET /institutions/:id` (`findOne`): the institution with
`county`, `district`, `levels`, `users` (active org rows with user), `_count` (students,
staff), any approval/active status. Reads: `name, code, photoUrl, establishedYear,
ownership, address, emisCode, waecCode, isBoarding, isUrban, accessMode, contactPhone,
contactPersonPhone, approvalStatus, principalName, numBuildings, numClassrooms,
numBathrooms, metadata.statistics.maxCapacity`, 13 facility flags (`hasLibrary,
hasComputerLab, hasSportsField, hasKitchen, hasCafeteria, hasElectricity, hasSafeWater,
hasWaterAccess, hasTextbooks, hasWash, hasPTA, hasAuditorium, hasClinic`), the
`INSTITUTION_ADMIN` user (name, email, photoUrl) and the counts. Page math (kept in the
copied page): enrollment % = round(students / maxCapacity × 100); compliance label ≥80
"High Standing", ≥50 "Satisfactory", else "Needs Improvement".

## 1. Data, sync and photos

### Nemis server — `desktop-provisioning.service.ts`, institution mapping (all scopes)

Each institution row gains `details`, built field by field:
`{ establishedYear, registrationDate (ISO|null), accessMode, isBoarding, isUrban,
numBuildings, numClassrooms, numBathrooms, waecCode, principalName, photoUrl, hasLibrary,
hasComputerLab, hasSportsField, hasKitchen, hasCafeteria, hasElectricity, hasSafeWater,
hasWaterAccess, hasTextbooks, hasWash, hasPTA, hasAuditorium, hasClinic }`.
Sent for every scope (small; ignored by School Admin / Teacher devices).

### Desktop

- **Migration 033** `add-institution-details`: `ALTER TABLE institutions ADD COLUMN details TEXT`
  (JSON, nullable; institutions has no outbox triggers).
- `ProvisioningImporter` `SPECS.institutions` gains `'details'` (objects are JSON-stringified
  by `sqliteValue`, like `profile`).
- Old server → `details` NULL → detail shows "—", no facilities, fallback photo. Old desktop
  ignores the key. Existing devices get `details` on the next full resync. Server first.

### Photos

- `electron/security/csp.ts` `img-src 'self' data: https://res.cloudinary.com` (the host the
  server's `cloudinaryService` builds every image URL on). New CSP test pins `img-src` and
  that no other directive gains a remote source.
- `renderer/components/county/schools/SchoolPhoto.tsx`: wraps Next `<Image>` with the same
  props and swaps `src` to `/school-fallback.jpg` on `onError`. People photos already fall
  back through `Avatar`.

## 2. Reads and wiring

### `@nemis-desktop/application`

- Port `ICountySchoolsReadModel` (own county = `institutions.countyId IN (SELECT id FROM
  counties)`, all rows when no county row has synced):
  ```ts
  listActiveSchools(): CountySchoolListItem[];
  // active, type SCHOOL, ORDER BY name: { id, name, code, type, isActive, districtName,
  //   levels: string[] (profile.levels), studentCount (ALL students), photoUrl (details) }
  getSchool(id: string): CountySchoolDetailRow | null;
  // own county, any approval/active status: institution columns + metadata (profile minus
  //   levels) + levels + details (parsed) + districtName + countyName + studentCount +
  //   staffCount (all rows) + principal (first active institution_admin by id:
  //   { firstName, lastName, email, photoUrl } | null)
  ```
  `profile` and `details` are parsed defensively: invalid JSON → `null`, never a throw.
- Use cases: `GetCountySchoolsUseCase` → `{ county, districtCount, schools }`
  (`districtCount` = the county's own active districts, as the web's Districts card);
  `GetCountySchoolDetailUseCase({ schoolId })` → the detail or `null`.
- `CountyApplicationService.listSchools()`, `.getSchool(schoolId)`; new port `countySchools`
  in every port builder. No new `ApplicationLayer` key.

### `@nemis-desktop/presentation`

- `CountySchoolsViewModel` (`summary`, `load()`), `CountySchoolDetailViewModel`
  (`detail`, `load(schoolId)`, `null` → `empty`). The detail view model is keyed by school
  id: the page treats data whose `school.id` differs from the requested id as not loaded
  (no previous-school flash).
- Mappers produce the web shapes: `district: { name }`, `county: { name }`,
  `_count: { students, staff }`, `levels: [{ level }]`, `users: [{ role:
  'INSTITUTION_ADMIN', user: { firstName, lastName, email, photoUrl } }]`, `metadata`,
  `address` (from `street`), and every `details` field spread onto the school.

### IPC

`county:list-schools` (no args) and `county:get-school` (one id) — COUNTY_ADMIN-only;
preload `county` slice, `countyBridge`, renderer facade, hooks
`useCountySchoolsViewModel` / `useCountySchoolDetailViewModel`. The renderer hook
`useSchoolsViewModel` (only used by the old page) is removed; the presentation
`SchoolsViewModel` stays.

## 3. UI port

- `schools/page.tsx` — line-for-line copy of `SchoolsPage`. Differences only: data from
  `useCountySchoolsViewModel()` (spinner on idle/loading, `refreshing` keeps the page,
  `ErrorState` + Retry on error); the `mounted` flag is dropped (client-only page);
  Districts card shows `districtCount`; "View School" →
  `/government/county/schools/details?id=<id>`; `<Image>` → `SchoolPhoto`;
  `CountyAuthGuard` dropped.
- `schools/details/page.tsx` — `<Suspense>` around
  `components/county/schools/SchoolDetailPage.tsx`, a line-for-line copy of
  `SchoolDetailPage`. Differences only: id from `useSearchParams()`; data from
  `useCountySchoolDetailViewModel()`; `<Image>` → `SchoolPhoto`; unknown / empty / error /
  no id → the web's own "School not found or you don't have access." view; guard dropped.
- `schools/bulk-import/page.tsx` → `<ComingSoon title="Bulk Import Schools" />`
  (`schools/create` already exists).
- The old `schools/page.test.tsx` is replaced.

## 4. Error handling

- Reads: `guarded()` → `toIpcError` → ViewModel `error` (list: `ErrorState`; detail: the
  web's not-found view).
- Corrupt `details` / `profile` JSON → that field `null`; the page shows "—".
- Photo load failure → fallback image / role icon; never an error.
- Both channels COUNTY_ADMIN-only; `county:get-school` validates one id.

## 5. Testing (TDD, red first)

- **Server (Jest)**: institution rows carry `details` with exactly the listed keys, ISO
  `registrationDate`, nulls preserved; existing snapshot tests stay green.
- **Desktop**: migration 033; importer (`details` stored; absent → NULL); CSP test; SQLite
  adapter (active + by name on the list, any status on detail, own county, all-student /
  all-staff counts, levels from profile, first active principal, bad JSON → null); use cases
  (`districtCount`, unknown id → null); ViewModels (keep data on reload, empty on unknown
  id); IPC (2 handlers, validator, 2 channels × 5 roles); list page (stat cards, search,
  type filter, status filter, grid/table, pagination at 11, View School href, photo
  fallback, Add School / Bulk Import routes); detail page (header + quick stats incl.
  capacity %, info rows, principal, accreditation badge, compliance thresholds, facilities
  shown/hidden, not-found view, no previous-school flash); bulk-import placeholder.
- **Gate**: desktop lint, typecheck, full suite (Electron runner), `build:renderer`; Nemis
  typecheck + jest `desktop-provisioning`, `institutions`; one fresh whole-branch review.

**Delivery**: `feat/county-schools` from `main` in each repo; server first; nothing merged or
pushed without asking.

## Out of scope

- Approvals, create school, bulk import (sub-projects 2–4).
- Downloading/caching photos for offline display.
- Fixing web quirks (inactive filter that never matches; `principalName` vs admin user
  precedence) — ported as-is.

## Open items

None.
