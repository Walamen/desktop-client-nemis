# Data Access Layer

Phase 3 architecture reference. Spec: `docs/superpowers/specs/2026-07-16-phase-3-data-access-layer-design.md`.

## Data flow

    Renderer
      ↓ window.nemis.* (preload bridge)
    IPC handler          — validates shape/arity, wraps IpcResult
      ↓
    Application Service  — async facade, cross-repo transactions   (data/services)
      ↓
    Repository Interface — sync contract, what mocks implement     (data/repositories/interfaces)
      ↓
    SQLite Repository    — validate → build SQL → prepare → map    (data/repositories/sqlite)
      ↓
    Database platform    — DatabaseManager.connection/.transactions (electron/database)
      ↓
    SQLite

Repositories are the ONLY database gateway. The renderer never knows where
data comes from; the future sync worker calls the same services.

## Why sync repositories, async services

better-sqlite3 is synchronous and its transactions cannot contain `await` —
an async callback breaks atomicity. Repositories therefore expose synchronous
methods that compose inside `TransactionManager` callbacks with real
SAVEPOINT nesting; services expose Promise-returning methods, putting the
async boundary exactly where the process boundary is (IPC, sync worker).

## Folder map (apps/desktop/electron/data/)

| Folder                    | Responsibility                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `repositories/interfaces` | Pure contracts (`IDeviceRepository`, …) — declare only operations that make sense per entity |
| `repositories/base`       | `BaseRepository` (shared machinery), `StatementCache`, `RepositoryContext`                   |
| `repositories/sqlite`     | Concrete implementations, one per entity                                                     |
| `services`                | Async facades; own cross-repository transactions                                             |
| `queries`                 | Query builders — the only place SQL text is produced                                         |
| `mappers`                 | Row → model conversion; JSON columns parsed here and only here                               |
| `models`                  | Domain models (ISO-string timestamps, IPC-serializable)                                      |
| `dto`                     | Input shapes + `QueryOptions`/`Page<T>`                                                      |
| `validators`              | Persistence validation (core rules + per-entity schemas)                                     |
| `factories`               | `createDataLayer` — the composition root, called once from main.ts                           |
| `errors`                  | `RepositoryError` taxonomy + `translateDatabaseError`                                        |
| `testing`                 | `createTestContext` — real temp-file DB with migrations applied                              |
| `repositories/sqlite/business` | Six real business adapters (students, classes, institutions, users, academicYears, attendance) |

## Migrations

**Migration 001 (create-platform-tables):** Infrastructure schema — devices,
app_settings, sync_metadata, sync_queue, audit_log. Applied on every startup,
idempotent. Created in Phase 1.5.

**Migration 002 (create-business-tables):** Business domain schema — 7 tables
housing the dashboard bootstrap data and Phase-9 CRUD/sync writes. Applied once,
schema fixed. Created in Phase 8.

| Table | Columns | Sync columns | Indexes | Purpose |
| --- | --- | --- | --- | --- |
| `institutions` | id, code, name, type, ownership, countyId, districtId, approvalStatus, street, communityTown, latitude, longitude, rejectionReason, profile | version, updatedAt, lastModifiedBy, deviceId | (none) | School profile; one per school instance |
| `users` | id, firstName, middleName, lastName, email, isActive | version, updatedAt, lastModifiedBy, deviceId | (none) | Identity records; seeded with local user row |
| `user_organizations` | id, userId, role, institutionId, countyId, districtId, isActive | (none) | idx_user_organizations_userId | User's role assignments (foreign key to users) |
| `academic_years` | id, institutionId, code, startDate, endDate, isCurrent | version, updatedAt, lastModifiedBy, deviceId | idx_academic_years_institutionId, idx_academic_years_isCurrent | School years; `isCurrent=1` is the active year |
| `classes` | id, institutionId, academicYearId, name, gradeLevel, capacity, isActive | version, updatedAt, lastModifiedBy, deviceId | idx_classes_institutionId, idx_classes_academicYearId | Classrooms |
| `students` | id, institutionId, firstName, middleName, lastName, admissionNumber, dateOfBirth, gender, gradeLevel, isActive | version, updatedAt, lastModifiedBy, deviceId | idx_students_institutionId, idx_students_admission (UNIQUE) | Learners; admission number is school-scoped, unique |
| `attendance` | id, studentId, classId, subjectId, date, status, recordedBy | version, updatedAt, lastModifiedBy, deviceId | idx_attendance_date, idx_attendance_class_date | Daily presence records |

Every business table (except user_organizations, a junction) carries sync
metadata (version, updatedAt, lastModifiedBy, deviceId) from creation. Unused
by Phase 8 logic, these columns enable Phase-9 sync reconciliation without
table rewrites.

## Business adapters (Phase 8)

Six real SQLite repository adapters wired in `createDataLayer.ts`:

- `SqliteStudentRepository` (IStudentRepository) — `findById`, `save`, `exists`, `existsByAdmissionNumber`, `findPage`, `findByClassId` (returns []), `countAll`.
- `SqliteClassRepository` (IClassRepository) — `findById`, `exists`, `countAll` (read-only).
- `SqliteInstitutionRepository` (IInstitutionRepository) — `findById`, `findFirst` (read-only, no save).
- `SqliteUserRepository` (IUserRepository) — `findById`, `findFirst` (read-only).
- `SqliteAcademicYearRepository` (IAcademicYearRepository) — `findCurrent` ONLY.
- `SqliteAttendanceRepository` (IAttendanceRepository) — `save` (upsert), `findByClassAndDate`, `countByDate`.

Each composes a `StatementCache` over `context.connection` directly and implements a pure interface (no
implementation details leak to callers). Repositories are created once in
`createDataLayer` and passed to the `ApplicationLayer` via `createApplicationComposition`.

