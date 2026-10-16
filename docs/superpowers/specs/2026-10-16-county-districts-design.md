# County Districts pages — design

Date: 2026-10-16
Repos: desktop-client-nemis (main work), Nemis (server snapshot change)
Entry points: `apps/desktop/renderer/app/government/county/districts/page.tsx` (today a
`ComingSoon` placeholder) and a new detail page
Source of truth for design/behaviour:
`Nemis/apps/portal-web/src/app/government/county/districts/page.tsx` (list + Manage DEO drawer) and
`Nemis/apps/portal-web/src/app/government/county/districts/[id]/page.tsx` (detail)
Builds on: the County dashboard (spec `2026-10-16-county-dashboard-design.md`), merged to `main` in both repos.

## Goal

Second page of the County Admin migration. Port portal-web's District Management page, its
Manage DEO drawer and its District Details page — same design, same behaviour. Reads come
from the County device's synced SQLite; DEO assignment changes are online-only commands.

Success: a County Admin can browse districts (grid/table), open a district's details, and,
when online, assign, reassign and remove District Education Officers exactly as on the
web; offline the pages stay readable and the DEO actions are clearly unavailable.

## Decisions (agreed in brainstorming)

| # | Decision |
|---|---|
| 1 | Assign / Reassign / Remove DEO are **online-only commands**, the desktop transfers pattern: call the server's existing endpoint, then force a pull; the pull is the only writer of local data. Disabled offline with a note. |
| 2 | Data gaps are **closed properly** with a server snapshot change (standing County-migration decision): DEO assignments + DEO users in the County snapshot; user phone / last login / photo; district `code`; school contact phone and EMIS/official code. Server ships first. |
| 3 | Reads follow the **full hexagonal path** (read-model port → use case → ViewModel → SQLite adapter → IPC); commands follow the transfers path (renderer → bridge → IPC → `runOnline(gateway, refresh)`). |
| 4 | DEO photos: store the server's `imageUrl` as `users.photoUrl` and pass it to `Avatar` (existing teacher-photo precedent): loads online, falls back to the DEO role icon offline. |
| 5 | Quick Actions keep portal-web's targets; missing ones are `ComingSoon` placeholders (`users/create`; `reports/generate` already exists). |
| 6 | Detail route is `/government/county/districts/details?id=<id>` (static export cannot serve `[id]`; follows `students/profile?id=`). |
| 7 | "Has a DEO" = has an **active DEO assignment**. The web counts every active user attached to the district (`_count.users`, any role), which can mark a district without a DEO as "Assigned"; the desktop does not hold all those users anyway. Deliberate difference. |

## Background: what the web pages do and read

**List page** (`DistrictsManagementPage`):
- `GET /counties/:id` → header county name.
- `GET /districts?countyId=&includeDeo=true` (districts.service `findAll`): **active** districts of
  the county, ordered by name, each with `code`, `isActive`, `_count.institutions`
  (active schools), `_count.users` (active user rows of any role) and `users` (the first
  active DEO: `firstName, lastName, email, imageUrl`).
- Derived: Total Districts; Active DEOs = districts with `_count.users > 0`; Total Schools =
  Σ active schools; Unassigned = districts with no users; `maxSchools` for bars; top-5 by
  school count; coverage % = assigned / total.
- `GET /users/county/:countyId?role=DEO&includeInactive=true` (users.service
  `getUsersByCounty`): users having an active org row that is either (`countyId` = county,
  role DEO) or the **unassigned pool** (role DEO, `countyId` null, `districtId` null). Each
  user's district = their active DEO org with a `districtId` (portal-web
  `transformApiUserToManagementUser`). Fields used: `firstName, lastName, email,
  phoneNumber, isActive, lastLoginAt, imageUrl`.
- `GET /districts/:id/officers` (`getDistrictOfficers`): active DEO orgs of the district →
  `{ userId, name, email, phoneNumber, isActive, lastLoginAt, photoUrl }`. Used by the
  drawer to decide Assign vs Reassign and to name the DEO being replaced.
