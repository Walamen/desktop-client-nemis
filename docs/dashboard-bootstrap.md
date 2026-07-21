# Dashboard Bootstrap & Data Flow (Phase 8)

Phase 8 wires the five parallel bootstrap queries (`device`, `user`, `school`,
`academic-year`, `dashboard`) into the IPC facade and connects them through the
presentation layer to the React dashboard on startup. The offline-first SQLite
platform is now live: the renderer never queries in-memory fakes; every call
travels through IPC to the real Application Layer backed by real SQLite adapters
and 200+ COUNT-based repository operations. This document is the durable
reference for the startup sequence, the bootstrap design, the data flow,
state transitions, error handling, and Phase-9 readiness.

---

## 1. Startup sequence

### Main process

```
Electron app.whenReady()
  ↓ loadConfig() → initLogger()
  ↓ loadOrCreateDatabaseKey() → SQLCipher encryption key
  ↓ new DatabaseManager({ userDataDir, encryptionKey, device, log })
  ↓ .initialize()
    ├─ Database.open(filePath, encryptionKey)
    ├─ MigrationService.migrateToLatest()  [001 → 002]
    ├─ initializeMetadata(db, device, schemaVersion)  [create device row]
    ├─ initializeLocalUser(db)  [create/get local user row]
    ├─ state = 'ready'
  ↓ createDataLayer(manager, log)  [composes 6 business SQLite adapters]
  ↓ createApplicationComposition(dataLayer)  [wires application layer]
  ↓ registerIpcHandlers(services, application)  [mounts 5 query handlers]
  ↓ createMainWindow() + hardenWebContents()
  ↓ window loads renderer
```

On error: `DatabaseError` caught at app.whenReady, shows native dialog, quits.

### Renderer process

```
React: RootProviders (app/providers.tsx)
  ↓ createRendererPresentation()  [SYNC, returns immediately]
    └─ createTestApplication() + seedDemoData()  [Phase 8 facade placeholder]
  ↓ useMemo() wraps the layer, useStore reads bootstrap.phase = 'idle'
  ↓ useEffect() calls layer.bootstrap.run()
    └─ BootstrapService.run()
      ├─ store.start(['device', 'user', 'school', 'academic-year', 'dashboard'])
      ├─ Promise.allSettled([
      │   viewModels.device.loadDeviceInfo(),
      │   viewModels.currentUser.loadCurrentUser(),
      │   viewModels.settings.loadCurrentSchool(),
      │   viewModels.academicYear.loadCurrent(),
      │   viewModels.dashboard.loadOverview()
      │ ])  [all 5 parallel, no blocking]
      ├─ For each task, call .hasError() and mark done/failed
      ├─ store.finish()  [phase = 'ready' if any task succeeded; 'error' if ALL failed]
  ↓ if phase === 'idle' || 'loading': render Spinner
  ↓ if phase === 'ready' || 'error': render PresentationProvider + children
    └─ RootProviders mounts app/government/school-admin/layout.tsx
      └─ Dashboard page renders, branching on bootstrap query states
```

Renderer blocks until at least one query succeeds; if all fail, show database-unavailable
panel instead of silent spinner hang.

---

## 2. BootstrapService design

`packages/presentation/src/services/bootstrap-service.ts`:

```ts
export class BootstrapService {
  constructor(
    private readonly store: BootstrapStore,
    private readonly tasks: readonly BootstrapTask[],
  ) {}

  async run(): Promise<void> {
    this.store.start(this.tasks.map((t) => t.name));
    await Promise.allSettled(this.tasks.map((t) => t.run()));
    for (const task of this.tasks) {
      if (task.hasError()) this.store.markFailed(task.name);
      else this.store.markDone(task.name);
    }
    this.store.finish();
  }
}
```

**Five tasks, wired in `create-presentation-layer.ts`:**

| Task name       | Method                                  | ViewModel               | Error detector                    |
| --------------- | --------------------------------------- | ----------------------- | --------------------------------- |
| `device`        | `viewModels.device.loadDeviceInfo()`    | `DeviceViewModel`       | `device.store.device.status === 'error'` |
| `user`          | `viewModels.currentUser.loadCurrentUser()` | `CurrentUserViewModel`  | `user.store.user.status === 'error'`   |
| `school`        | `viewModels.settings.loadCurrentSchool()` | `SettingsViewModel`     | `profile.store.profile.status === 'error'` |
| `academic-year` | `viewModels.academicYear.loadCurrent()` | `AcademicYearViewModel` | `current.store.current.status === 'error'` |
| `dashboard`     | `viewModels.dashboard.loadOverview()`   | `DashboardViewModel`    | `summary.store.summary.status === 'error'` |

