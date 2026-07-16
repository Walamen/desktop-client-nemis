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

## Strategies

- **Mapping:** raw rows never leave `repositories/sqlite`. Mappers are pure;
  JSON TEXT columns (`app_settings.value`, `sync_queue.payload`,
  `audit_log.details`) are parsed/serialized exactly there.
- **Validation:** persistence-level only, before any SQL; failures throw
  `ValidationError` with per-field issues. No business or UI rules.
- **Transactions:** callback-scoped via `TransactionManager`; nested calls
  become SAVEPOINTs; batch writes use IMMEDIATE mode; rollback is automatic
  on throw. Services orchestrate cross-repo transactions (see
  `AppSettingsService.set`, `SyncQueueService.fail`).
- **Errors:** repositories translate everything into the `RepositoryError`
  taxonomy (`REPO_NOT_FOUND`, `REPO_DUPLICATE`, `REPO_VALIDATION`,
  `REPO_TRANSACTION`, `REPO_QUERY`, `REPO_UNKNOWN`); raw driver errors stay
  on `cause` and never cross IPC.
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
- SQLCipher not yet enabled — decide before business data lands.
- `BaseRepository` binds its `StatementCache` to the connection captured at
  construction. The `DataLayer` must be recreated after any
  `DatabaseManager.shutdown()` → `initialize()` cycle (e.g. a future
  backup-restore flow) — stale repositories would hold prepared statements
  on a closed connection.
- Concrete `Sqlite*Repository` classes expose `BaseRepository`'s full public
  surface; the per-entity interfaces (`I*Repository`) are the binding
  contract — always type against the interface.
