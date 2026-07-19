# Phase 6 — Presentation Layer (`@nemis-desktop/presentation`) Design

**Date:** 2026-07-19
**Status:** Approved (user-approved in brainstorming session)
**Builds on:** Phase 5 Application Layer (merged to `main` at `c62575b`)

## 1. Purpose

Create the Presentation Layer: the ONLY layer the React UI (Phase 7) will interact
with. It owns ViewModels, state management, UI commands/queries, loading/error/
selection state, search, filtering, sorting, pagination, notifications, dialog and
navigation state, form state, computed values, and formatting. It contains **no
business rules** — those live in `@nemis-desktop/domain` and the backend.

```
React (Phase 7) → @nemis-desktop/presentation → @nemis-desktop/application
                → domain → repositories → SQLite
```

## 2. Decisions made during brainstorming

| Decision         | Choice                                                                                                            | Alternatives considered                                                                                                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Location         | New workspace package `packages/presentation` (`@nemis-desktop/presentation`), mirroring Phases 4–5               | Inside `packages/shared` (rejected: weakens boundary enforcement; `shared` stays a small utility package)                                                                                                                                                    |
| State management | **Zustand vanilla stores** (`zustand/vanilla`) wrapped by ViewModel classes (MVVM)                                | Redux Toolkit (rejected: duplicates existing Command/Query pattern, global-store coupling), MobX (rejected: implicit proxy reactivity, weaker strict-mode auditability), Jotai (rejected: React-centric atoms, awkward to drive from sync worker/IPC events) |
| React in package | **None.** Package is 100 % React-free; the renderer adds a thin `useStore(vm.store, selector)` binding in Phase 7 | Shipping a `/react` subpath now (rejected: YAGNI, keeps phase testable with zero rendering)                                                                                                                                                                  |

### State-management decision report (required deliverable)

Zustand vanilla fits this Offline-First Electron architecture because:

- **Offline-First / outside-React drivers.** Stores are plain TypeScript objects.
  Background sync completion, connectivity changes, and IPC push events (all
  future phases) can call `store.setState()` without React in the loop.
- **Application-layer integration.** ViewModels call application services (async,
  `ApplicationResponse<T>`) and commit results into stores with explicit,
  auditable `setState` transitions — no reducers/dispatch ceremony duplicating
  the CQRS pattern that already exists in `@nemis-desktop/application`.
- **Future synchronization.** A `SyncViewModel`/connectivity store can be updated
  by a sync worker via the same store API; screens react through selectors.
- **Large datasets.** Selector-based subscriptions give fine-grained re-render
  control; per-screen stores keep unrelated slices isolated.
- **Footprint.** ~1 kB, zero providers, no framework lock-in. Redux DevTools
  middleware can be added later if desired.

## 3. Package & dependency rules

- `packages/presentation`, name `@nemis-desktop/presentation`, pure TypeScript,
  strict mode, named exports, Vitest.
- **Dependencies:** `@nemis-desktop/application`, `@nemis-desktop/types`,
  `zustand`. Nothing else.
- **Forbidden imports** (enforced by a `presentationImportGuard` in
  `packages/presentation/eslint.config.mjs`, wired into root `eslint.config.mjs`,
  same mechanism as `applicationImportGuard`): `react`, `react-dom`, `next`,
  `electron`, `better-sqlite3`, and path patterns `**/database/**`, `**/data/**`,
  `**/ipc/**`, `**/electron/**`. Also forbid `@nemis-desktop/domain` — the
  presentation layer speaks application DTOs only, never domain entities.
- **The seam:** the composition root receives the Phase-5 `ApplicationLayer`
  object (7 services: `students`, `academics`, `attendance`, `assessments`,
  `identity`, `institution`, `infra`). Services expose only async methods
  returning `ApplicationResponse<T>`, so a future renderer-side IPC facade can
  satisfy the same shape **structurally** — presentation code will not change
  when the IPC bridge lands in a later phase.

## 4. Folder structure

The user-spec folder list maps onto the package as follows (merges noted):