**BootstrapStore phases:**

- `idle` → `loading` (on `.start()`)
- `loading` → `ready` (on `.finish()` if ≥1 task succeeded)
- `loading` → `error` (on `.finish()` if all tasks failed)

**Partial failure tolerance:** Each task's ViewModel keeps its own independent
`AsyncState`. If `device` fails but `dashboard` succeeds, the device tile
shows error, the dashboard shows data. Only if **all five** tasks fail does
the bootstrap phase flip to `error` and `RootProviders` shows the database-unavailable
panel instead of the app.

---

## 3. Dashboard data flow

```
React component (page.tsx)
  ↓ useDashboardViewModel() → hooks.ts → usePresentation().viewModels.dashboard
  ↓ DashboardViewModel (packages/presentation)
    ↓ .loadOverview() → trackQuery()
    ↓ GetDashboardOverviewUiQuery (presentation/queries)
      ↓ .execute() → reporting.getDashboardOverview()
      ↓ ReportingApplicationService (packages/application)
        ↓ GetDashboardOverviewUseCase (application/use-cases)
          ↓ .execute() → invokeUseCase()
            ├─ students.countAll()
            ├─ classes.countAll()
            └─ attendance.countByDate(today)
            ↓ Each call crosses IPC to main process
              ↓ IPC handler: registerDashboardHandlers()
                ↓ app.reporting.getDashboardOverview() [real app]
                  ↓ GetDashboardOverviewUseCase (real, over SQLite adapters)
                    ├─ SqliteStudentRepository.countAll()  [COUNT(*) FROM students]
                    ├─ SqliteClassRepository.countAll()    [COUNT(*) FROM classes]
                    └─ SqliteAttendanceRepository.countByDate(date)  [complex SELECT, see below]
                    ↓ SQLite (real database)
                    ↓ Returns DTO → IpcResult { ok, data }
                ↓ Renderer IPC handler routes response
              ↓ Renderer: ui-query receives data
              ↓ Mapper: toDashboardSummaryView()
              ↓ Store.setState({ summary: { status: 'success', data: view } })
  ↓ Dashboard page renders stats grid / empty states / error panel
```

Every no-arg query follows the same layered path: React → ViewModel → UiQuery →
ApplicationLayer facade → window.nemis → IPC handler → real ApplicationLayer →
SQLite adapter → SQLite.

---

## 4. Queries implemented

Five no-arg queries power the bootstrap. Each returns `ApplicationResponse<T | null>`.

| Query                         | Service / Channel           | Method                                                       | Repository call                |
| ----------------------------- | --------------------------- | ------------------------------------------------------------ | ------------------------------ |
| `GetDashboardOverviewUiQuery` | `reporting.getDashboardOverview()` → `DASHBOARD_GET_OVERVIEW` | `GetDashboardOverviewUseCase` — counts + attendance summary | `students.countAll()`, `classes.countAll()`, `attendance.countByDate(today)` |
| `GetCurrentSchoolUiQuery`     | `institution.getCurrentSchool()` → `SCHOOL_GET_SUMMARY`      | `GetCurrentSchoolUseCase` — reads current school             | `institutions.findFirst()`     |
| `GetCurrentAcademicYearUiQuery` | `academics.getCurrentAcademicYear()` → `ACADEMIC_YEAR_GET_CURRENT` | `GetCurrentAcademicYearUseCase` — reads current year         | `academicYears.findCurrent(isCurrent: 1)` |
| `GetCurrentUserUiQuery`       | `identity.getCurrentUser()` → `IDENTITY_GET_CURRENT_USER`     | `GetCurrentUserUseCase` — reads first user                   | `users.findFirst()`            |
| `GetDeviceInfoUiQuery`        | `infra.getDeviceInfo()` → `DEVICE_GET_INFO`                  | `GetDeviceInformationUseCase` — reads device                 | `deviceGateway.getCurrent()` → `devices.findFirst()` |

**IPC channels** (defined in `packages/types/src/ipc.ts`):
- `DASHBOARD_GET_OVERVIEW` (no args) → `DashboardOverviewOutput`
- `SCHOOL_GET_SUMMARY` (no args) → `InstitutionProfileOutput | null`
- `ACADEMIC_YEAR_GET_CURRENT` (no args) → `AcademicYearOutput | null`
- `IDENTITY_GET_CURRENT_USER` (no args) → `UserOutput | null`
- `DEVICE_GET_INFO` (no args) → `DeviceOutput | null`