- `POST /districts/:id/officers/:userId` body `{ replaceExisting }` (`assignOfficer`):
  eligibility check; deactivates the user's active DEO org elsewhere; reactivates an
  existing inactive org (deactivating other DEOs here) or creates a new one; refuses with
  409 "already has an assigned DEO (…)" unless `replaceExisting`; auto-activates the user
  account; notifies the DEO.
- `DELETE /districts/:id/officers/:userId` (`removeOfficer`): sets the org inactive, notifies.

**Detail page** (`DistrictDetailsPage`):
- `GET /districts/:id` (`findOne`): district with its **active** institutions by name.
- `GET /districts/:id/stats` (`getDistrictStats`): `totalSchools` (active), `totalStudents`
  (active, in active schools), `totalTeachers` (active staff with position `TEACHER` or
  `ASSISTANT_TEACHER`, in active schools), `deoCount` (active DEO orgs),
  `studentTeacherRatio = totalTeachers > 0 ? round(totalStudents / totalTeachers) : 0`.
- `getDistrictOfficers` → DEO card (first officer).
- Schools table rows come from `GET /institutions?countyId&districtId&type=SCHOOL`
  (institutions.service `findAll`: **active**, `type = SCHOOL`, ordered by name), falling
  back to `findOne`'s active institutions when that list is empty.
- Schools table per school: `name`, `address`; principal = `principalName` (not an
  Institution field, so always undefined) or `getInstitutionPrincipalName(metadata)`;
  `formatLabel(level)` (Institution has no `level` field, so the web always shows "N/A");
  `formatLabel(ownership)`;
  students = metadata stats `studentCount ?? maxCapacity`; teachers = `teacherCount ??
  staffCount`; location = `communityTown || address`; contact = `contactPhone ||
  contactPersonPhone || metadata.phone`; code = `emisCode || officialSchoolCode || code`;
  Active/Inactive badge.
- Students/teachers lists are fetched only as count fallbacks behind `stats`.

## 1. Data and sync

### Nemis server — `apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts`

- **`userOrganizations` (COUNTY scope only)**: `where` becomes an `OR` of the existing
  clause (`institutionId in authorized, isActive, role in DESKTOP_ROLES`) and:
  - `{ role: DEO, countyId: scope.countyId }` — **active and inactive**, so a removed or
    transferred-away DEO reaches the device on the next pull (merge never deletes);
  - `{ role: DEO, countyId: null, districtId: null, isActive: true }` — the unassigned pool.
  Their users ride along through the existing `include: { user: true }` → `users`
  (`uniqueBy` id). Never `since`-filtered (unchanged), so every forced pull carries them.
  Other scopes unchanged.
- **Row fields** (all scopes; harmless where unused):
  - `users`: `phoneNumber`, `lastLoginAt` (ISO or null), `photoUrl` (from `imageUrl`),
    `createdAt` (ISO; the web lists DEOs newest first, `orderBy createdAt desc`).
  - `districts`: `code`.
  - `institutions`: `contactPhone`, `contactPersonPhone`, `emisCode`, `officialSchoolCode`.
- `DESKTOP_ROLES` already contains DEO (the role list the existing clause uses).

### Desktop

- **Migration 032** `add-county-districts-columns` (all nullable, `ALTER TABLE … ADD COLUMN`):
  `districts.code`, `users.phoneNumber`, `users.lastLoginAt`, `users.photoUrl`, `users.createdAt`,
  `institutions.contactPhone`, `institutions.contactPersonPhone`, `institutions.emisCode`,
  `institutions.officialSchoolCode`. None of these tables has outbox triggers.
- `ProvisioningImporter` `SPECS`: add the new columns to `districts`, `users`, `institutions`.
- Import order already places `users` before `userOrganizations` (FK `userId → users`).
- **Compatibility**: an old server sends no DEO rows → the drawer shows "No DEO Users
  Found", districts show "No DEO assigned". An old desktop ignores the extra rows/fields.
  Existing County devices get DEOs on the very next pull (`userOrganizations` is always
  full). Release order: server first.

