# Presentation Layer

**Package:** `@nemis-desktop/presentation` (`packages/presentation`)
**Phase:** 6 — builds on the Phase 5 Application Layer (merged to `main` at `c62575b`)
**Status:** implemented, no React/rendering in this phase (that is Phase 7)

## 1. Overview & architecture diagram

`@nemis-desktop/presentation` is the **only** layer the React UI (Phase 7) will
import from. It owns ViewModels, state management (Zustand vanilla stores), UI
commands/queries, loading/error/selection state, search/filter/sort/pagination,
notifications, dialog and navigation state, form state, and formatting. It
contains **no business rules** — those live in `@nemis-desktop/domain` and are
orchestrated by `@nemis-desktop/application`. The package is 100% React-free.

```
React (Phase 7)
      │  useStore(vm.store, selector)  — thin binding added in Phase 7
      ▼
@nemis-desktop/presentation   (ViewModels, stores, commands, queries,
                                selectors, presenters, formatters, forms)
      │  app.students / app.academics / ... (ApplicationResponse<T>)
      ▼
@nemis-desktop/application    (CQRS use cases, services)
      │  domain entities via repository ports
      ▼
@nemis-desktop/domain          (entities, value objects, domain events)
      │  repository adapters (main-process composition root)
      ▼
SQLite (better-sqlite3 / better-sqlite3-multiple-ciphers, SQLCipher)
```

### Package boundary rules

`package.json` dependencies are exactly `@nemis-desktop/application`,
`@nemis-desktop/types`, and `zustand`; `@nemis-desktop/domain` appears only as
a **devDependency**, used exclusively by tests (see below). Nothing else.

Enforced by `packages/presentation/eslint.config.mjs`
(`presentationImportGuard`, wired into the root `eslint.config.mjs`, the same
mechanism as `applicationImportGuard` in Phase 5):

- Forbidden packages: `react`, `react-dom`, `next`, `electron`,
  `better-sqlite3`, `better-sqlite3-multiple-ciphers`.
- Forbidden path patterns: `**/database/**`, `**/data/**`, `**/ipc/**`,
  `**/electron/**`.
- Forbidden package: `@nemis-desktop/domain` — presentation speaks
  **application DTOs only**, never domain entities.