A helper function `guarded()` is a RUNTIME wrapper that catches driver errors from every SQL statement
and translates them via `wrapSqliteError` into the `DatabaseError` taxonomy (see `.../business/support.ts`).

## DataLayer composition

`createDataLayer(manager, log)` returns:

```ts
interface DataLayer {
  repositories: {
    devices: IDeviceRepository;
    appSettings: IAppSettingsRepository;
    syncMetadata: ISyncMetadataRepository;
    syncQueue: ISyncQueueRepository;
    auditLog: IAuditLogRepository;
    students: IStudentRepository;
    institutions: IInstitutionRepository;
    users: IUserRepository;
    academicYears: IAcademicYearRepository;
    classes: IClassRepository;
    attendance: IAttendanceRepository;
  };
  services: {
    device: DeviceService;
    appSettings: AppSettingsService;
    syncMetadata: SyncMetadataService;
    syncQueue: SyncQueueService;
    auditLog: AuditLogService;
  };
  transactions: TransactionRunner;
}
```

Called once from `main.ts` after `DatabaseManager.initialize()`. Everything
downstream (application layer, IPC handlers) receives only interfaces, never
concrete classes. Platform services (device, appSettings, sync*) are stateless
facades over platform repositories; business repositories are pure — no
service wrappers (services live in the application layer).

## Local user seeding

`initializeLocalUser(db)` runs on every app startup. If no rows exist in the
`users` table, it inserts a synthetic row with:

- `id`: UUID generated fresh
- `firstName`: "Local"
- `lastName`: "Admin"
- `email`: "admin@local.nemis"
- `role`: INSTITUTION_ADMIN
- `isActive`: 1

If rows exist, it returns the first found. This guarantees the identity queries
(GetCurrentUserUseCase) never throw "no user found" on a fresh install; the
dashboard renders with a greeting and the app stays functional.

## Strategies

- **Mapping:** raw rows never leave `repositories/sqlite`. Mappers are pure;
  JSON TEXT columns (`app_settings.value`, `sync_queue.payload`,
  `audit_log.details`) are parsed/serialized exactly there.
- **Validation:** persistence-level only, before any SQL; failures throw
  `ValidationError` with per-field issues. No business or UI rules.
- **Transactions:** callback-scoped via `TransactionManager`; nested calls
  become SAVEPOINTs; batch writes use IMMEDIATE mode; rollback is automatic
  on throw. Services orchestrate cross-repo transactions (see
  `AppSettingsService.set`, `SyncQueueService.fail`). `ISyncQueueRepository`'s
  `claimBatch` does an atomic select+mark under one IMMEDIATE transaction —
  the sync-worker claim API; the race-safety argument (why no competitor can
  read-then-claim between the find and the mark) lives in its doc comment.
  Bulk updates go through `BaseRepository.updateByIds`, which chunks the id
  list below SQLite's sub-999 parameter ceiling automatically and runs every
  chunk inside one transaction — repositories never encode that ceiling
  themselves.
- **Errors:** repositories translate everything into the `RepositoryError`
  taxonomy (`REPO_NOT_FOUND`, `REPO_DUPLICATE`, `REPO_VALIDATION`,
  `REPO_TRANSACTION`, `REPO_QUERY`, `REPO_UNKNOWN`); raw driver errors stay
  on `cause` and never cross IPC. At the IPC boundary,
  `electron/ipc/errorMapping.ts` maps that taxonomy (plus `DatabaseError` and
  `ApplicationError`) onto the closed `IpcErrorCode` contract —
  `VALIDATION_FAILED` carries per-field `issues`. Renderer settings access is
  additionally gated by `electron/security/settingsAllowlist.ts`: a setting
  is never renderer-readable merely because it exists in the database, only
  because its key is listed there.
- **Performance:** every statement is prepared once per repository via
  `StatementCache` (LIMIT/OFFSET are parameterized so SQL text stays stable);
  batch operations run in a single transaction.

## Adding a new entity (extension checklist)

1. Migration for the table (`database/migrations/`), name in `TableNames`.
2. Model in `data/models/`, input DTOs in `data/dto/`.
3. Row interface + mapper in `data/mappers/`.
4. Validators in `data/validators/`.
5. Interface in `repositories/interfaces/` — only the operations the entity
   really supports (e.g. audit log exposes no update/delete).
6. SQLite repository in `repositories/sqlite/` extending `BaseRepository`.
7. Service in `data/services/` if IPC/sync needs it.
8. Wire both in `factories/createDataLayer.ts`.
9. Tests: repository against `createTestContext()`, service against interface
   mocks.
10. IPC (if exposed): `IpcContract` entry + `IpcChannels` constant, shape
    validator in `security/validateIpc.ts`, handler, preload method — the
    exhaustiveness assertion in `packages/types/src/ipc.ts` will not compile
    until the channel is listed.

## Deliberate limits (revisit when needed)

- No JOINs in the query builder — platform tables don't need them.
- No UPSERT in the builder — `setByKey` uses a transactional read-then-write.
- `sync_errors` is owned by `SyncQueueRepository` (queue aggregate).
- SQLCipher encryption is enabled (Phase 3.5) below this layer — see
  `docs/database.md`'s Encryption section; the data access layer itself is
  unchanged and unaware of it.
- `BaseRepository` binds its `StatementCache` to the connection captured at
  construction. The `DataLayer` must be recreated after any
  `DatabaseManager.shutdown()` → `initialize()` cycle (e.g. a future
  backup-restore flow) — stale repositories would hold prepared statements
  on a closed connection.
- Concrete `Sqlite*Repository` classes expose `BaseRepository`'s full public
  surface; the per-entity interfaces (`I*Repository`) are the binding
  contract — always type against the interface.
