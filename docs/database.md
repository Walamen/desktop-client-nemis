# NEMIS Desktop — Local Data Platform

SQLite is the local working database only. PostgreSQL remains the national
authoritative database; nothing here is a source of truth.

> Phase 3 added the Data Access Layer on top of this platform — see
> `docs/data-access.md`. Application code must go through repositories;
> only the data layer touches `DatabaseManager.connection` directly.

## Architecture

    main.ts
      └── DatabaseManager            lifecycle orchestrator (sole entry point)
            ├── Database             one better-sqlite3 connection: open/validate/pragmas/close
            ├── MigrationService     versioned, transactional migrations + history
            ├── initializeMetadata   idempotent seed: device row, sync singleton, defaults
            └── TransactionManager   callback-scoped transactions (savepoint nesting)

    BackupService and DatabaseHealthService are standalone infrastructure —
    built, tested, and constructor-injectable, but not yet composed into
    DatabaseManager (nothing in this phase calls them). Phase 3, when backup
    scheduling or a health-check surface is wired up, is expected to either
    add them as DatabaseManager members or keep them separately instantiated
    call sites; this repo does not yet decide which.

Everything under `apps/desktop/electron/database/` is main-process only and
never crosses the IPC bridge in this phase. Services receive the raw
connection by constructor injection, so every module is testable against a
temp-file database without Electron.

## Lifecycle

Startup: open → quick_check validation → pragmas (incl. foreign_keys ON) →
migrations → metadata seed → audit `database.started` → ready.
Shutdown (`will-quit`): audit `database.stopped` → `wal_checkpoint(TRUNCATE)` →
`PRAGMA optimize` → close. Both idempotent; a failed startup closes any
partially opened connection (no leaks) and quits with a user-facing dialog.
better-sqlite3 is synchronous, so no transaction can be pending across ticks
at shutdown time.

## File locations

- Database: `<userData>/database/nemis.db` (+ `-wal`, `-shm` siblings)
- Backups: `<userData>/database/backups/nemis-<UTC-timestamp-with-ms>[-label].db`

## PRAGMAs (see constants/pragmas.ts for full rationale)

| PRAGMA             | Value           | Why                                                     |
| ------------------ | --------------- | ------------------------------------------------------- |
| journal_mode       | WAL             | non-blocking reads, crash safety, online backup         |
| synchronous        | NORMAL          | safe with WAL; FULL doubles fsync for no integrity gain |
| foreign_keys       | ON              | per-connection; enforced and verified at open           |
| busy_timeout       | 5000 ms         | wait, don't fail, on rare cross-process contention      |
| cache_size         | -64000 (64 MiB) | desktop RAM is cheap; largest query-speed lever         |
| temp_store         | MEMORY          | temp b-trees in RAM                                     |
| wal_autocheckpoint | 1000 pages      | default, made explicit                                  |
| journal_size_limit | 64 MiB          | caps WAL growth after large transactions                |

## Migrations

- TypeScript modules in `database/migrations/`, registered ascending in
  `registry.ts`. Append only — never edit or reorder a shipped migration.
- Each migration = one transaction: DDL + `schema_migrations` history row +
  `PRAGMA user_version` bump commit or roll back together.
- Startup validation rejects: non-ascending/duplicate versions, and drift
  (an applied migration missing/renamed in the registry).
- `down()` is optional; `rollbackLast()` refuses migrations without it.
  Rollback is an operator/dev tool, not an auto-recovery path.

### Adding a migration (recipe)

1. Create `NNN-descriptive-name.ts` exporting a `Migration` (next integer version).
2. Append it to `migrations/registry.ts`.
3. Add a colocated test asserting the new schema (see `001-*.test.ts`).
4. Table standards: TEXT UUID PK, `createdAt`/`updatedAt` ISO-8601 UTC TEXT;
   `deletedAt`/`version` columns on future synchronized entities; document
   every index with a comment; never auto-increment IDs.

## Platform tables (migration 001)

`devices` (this installation's identity), `app_settings` (key/value, JSON
values), `sync_metadata` (singleton row: lastSyncAt, schemaVersion,
databaseVersion, syncStatus), `sync_queue` (future offline-first outbox),
`sync_errors` (failed operations, FK → sync_queue ON DELETE SET NULL),
`audit_log` (application/database/sync/security events),
`schema_migrations` (migration history). Business tables (students, teachers,
…) arrive in later phases with the sync layer.