**Test-only relaxation:** `presentationTestImportRelaxation` applies to
`packages/presentation/src/**/*.test.ts` and
`packages/presentation/src/testing/**/*.ts`. It keeps the React/Electron/SQLite
bans but drops the `@nemis-desktop/domain` ban, because ViewModel tests seed
the Phase-5 in-memory application fakes with real domain entities (mirroring
how the application package's own tests seed its fakes). Non-test source can
never import `@nemis-desktop/domain`.

**The seam:** the composition root receives the Phase-5 `ApplicationLayer`
object (services: `students`, `academics`, `attendance`, `assessments`,
`identity`, `institution`, `infra`). Every service method is async and returns
`ApplicationResponse<T>`, so a future renderer-side IPC facade can satisfy the
same shape structurally — presentation code will not change when the IPC
bridge lands in a later phase. "UI depends only on the Presentation Layer" is
therefore structurally prepared now and becomes fully verifiable once Phase 7
wires the renderer.

## 2. State management decision report

Copied from the approved design spec
(`docs/superpowers/specs/2026-07-19-phase-6-presentation-layer-design.md`, §2)
verbatim, as the canonical record of this decision.

| Decision         | Choice                                                                                                           | Alternatives considered                                                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Location         | New workspace package `packages/presentation` (`@nemis-desktop/presentation`), mirroring Phases 4–5              | Inside `packages/shared` (rejected: weakens boundary enforcement; `shared` stays a small utility package)                                                                                                                                                    |
| State management | **Zustand vanilla stores** (`zustand/vanilla`) wrapped by ViewModel classes (MVVM)                               | Redux Toolkit (rejected: duplicates existing Command/Query pattern, global-store coupling), MobX (rejected: implicit proxy reactivity, weaker strict-mode auditability), Jotai (rejected: React-centric atoms, awkward to drive from sync worker/IPC events) |
| React in package | **None.** Package is 100% React-free; the renderer adds a thin `useStore(vm.store, selector)` binding in Phase 7 | Shipping a `/react` subpath now (rejected: YAGNI, keeps phase testable with zero rendering)                                                                                                                                                                  |

Zustand vanilla fits this Offline-First Electron architecture because:

- **Offline-First / outside-React drivers.** Stores are plain TypeScript
  objects. Background sync completion, connectivity changes, and IPC push
  events (all future phases) can call `store.setState()` without React in the
  loop.
- **Application-layer integration.** ViewModels call application services
  (async, `ApplicationResponse<T>`) and commit results into stores with
  explicit, auditable `setState` transitions — no reducers/dispatch ceremony
  duplicating the CQRS pattern that already exists in
  `@nemis-desktop/application`.
- **Future synchronization.** A `SyncViewModel`/connectivity store can be
  updated by a sync worker via the same store API; screens react through
  selectors.
- **Large datasets.** Selector-based subscriptions give fine-grained
  re-render control; per-screen stores keep unrelated slices isolated.
- **Footprint.** ~1 kB, zero providers, no framework lock-in. Redux DevTools
  middleware can be added later if desired.

## 3. MVVM pattern

Every screen is backed by a ViewModel class (e.g. `packages/presentation/src/view-models/students/students-view-model.ts`)
composed of exactly three things:

1. A vanilla Zustand store: `readonly store = createStore<TState>(() => (...))`.
2. Commands/queries: thin per-domain classes (`commands/`, `queries/`)
   injected or constructed from application services.
3. A typed state interface with two universal conventions:
   - Every async slice is an `AsyncState<T>` field (e.g. `list`, `details`,
     `roster`, `records`, `grades`, `profile`, `device`, `user`).
   - Every command-bearing ViewModel has a top-level `submission:
SubmissionStatus` field (`'idle' | 'submitting' | 'submitted' |
'failed'`, `packages/presentation/src/core/submission.ts`).

ViewModels are plain classes with constructor-injected dependencies only
(application services + shared stores, e.g. `NotificationStore`,
`SessionStore`) — no service locators, no globals. React is not referenced
anywhere in a ViewModel; Phase 7 will bind components with
`useStore(vm.store, selector)` (a `zustand/react` hook over the vanilla
store), which is why the package can ship with zero rendering tests today.

## 4. ViewModel catalog

**Fully implemented** (backed by real Phase-5 use cases), all under
`view-models/<screen>/<screen>-view-model.ts`:

| ViewModel              | Backing service methods                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `StudentsViewModel`    | `students.list` (paginated, via `ListStudentsUiQuery`), `students.getById`, `students.create`, `students.deactivate`, `students.linkGuardian` |
| `ClassRosterViewModel` | `academics.getClassRoster`, `academics.enroll`, `academics.withdraw`                                                                          |
| `AttendanceViewModel`  | `attendance.getByClassAndDate`, `attendance.record`                                                                                           |
| `AssessmentsViewModel` | `assessments.createAssessment`, `assessments.recordGrade`, `assessments.publishGrade`, `assessments.getGradesByStudent`                       |
| `SettingsViewModel`    | `institution.getProfile`, `institution.updateGradingConfig`; `infra.updateSettings`                                                           |
| `DeviceViewModel`      | `infra.registerDevice` (+ writes the resulting device id into `SessionStore.setCurrentDevice`)                                                |
| `CurrentUserViewModel` | `identity.getUserById` → current-user selection (writes into `SessionStore.setCurrentUser`)                                                   |

Note: the design spec referred to the session-role ViewModel as
`SessionViewModel`; it shipped as `CurrentUserViewModel`
(`view-models/current-user/current-user-view-model.ts`) — same
responsibility (resolve and hold the current user id in `SessionStore`), the
class name better reflects what it loads (a single user), while `SessionStore`
remains the shared cross-screen selection store.

**Extension points only** — typed state shape and store contract are defined,
methods throw `NotImplementedPresentationError`, documented in
`view-models/_extension-template/README.md`:

| ViewModel                                                              | Why it's a stub                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DashboardViewModel` (`view-models/dashboard/dashboard-view-model.ts`) | No dashboard aggregate/summary use cases exist in the Phase-5 application layer yet (no count/summary queries). `DashboardSummaryView` (totalStudents, presentToday, pendingGrades) is typed now so the screen can be scaffolded; `loadSummary()` throws until the application layer grows summary queries.                      |
| `TeachersViewModel` (`view-models/teachers/teachers-view-model.ts`)    | The Teachers/Staff domain was not built in Phases 4–5 (no `@nemis-desktop/domain` slice, no application service). `loadTeachers()` throws until that domain ships.                                                                                                                                                               |
| `SyncViewModel` (`view-models/sync/sync-view-model.ts`)                | Sync **state** is live today — it reads the shared `ConnectivityStore` (which a future sync worker will write) and exposes `statusPresentation()` via `presentSyncStatus`. Only the **action** is stubbed: `startSync()` throws `NotImplementedPresentationError` until the synchronization phase implements a real sync worker. |

All eleven ViewModels (9 implemented + 2 stubs) are wired in one composition root,
`createPresentationLayer` (`factories/create-presentation-layer.ts`), and
exposed on `PresentationLayer.viewModels`. The BootstrapService wires the 5
main queries (`device`, `user`, `school`, `academic-year`, `dashboard`) as
parallel startup tasks in `create-presentation-layer.ts` lines 87–113.

**Phase 8 view model additions:**

- `DashboardViewModel.loadOverview()` (graduated from stub) — now calls a real
  `GetDashboardOverviewUseCase` (no-arg) that computes total students, total
  classes, and today's attendance counts. Store shape:
  `{ summary: AsyncState<DashboardSummaryView> }`.
- `AcademicYearViewModel` (new, Phase 8) — `loadCurrent()` calls
  `GetCurrentAcademicYearUseCase` (no-arg) that reads the current academic year.
  Store shape: `{ current: AsyncState<AcademicYearView> }`.
- `CurrentUserViewModel.loadCurrentUser()` (graduated) — now has real backing
  use case (no-arg `GetCurrentUserUseCase`).
- `SettingsViewModel.loadCurrentSchool()` (new method, Phase 8) — calls
  `GetCurrentSchoolUseCase` (no-arg) to read the active institution profile.
- `DeviceViewModel.loadDeviceInfo()` (new method, Phase 8) — calls the no-arg
  `GetDeviceInformationUseCase`.

## 5. Query & command pattern

Two pipelines in `core/async-runner.ts` are the only way ViewModels talk to
the application layer — no hand-rolled `try/catch` anywhere else in the
package.

### `trackQuery`

```ts
trackQuery<TDto, TView>(opts: {
  access: QueryStateAccess<TView>;   // get()/set() over one AsyncState<TView> field
  fetch: () => Promise<ApplicationResponse<TDto | null>>;
  map: (dto: TDto) => TView;
  isEmpty?: (view: TView) => boolean;
  onData?: (dto: TDto) => void;      // side-effect hook, e.g. write pagination total
}): Promise<void>
```

State transitions: sets `loading` (no prior data) or `refreshing` (prior data
present, via `hasData`) → awaits `fetch()` → `null`/`undefined` data becomes
`empty`; otherwise the DTO is mapped and `isEmpty?.(view)` decides between
`empty` and `success`; any thrown error is translated by
`toPresentationError(err, 'query')` and committed as `error`. Queries never
notify — loading a list silently is expected UX.

### `executeCommand`

```ts
executeCommand<TDto, TView>(opts: {
  run: () => Promise<ApplicationResponse<TDto>>;
  map: (dto: TDto) => TView;
  notifications: NotificationStore;
  successMessage: string;
}): Promise<CommandOutcome<TView>>   // { ok: true; data } | { ok: false; error }
```

Runs `run()`, maps the DTO, calls `notifications.success(successMessage)`, and
emits `notifications.warning(...)` for every `ApplicationResponse.warnings`
entry — this is the **only** notification path for commands; UI commands
never call `NotificationStore` directly. On a thrown error, it translates via
`toPresentationError(err, 'command')`, calls `notifications.error(...)`, and
returns `{ ok: false, error }`. **`executeCommand` never throws** — callers
always get a `CommandOutcome`, never a rejected promise.

### Thin per-domain UiQuery/UiCommand classes

`commands/<domain>/*.ts` and `queries/<domain>/*.ts` each wrap exactly one
application-service method through one of the two pipelines above, e.g.
`CreateStudentUiCommand`, `DeactivateStudentUiCommand`, `LinkGuardianUiCommand`,
`EnrollStudentUiCommand`, `WithdrawEnrollmentUiCommand`,
`RecordAttendanceUiCommand`, `CreateAssessmentUiCommand`,
`RecordGradeUiCommand`, `PublishGradeUiCommand`,
`UpdateGradingConfigUiCommand`, `UpdateSettingUiCommand`,
`RegisterDeviceUiCommand`; `ListStudentsUiQuery`, `GetStudentByIdUiQuery`,
`GetClassRosterUiQuery`, `GetAttendanceUiQuery`, `GetGradesByStudentUiQuery`,
`GetInstitutionProfileUiQuery`, `GetUserByIdUiQuery`. ViewModels compose these
classes rather than calling `trackQuery`/`executeCommand` inline for every
action, keeping the ViewModel focused on state shape and cross-field effects
(e.g. `StudentsViewModel.deactivateStudent` refreshes the details panel only
if it is currently showing the mutated student).

## 6. Error handling

`errors/presentation-error.ts` defines an abstract `PresentationError extends
Error` with a `kind: PresentationErrorKind`, a `userMessage` (always safe and
understandable — the UI renders only this, never raw messages or stacks), and
an optional `cause` for logs. Seven kinds, one class per kind:

| Kind                  | Class                             | When                                                                                                                                     |
| --------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `validation`          | `ValidationError`                 | Carries `fieldErrors: Record<string, string>` for `FormManager.applyExternalErrors` to map back onto form fields.                        |
| `permission`          | `PermissionError`                 | The user lacks permission for the action.                                                                                                |
| `operation-failed`    | `OperationFailedError`            | A business rule or workflow precondition rejected the action; message comes straight from the application layer (already renderer-safe). |
| `loading`             | `LoadingError`                    | Default fallback for unrecognized errors surfaced by a **query**.                                                                        |
| `network-unavailable` | `NetworkUnavailableError`         | Reserved for future IPC/REST transports — nothing in `toPresentationError` maps to it yet (see §13).                                     |
| `database-unavailable` | `DatabaseUnavailableError`        | (Phase 8) Mapped from IPC `DATABASE_UNAVAILABLE` error code when SQLite is locked, corrupt, or shut down. UI renders full-screen error panel. |
| `unexpected`          | `UnexpectedPresentationError`     | Default fallback for unrecognized errors surfaced by a **command**.                                                                      |
| `not-implemented`     | `NotImplementedPresentationError` | Thrown directly (not via translation) by extension-stub ViewModel methods; message is `"${feature} is not available yet."`.              |

### `toPresentationError(err, context)` mapping table

The single translation point (`errors/to-presentation-error.ts`), called from
inside `trackQuery`/`executeCommand`:

| Thrown by application layer               | Mapped to                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Already a `PresentationError`             | returned unchanged (idempotent)                                                                                                        |
| `ApplicationValidationException`          | `ValidationError('Please correct the highlighted fields.', fieldErrors)` — `fieldErrors` built from `err.issues` (`field` → `message`) |
| `PermissionDeniedException`               | `PermissionError('You do not have permission to perform this action.', { cause: err })`                                                |
| `UseCaseException` \| `WorkflowException` | `OperationFailedError(err.message, { cause: err })` — the application layer's message is already user-safe                             |
| anything else, `context === 'query'`      | `LoadingError('Something went wrong while loading. Please try again.', { cause: err })`                                                |
| anything else, `context === 'command'`    | `UnexpectedPresentationError('Something went wrong. Please try again.', { cause: err })`                                               |

`userMessage` policy: it is the only error text ViewModels/UI ever surface;
raw `Error.message`/stack traces stay on `cause`, for logs only.

## 7. Selectors

Pure functions, colocated by store under `selectors/`, taking state (and
sometimes a second store's state) and returning a derived value — no classes,
no memoization framework, safe to call on every render.

- `selectors/session-selectors.ts`: `selectCurrentUserId`,
  `selectSelectedStudentId`, `selectActiveAcademicYearId`,
  `selectCurrentDeviceId` — all pure projections of `SessionState`.
- `selectors/connectivity-selectors.ts`: `selectIsOffline`,
  `selectSyncStatus`, `selectSyncPresentation`,
  `selectConnectivityPresentation` — the latter two route through the
  `presenters/` module to produce ready-to-render `StatusPresentation`.
- `selectors/students-selectors.ts` — a per-screen selector example that
  crosses two stores: `selectStudentRows(state: StudentsState)` applies the
  client-side keyword filter (`matchesKeyword`) over `state.list`;
  `selectStudentsViewStatus(state, connectivity)` combines `StudentsState`
  and `ConnectivityState` via `toViewStatus`; `selectSelectedStudent(session,
students)` looks up the `SessionStore`-selected student inside the loaded
  `StudentsState.list`. This is the pattern for any future screen that needs
  session + screen state together.

Selection state itself (selected student/school/academic year/current
user/device) lives in the shared `SessionStore` so every screen agrees on
what's selected, rather than duplicating it per ViewModel.

## 8. Loading states

`core/async-state.ts` defines the discriminated union every screen's request
lifecycle uses:

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'refreshing'; data: T } // stale data still shown while reloading
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'error'; error: PresentationErrorLike };
```

(`PresentationErrorLike` is a minimal structural interface — `{ kind,
userMessage }` — so `core/` has no dependency on `errors/`; the real
`PresentationError` class satisfies it.)

Helpers: `idleState<T>()`, `hasData(state)` (true for `success`/`refreshing`,
narrows to the `{ data: T }` branch), `isBusy(state)` (true for
`loading`/`refreshing`).

`offline` and `syncing` are treated as **global** conditions, tracked in
`ConnectivityStore`, not per-request states — a request doesn't know whether
the whole app is offline. Screens combine the two via `toViewStatus(state,
ctx?)`, which returns the `ViewStatus` union:

```ts
type ViewStatus =
  'idle' | 'loading' | 'refreshing' | 'success' | 'empty' | 'error' | 'offline' | 'syncing';