All validators use `assertNoArgs` (`apps/desktop/electron/security/validateIpc.ts`).

---

## 5. State transitions

Every ViewModel async slice is an `AsyncState<T>`:

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'refreshing'; data: T }
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'error'; error: PresentationErrorLike };
```

Each task transitions as `idle` → `loading` → `success/empty/error`.

**Error kinds** (`packages/presentation/src/errors/presentation-error.ts`):

| Kind | When | Source | Example |
| --- | --- | --- | --- |
| `'database-unavailable'` | SQLite locked, corrupt, or shut down | `toIpcError(DatabaseError)` → `DATABASE_UNAVAILABLE` IPC code → `DatabaseUnavailableError` | Main process can't open file; migration fails at startup |
| `'loading'` | Load failed for app-layer reasons (not DB) | `toIpcError(ApplicationError)` → `UNEXPECTED_ERROR` IPC code → `LoadingError` mapper | Repository query threw non-DB error |
| `'network-unavailable'` | Reserved for future transports | None wired yet | Phase 9+ when sync worker is live |
| `'unexpected'` | Unmapped error (never happens if toIpcError is exhaustive) | Non-coded IPC error | Renderer received malformed IPC response |

**UI branches in `dashboard/page.tsx`:**

```ts
if (summary.status === 'error' && summary.error.kind === 'database-unavailable') {
  // Show DatabaseUnavailablePanel (retry button; no data on screen)
} else if (summary.status === 'error') {
  // Show ErrorState (generic error message + retry)
} else if (summary.status === 'success' || 'refreshing') {
  // Show stats grid (refreshing keeps previous data visible)
} else {
  // idle / loading → Skeleton placeholders
}
```

Per-tile errors are isolated: `device` tile shows error, dashboard data still visible
if dashboard succeeded.

---

## 6. Empty-state strategy

A fresh install legitimately shows zeros and empty states. No fabricated numbers.

**Empty text copy** (exact, from `dashboard/page.tsx`):

- **School profile:** "School profile not set up yet" (when `profile.status === 'empty'`)
- **Academic Year:** "No academic year configured" (when `year.status === 'empty'`)
- **Attendance:** "No attendance recorded" (when `attendanceToday.total === 0`)
- **Teachers:** "Staff records not tracked yet" (when teacher data unavailable)

**Stats rendering** (from `DashboardSummaryView`):

- `totalStudents` — real COUNT from `students` table (trustworthy)
- `totalClasses` — real COUNT from `classes` table (trustworthy)
- `attendanceToday` — `{ present: number, total: number }` from attendance index query
  (exact at query time, not real-time)

**Why zeros are correct:**

1. Phase 8 has no import/sync — data enters only through UI create operations.
2. Dashboard doesn't expose CRUD (no "Add Student" backend yet, only placeholder links).
3. A fresh desktop app boots with an empty SQLite store and zero pre-seeded rows.
4. The bootstrap loader shows Skeleton tiles until data arrives, then renders
   zeros + empty states side-by-side, communicating "this is truly empty, not a
   load error."

---

## 7. Error-handling strategy

### At startup (main process)

**Migration failure:**
```
DatabaseManager.initialize()
  → MigrationService.migrateToLatest() throws
  → caught in app.whenReady().catch()
  → dialog.showErrorBox('NEMIS Desktop', 'Database failed to open...')
  → app.quit()
