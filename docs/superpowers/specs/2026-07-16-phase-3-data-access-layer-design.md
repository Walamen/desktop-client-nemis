# Phase 3 Design: Data Access Layer

**Date:** 2026-07-16
**Status:** Approved
**Branch:** `phase-3-data-access-layer` (off `main`, tip `0ddb094`)

## Goal

Build the single gateway for all data access in the NEMIS desktop client: a layered
Data Access Layer (DAL) between the application and SQLite. After this phase, no
application code communicates with SQLite directly — repositories are the only
database gateway, and every future feature (including synchronization) reuses this
layer.

**In scope:** repositories for the six Phase 2 platform tables, BaseRepository,
query builder, mappers, validators, repository error taxonomy, thin application
services, one proof-of-path IPC endpoint, tests, documentation.

**Out of scope:** synchronization logic, REST/API communication, authentication,
business entities (students/teachers/attendance/assessments), UI features,
business logic, JOIN support in the query builder, SQLCipher.

## Decisions (settled during brainstorming)

1. **IPC scope:** the DAL is built fully in the main process, plus **one**
   parameterized proof-of-path endpoint (`settings:get`) wired end-to-end.
   No renderer UI changes.
2. **Sync repositories, async services:** repository interfaces are synchronous
   (better-sqlite3 is synchronous and its transactions cannot contain `await`);
   application services expose async methods. The async boundary sits exactly at
   the process boundary (IPC, future sync worker).
3. **Zero new dependencies:** hand-rolled query builder and validators. No
   Kysely/Zod — keeps the offline platform dependency-light, auditable, and avoids
   new native-packaging concerns.

## Architecture

```
Renderer
  ↓ window.nemis.* (preload bridge)
IPC handler (validates shape, wraps IpcResult)
  ↓
Application Service   (async facade, orchestration, cross-repo transactions)
  ↓
Repository Interface  (sync contract; what mocks implement)
  ↓
SQLite Repository     (validation → QueryBuilder → prepared statement → mapper)
  ↓
Database Layer        (Phase 2: DatabaseManager.connection + .transactions)
  ↓
SQLite
```

The DAL lives in `apps/desktop/electron/data/`, a sibling of the Phase 2
`database/` directory:

- `database/` (unchanged) — the *platform*: connection lifecycle, pragmas,
  migrations, TransactionManager, backup.
- `data/` (new) — the *gateway*: repositories, services, mappers, queries,
  validators. Consumes only `DatabaseManager.connection` + `.transactions`;
  never constructs a `Database` or opens a connection (frozen Phase 2 convention).

## Folder structure

```
electron/data/
  repositories/
    interfaces/    IDeviceRepository, IAppSettingsRepository, ISyncMetadataRepository,
                   ISyncQueueRepository, IAuditLogRepository (pure types)
    base/          BaseRepository + StatementCache
    sqlite/        SqliteDeviceRepository, SqliteAppSettingsRepository, ...
  services/        DeviceService, AppSettingsService, SyncMetadataService,
                   SyncQueueService, AuditLogService (async facades)
  mappers/         row ↔ domain-model mappers (pure, one per entity)
  queries/         QueryBuilder: select / insert / update / delete / count
  models/          Device, AppSetting, SyncMetadata, SyncQueueItem, SyncError,
                   AuditLogEntry
  dto/             CreateX/UpdateX inputs, QueryOptions (filter/sort/page), Page<T>
  validators/      validation core (rules + createValidator) + per-entity validators
  factories/       createDataLayer(manager, log) — wires repos + services; called
                   once from main.ts
  errors/          RepositoryError taxonomy
```

## Repositories

Five repositories cover the six platform tables. Each has: interface, SQLite
implementation, mapper, validator. **Interfaces declare only the operations that
make sense for that entity** — the interface is the contract; BaseRepository is
shared machinery behind it.

| Repository | Surface |
|---|---|
| `DeviceRepository` | `findById`, `findAll`, `create`, `update`, `exists`, `count` |
| `AppSettingsRepository` | `getByKey`, `setByKey` (upsert), `getAll`, `deleteByKey` |
| `SyncMetadataRepository` | `get()`, `update()` only — singleton row, seeded by the platform; no create/delete |
| `SyncQueueRepository` | `enqueue`, `nextBatch(limit)` (oldest pending first, uses `idx_sync_queue_status_createdAt`), `markInFlight`, `markCompleted`, `markFailed` (increments `retryCount`), `countByStatus`, `purgeCompleted(olderThan)`; **also owns `sync_errors`**: `recordError`, `errorsForOperation` |
| `AuditLogRepository` | `append`, `findByCategory`, `findInRange`, `count`, `prune(olderThan)` — append-only; no update/delete exposed |

`sync_errors` belongs to the queue aggregate (errors only exist in the context of
a queue operation); a dedicated repository can be split out in the sync phase if
needed.

**Not implemented (future phases):** StudentRepository, TeacherRepository,
AttendanceRepository, AssessmentRepository.

### BaseRepository

Generic abstract class `BaseRepository<TRow, TModel, TCreateInput, TUpdateInput>`
parameterized by table name, mapper, and validator. Provides: `findById`,
`findAll(options)`, `create`, `createMany`, `update`, `delete`, `exists`, `count`,
`executeTransaction(work)`. Concrete repositories extend it and add
entity-specific methods; entity-specific SQL goes through the QueryBuilder, never
inline strings. A per-repository **StatementCache** (keyed by SQL text) reuses
prepared statements for hot paths.

## Query builder (`data/queries/`)

Fluent builders producing `{ sql, params }`:

- `SELECT`: column list, `WHERE` with `and`/`or` of
  `eq/neq/gt/gte/lt/lte/like/inList/isNull`, multi-column `ORDER BY`,
  `LIMIT`/`OFFSET`.