```

Rule, exactly as implemented: if `ctx.isOffline` and the request is `idle` or
`error`, report `offline` (offline never hides data already on screen — a
`success`/`refreshing` state is left alone even while offline); else if
`ctx.isSyncing` and the request `hasData`, report `syncing`; otherwise pass
the `AsyncState.status` straight through. `selectStudentsViewStatus` is the
shipped example of wiring a screen's `AsyncState` and `ConnectivityState`
through this helper.

## 9. Forms, pagination, search, notifications, dialogs, navigation

### Forms (`forms/`, `validators/`)

`FormManager<TValues extends Record<string, unknown>>` (`forms/form-manager.ts`)
owns a Zustand store of `{ values, errors, isDirty, submission: SubmissionStatus,
submitError: PresentationError | null }`. `setValue(field, value)` updates a
value, clears that field's error, and recomputes `isDirty` by comparing every
field against the constructor's `initialValues` via `Object.is`. `validate()`
runs the injected `FormValidator<TValues>[]` pipeline and returns whether it
passed. `reset()` restores initial values and clears submission state.
`beginSubmit()` / `completeSubmit()` / `failSubmit(error)` drive the
submission lifecycle; `failSubmit` also calls `applyExternalErrors`, which
copies a command's `ValidationError.fieldErrors` back onto the form so
server/domain-origin validation renders next to the right field.
`validators/form-validators.ts` ships three presentational-only validators:
`required(...fields)`, `maxLength(field, max)`, `isoDate(field)` — business
validation stays in application/domain, never here.

### Pagination (`pagination/pagination.ts`)

`PaginationState { page (1-based), pageSize, totalCount, sort: SortSpec |
null }`. `createPagination(pageSize?)`, `toPageRequest(p)` (converts to the
application layer's `PageRequest { limit, offset }`), `totalPages(p)`,
`withPage(p, page)` (clamped to `[1, totalPages]`), `withPageSize(p, pageSize)`
(resets to page 1), `withTotal(p, totalCount)` (re-clamps the current page),
`withSort(p, sort)`. All pure, immutable transforms.

### Search (`search/search-state.ts`)

`SearchState { keyword, filters: readonly FilterDescriptor[], debounceMs }`
(`filters/filter-descriptor.ts` defines `FilterDescriptor { field, operator:
'eq'|'contains'|'gte'|'lte', value }`, kept as data so a future server/sync
search can adopt the same shape unchanged). `createSearch(debounceMs?)`,
`withKeyword`, `withFilters`, `clearSearch` are pure transforms. Debounce
policy is data (`debounceMs`); the timer itself is owned by the UI layer, not
this package. `matchesKeyword(fields, keyword)` is the client-side keyword
matcher used by `selectStudentRows` today (see §13 for its documented limit).

### Notifications (`notifications/notification.ts`, `stores/notification-store.ts`)

`UiNotification { id, kind: 'success'|'info'|'warning'|'error', message,
autoDismissMs: number | null, createdAt }`. `AUTO_DISMISS_MS` defaults:
success/info 4000ms, warning 6000ms, error `null` (manual dismiss only).
`NotificationStore` exposes `success/info/warning/error(message)` convenience
methods plus `notify(kind, message, opts?)`, `dismiss(id)`, `clear()`.
Presentation-only — **no Electron native notifications**. As covered in §5,
the only path that populates this store from command execution is
`executeCommand`; ViewModels never call `notifications.success/error(...)`
directly around a command (`ConnectivityStore.setOnline` is the one other
direct caller, for offline/online transitions, which are not commands).

### Dialogs (`stores/dialog-store.ts`)

`DialogStore` holds `{ current: DialogDescriptor | null }`, either a
`{ kind: 'custom'; name; payload }` or `{ kind: 'confirm'; payload:
ConfirmRequest }`. `open(name, payload?)` opens a custom dialog (cancelling
any pending `confirm()` first, so its promise never orphans). `confirm(req)`
returns a `Promise<boolean>` resolved by `resolveConfirm(result)`, which the
UI calls once the user answers; `close()` resolves a pending confirm as
`false` or simply clears a non-confirm dialog.

### Navigation (`navigation/route.ts`, `stores/navigation-store.ts`)

`ScreenId` enumerates the known screens (`'dashboard' | 'students' |
'class-roster' | 'attendance' | 'assessments' | 'settings' | 'device' |
'sync' | 'teachers'`) — including the three extension-stub screens, so
navigation is typed end-to-end before their ViewModels are implemented.
`NavigationStore` holds `{ current: RouteDescriptor, history }`;
`navigate(screen, params?)` pushes `current` onto `history`; `back()` pops the
last history entry (no-op if history is empty). Framework-agnostic — the real
router (Next.js, Phase 7) mirrors this store rather than replacing it.

## 10. Presenters & formatters

`presenters/status-presentation.ts` defines the shared shape:
`BadgeToken = 'success' | 'active' | 'pending' | 'error' | 'neutral'` and
`StatusPresentation { label, badge: BadgeToken }`. **Presentation never emits
hex colors or any palette-specific value** — badge tokens are semantic names;
the UI (Phase 7) owns the mapping from token to the enterprise palette.

`presenters/present-status.ts` builds `StatusPresentation` for every status
enum the application layer surfaces: `presentActive(isActive)`,
`presentAttendanceStatus(AttendanceStatus)`,
`presentEnrollmentStatus(EnrollmentStatus)`, `presentGradeStatus(GradeStatus,
isPublished)` (published always wins over the raw status),
`presentApprovalStatus(ApprovalStatus)`, plus the connectivity-facing
`presentSyncStatus(SyncStatus, lastSyncAt)` and
`presentConnectivity(isOnline)`. Each is a small lookup table keyed by the
`@nemis-desktop/types` enum, returning a fixed `{ label, badge }` — no
conditional strings scattered through ViewModels.

`formatters/` are pure, dependency-free functions with no store/state
access: `format-date.ts` (`formatIsoDate`, `formatIsoDateTime`, both
`Intl.DateTimeFormat('en-GB', { timeZone: 'UTC' })`-based, returning `'—'` for
unparsable input), `format-text.ts` (`formatFullName`, `humanizeEnum`
e.g. `'UNDER_REVIEW'` → `'Under review'`, `formatGradeLevel` e.g.
`'GRADE_5'` → `'Grade 5'`), `format-marks.ts` (`formatMarks(obtained, total)`
→ `'12 / 20'`, `formatPercent` → `'60%'` or `'—'` when `total <= 0`).

`mappers/<domain>/<domain>-view-mapper.ts` (one per domain: students,
academics, attendance, assessments, institution, infra, identity) are the
glue: pure `toXxxView(dto)` functions that call formatters/presenters to turn
an application DTO into a display-ready view-model interface from
`view-models/<screen>/<screen>-views.ts`. The UI performs **no** formatting
of its own — every string a component renders arrives pre-formatted from a
mapper.

## 11. Folder organization

```
packages/presentation/
  package.json  tsconfig.json  eslint.config.mjs
  src/
    core/            AsyncState<T>, ViewStatus, trackQuery/executeCommand pipeline
    errors/          PresentationError taxonomy + toPresentationError translator
    constants/       DEFAULT_PAGE_SIZE, DEFAULT_SEARCH_DEBOUNCE_MS
    stores/          SessionStore, NotificationStore, DialogStore,
                      NavigationStore, ConnectivityStore (cross-cutting)
    selectors/       reusable pure selectors, colocated with their store
    commands/        UI command classes per domain (students/ academics/
                      attendance/ assessments/ settings/ device/)
    queries/         UI query classes per domain (students/ academics/
                      attendance/ assessments/ settings/ identity/)
    view-models/     one folder per screen: students/ class-roster/
                      attendance/ assessments/ settings/ device/ current-user/
                      dashboard/ teachers/ sync/ + _extension-template/
    presenters/      status-presentation.ts (BadgeToken/StatusPresentation),
                      present-status.ts (status → StatusPresentation lookups)
    formatters/      pure formatting fns: dates, names/enums, marks/percent
    mappers/         application DTO → view model, per domain
    forms/           FormManager<TValues>, field/submission state
    validators/      presentational validators (required, maxLength, isoDate)
    pagination/       PaginationState + pure transforms
    filters/         FilterDescriptor (typed filter data)
    search/          SearchState + pure transforms, matchesKeyword
    notifications/   UiNotification, NotificationKind, AUTO_DISMISS_MS
    navigation/      ScreenId, RouteDescriptor
    testing/         create-test-application.ts — application layer wired
                      to Phase-5 in-memory fakes, for ViewModel tests
    factories/       createPresentationLayer(app, options?)
    index.ts         public API — the only import surface Phase 7 uses