```

No recovery offered; operator must troubleshoot logs or uninstall/reinstall.

### After startup (IPC errors)

**Path:** IPC handler call → error thrown → caught in registrar's handle() wrapper
→ `toIpcError(error)` → `IpcErrorPayload { code, message }` → renderer.

**Mapping table:**

| Error | IPC code | Renderer | UI branch |
| --- | --- | --- | --- |
| `DatabaseError` (DB_CONNECTION, DB_MIGRATION) | `DATABASE_UNAVAILABLE` | `DatabaseUnavailableError` | DatabaseUnavailablePanel (full-screen, no data) |
| `RepositoryError` (query/parse/constraint fail) | `UNEXPECTED_ERROR` | `LoadingError` / `UnexpectedPresentationError` | ErrorState tile (message + retry) |
| `ApplicationError` (domain rule violation) | `OPERATION_FAILED` / specific codes | Mapped kind | Context-specific (not used in bootstrap queries) |
| Non-coded error (network drop, serialization fail) | `UNEXPECTED_ERROR` | `UnexpectedPresentationError` | ErrorState tile |

**Single sub-query failure is isolated:**

If `device.loadDeviceInfo()` fails but `dashboard.loadOverview()` succeeds:
- Device tile: error state
- Dashboard tile: success, renders stats
- Bootstrap phase: `'ready'` (not all failed)
- Page: renders both tiles with their own error/success branches

**Exception masking:**

Every exception from the main process → logs → `IpcErrorPayload { code: 'UNEXPECTED_ERROR', message: 'An unexpected error occurred.' }` — no stack, no internal details cross IPC.

---

## 8. Performance

### Parallel bootstrap

`Promise.allSettled()` runs all five queries concurrently. No task blocks another.
Typical startup: 50–150ms for all five queries on a warm SQLite database (cached
in memory by better-sqlite3).

### Query optimization

**COUNT vs. list:**

Phase 7 dashboard had:
```ts
students.list({ limit: 1000, offset: 0 })  // read 1000 rows to get .total
```

Phase 8 replaces with:
```ts
students.countAll()  // COUNT(*) → integer, no row fetching
classes.countAll()   // COUNT(*) FROM classes
attendance.countByDate(date)  // SELECT status, COUNT(*) GROUP BY status
```

Each is a single prepared statement, no row deserialization.

### Indexes

Migration 002 adds indexes matching query filters:

```sql
CREATE INDEX idx_students_institutionId ON students (institutionId);
CREATE INDEX idx_classes_institutionId ON classes (institutionId);
CREATE INDEX idx_academic_years_isCurrent ON academic_years (isCurrent);
CREATE INDEX idx_attendance_date ON attendance (date);
CREATE INDEX idx_attendance_class_date ON attendance (classId, date);
```

Attendance index `(classId, date)` supports `countByDate` and Phase-9's per-class
attendance queries.

### Statement cache

`StatementCache` in `BaseRepository` prepares every SQL statement once per
repository, parameterizing LIMIT/OFFSET so SQL text stays stable across calls.

---

## 9. Remaining technical debt

**5 business ports still stubbed** (not wired in `createApplicationComposition`):
- `guardians` → `new Proxy({}, { get: () => () => notBuilt('Guardian') })`
- `enrollments` → same
- `assessments` → same
- `grades` → same
- `gradingConfigs` → same

These throw immediately if used; they are Phase-9+ scope.

**Attendance domain limitation** (accepted, not blocking):
- Domain model `Attendance` has no `reconstitute()` method.
- Repository `findByClassAndDate()` rebuilds from SQL rows, losing no data
  (only attendance records are reread, not domain invariants).
- `countByDate()` uses raw SQL GROUP BY, exact and correct.
- Write path (`record()`) has no optimistic-concurrency guard (sync-phase debt).

**Academic-year port has one consumer:**
- `GetCurrentAcademicYearUseCase` queries it for the dashboard.
- No other use case reads academic years yet (enrollments, class roster filtering
  all defer to Phase 9+).
- Port is real; usage is thin.

**RecentActivityFeed / TeachersListSection still static:**
- Components render `<EmptyState>` placeholder copy, no ViewModel backing.
- No business data source yet (no events log, no teacher list queries).
- Honest placeholder, no fabricated data.

---

## 10. Phase-9 readiness

All five bootstrap query tables (students, classes, academic_years, institutions,
users) and the attendance table carry sync columns:

```sql
version INTEGER NOT NULL,
updatedAt TEXT NOT NULL,
lastModifiedBy TEXT,  -- null for local creates; set by sync worker
deviceId TEXT
```

When Phase 9 wires the sync worker:

1. **CRUD paths:** `apps/desktop/electron/data/adapters/createApplicationComposition.ts`
   already registers all six business adapters (students, classes, academics,
   institution, identity, attendance). Write operations (`create()`, `update()`,
   `deactivate()`) flow through the same SQLite repositories.

2. **Sync worker writes:** A future background sync process will call the same
   repository methods (`students.save()`, `attendance.record()`) to persist
   server-sent changes, updating version/updatedAt/lastModifiedBy columns. No
   table rewrites or migrations needed.

3. **Facade growth:** The IPC facade grows by wiring more channels and handlers
   (e.g. `STUDENT_CREATE`, `ATTENDANCE_RECORD`) in the same pattern: application
   service → use case → IPC. The BootstrapService and dashboard page need no
   changes; new CUD operations are separate concerns.

4. **Data availability:** Phase-9 imports and CRUD happen in the same app that
   bootstraps; the local SQLite store is the single source of truth. Offline
   edits accumulate in the sync queue, queued on connection; reconciliation
   uses the `version` column already present in migration 002.