## 2. Application, presentation, IPC

### Reads — `@nemis-desktop/application`

- **Port** `interfaces/county/county-districts-read-model.ts` — `ICountyDistrictsReadModel`
  (raw rows; "county's own" = `districts.countyId IN (SELECT id FROM counties)`, falling back
  to all districts when no county row has synced, as the dashboard does):
  ```ts
  listActiveDistricts(): CountyDistrictListRow[];
  // { id, name, code, isActive, activeSchoolCount, activeDeoCount,
  //   firstDeo: { userId, firstName, lastName, email, photoUrl } | null }  — isActive = 1, own county, ORDER BY name
  getDistrict(id: string): { id; name; code; isActive } | null;            // own county only
  listDistrictSchools(districtId: string): CountyDistrictSchoolRow[];
  // active, type = 'SCHOOL', ORDER BY name: { id, name, code, emisCode, officialSchoolCode,
  //   street, communityTown, ownership, contactPhone, contactPersonPhone,
  //   metadata (profile JSON minus `levels`, parsed), isActive }
  // No `level` / `principalName`: the web reads fields Institution does not have, so the
  // ported table shows "N/A" for Level and takes the principal from metadata — parity.
  getDistrictCounts(districtId: string): { schools; students; teachers; deos };
  listDistrictOfficers(districtId: string): CountyDeoOfficerRow[];
  // active DEO orgs: { userId, firstName, lastName, email, phoneNumber, isActive, lastLoginAt, photoUrl }
  listCountyDeoUsers(): CountyDeoUserRow[];
  // the getUsersByCounty rule above: { id, firstName, lastName, email, phoneNumber,
  //   isActive, lastLoginAt, photoUrl, districtId (active DEO org with a district) | null }
  ```
  "First active DEO" is the active DEO org with the lowest `id` (stable; the web's `take: 1`
  has no order).
- **Use cases**: `GetCountyDistrictsUseCase` → `{ county, districts, deoUsers,
  officersByDistrict }`; `GetCountyDistrictDetailUseCase({ districtId })` → `{ county,
  district, officers, schools, stats }` or `null` for an unknown / other-county id. Stats
  math as in Background. DTOs alias wire types in `@nemis-desktop/types`
  (`county-districts.ts`), as the dashboard does.
- Added to `CountyApplicationService` (`listDistricts()`, `getDistrict(districtId)`);
  new port `countyDistricts` on `ApplicationPorts`; every port builder updated (application
  test layer, presentation `createTestApplication`, `createApplicationComposition`), and
  `electron/main/main.ts` `deferredApplication` already forwards `county`.

### Reads — `@nemis-desktop/presentation`

- `CountyDistrictsViewModel` (`load()`; `summary: AsyncState<CountyDistrictsView>`) and
  `CountyDistrictDetailViewModel` (`load(districtId)`; `detail: AsyncState<…>`; `null` DTO →
  `empty`). Mappers reshape rows into the props the ported pages read (e.g. `district._count
  = { institutions, users: activeDeoCount }`, `district.users = [{ user }]`).
- Registered as `viewModels.countyDistricts` / `viewModels.countyDistrictDetail`.

### Commands (online-only)

- Gateway (`BackendProvisioningGateway`): `assignDistrictOfficer({ districtId, userId,
  replaceExisting })` → `POST /districts/:districtId/officers/:userId` body
  `{ replaceExisting }`; `removeDistrictOfficer({ districtId, userId })` → `DELETE
  /districts/:districtId/officers/:userId`. Both via `authorized(…, ONLINE_COMMAND)`, ids
  URI-encoded.
- IPC: `county:assign-deo`, `county:remove-deo` → `runOnline(gateway call, refresh)`
  (`refresh` = the forced pull the transfers handlers use). Validators: non-empty string ids;
  `replaceExisting` boolean.

### IPC surface

