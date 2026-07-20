# Phase 8 — Dashboard Bootstrap & Real Data Wiring: Design

**Date:** 2026-07-20
**Status:** Approved (brainstorming complete)
**Depends on:** Phase 7 (Desktop Shell, merged to `main` at `59d669b`)

## 1. Context

Phases 1–7 built everything up to a working shell: Electron foundation, SQLite platform,
repository layer, domain layer, application layer (hexagonal CQRS), a React-free MVVM
presentation layer, and a React renderer wired to it — but the renderer's composition root
(`create-renderer-presentation.ts`) builds the `ApplicationLayer` over Phase-6 **in-memory
fakes**, seeded with demo data that never touches SQLite. The Dashboard's only real number is
Total Students, computed with an admitted `list({ limit: 1000 })` workaround; every other stat
is a hard-coded `0`.

Two facts, discovered during design, materially shape this phase:

- **No business SQLite schema exists yet.** The only migration
  (`001-create-platform-tables.ts`) is explicitly commented "Platform tables only — no business
  entities (those arrive with sync in later phases)." `createApplicationComposition.ts` stubs
  all ten business repository ports as throwing `Proxy` objects and is not even called from
  `main.ts` yet. Wiring the Dashboard to real data therefore requires a new migration and new
  repository adapters before any number can be real — exactly what the Phase 7 report's §8
  named as the Phase-8 prerequisite.
- **There is no Prisma schema in this repository.** Prisma belongs to the separate NestJS
  backend (`Nemis/`). This repo's local persistence is hand-written `better-sqlite3` migrations
  under `apps/desktop/electron/database/migrations/`; that is the authoritative local schema
  source for this phase, not Prisma.

## 2. Decisions (settled with the user)

| Question | Decision |
| --- | --- |
| Phasing | **One combined Phase 8.** Schema, adapters, IPC facade, BootstrapService, and Dashboard wiring, dependency-ordered, one spec/plan/implementation cycle — matches the size of every prior phase in this repo. |
| Current-user placeholder | **Seed a real user row.** One "Local Admin" `users` row is created idempotently on first run (same pattern `initializeMetadata.ts` already uses for the device row); `CurrentUserViewModel` reads it through a real SQLite-backed repository. No auth logic — just a real row instead of a hardcoded object. |
| Teachers dashboard tile | **Permanent honest empty state, no new domain.** The Staff/Teacher domain has no entity or repository anywhere in `@nemis-desktop/domain`; building one would violate the DO-NOT list (no Teacher CRUD) and is real scope creep. The tile renders "Staff records not tracked yet" — never a fabricated `0`. |
| Business data population | **Nothing is fabricated to make tiles look populated.** `institutions`, `academic_years`, `classes`, `students` tables are created but start and stay empty (no CRUD UI, no sync this phase). A fresh install legitimately shows empty states for School Name, Academic Year, Classes, and Attendance Summary — this is correct, not a bug. |

## 3. Goals

- Every Dashboard value is either backed by a real SQLite query or an explicit, honest empty
  state — zero hard-coded numbers anywhere in the renderer.
- A `BootstrapService` drives the app's startup data-loading sequence, asynchronously, in
  parallel where independent, tolerant of partial failure, and observable via a store.
- `DashboardViewModel` exposes six explicit states: `Loading`, `Loaded`, `Empty`, `Error`,
  `Offline`, `DatabaseUnavailable`.
- The IPC facade is shaped as `ApplicationLayer`, so the renderer's composition root is the
  only file that changes to go from fakes to real data (the Phase-6/7 seam guarantee holds).
- `createApplicationComposition.ts` goes live: the business repository ports needed for this
  phase (`students`, `institutions`, `users`) are real SQLite adapters, not `Proxy` stubs.
- TypeScript, ESLint, tests, and production build all green; Windows installer still works.

## 4. Non-goals (explicit DO-NOTs, carried from the phase brief)