```

Notes on divergence from the original spec's proposed tree: `dialogs/` payload
types live directly in `stores/dialog-store.ts` rather than a separate
`dialogs/` folder (the store _is_ the payload contract, one file, no
duplication); `navigation/` holds only the route/screen types, the store
itself lives in `stores/navigation-store.ts` — both are the "merges noted" the
spec anticipated in its folder-structure section.

## 12. Extension strategy

New screens follow `view-models/_extension-template/README.md`, which walks
through the Students slice as the reference implementation: views → mapper →
queries → commands → ViewModel (`AsyncState` fields + `SubmissionStatus`,
loading via `trackQuery`, actions via command classes) → selectors → wire into
`factories/create-presentation-layer.ts` and `src/index.ts` → tests using
`testing/create-test-application.ts`. Until the backing domain/application
slice exists, ship the ViewModel as a typed stub whose methods throw
`NotImplementedPresentationError`, following `DashboardViewModel` /
`TeachersViewModel` / `SyncViewModel` as precedent.

## 13. Known limitations / debt

- **Client-side keyword filter.** `ListStudentsDto`/the application layer's
  student list query has no server-side keyword parameter yet, so
  `selectStudentRows` (`selectors/students-selectors.ts`) filters the already
  fetched page in memory via `matchesKeyword`. This only filters what is on
  the current page — it is not a substitute for server-side search and should
  be replaced once the application layer grows a keyword-aware list query.
- **`NetworkUnavailableError` is unmapped.** The error kind and class exist
  (`errors/presentation-error.ts`) but `toPresentationError` never produces
  one — there is no IPC/REST transport yet for a network call to fail
  against. It is reserved for when the renderer starts talking to the main
  process over IPC (or a future REST sync channel) and needs to distinguish
  "you are offline" from "the operation itself failed."
- **Phase-5 Proxy-stub business adapters.** The application layer's
  `createApplicationComposition` still uses `as never`-cast Proxy stubs for
  some business repository adapters (flagged in the Phase-5 report). This
  phase does not touch that composition; it is a **Phase-7 prerequisite** —
  the real renderer wiring needs those adapters replaced with genuine SQLite-
  backed repositories before the app can run end-to-end.
- **`PaginationState.sort` is unconsumed.** `pagination/pagination.ts` defines
  `SortSpec { field, direction }` and `withSort(p, sort)`, and `PaginationState`
  carries a `sort` field, but no application query (`ListStudentsUiQuery` or
  otherwise) currently accepts or applies a sort spec — `toPageRequest` only
  forwards `limit`/`offset`. The type exists so screens can be built against a
  stable contract; wiring `sort` through to a query is future work.
- **`GradingConfigView` / `SettingView` carry raw values, not formatted
  strings.** Every other view-model interface in `view-models/*/`-`views.ts`
  holds display-ready strings (via mappers/presenters/formatters). By design,
  `GradingConfigView` (`view-models/settings/settings-views.ts`: `maxMarks`,
  `passingMarks`, `requireAdminApproval`) and `SettingView`
  (`view-models/device/device-views.ts`: `key`, `value: unknown`,
  `updatedAt`) intentionally do **not** follow that pattern — they back
  editable form fields (`UpdateGradingConfigDto`, `UpdateSettingsDto`) that
  must round-trip the exact editable value back into a command unchanged.
  Formatting them would require an un-formatting step on submit and risks
  precision/representation loss (e.g. numeric marks, arbitrary setting
  values). This is a deliberate, not accidental, deviation from the
  formatted-view convention.