- `INSERT`, `UPDATE … SET … WHERE`, `DELETE … WHERE`, `COUNT`.

Safety invariants:

- Values are **always parameterized** — never interpolated into SQL text.
- Identifiers (table/column names) are validated against schema constants —
  no identifier injection.

**Non-goal:** JOINs. Platform tables don't need them; the builder gains joins when
a future phase's entities do.

## Models, DTOs, mappers

- Domain models keep timestamps as **ISO-8601 strings** (project convention;
  IPC-serializable as-is — no `Date` objects).
- Mappers are pure per-entity objects (`toModel(row)`, `toRow(model)`) and own the
  JSON columns: `app_settings.value`, `sync_queue.payload`, `audit_log.details`
  are parsed/serialized exactly there. Raw rows never escape the SQLite
  repository implementations.
- DTOs separate input shapes (`CreateDeviceInput`, `UpdateDeviceInput`,
  pagination/filter options, `Page<T>` results) from stored models.
- IDs and timestamps are generated inside repositories (reusing `newId()` /
  `nowIso()` from the database layer), never accepted from callers.

## Validation (`data/validators/`)

Persistence validation only — no UI rules, no business rules.

- Composable rules: `required`, `isString`, `maxLength`, `oneOf`, `isIsoDate`,
  `isNonNegativeInt`, `isJsonSerializable`.
- `createValidator<T>(schema)` returns a validate function producing
  `{ field, message }` issues.
- Repositories validate DTOs **before** any SQL; failures throw
  `ValidationError` carrying the issues.

## Errors (`data/errors/`)

New repository taxonomy, parallel to (not extending) the Phase 2 `DatabaseError`
family:

- `RepositoryError` (base, with `code`)
  - `EntityNotFoundError` (`REPO_NOT_FOUND`)
  - `DuplicateEntityError` (`REPO_DUPLICATE`)
  - `ValidationError` (`REPO_VALIDATION`)
  - `TransactionFailureError` (`REPO_TRANSACTION`)

Translation at the repository boundary: `ConstraintError` (unique) →
`DuplicateEntityError`; missing row on `update`/`findByIdOrThrow` →
`EntityNotFoundError`; everything else wraps into `RepositoryError` with the
original on `cause`. Raw driver errors and `DatabaseError`s never leave the
repository layer.

## Transactions

- Services orchestrate cross-repository work through
  `TransactionManager.run(() => …)` — synchronous repository calls compose inside
  with real atomicity.
- Phase 2's SAVEPOINT nesting means repositories using `executeTransaction`
  internally still compose when called inside a service transaction.
- Batch operations (`createMany`, `markCompleted(ids)`) run in `runImmediate`
  transactions.
- Rollback is automatic on throw (Phase 2 guarantee).

## Services and proof-of-path IPC

Application services are thin async facades over repositories — the surface IPC
and the future sync worker will call. One service demonstrates a cross-repo
transaction: `AppSettingsService.set()` writes the setting and an audit entry
atomically.

One parameterized IPC endpoint proves the whole pipeline — `settings:get`:

1. `IpcContract` entry (`packages/types/src/ipc.ts`).
2. Shape-validating validator for the argument.
3. Registrar entry with arity comment + `IpcChannels` exhaustiveness assertion
   (Phase 1.5 checklist).
4. Preload bridge: `window.nemis.settings.get(key)`.
5. Handler → `AppSettingsService.get(key)`.

Also closes the flagged Phase 2 debt item before DB data crosses IPC: wrap
`MigrationService`'s pre-apply prepares and `initializeMetadata`'s prepares into
the error taxonomy (currently raw driver errors could escape unwrapped).

## Logging

Repositories and services accept the existing `DatabaseLogger` interface.
Log: validation failures (warn), transaction failures (error), unexpected errors
(error), service operations (info, sparingly). No excessive logging.

## Testing

Vitest, reusing `createTestDatabase()` (temp-file DB, WAL like production):

- **QueryBuilder unit tests** — exact SQL + params assertions; identifier
  injection attempts rejected.
- **Validator and mapper unit tests** — pure functions.
- **Per-repository integration tests** against real temp SQLite: CRUD,
  pagination/sorting/filtering, batch ops, error translation (duplicate key →
  `DuplicateEntityError`, missing row → `EntityNotFoundError`), transaction
  rollback, SAVEPOINT nesting.
- **Service tests** with hand-built mocks of repository interfaces (no DB).
- **IPC handler test** for `settings:get` — validator rejects bad shapes; result
  envelope correct.

## Documentation

New `docs/data-access.md`: repository pattern explanation, folder structure, data
flow diagram, mapper strategy, validation strategy, transaction strategy, and an
"adding a new entity" extension checklist (interface → model → DTO → mapper →
validator → sqlite repo → factory → tests).

## Acceptance criteria

- Renderer never accesses SQLite directly; repositories are the only gateway.
- BaseRepository reusable; QueryBuilder, mappers, validators implemented.
- Transactions supported (single, nested via SAVEPOINT, automatic rollback,
  batch).
- All tests pass (`pnpm rebuild:node && pnpm test`).
- TypeScript strict passes, ESLint passes, production build succeeds
  (`pnpm make` after `pnpm rebuild:electron`).

## Known deferrals / flags

- **SQLCipher:** not introduced. Decide before business data lands in SQLite —
  encrypting an empty platform is far cheaper than migrating populated tables.
- **Electron pin:** revisit the 42.7.0 (ABI 146) pin early in the phase — check
  whether better-sqlite3 has shipped electron-v148 prebuilds.
- **JOINs, StudentRepository etc.:** future feature phases.
- **BackupService/DatabaseHealthService wiring:** still not composed into
  DatabaseManager; unchanged this phase unless a task needs them.