No synchronization. No REST calls. No Student/Teacher/Attendance CRUD UI. No authentication.
No conflict resolution. No repository or SQLite access from React (IPC only). No bypassing the
Presentation Layer. No new domain slices beyond what §7 lists (all read-only additions to
existing domains). The remaining seven business-repository stubs (`guardians`, `enrollments`,
`classes`\*, `attendance`\*, `assessments`, `grades`, `gradingConfigs`) stay `Proxy` stubs —
\*`classes` and `attendance` get one new **read-only** repository method each (§7), not a full
adapter; their write paths remain stubbed and are a future phase's job.

## 5. Architecture

### 5.1 Data flow

```
React component
  → useViewModel(vm.store, selector)          renderer hook (unchanged since Phase 7)
    → ViewModel                                @nemis-desktop/presentation (real)
      → ApplicationLayer-shaped IPC facade      NEW: renderer/lib/presentation/create-ipc-application-layer.ts
        → window.nemis.*                        preload / contextBridge
          → ipcMain.handle(...)                 NEW channels, existing registrar pattern
            → real ApplicationLayer              main process — createApplicationComposition.ts, now wired into main.ts
              → real SQLite repository adapters  NEW
                → SQLite                          migration 002
```

Only two renderer files change behavior for the seam: `create-renderer-presentation.ts` swaps
`createTestApplication()` for the new IPC facade, and `app/government/school-admin/layout.tsx`
stops importing `DEMO_INSTITUTION_ID`/`DEMO_USER_ID` (§5.3). Every component, hook, and
ViewModel above the facade is untouched — this is the seam Phase 6/7 built for.

### 5.2 IPC facade — new channels

Following the existing `IpcContract`/`IpcChannels` convention (`packages/types/src/ipc.ts`) —
one typed, validated channel per capability, not a generic dispatcher, per CLAUDE.md's
"prefer existing architecture" rule. Rather than exposing every underlying use case
individually, the new `GetDashboardOverview` application query (§7) aggregates student count,
class count, and attendance summary into one DTO, keeping the channel count small:

| Channel | Wraps | Args |
| --- | --- | --- |
| `dashboard:get-overview` | new `GetDashboardOverview` query | none |
| `school:get-summary` | existing `institution.getProfile` (new real adapter) | none |
| `academic-year:get-current` | new `GetCurrentAcademicYear` query | none |
| `identity:get-current-user` | existing `identity.getUserById`, new no-arg convenience wrapper | none |
| `device:get-info` | new lightweight query over the already-real `DeviceGatewayAdapter` | none |
| `settings:get` | already exists, reused for `GetApplicationSettings` | `key: string` |

