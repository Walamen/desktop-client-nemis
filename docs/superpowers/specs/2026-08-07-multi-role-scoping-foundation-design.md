# Multi-Role Scoping Foundation + County Schools List — Design

Status: Approved for planning
Date: 2026-08-07
Related: [CLAUDE.md](../../../CLAUDE.md) "Who Uses This App" / "Known Foundation Bias" sections

## Problem

The desktop client was built institution-admin-first. Every business repository interface,
and the one `IInstitutionRepository` in particular, assumes a device's local SQLite database
holds exactly one institution's data:

- `IInstitutionRepository.findFirst()` is documented as "the single institution this install
  manages."
- `IStudentRepository` (and sibling repositories) have no institution-scoped filter or grouping
  method — `countAll()`, `countByGradeLevel()`, etc. are implicitly "in this installation,"
  which has always meant "in this one school."
- `UserOrganization` (domain) carries `countyId`/`districtId` props but only exposes an
  `institutionId` getter.

This breaks the instant a device belongs to a `COUNTY_ADMIN`, `DEO`, or `MINISTRY_ADMIN`
account, because those roles' local databases legitimately hold **many** institutions' data
(the user chose full-record replication over an aggregated read-model — see Decisions below).
Every list/count query would silently mix rows from different institutions together.

This spec covers the first slice that proves the fix: generalizing the scoping model, and
building one real feature on top of it — the County Admin "Schools" list
(`Nemis/apps/portal-web/src/app/government/county/schools`), which is the natural first feature
since almost every other County feature needs to know which institutions are in scope.

## What's already in place (no rework needed)

Investigation of `packages/domain`, `packages/application`, the electron sync/provisioning
layer, and `Nemis/apps/Server` found the following already generalized:

- `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` —
  `resolveDesktopScope()` and `authorizedInstitutionIds()` already compute the full list of
  institutions in a County/District/National scope, and the sync snapshot already returns
  **every** institution's full data for those scopes unrestricted (only `TEACHER` is narrowed,
  via `restrictTeacherSnapshot`).
- `apps/desktop/electron/provisioning/ProvisioningImporter.ts` is a generic bulk table-copier
  with no singleton assumption — it imports however many institutions' rows the snapshot
  contains.
- `packages/types` already has the full role/scope model: `SystemRole`, `DESKTOP_PORTAL_ROLES`,
  `DESKTOP_PORTALS` (role → route → `DesktopScopeType`), and `AuthenticatedSession.user.scope`.
- `provisioning_metadata` (SQLite) already has `role`/`scopeType`/`scopeId` columns (migration 009).
- `WorkspaceManager`'s per-device SQLCipher key is already derived from `{userId, scope}`, not
  hardcoded to institution — no changes needed for workspace isolation.
- Business SQLite tables (`students`, `classes`, `academic_years`, …) already carry an
  `institutionId` column with an index — the schema can already hold multiple institutions'
  rows; only the query/repository layer above it can't yet make use of that.

The gap is narrowly confined to the application-layer repository interfaces/use cases and the
one new backend field described below — not a wholesale re-architecture.

## Decisions

These were confirmed with the user before design:

1. **Offline data depth for oversight roles**: full record replication. County/DEO/Ministry
   devices reuse the same domain entities (`Student`, `Teacher`, `Class`, etc.) as School
   Admin/Teacher, just spanning multiple institutions, rather than a separate aggregated
   read-model schema.
2. **Pilot role**: County Admin (`COUNTY_ADMIN`), because its scope (spans districts +
   institutions, not the whole nation) exercises the multi-institution logic without national
   data volume.
3. **Pilot feature scope**: full feature parity with portal-web's `county/` folder is the
   eventual goal, but is too large for one spec (~15 feature areas: audit, data-validation,
   districts, enrollment, escalations, finance, infrastructure, messages, notifications,
   parents, reports, schools, settings, students, teachers, users). This spec covers only the
   foundation + the `schools` feature; each other feature area gets its own follow-on spec.
4. **Scoping mechanism**: explicit scope params via additive methods, not an ambient/global
   "current scope" context. New methods (`findAll()`, `countByInstitution()`) sit alongside
   existing singleton methods (`findFirst()`) rather than replacing them — School Admin/Teacher
   code paths are untouched, zero regression risk to them. This matches the codebase's existing
   explicit-constructor-injection, pure-input style (see `docs/conventions.md`).
5. **District names**: the local snapshot has no `districts` reference table today (only opaque
   `districtId` strings), so a small, contained backend addition is in scope for this spec: add
   `districts` (`id`, `name`, `countyId`) to `DesktopProvisioningData` and the snapshot query in
   `Nemis/apps/Server`, plus a matching import spec in `ProvisioningImporter`.

## Architecture

Five layers change, each additively:

### 1. Backend (`Nemis/apps/Server`)
- Add `districts: Record<string, unknown>[]` to `DesktopProvisioningData`
  (`Nemis/packages/types/src/desktop-provisioning.ts`).
- Add a `districts` query to the snapshot transaction in `desktop-provisioning.service.ts`,
  scoped the same way `institutions` already is (via `authorizedInstitutionIds`/`countyId`).
- No changes to `resolveDesktopScope`, `authorizedInstitutionIds`, or `restrictTeacherSnapshot`.

### 2. Domain (`packages/domain`)
- `UserOrganization`: add `get countyId(): string | undefined` and
  `get districtId(): string | undefined` getters (props already exist).