## Transactions

`TransactionManager.run/runImmediate/runExclusive(work)` — callback-scoped by
design: explicit begin/commit/rollback handles are not exposed, so a leaked
open transaction is unrepresentable. Nested calls become SAVEPOINTs
automatically. Errors thrown by `work` propagate unchanged after rollback
(including native SQLite errors); only transaction-machinery failures are
wrapped as `DatabaseError` taxonomy.

## Errors

`DatabaseError` (base, with `code`) → `ConnectionError`, `MigrationError`,
`TransactionError`, `ConstraintError`, `IntegrityError`, `BackupError`.
Raw SQLite errors never leave the layer: `wrapSqliteError` maps result codes
and keeps the original on `cause`. Nothing database-shaped crosses IPC yet.

## Backup & restore

Online backup via SQLite's backup API (safe while the app runs), validated
with `quick_check` before being reported (invalid output is deleted).
`createBackup` refuses to overwrite an existing target (throws `BackupError`).
Restore contract: close the connection first —
`DatabaseManager.shutdown()` → `restoreBackup(source, target)` →
`initialize()`; restore copies then renames, and removes stale `-wal`/`-shm`.
Scheduling, retention, and UI are future phases.

**Trust gap:** nothing in this phase triggers a backup or restore — the
whole surface is unit-tested against temp-file databases only, never
exercised in the packaged app. The restore path in particular renames over
a live file and removes journal siblings, which is exactly the kind of
Windows-file-locking-sensitive operation Task 15 showed this codebase can
get wrong silently (the packaged native-module gap wasn't caught by any
unit test). Give backup/restore an integration or packaged-app smoke test
before treating it as field-ready.

## Testing

- `pnpm test` (Vitest, colocated `*.test.ts`, relative imports inside the
  database layer).
- `testing/createTestDatabase.ts` gives every test an isolated temp-file DB.
- ABI note: the repo pins Electron 42.7.0 (ABI 146) because better-sqlite3
  12.11.1 publishes no ABI-148 (Electron 43) prebuilds yet — revert when
  upstream ships them. Electron Forge's automatic native rebuild fails
  silently on machines without a C++ toolchain. After any fresh `pnpm install`,
  run `pnpm rebuild:electron` before `pnpm start`/`pnpm make`, and
  `pnpm rebuild:node` before `pnpm test` (the test factory detects the ABI
  mismatch and prints this instruction).
  **The Electron version is duplicated** in `apps/desktop/package.json`
  (`electron` dependency) and root `package.json` (`rebuild:electron`'s
  `--target=`) — package.json has no comments, so bumping one without the
  other is a silent drift trap; grep both when changing the pin.

## Encryption (Phase 3.5)

The database is SQLCipher-encrypted (SQLCipher-4 compatible scheme) via
`better-sqlite3-multiple-ciphers`, installed as a pnpm alias under the
`better-sqlite3` name — imports, types, rebuild scripts, and packaging are
unchanged. `Database.open` applies `cipher='sqlcipher'` + `hexkey` before any
other pragma; a wrong or missing key fails `quick_check` and surfaces as
`IntegrityError`/`ConnectionError`.

**Key management:** a per-installation random 256-bit key, wrapped by
Electron `safeStorage` (Windows DPAPI, per-OS-user) and stored as
`<userData>/nemis-db-key.bin` (`electron/security/databaseKey.ts`). If
safeStorage is unavailable startup fails hard — there is no plaintext
fallback. Losing the OS user profile (or the key file) makes the local
database unrecoverable BY DESIGN; the authoritative data lives in PostgreSQL
and is re-synced.

**Migration:** a pre-3.5 plaintext database is encrypted in place on first
keyed open (`hexrekey`, with a temporary `journal_mode=DELETE` because rekey
needs a rollback journal); the event is audit-logged as `database.encrypted`.

**Overhead:** SQLCipher-scheme page encryption costs roughly 5–15% on I/O —
accepted (Decision Framework: data integrity and security outrank
performance).

**Tests** run keyless (unencrypted) by design; encryption behavior is covered
by `Database.encryption.test.ts` and the packaged smoke test.

## Future extension (Phase 3+)

- Repositories consume `DatabaseManager.connection` + `.transactions`; they
  must not construct connections.
- The sync engine builds on `sync_queue`/`sync_errors`/`sync_metadata` as-is.