Every new channel is intentionally **no-arg**: a School Admin desktop install is scoped to
exactly one device, one local user (pre-auth), and one school (CLAUDE.md: "School Admin — own
school only"), so "get the current X for this installation" needs no id parameter. This
directly resolves the Phase 7 report's §7 callout that `loadUser(userId)` /
`loadProfile(institutionId)` forced `layout.tsx` to hardcode seed-data ids — the new queries
have nothing to parametrize.

### 5.3 Renderer composition root changes

- **`create-ipc-application-layer.ts`** (new) — implements the subset of `ApplicationLayer`
  the presentation layer calls, each method a thin `window.nemis.<x>()` invocation. This is the
  ONLY new module allowed to reference `window.nemis` outside `services/`.
- **`create-renderer-presentation.ts`** — body changes from
  `createTestApplication() + seedDemoData()` to `createIpcApplicationLayer()`; the function
  signature and everything downstream (`createPresentationLayer`) is unchanged.
- **`seed-demo-data.ts`** — deleted from the renderer composition path. Kept (or ported) under
  `packages/presentation/src/testing/` only if a test still wants seeded fakes; production no
  longer seeds anything client-side.
- **`app/government/school-admin/layout.tsx`** — drops `DEMO_INSTITUTION_ID`/`DEMO_USER_ID`
  imports; calls the new no-arg `loadCurrentSchool()` / `loadCurrentUser()` ViewModel methods
  (§9) instead of `loadProfile(id)` / `loadUser(id)`.

### 5.4 Main-process wiring

- `main.ts`'s `bootstrap()` now calls `createApplicationComposition(dataLayer, transactions)`
  after `createDataLayer(...)` and passes the resulting `ApplicationLayer` into
  `registerIpcHandlers(...)`, alongside the existing `dataLayer.services`.
- `createApplicationComposition.ts`: the `students`, `institutions`, `users` `Proxy` stubs are
  replaced with real adapters (§7). The other seven stay stubbed — untouched.
- A first-run seed step (extending `initializeMetadata.ts`'s idempotent pattern, run once after
  migrations) inserts exactly one `users` row if none exists. No other business table is
  seeded.

## 6. Schema — migration `002-create-business-tables.ts`

New tables: `institutions`, `users`, `user_organizations`, `academic_years`, `classes`,
`students`. Columns are derived directly from the already-defined Phase-4 domain entities
(`packages/domain/src/{institution,identity,academics,students}/entities/*.ts`) — exact column
lists are finalized during implementation, not guessed here. Each table additionally carries
`updatedAt`, `deviceId`, and `lastModifiedBy` per CLAUDE.md's conflict-resolution metadata
contract, unused by any logic this phase, so the sync phase does not have to alter these tables
later. Same conventions as migration 001: TEXT UUID PKs, ISO-8601 UTC TEXT timestamps, indexes
on any column a new query filters or sorts by (at minimum: `students.institutionId`,
`classes.institutionId`, `classes.academicYearId`, `user_organizations.userId`).

No table beyond `users` is seeded (§2). `institutions`, `academic_years`, `classes`, `students`
exist and are queried for real, and are legitimately empty until CRUD or sync exists.

## 7. Application-layer additions (read-only only — no new CRUD)

| Addition | Type | Notes |
| --- | --- | --- |
| `SqliteStudentRepository` | adapter | Implements existing `IStudentRepository` port. Replaces the `students` `Proxy` stub. |
| `SqliteInstitutionRepository` | adapter | Implements existing `IInstitutionRepository` port. Replaces the `institutions` stub. |
| `SqliteUserRepository` | adapter | Implements existing `IUserRepository` port. Replaces the `users` stub. |
| `IAcademicYearRepository` + `GetCurrentAcademicYear` | new port + query | No academic-year application slice exists today; built per `_extension-template/README.md`. |
| `IClassRepository.countByInstitution` (or equivalent) | new port method | Added to the existing `class-repository.ts` port; the adapter that implements it stays a stub for every other method — write paths are not built. |
| `GetDashboardOverview` | new aggregate query | Composes student count (real `COUNT`, not `list({limit:1000})` — fixes the Phase 7 debt item), class count, and an attendance-today summary (via a new read-only method on the existing `attendance-repository.ts` port, same partial-adapter treatment as classes). |
| `identity.getCurrentUser()` | new no-arg query | Thin wrapper: looks up the single seeded user, no id parameter (§5.2). |
| `GetDeviceInformation` | new lightweight query | Reads the device row `DeviceGatewayAdapter` already manages; no new adapter needed, that gateway is real since Phase 5. |

`Student.count` avoiding the DTO/mapper overhead of listing rows requires either a new
repository method (`countAll`/`countByInstitution`) doing `SELECT COUNT(*)`, or reusing
`PagedResult.total` from a `limit: 0` list call if the SQL layer supports it cheaply — decided
during implementation, whichever avoids fetching rows just to discard them.

## 8. BootstrapService

Lives in the **renderer** (`renderer/lib/bootstrap/bootstrap-service.ts`), not Electron main.
Main already hard-gates window creation on DB init success — a DB failure today shows a native
error dialog and quits before any renderer code runs — so by the time React mounts, "is the
database file open" is already resolved. `BootstrapService` instead owns the renderer's own
startup data-loading sequence:

```
Device → Current User → School → Academic Year → Dashboard Overview
```

All five are independent reads (none depends on another's result), so they load via
`Promise.allSettled`, satisfying "parallel where appropriate." A new `BootstrapStore` (Zustand
vanilla, same pattern as `ConnectivityStore`) tracks overall phase
(`idle | loading | ready | error`) and, per item, which of the five loads is still pending —
this replaces the bare spinner `RootProviders` renders today with a store-observable one. One
slow or failing load never blocks the others: each ViewModel keeps its own `AsyncState`
independently, so (for example) a `DatabaseUnavailable` academic-year query does not prevent
the student count from rendering.

## 9. Presentation-layer changes

- **`CurrentUserViewModel`** gains `loadCurrentUser()` (no-arg), calling `identity:get-current-user`. The existing `loadUser(userId)` stays for any future session-aware use.
- **`SettingsViewModel`** gains `loadCurrentSchool()` (no-arg) calling `school:get-summary`, alongside the existing id-based `loadProfile(institutionId)`.
- **`DashboardViewModel`** graduates fully: `loadOverview()` calls `dashboard:get-overview` via `trackQuery`, mapping into a `DashboardSummaryView` with no `placeholder: boolean` flags — every field is either a real number or absent (rendered as its own empty-state chip, e.g. Teachers, Attendance).
- **New `DeviceViewModel`/`AcademicYearViewModel` read methods** for `device:get-info` and `academic-year:get-current`, following the existing `trackQuery` pattern — no new ViewModel classes needed if these fit naturally on `DeviceViewModel` (already exists) and a small addition to `SettingsViewModel` or a new minimal `AcademicYearViewModel`, decided during implementation based on which screen(s) will eventually need academic-year data beyond the dashboard.
- **Error taxonomy**: `errors/presentation-error.ts` gains `DatabaseUnavailableError` (kind `database-unavailable`). `toPresentationError` maps the IPC error codes `DATABASE_UNAVAILABLE` and `MIGRATION_REQUIRED` (already reserved in `IpcErrorCode`, never produced until now) to it. `NetworkUnavailableError` (also reserved, also unmapped since Phase 6) finally gets a producer: any IPC transport-level failure (e.g. `ipcRenderer.invoke` rejecting outright, not an `IpcResult<T>` with `ok: false`) maps to it, distinguishing "the operation failed" from "the transport is down."
- **`ViewStatus`** gains no new member — `DatabaseUnavailable` is surfaced as `status: 'error'` with `error.kind === 'database-unavailable'`; the UI branches on `kind`, matching how it already renders `PermissionError` vs `ValidationError` differently within the `error` status.

## 10. Dashboard UI

- Stat tiles: Total Students (real), Total Classes (real), Attendance Today (real, likely `0/0`
  on a fresh install), Total Teachers (empty-state chip, never a number).
- School Name / Academic Year: rendered from `SettingsViewModel`/academic-year state; empty
  installs show "School profile not set up yet" / "No academic year configured" (the exact
  copy the phase brief specifies) instead of blank space or a dash.
- Recent Activity / Teachers list section: unchanged from Phase 7's honest static placeholder
  copy — no data source exists for either, and building one is out of scope here.
- A distinct panel renders for the `database-unavailable` error kind (e.g. "Local database is
  unavailable — restart the application or contact support"), visually different from the
  generic `ErrorState` used for other error kinds, per the "user-friendly, actionable" mandate.

## 11. Error handling

| Failure | Where caught | User-facing result |
| --- | --- | --- |
| Migration fails at startup | `main.ts` (existing) | Native error dialog, app quits — unchanged, out of scope to modify. |
| A query hits a locked/corrupted DB after startup | new SQLite adapter → IPC handler → `errorMapping.ts` → `DATABASE_UNAVAILABLE` | `DashboardViewModel` state `database-unavailable`, dedicated panel (§10). |
| IPC transport itself fails (preload/main crash mid-call) | renderer facade | `NetworkUnavailableError` → generic but distinct "connection to local service lost" message. |
| A single dashboard sub-query throws (e.g. academic year) | that ViewModel's own `trackQuery` | Only that tile shows its error/empty state; the rest of the dashboard renders normally. |
| Unexpected exception anywhere in a use case | existing `invokeUseCase` pipeline (unchanged) | Falls through to `UnexpectedApplicationException` → `UnexpectedPresentationError`, generic safe message. |

All technical detail (stack, raw SQLite error) stays on `error.cause`, logged via
`electron-log` in production per CLAUDE.md; only `userMessage` ever reaches a component.

## 12. Performance

- `Promise.allSettled` for the five bootstrap loads (§8) — no serial waterfall.
- New repository methods use prepared statements and `COUNT`/aggregate SQL rather than fetching
  and discarding rows (fixes the Phase 7 `list({limit:1000})` debt item directly).
- Indexes added in migration 002 (§6) match every filter/sort the new queries perform.
- No polling: all loads are one-shot on bootstrap; a later phase's sync worker is the only
  future writer to these stores outside a direct user action.

## 13. Testing

- **Migration**: `002-create-business-tables.test.ts`, matching the 001 convention (tables
  created, indexes present, `down()` drops cleanly).
- **Adapters**: `Sqlite{Student,Institution,User}Repository.test.ts`, temp-file DB, matching
  the existing `Sqlite*Repository.test.ts` pattern.
- **Application layer**: new/extended use-case tests against in-memory fakes (happy path, empty
  result, precondition failure) plus one real-SQLite E2E test for the new adapters, matching
  `infra-e2e.test.ts`'s precedent — this is the one path proving the full hexagonal seam against
  a real (empty) database.
- **IPC**: handler validation tests for each new channel (arity/shape), `errorMapping.ts`
  coverage for the two newly-produced error codes.
- **Facade**: `create-ipc-application-layer.test.ts` with a mocked `window.nemis`, asserting
  each method calls the right channel with the right args and maps `IpcResult` correctly.
- **BootstrapService**: parallel-load ordering, one-load-fails-others-succeed tolerance, store
  state transitions (`idle → loading → ready` and `→ error`).
- **DashboardViewModel**: all six states, using in-memory fakes plus fakes for the new ports.
- **UI**: empty-state and database-unavailable panel rendering, matching Phase 7's
  render-level test scope (no business-logic assertions in renderer tests).

**Gate (unchanged from every prior phase):** `pnpm typecheck`, `pnpm lint`, `pnpm test`,
production build (`next build` static export) + Electron Forge package smoke. Same
`pnpm rebuild:node` / `pnpm rebuild:electron` env note as Phase 7 for the `better-sqlite3` ABI.

## 14. Documentation deliverables

New `docs/dashboard-bootstrap.md` (mirrors `docs/desktop-shell.md`'s structure), covering:
startup sequence diagram, `BootstrapService` design, Dashboard data flow, queries implemented,
empty-state strategy, error-handling strategy (§11's table), performance notes, remaining debt,
and Phase-9 readiness. Plus updates to `docs/data-access.md` (migration 002), 
`docs/application-layer.md` (three stubs replaced, new queries/ports, §7's table), 
`docs/presentation-layer.md` (`DashboardViewModel` graduated, new error kind, `BootstrapStore`), 
and an appended section to `docs/conventions.md` documenting how a future screen adds its own
no-arg "current X" read query following this phase's pattern.

## 15. Risks & accepted debt

- A fresh install will show four of seven dashboard facts as empty states (School Name,
  Academic Year, Classes, Attendance, and permanently Teachers) — this is the correct,
  honest behavior for a system with no CRUD or sync yet, not a shortfall of this phase.
- The seven business-repository stubs left untouched (`guardians`, `enrollments`,
  `attendance`-writes, `assessments`, `grades`, `gradingConfigs`, and `classes`-writes) remain
  a prerequisite for any future CRUD phase — unchanged scope from the Phase 7 report.
- `IAcademicYearRepository` is a new port with exactly one consumer (the dashboard query);
  if a future Academic/Terms screen needs more, the port grows then rather than being
  over-built now (YAGNI, consistent with this repo's established practice).
- Schema columns for the six new tables are intentionally not fully specified in this document
  (§6) — they are derived mechanically from existing domain entities during implementation, so
  fixing them here would just be a redundant transcription step.
