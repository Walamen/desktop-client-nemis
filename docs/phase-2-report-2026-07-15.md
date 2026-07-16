# Phase 2 — Local Data Platform Report

Branch: `phase-2-local-data-platform` (from `phase-1-foundation`). Executed via superpowers:subagent-driven-development — 15 tasks, each with an implementer + task reviewer pass, plus this final verification task. All 15 tasks landed with a clean review (several after one fix-and-re-review cycle); see the debt register (§10) for what those cycles found.

---

## 1. Final folder structure

```
apps/desktop/electron/database/
    Database.ts                     # connection wrapper: open/validate/pragmas/close
    Database.test.ts
    DatabaseManager.ts               # lifecycle orchestrator (sole entry point for main.ts)
    DatabaseManager.test.ts
    constants/
        pragmas.ts                   # every PRAGMA + rationale
        paths.ts                     # resolveDatabasePaths(userDataDir)
        paths.test.ts
        version.ts                   # DATABASE_VERSION
    errors/
        errors.ts                    # DatabaseError taxonomy
        wrapSqliteError.ts           # SQLite code -> taxonomy mapping
        wrapSqliteError.test.ts
    helpers/
        ids.ts                       # newId()
        time.ts                      # nowIso()
    migrations/
        types.ts                     # Migration interface
        registry.ts                  # ordered migration list
        001-create-platform-tables.ts
        001-create-platform-tables.test.ts
    schema/
        tableNames.ts                # canonical table-name constants
    seed/
        initializeMetadata.ts        # device row, sync_metadata singleton, default settings
        initializeMetadata.test.ts
    services/
        MigrationService.ts
        MigrationService.test.ts
        DatabaseHealthService.ts
        DatabaseHealthService.test.ts
    transaction/
        TransactionManager.ts
        TransactionManager.test.ts
    backup/
        backupFileName.ts
        backupFileName.test.ts
        BackupService.ts
        BackupService.test.ts
    testing/
        createTestDatabase.ts         # temp-file DB factory + ABI-mismatch explainer

apps/desktop/electron/main/main.ts    # wires DatabaseManager into app lifecycle
apps/desktop/forge.config.ts          # packageAfterCopy hook for the native module
docs/database.md                      # architecture reference (this report summarizes it)
```

49 tests across 11 files land under `database/` (out of 77 total in the workspace — the other 28 pre-date Phase 2).

## 2. Architecture

```
main.ts
  └── DatabaseManager            lifecycle orchestrator (sole entry point)
        ├── Database             one better-sqlite3 connection: open/validate/pragmas/close
        ├── MigrationService     versioned, transactional migrations + history
        ├── initializeMetadata   idempotent seed: device row, sync singleton, defaults
        └── TransactionManager   callback-scoped transactions (savepoint nesting)

BackupService and DatabaseHealthService are standalone infrastructure — built,
tested, constructor-injectable — but NOT composed into DatabaseManager; nothing
in this phase calls them. This was caught by the final whole-branch review:
earlier drafts of this diagram (and of docs/database.md) showed them as
DatabaseManager children, which the shipped code does not do. Phase 3 needs to
decide whether they become DatabaseManager members or stay separately
instantiated.
```

Everything under `electron/database/` is main-process only; nothing crosses the IPC bridge this phase (per the DO NOT list). Services receive the raw connection by constructor injection, so every module is unit-testable against a temp-file database without Electron.

**Startup:** open → quick_check validation → pragmas (foreign_keys ON, verified) → migrations → metadata seed → audit `database.started` → ready. A failed startup closes any partially-opened connection (exception-safe, see Task 10 fix) and the app shows a failure-aware dialog before quitting.

**Shutdown (`will-quit`):** audit `database.stopped` → `wal_checkpoint(TRUNCATE)` → `PRAGMA optimize` → close. Verified live in both dev and packaged builds (§8).

## 3. Every SQLite PRAGMA used