- No new aggregate root for District/County — they remain plain reference data (id + name +
  parent id), since no business invariant operates on them yet. Introducing a full aggregate
  would be speculative (YAGNI) until a feature actually needs County/District behavior, not
  just a name lookup.

### 3. Application (`packages/application`)
- `IInstitutionRepository`: add `findAll(): Institution[]` alongside the existing `findFirst()`.
  Update the interface's doc comment to stop claiming "the single institution."
- New `IDistrictRepository` interface: `findAll(): DistrictRef[]` (`{ id, name, countyId }`).
- `IStudentRepository`: add `countByInstitution(): { institutionId: string; studentCount: number }[]`,
  same shape/pattern as the existing `countByGradeLevel()`/`countByGender()`.
- New `ListInstitutionsUseCase` (query): calls the three repositories above and assembles
  `InstitutionSummaryOutput[]`:
  `{ id, code, name, type, ownership, districtId, districtName, approvalStatus, studentCount }`.
- New in-memory fakes for `IDistrictRepository` and the new `IStudentRepository` method,
  following `packages/application/src/testing/**` conventions.

### 4. Electron/SQLite (`apps/desktop/electron`)
- New migration: `districts` table (`id`, `name`, `countyId`) + index on `countyId`.
- `ProvisioningImporter`: add a `districts` spec entry. `districts` has no FK dependency on
  `institutions` (the reference runs the other way — `institutions.districtId` points at
  `districts.id`), so it must be imported before `institutions` in the dependency-ordered list.
- `SqliteInstitutionRepository`: implement `findAll()` (`SELECT ... FROM institutions ORDER BY name`).
- New `SqliteDistrictRepository`: implement `findAll()`.
- `SqliteStudentRepository`: implement `countByInstitution()`
  (`SELECT institutionId, COUNT(*) AS studentCount FROM students WHERE isActive = 1 GROUP BY institutionId`).
- New IPC query handler (e.g. `ipc/handlers/county/institutions.ts` or a shared/oversight
  handler group — exact placement decided during planning) exposing `listInstitutions`, backed
  by `ListInstitutionsUseCase`. Because the backend already scopes what lands in the local DB,
  this one handler is correct for every role without branching on role — School Admin's local
  DB will only ever contain its own institution, so `findAll()` naturally returns one row there.

### 5. Renderer (`apps/desktop/renderer`)
- New `SchoolsViewModel` in `packages/presentation`, calling `listInstitutions` via the existing
  `trackQuery` pattern.
- Replace the placeholder `app/government/county/schools/page.tsx` shell with a real list/table
  view: search, type filter, district filter, per-school student count — matching portal-web's
  fields that are actually available (see Known v1 limitations).

## Data flow

1. County Admin logs in → backend resolves `COUNTY` scope → device registers with `scopeType=COUNTY`.
2. Sync pull: snapshot returns institutions + **districts (new)** + students + everything else,
   pre-filtered to every institution in the county (already works today for everything except
   districts).
3. `ProvisioningImporter` bulk-imports rows into SQLite, `districts` added as a new table spec.
4. Renderer opens `/government/county/schools` → IPC → `ListInstitutionsUseCase` →
   `IInstitutionRepository.findAll()` + `IDistrictRepository.findAll()` (name lookup) +
   `IStudentRepository.countByInstitution()` (enrollment count) → `InstitutionSummaryOutput[]`
   → IPC → `SchoolsViewModel` → table/grid.

## Error handling

- Zero institutions in scope (new county, no schools yet) → empty state, not an error — matches
  portal-web's existing empty state pattern.
- A `districtId` with no matching row (e.g. a snapshot synced before this migration shipped) →
  mapper falls back to `"—"` for the district name rather than throwing.
- No changes needed to workspace/encryption isolation (`WorkspaceManager` key derivation is
  already `{userId, scope}`-based).

## Known v1 limitations (explicit, not deferred silently)

- `Institution` has no `isActive` field in the domain entity or the backend snapshot. The
  Active/Inactive filter present on portal-web's Schools page is a fast-follow, not part of
  this slice.
- This slice is **read-only**. "Add School," "Bulk Import," and "Approvals" (write workflows on
  portal-web's Schools page) are out of scope — only the list and per-school summary.
- Only the `schools` feature area is covered. The other ~14 County feature areas (districts,
  students, teachers, parents, users, enrollment, data-validation, escalations, finance,
  infrastructure, reports, audit, messages, notifications, settings) are follow-on specs, built
  on top of the foundation this spec establishes.

## Testing

- **Domain**: unit tests for the new `UserOrganization.countyId`/`districtId` getters.
- **Application**: `ListInstitutionsUseCase` tests via in-memory fakes — multiple institutions,
  empty scope, missing district name.
- **Electron**: tests for `SqliteInstitutionRepository.findAll()`, new
  `SqliteDistrictRepository`, `SqliteStudentRepository.countByInstitution()`, the new migration,
  and `ProvisioningImporter` importing `districts`.
- **IPC**: handler test following the existing `ipc/handlers/**/*.test.ts` pattern.
- **Renderer/presentation**: `SchoolsViewModel` test + a page smoke test like the existing
  `dashboard.test.tsx` files.
- **The regression test that matters most**: extend an E2E-style test (e.g.
  `data/adapters/business-e2e.test.ts`) with a SQLite fixture holding **2+ institutions**, and
  assert `findAll()`/`countByInstitution()` keep them correctly separated. This is the test that
  proves the "installation == institution" assumption is actually gone, not just papered over.
- **Backend**: extend `desktop-provisioning.service.spec.ts` for the new `districts` field.