```
packages/presentation/
  package.json  tsconfig.json  eslint.config.mjs
  src/
    core/            # AsyncState<T>, ViewStatus, runQuery/runCommand pipeline
                     # (absorbs spec folders: state/, loading/)
    errors/          # presentation error taxonomy + application→UI translator
    interfaces/      # public contracts: ViewModel base, store typing helpers,
                     # IPresentationLogger, INotificationSink
    constants/       # status/badge tokens, notification defaults, page sizes
    stores/          # shared cross-cutting stores: SessionStore (selection),
                     # NotificationStore, DialogStore, NavigationStore,
                     # ConnectivityStore
    selectors/       # reusable cross-store selectors
    commands/        # UI command classes per domain (delegate to app services)
      students/ academics/ attendance/ assessments/ settings/ device/
    queries/         # UI query classes per domain (read models for screens)
      students/ academics/ attendance/ assessments/ settings/ device/ session/
    view-models/     # one folder per screen; each composes commands+queries+store
      students/ class-roster/ attendance/ assessments/ settings/ device/ session/
      _extension-template/   # + typed stubs: dashboard/ teachers/ sync/
    presenters/      # display-model builders (status labels, badge tokens)
    formatters/      # pure formatting fns: dates, names, numbers
    mappers/         # application DTO → view model (absorbs spec folder: adapters/)
    forms/           # FormManager<TValues>, field state, submission state
    validators/      # presentational validators (required, length, format)
    pagination/      # PaginationState: page, pageSize, sort, totalCount
    filters/         # typed filter descriptors
    search/          # SearchState: keyword + filters, debounce-ready
    notifications/   # notification types & policies (store lives in stores/)
    navigation/      # route descriptors, guard data (store lives in stores/)
    dialogs/         # dialog payload types, confirm-dialog helper
    factories/       # createPresentationLayer(app, options?)
    index.ts         # public API
```

## 5. Core building blocks

### 5.1 `AsyncState<T>` and `ViewStatus`