| PRAGMA             | Value                                      | Why                                                                    |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------------- |
| journal_mode       | WAL                                        | non-blocking reads, crash safety, enables online backup                |
| synchronous        | NORMAL                                     | safe with WAL; FULL doubles fsync cost for no integrity gain here      |
| foreign_keys       | ON                                         | off by default per-connection in SQLite; enforced and verified at open |
| busy_timeout       | 5000 ms                                    | waits instead of failing instantly on rare cross-process contention    |
| cache_size         | -64000 (64 MiB)                            | desktop RAM is cheap; largest single query-speed lever                 |
| temp_store         | MEMORY                                     | temp b-trees (ORDER BY/GROUP BY spills) stay in RAM                    |
| wal_autocheckpoint | 1000 pages                                 | default made explicit                                                  |
| journal_size_limit | 64 MiB                                     | caps WAL growth after large transactions                               |
| quick_check        | (run at open)                              | cheap corruption check; `IntegrityError` on failure                    |
| integrity_check    | (DatabaseHealthService.fullIntegrityCheck) | thorough check for support tooling                                     |
| foreign_key_check  | (DatabaseHealthService.check)              | counts live FK violations                                              |
| user_version       | (MigrationService)                         | stores the current schema version                                      |

## 4. Every table created (migration 001)

`schema_migrations` (version PK, name, appliedAt, durationMs — created by MigrationService itself), `devices`, `app_settings`, `sync_metadata`, `sync_queue`, `sync_errors`, `audit_log`. All business tables (students, teachers, attendance, …) were explicitly excluded per the DO NOT list.

Standards: TEXT UUID primary keys, ISO-8601 UTC TEXT timestamps. One documented deviation: `sync_metadata.id` is a fixed `'singleton'` value with a CHECK constraint — it's a single-row, never-synchronized table by design.

## 5. Every index created

| Index                            | Table        | Why                                             |
| -------------------------------- | ------------ | ----------------------------------------------- |
| idx_app_settings_key             | app_settings | UNIQUE — settings addressed by key              |
| idx_sync_queue_status_createdAt  | sync_queue   | future sync worker polls "oldest pending first" |
| idx_sync_queue_entity            | sync_queue   | lookup/dedup by (entityType, entityId)          |
| idx_sync_errors_operationId      | sync_errors  | join errors to their queue operation            |
| idx_sync_errors_createdAt        | sync_errors  | time-ordered error triage                       |
| idx_audit_log_category_createdAt | audit_log    | audit queries filter by category, newest first  |

`sync_errors.operationId` carries `REFERENCES sync_queue(id) ON DELETE SET NULL` — verified live (Task 7 review) that FK enforcement is real, not a no-op, because `Database.open()` sets and confirms `foreign_keys = ON`.

## 6. Migration strategy

TypeScript modules registered ascending in `migrations/registry.ts`. Each migration is one transaction: DDL + `schema_migrations` history row + `PRAGMA user_version` bump commit or roll back together — a failure leaves the database exactly at the previous version (verified: Task 6 test asserts a table created mid-migration is gone after a forced failure). Startup validates the registry (strictly ascending, unique, positive-integer versions) and detects drift (an applied migration missing or renamed in the registry) before applying anything.

`rollbackLast()` is an operator/dev tool, not an auto-recovery path — it refuses migrations without a `down()`.

## 7. Transaction strategy

`TransactionManager.run/runImmediate/runExclusive(work)` are callback-scoped by design: no `begin()/commit()/rollback()` handles are exposed, so a leaked open transaction is unrepresentable. Nested calls become SAVEPOINTs automatically (native better-sqlite3 semantics, verified with a real nested-rollback test).

Task 8's review caught a genuine bug in the original design: the `inWork` boolean meant to distinguish "the callback threw" from "the transaction machinery threw" was reset in a `finally` block before the exception ever reached the outer `catch` — dead logic. A native SQLite error thrown by application code (e.g. a duplicate-key insert) would have been silently rewrapped into a different error type instead of propagating unchanged, breaking any caller that pattern-matches on the original error. Fixed by capturing the thrown error's identity inside the callback and comparing by reference in the catch block; a regression test (duplicate-PK insert inside `run()`) pins the correct behavior.

## 8. Verification evidence

**Full gate** (`pnpm rebuild:node && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm --filter @nemis-desktop/app build:renderer`): all green. 15 test files, 77 tests passing. Renderer build succeeds (Next.js static export, 103 kB first load).