- Reads: `county:list-districts` (no args), `county:get-district` (one id).
- All four channels in `COUNTY_ADMIN_CHANNELS`.
- Preload `county` slice gains `listDistricts`, `getDistrict`, `assignDeo`, `removeDeo`;
  `countyBridge` and the renderer `county` facade group gain the read methods; the page
  calls `countyBridge.assignDeo/removeDeo` directly (transfers precedent).

## 3. UI port

- `districts/page.tsx` — line-for-line copy of `DistrictsManagementPage` including the
  Manage DEO drawer. Differences only:
  1. Data from `useCountyDistrictsViewModel()` (full-page spinner on idle/loading;
     `refreshing` keeps the page). The drawer's officer list is
     `officersByDistrict[selectedDistrict.id]` — no separate query.
  2. Commands via `countyBridge.assignDeo/removeDeo`, then `vm.load()`; failures show in
     the drawer's red box via portal-web's `getErrorMessage` and fallback strings.
  3. Offline (connectivity store): drawer Assign/Reassign, Remove and its Refresh are
     disabled; one amber note "DEO changes need an internet connection." styled like the
     drawer's other notices. The only new UI.
  4. Refresh Data reloads the ViewModel (label/spinner unchanged); the web's
     `console.log`s are dropped.
  5. `CountyAuthGuard` dropped (layout `RouteGuard` covers it).
  6. "View Details" → `/government/county/districts/details?id=<id>`.
- `districts/details/page.tsx` — line-for-line copy of `DistrictDetailsPage`; id from
  `useSearchParams` inside `<Suspense>`; the "Some district data failed to load" warning is
  dropped (one call loads everything). Unknown id → the web's error view.
- `renderer/lib/institutionMetadata.ts` — verbatim copy of portal-web's helper.
- `users/create/page.tsx` → `<ComingSoon title="Create User" />`.

## 4. Error handling

- Reads: `guarded()` → `toIpcError` → ViewModel `error` → full-page error with Retry.
- Commands: offline / unreachable → existing offline error text in the drawer; server 4xx
  (409 already assigned, 404, 403) → server message in the drawer; command ok but pull
  failed → `refreshed: false`, treated as success (no error, never invite a repeat).
- All four channels COUNTY_ADMIN-only; argument validators reject bad shapes.

## 5. Testing (TDD, red first)

- **Server (Jest)**: County snapshot includes the county's DEO orgs (active + inactive) and
  the active unassigned pool, with their users; user rows carry `phoneNumber`,
  `lastLoginAt`, `photoUrl`; districts carry `code`; institutions carry the contact/EMIS
  fields; Institution and Teacher scopes keep the old `userOrganizations` query.
- **Desktop**: migration 032; importer (DEO orgs + users imported; a merge flips a removed
  DEO's `isActive` to 0); use cases (ratio incl. zero teachers, DEO counts, unknown id →
  null); SQLite adapter (active + own-county districts, first active DEO by id, teaching
  positions only, unassigned pool with null district, active SCHOOL-type schools by name
  with parsed metadata);
  ViewModels (incl. keep data on reload, empty on unknown id); IPC (4 handlers, validators,
  4 channels × 5 roles, gateway URL/method/body); list page (grid/table toggle, assign with
  no DEO, reassign confirms, remove confirms, server error in drawer, offline disables,
  View Details href); detail page (cards, schools table, unknown id alert).
- **Gate**: desktop lint, typecheck, full suite (Electron runner); Nemis typecheck + jest
  `desktop-provisioning`, `districts`, `users`; one fresh whole-branch review.

**Delivery**: branch `feat/county-districts` from `main` in each repo; server first; nothing
merged or pushed without asking.

## Out of scope

- Creating DEO accounts, district reports, and the rest of the County pages.
- Fixing web quirks other than Decision 7 (e.g. the unassigned pool visible to every county,
  inactive-district UI branches that the active-only list never reaches — ported as-is).
- Offline queueing of DEO changes.

## Open items

None.