Discriminated union standardizing every screen's request lifecycle:

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'refreshing'; data: T } // stale data still shown
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'error'; error: PresentationError };
```

`offline` and `syncing` are **global** conditions (ConnectivityStore), not
per-request states; a screen combines them via selectors into a `ViewStatus`
(`idle | loading | refreshing | success | empty | error | offline | syncing`)
for direct UI consumption. Helpers: `isLoading`, `hasData`, `toViewStatus`.

### 5.2 `runQuery` / `runCommand` pipeline

The single async runner every ViewModel uses — no hand-rolled try/catch:

- `runQuery(store, key, fn, mapper)`: sets `loading` (or `refreshing` when data
  exists), awaits the application service, maps `ApplicationResponse<T>` through
  the DTO→view-model mapper, commits `success` or `empty`, translates thrown
  errors into `PresentationError` and commits `error`.
- `runCommand(...)`: same, plus submission-state tracking and a success/error
  notification via `NotificationStore`.

### 5.3 Error taxonomy (`errors/`)

`PresentationError` base with `userMessage` (understandable), `severity`, and
`cause`. Subtypes: `ValidationError`, `LoadingError`,
`NetworkUnavailableError`, `UnexpectedPresentationError`,
`NotImplementedPresentationError` (extension stubs). A single
`toPresentationError(unknown)` translator maps application exceptions
(`ApplicationValidationException` → `ValidationError`, `PermissionDenied` →
user-friendly denial, unknown → `UnexpectedPresentationError`); raw messages/
stacks never reach the UI text, only `userMessage`.

### 5.4 Pagination, search, filtering, sorting

- `PaginationState`: `page`, `pageSize`, `sort: { field, direction }`,
  `totalCount`; composes with the application layer's existing pagination
  contract (`core/pagination.ts` in `@nemis-desktop/application`).
- `SearchState`: keyword + typed `FilterDescriptor[]`; debounce policy is data
  (`debounceMs`), execution belongs to the UI layer. Designed so a future
  server/sync-backed search implements the same query contract.

### 5.5 Forms (`forms/`, `validators/`)

Generic `FormManager<TValues>`: field values, per-field errors, dirty tracking,
`reset()`, submission state (`idle | submitting | submitted | failed`), success/
error state. Validation is pluggable **presentational** validators only
(required, length, format) — business validation stays in application/domain;
server-side/domain errors returned by commands are mapped back onto fields
where possible via `applyExternalErrors`.

### 5.6 Notifications, dialogs, navigation (shared stores)

- `NotificationStore`: success/info/warning/error + offline/sync notices,
  auto-dismiss policy per severity. Presentation-only; **no Electron
  notifications**.
- `DialogStore`: typed `openDialog(kind, payload)` / `closeDialog`, plus a
  promise-based `confirm()` helper.
- `NavigationStore`: current route descriptor + guard data as plain state; the
  real router (Next.js, Phase 7) mirrors this store. No routing library here.
- `ConnectivityStore`: `online/offline`, `syncStatus`
  (`idle | syncing | failed`), `lastSyncAt` — written by future sync phases,
  read by selectors today.

### 5.7 Presenters & formatters

Pure functions building **display models**: human-readable dates, full names,
status → `{ label, badgeToken }` where `badgeToken` is a semantic name
(`'success' | 'active' | 'pending' | 'error' | 'neutral'`) — never hex values;
the UI maps tokens to the enterprise palette. The UI performs no formatting.

## 6. UI Commands & Queries

Thin classes per domain under `commands/` and `queries/`, each delegating to one
application-service method through the `runCommand`/`runQuery` pipeline.
Examples: `CreateStudentUiCommand`, `DeactivateStudentUiCommand`,
`RecordAttendanceUiCommand`, `SaveGradingConfigUiCommand`,
`RegisterDeviceUiCommand`; `ListStudentsUiQuery`, `GetClassRosterUiQuery`,
`GetGradesByStudentUiQuery`. Queries return **view models** (mapped read
models), never application DTOs or domain entities, wherever a display shape
differs from the DTO; trivial passthroughs may re-export the DTO type under a
view-model alias to avoid dead mapping code.

## 7. ViewModel catalog

Each ViewModel class owns: a vanilla Zustand store (typed state interface),
its commands/queries, and exported selectors. Constructor-injected dependencies
only (application services + shared stores + presenters).

**Fully implemented** (backed by real Phase-5 use cases):

| ViewModel              | Backing service methods                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `StudentsViewModel`    | `students.list` (paginated/search), `getById`, `create`, `deactivate`, `linkGuardian` |
| `ClassRosterViewModel` | `academics.getClassRoster`, `enroll`, `withdraw`                                      |
| `AttendanceViewModel`  | `attendance.getByClassAndDate`, `record`                                              |
| `AssessmentsViewModel` | `assessments.createAssessment`, `recordGrade`, `publishGrade`, `getGradesByStudent`   |
| `SettingsViewModel`    | `institution.getProfile`, `updateGradingConfig`; `infra.updateSettings`               |
| `DeviceViewModel`      | `infra.registerDevice` + device status state                                          |
| `SessionViewModel`     | `identity.getUserById` → current-user selection                                       |

**Extension points only** — typed state shape + store contract defined, methods
throw `NotImplementedPresentationError`, documented in
`view-models/_extension-template/`: `DashboardViewModel`, `TeachersViewModel`,
`SyncViewModel` (sync state read from `ConnectivityStore` is live; actions are
stubs until the sync phase).

## 8. Selectors

Reusable pure selectors, memo-friendly, colocated with their store:
`selectSelectedStudent`, `selectSelectedSchool`, `selectActiveAcademicYear`,
`selectCurrentDevice`, `selectCurrentUser`, `selectSyncStatus`,
`selectIsOffline`, plus per-screen selectors (filtered/sorted/paginated views).
Selection state (selected student/school/academic year) lives in the shared
`SessionStore` so multiple screens agree.

## 9. Composition root

`createPresentationLayer(app: ApplicationLayer, options?)` in `factories/`:
constructs shared stores, presenters, and all ViewModels; returns a typed
`PresentationLayer` object. Single wiring point, same philosophy as
`createApplicationLayer`. `options` allows injecting a clock (for formatters in
tests) and notification policy overrides.

## 10. Testing strategy

Vitest, **no UI rendering tests**:

- **ViewModel tests**: run against `createApplicationLayer` wired with the
  Phase-5 `testing/` in-memory fakes — real presentation→application
  integration without SQLite. Assert via `store.getState()` and subscription
  spies (loading→success ordering, error translation, notification emission).
- **Unit tests**: stores, selectors, presenters, formatters, `FormManager`,
  pagination/search state, `toPresentationError`, `runQuery`/`runCommand`.
- **Boundary test**: lint guard verified to reject `react`/`electron` imports.
- **Gate**: `pnpm typecheck`, `pnpm lint`, `pnpm test` all green (all existing
  372 tests keep passing plus new presentation tests).

## 11. Documentation deliverables

- `docs/presentation-layer.md`: architecture diagram, state-management decision
  report (§2), ViewModel philosophy, selector/presenter/command/query
  strategies, folder map, extension guide ("adding a new screen" checklist).
- "Presentation Layer" section appended to `docs/conventions.md`.
- Final phase report: acceptance-criteria audit, remaining technical debt,
  Phase-7 readiness assessment.

## 12. Out of scope (explicit)

- No React pages or web-UI migration; no rendering tests.
- No SQLite, repository, IPC, REST, or Electron code.
- No synchronization implementation (ConnectivityStore is state-only).
- The Phase-5 Proxy-stubbed business repository adapters (`as never` cast in
  `createApplicationComposition`) are **not** replaced here — that is
  main-process wiring, flagged as a Phase-7 prerequisite in the readiness
  assessment.

## 13. Known constraints & gotchas carried forward

- Repo uses `noUncheckedIndexedAccess`; index access needs guards.
- Named exports only; small focused modules; no `any`.
- The acceptance criterion "UI depends only on Presentation Layer" is
  _structurally prepared_ here (boundary design + lint guards); it becomes
  fully verifiable when Phase 7 wires the renderer.