**Packaged-app proof** (`pnpm rebuild:electron && pnpm make`, then launching the packaged exe): this surfaced a real gap — `@electron-forge/plugin-vite` packages only the bundled `.vite` output and never copies `node_modules` into the app, so the externalized `require('better-sqlite3')` in the packaged `main.js` could not resolve. Every packaged launch crashed before a window ever appeared. Fixed with a `packageAfterCopy` hook in `forge.config.ts` that copies `better-sqlite3` and its two runtime dependencies (`bindings`, `file-uri-to-path`) into the packaged app, resolving pnpm's symlinks first. A second issue followed: once the module was present, Forge's automatic native-module rebuild engaged and failed hard (`node-gyp`, no Python on this machine) — fixed by setting `rebuildConfig: { onlyModules: [] }`, since the workflow already installs the correct Electron-ABI prebuilt via `pnpm rebuild:electron` before packaging.

After both fixes, the packaged proof passed cleanly:

- `resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node` present (auto-unpack-natives working as intended).
- Launched exe, graceful close via `taskkill /IM nemis-desktop.exe` (no `/F`) after ~20s.
- `%APPDATA%\NEMIS Desktop\logs\main.log`:
  ```
  [info]  NEMIS Desktop starting (dev=false)
  [info]  Opening database: ...\NEMIS Desktop\database\nemis.db
  [info]  Database ready
  [warn]  Denied permission check: media / web-app-installation / geolocation   (expected — Phase 1 hardening)
  [info]  Closing database
  ```
- `database/` directory after clean exit: `nemis.db` only (90112 bytes) — no leftover `-wal`/`-shm`, confirming the WAL checkpoint on close.
- `pnpm make` also produced installable Squirrel artifacts (`nemis-desktop-setup.exe`, `RELEASES`, `.nupkg`).

A third, unrelated gap surfaced during this verification pass: the committed code in 5 files (4 database-layer files + the plan doc) had drifted from the repo's Prettier formatting rules — `pnpm format:check` failed. Fixed with `pnpm format` (whitespace/line-wrapping only, no logic changes) and committed separately.

## 9. Backup strategy

Online backups via SQLite's backup API (safe while the app is running). Filenames use millisecond-precision UTC timestamps (`nemis-<timestamp>[-label].db`) after a review finding that second-precision stamps could collide and silently overwrite an earlier backup; `createBackup` also now refuses to overwrite an existing target file outright. Every backup is `quick_check`-validated before being reported; invalid output is deleted. Restore contract: the main connection must be closed first (`DatabaseManager.shutdown()` → `restoreBackup()` → `initialize()`); restore copies to a temp file then renames, and removes stale `-wal`/`-shm` siblings. Scheduling, retention policy, and UI are explicitly out of scope for this phase.

## 10. Remaining technical debt

**Environment / build:**

- **Electron pinned to 42.7.0 (ABI 146)**, not the originally planned 43.1.0, because better-sqlite3 12.11.1 publishes no ABI-148 prebuilds yet and this environment has no C++ toolchain to compile from source. Revert to 43.x once upstream ships electron-v148 prebuilds (or once a toolchain is available everywhere this repo is built).
- **The Electron version is duplicated** in `apps/desktop/package.json` (the `electron` dependency) and root `package.json` (`rebuild:electron`'s `--target=`) — found in the final whole-branch review. package.json has no comments to couple them, so bumping one without the other silently rebuilds the wrong ABI. Grep both when changing the pin; consider deriving the target programmatically in Phase 3.
- Electron Forge's automatic native-module rebuild fails silently/hard without a C++ toolchain; the workflow now depends on `pnpm rebuild:node` (test/dev, Node ABI) and `pnpm rebuild:electron` (packaging, Electron ABI) being run explicitly at the right points — there is no automated guard against forgetting this.
- No CI is wired up yet to run the gate automatically.

**Database layer (all Minor, recorded per-task, none blocking):**

- `wrapSqliteError` branches for `SQLITE_LOCKED`/`SQLITE_CANTOPEN`/`SQLITE_MISMATCH` and the generic `SQLITE_`-unknown fallback are untested (plan-inherited test gap).
- `cache_size`/`wal_autocheckpoint`/`journal_size_limit` pragma values are applied but not asserted by any test.
- `MigrationService`: `durationMs` is computed twice (persisted vs. returned value can diverge by the commit/fsync delta — cosmetic); `rollbackLast()` doesn't run registry validation the way `migrateToLatest()` does.
- `DatabaseManager`: no test asserts a redundant `initialize()` call skips its side effects (e.g. a second audit row); calling `shutdown()` after a failed `initialize()` silently transitions `'failed'` → `'closed'`, masking that the manager never reached ready — whether `'failed'` should be sticky is an open design question.
- `BackupService.restoreBackup`: if the file rename succeeds but the subsequent stale-`-wal`/`-shm` cleanup throws, the function reports failure even though the primary data swap already succeeded — a narrow, Windows-lock-adjacent edge case.
- `createTestDatabase` orphans its temp directory if `Database.open()` throws before returning (test-infra only, not shipped code).
- `prebuild-install@7.1.3` (a transitive dependency of better-sqlite3) is marked deprecated upstream — tracked for awareness, not actionable within this phase.
- **`DatabaseManager` does not compose `BackupService` or `DatabaseHealthService`** (found in the final whole-branch review, §2's diagram was wrong until this pass corrected it). Both remain standalone, constructor-injectable services with no wiring into the lifecycle owner or any call site.
- **Backup/restore trust gap:** because nothing in this phase calls `BackupService`, its entire surface — including `restoreBackup`'s rename-over-live-file and `-wal`/`-shm` cleanup — has only ever run against temp-file databases in unit tests, never against the real packaged app. This phase's own packaging bug (§8) showed that "passes unit tests" and "works in the packaged app" are not the same claim for this codebase. Give backup/restore an integration or packaged smoke test before treating it as field-ready.
- `Database.#applyPragmas` verifies `foreign_keys` took effect after `pragma('foreign_keys = ON')` but does not similarly verify `journal_mode` actually became `wal` (some filesystems — network shares, some removable media — silently refuse WAL). Cheap to add; not yet done.
- `MigrationService`'s pre-apply history-table creation and `currentVersion()` read, and all of `initializeMetadata`'s prepares, run outside the `MigrationError`/taxonomy wrapper — a raw driver error there (e.g. disk full) would propagate unwrapped and be misclassified by `main.ts`'s `instanceof DatabaseError` check. Harmless while nothing crosses IPC; close before Phase 3 exposes any of this to the renderer.

**Product scope (explicitly deferred per the phase brief, not a gap):**

- No synchronization logic, no API calls, no repositories, no CRUD, no business tables, no authentication — all correctly out of scope for Phase 2.
- SQLCipher (preferred per the architecture doc) was not introduced; the platform is currently unencrypted at rest.

## 11. Recommendations before Phase 3

1. **Stand up CI** running the full gate (typecheck / lint / format / test / build:renderer) plus `rebuild:node` as a setup step, so the Prettier-drift and ABI issues found manually in this task are caught automatically going forward.
2. **Decide SQLCipher timing** before any business data (students, attendance, etc.) lands in SQLite — encrypting an empty platform is far cheaper than migrating populated tables later.
3. **Define repository-layer conventions** on top of `DatabaseManager`: repositories should consume `DatabaseManager.connection` and `.transactions` and never construct a `Database` or open a connection themselves — this is the boundary the whole platform was built to enforce.
4. **First parameterized IPC endpoint checklist** (from the Phase 1.5 architecture review): shape-validating validator, arity comment at the registrar cast, `IpcChannels` exhaustiveness assertion — relevant as soon as Phase 3 exposes any database-backed data to the renderer.
5. **Revisit the Electron 42.7.0 pin** early in Phase 3 planning — check whether better-sqlite3 has shipped ABI-148 prebuilds, or whether a toolchain should be provisioned so Forge's native rebuild works unattended.
6. **Track the Minor debt items in §10** opportunistically; none block Phase 3 starting, but several (sticky-failed state, restore misreport edge case) are worth cheap fixes the next time those files are touched.
