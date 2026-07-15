# Phase 2 — Local Data Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production-ready local SQLite platform (connection lifecycle, migrations, platform tables, transactions, backup, health, errors, logging, tests, docs) that every future NEMIS Desktop feature builds on.

**Architecture:** A dedicated `apps/desktop/electron/database/` layer wraps better-sqlite3 behind a `Database` connection class; a `DatabaseManager` orchestrates the full lifecycle (open → validate → pragmas → migrate → seed metadata → ready → clean shutdown). Migrations are versioned TypeScript modules applied transactionally with recorded history. All services (`MigrationService`, `TransactionManager`, `BackupService`, `DatabaseHealthService`) receive the raw connection by injection, so every module is unit-testable against a temp-file database without Electron.

**Tech Stack:** better-sqlite3 (^12), TypeScript strict, Electron Forge + Vite plugin (auto-unpack-natives already registered), Vitest, electron-log.

## Global Constraints

- Branch: create `phase-2-local-data-platform` from `phase-1-foundation` (NOT from `main`).
- TypeScript strict; `any` forbidden (ESLint-enforced). Named exports only (framework-mandated defaults excepted).
- One responsibility per file; pure logic in plain modules testable without Electron; Electron-bound wrappers stay thin.
- Colocated tests: `foo.ts` → `foo.test.ts`; run with `pnpm test` (Vitest at repo root; include pattern already covers `apps/desktop/electron/**/*.test.ts`).
- UUID primary keys (`crypto.randomUUID`); `createdAt`/`updatedAt` as ISO-8601 UTC TEXT; never auto-increment IDs for synchronized entities.
- Never expose raw SQLite errors outward — wrap in the database error taxonomy.
- No sync logic, no API calls, no repositories, no CRUD, no auth, no business tables (students/teachers/attendance/grades/subjects/assessments).
- Logging: console in dev, electron-log in production (existing `initLogger` already does this split).
- `@app/*` path alias → `apps/desktop/electron/*` (works in tsc, Vite, and Vitest? — Vitest has no alias config today; database tests must use **relative imports** inside `electron/database/` to stay runnable, matching existing colocated tests like `config/parseConfig.test.ts`).
- Commit after every task (`git add <files> && git commit`), Conventional Commits style, each ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- ABI note: `pnpm start`/`pnpm make` rebuild better-sqlite3 for Electron's ABI; `pnpm test` runs under system Node. After running Electron, run `pnpm rebuild:node` (added in Task 2) before `pnpm test` if you hit `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION` errors.

## File Structure (end state)

```
apps/desktop/electron/database/
    Database.ts                     # connection wrapper: open/validate/pragmas/close
    DatabaseManager.ts              # lifecycle orchestrator (the only public entry point for main.ts)
    constants/
        pragmas.ts                  # every PRAGMA + why
        paths.ts                    # resolveDatabasePaths(userDataDir)
        version.ts                  # DATABASE_VERSION platform-format constant
    errors/
        errors.ts                   # DatabaseError taxonomy
        wrapSqliteError.ts          # SQLite error code → taxonomy mapping
    helpers/
        ids.ts                      # newId() (UUID)
        time.ts                     # nowIso()
    migrations/
        types.ts                    # Migration interface
        registry.ts                 # ordered list of all migrations
        001-create-platform-tables.ts
    schema/
        tableNames.ts               # canonical table-name constants
    seed/
        initializeMetadata.ts       # device row, sync_metadata singleton, default settings
    services/
        MigrationService.ts
        BackupService.ts
        DatabaseHealthService.ts
    transaction/
        TransactionManager.ts
    testing/
        createTestDatabase.ts       # temp-file DB factory + ABI-mismatch explainer
docs/database.md                    # architecture, lifecycle, pragmas, migration/backup strategy
```

---

### Task 1: Phase-2 pre-flight (branch + security checklist + explicit devDependency)

The architecture review (docs/architecture-review-2026-07-14.md) gates Phase 2 on: deny-all `setPermissionCheckHandler`, a `will-redirect` navigation guard, and `electron-winstaller` as an explicit devDependency.

**Files:**
- Modify: `apps/desktop/electron/security/permissions.ts`
- Modify: `apps/desktop/electron/security/hardenWindow.ts`
- Modify: `apps/desktop/electron/main/main.ts`
- Modify: `apps/desktop/package.json` (via pnpm add)

**Interfaces:**
- Produces: `denyPermissionChecks(): void` (called from main.ts beside existing `denyPermissionRequests()`).

- [ ] **Step 1: Create the Phase 2 branch**

```bash
git checkout phase-1-foundation
git checkout -b phase-2-local-data-platform
```

- [ ] **Step 2: Add deny-all permission check handler**

In `apps/desktop/electron/security/permissions.ts`, append below `denyPermissionRequests`:

```ts
/**
 * Synchronous twin of the request handler: some APIs consult
 * checkPermission without firing a request event. Deny those too.
 */
export function denyPermissionChecks(): void {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    logger.warn(`Denied permission check: ${permission}`);
    return false;
  });
}
```

- [ ] **Step 3: Add will-redirect guard**

In `apps/desktop/electron/security/hardenWindow.ts`, append inside `hardenWebContents` after the existing `will-navigate` block:

```ts
  contents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url, allowedOrigins)) {
      logger.warn(`Blocked redirect to: ${url}`);
      event.preventDefault();
    }
  });
```

- [ ] **Step 4: Call the new handler in main.ts**

In `apps/desktop/electron/main/main.ts`: extend the import and call site:

```ts
import { denyPermissionRequests, denyPermissionChecks } from '@app/security/permissions';
```

and inside `.then(() => { ... })`, directly after `denyPermissionRequests();`:

```ts
      denyPermissionChecks();
```

- [ ] **Step 5: Add electron-winstaller as explicit devDependency**

```bash
pnpm --filter @nemis-desktop/app add -D electron-winstaller@^5.4.0
```

- [ ] **Step 6: Verify gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass (28 existing tests, no new tests — these are thin Electron-bound wrappers, exempt per conventions).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/security/permissions.ts apps/desktop/electron/security/hardenWindow.ts apps/desktop/electron/main/main.ts apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat(security): deny-all permission checks + will-redirect guard; pin electron-winstaller"
```

---

### Task 2: better-sqlite3 dependency + native build wiring

**Files:**
- Modify: `apps/desktop/package.json` (via pnpm add)
- Modify: `pnpm-workspace.yaml`
- Modify: `apps/desktop/vite.main.config.ts`
- Modify: `package.json` (root — rebuild script)

**Interfaces:**
- Produces: importable `better-sqlite3` in main-process code; `pnpm rebuild:node` root script.

- [ ] **Step 1: Allow the build script and install**

In `pnpm-workspace.yaml`, extend:

```yaml
onlyBuiltDependencies:
  - electron
  - better-sqlite3
```

Then:

```bash
pnpm --filter @nemis-desktop/app add better-sqlite3@^12.4.1
pnpm --filter @nemis-desktop/app add -D @types/better-sqlite3@^7.6.13
```

(better-sqlite3 must be a **production** dependency so Forge packages it into the app and auto-unpack-natives can unpack the `.node` binary.)

- [ ] **Step 2: Externalize the native module in the Vite main build**

Replace the body of `apps/desktop/vite.main.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'electron'),
    },
  },
  build: {
    rollupOptions: {
      // Native module: must stay a runtime require, never bundled.
      external: ['better-sqlite3'],
    },
  },
});
```

- [ ] **Step 3: Add the Node-ABI rebuild script**

In root `package.json` `scripts`, add:

```json
"rebuild:node": "pnpm rebuild better-sqlite3"
```

- [ ] **Step 4: Smoke-test the native module under Node**

Run: `node -e "const db=require('better-sqlite3')(':memory:');console.log(db.prepare('select sqlite_version() v').get().v);db.close()"` from `apps/desktop/`
Expected: prints a SQLite version (e.g. `3.5x.x`). If `ERR_DLOPEN_FAILED`: run `pnpm rebuild:node` and retry.

- [ ] **Step 5: Verify gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass.

```bash
git add apps/desktop/package.json pnpm-workspace.yaml pnpm-lock.yaml apps/desktop/vite.main.config.ts package.json
git commit -m "build(db): add better-sqlite3 with pnpm build allowance, vite external, node rebuild script"
```

---

### Task 3: Database error taxonomy

Pure module — **no** better-sqlite3 import, so these tests run regardless of native ABI state.

**Files:**
- Create: `apps/desktop/electron/database/errors/errors.ts`
- Create: `apps/desktop/electron/database/errors/wrapSqliteError.ts`
- Test: `apps/desktop/electron/database/errors/wrapSqliteError.test.ts`

**Interfaces:**
- Produces:
  - `class DatabaseError extends Error { readonly code: DatabaseErrorCode }` and subclasses `ConnectionError`, `MigrationError`, `TransactionError`, `ConstraintError`, `IntegrityError`, `BackupError` — all with `(message: string, options?: { cause?: unknown })` constructors.
  - `wrapSqliteError(error: unknown, context: string): DatabaseError` — passes through existing `DatabaseError`s, maps SQLite codes, never leaks the raw SQLite message into `.message` (keeps it on `.cause`).

- [ ] **Step 1: Write the failing test**

`apps/desktop/electron/database/errors/wrapSqliteError.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ConnectionError,
  ConstraintError,
  DatabaseError,
  IntegrityError,
  MigrationError,
} from './errors';
import { wrapSqliteError } from './wrapSqliteError';

function sqliteError(code: string, message = 'raw sqlite detail'): Error {
  const error = new Error(message);
  (error as Error & { code: string }).code = code;
  return error;
}

describe('wrapSqliteError', () => {
  it('passes through DatabaseError instances unchanged', () => {
    const original = new MigrationError('migration 3 failed');
    expect(wrapSqliteError(original, 'ctx')).toBe(original);
  });

  it('maps constraint violations to ConstraintError', () => {
    const wrapped = wrapSqliteError(sqliteError('SQLITE_CONSTRAINT_FOREIGNKEY'), 'insert device');
    expect(wrapped).toBeInstanceOf(ConstraintError);
    expect(wrapped.code).toBe('DB_CONSTRAINT');
  });

  it('maps busy/locked to ConnectionError and corruption to IntegrityError', () => {
    expect(wrapSqliteError(sqliteError('SQLITE_BUSY'), 'open')).toBeInstanceOf(ConnectionError);
    expect(wrapSqliteError(sqliteError('SQLITE_CORRUPT'), 'open')).toBeInstanceOf(IntegrityError);
    expect(wrapSqliteError(sqliteError('SQLITE_NOTADB'), 'open')).toBeInstanceOf(IntegrityError);
  });

  it('never leaks the raw SQLite message; keeps it as cause', () => {
    const raw = sqliteError('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: devices.id');
    const wrapped = wrapSqliteError(raw, 'insert device');
    expect(wrapped.message).not.toContain('devices.id');
    expect(wrapped.message).toContain('insert device');
    expect(wrapped.cause).toBe(raw);
  });

  it('wraps unknown values in a generic DatabaseError', () => {
    const wrapped = wrapSqliteError('boom', 'somewhere');
    expect(wrapped).toBeInstanceOf(DatabaseError);
    expect(wrapped.code).toBe('DB_UNKNOWN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- wrapSqliteError`
Expected: FAIL — cannot resolve `./errors`.

- [ ] **Step 3: Implement errors.ts**

```ts
/**
 * Database error taxonomy. Raw SQLite errors never cross this boundary:
 * wrapSqliteError() converts them, keeping the original on `cause`.
 */
export type DatabaseErrorCode =
  | 'DB_CONNECTION'
  | 'DB_MIGRATION'
  | 'DB_TRANSACTION'
  | 'DB_CONSTRAINT'
  | 'DB_INTEGRITY'
  | 'DB_BACKUP'
  | 'DB_UNKNOWN';

export interface DatabaseErrorOptions {
  cause?: unknown;
}

export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;

  constructor(message: string, code: DatabaseErrorCode = 'DB_UNKNOWN', options?: DatabaseErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_CONNECTION', options);
  }
}

export class MigrationError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_MIGRATION', options);
  }
}

export class TransactionError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_TRANSACTION', options);
  }
}

export class ConstraintError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_CONSTRAINT', options);
  }
}

export class IntegrityError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_INTEGRITY', options);
  }
}

export class BackupError extends DatabaseError {
  constructor(message: string, options?: DatabaseErrorOptions) {
    super(message, 'DB_BACKUP', options);
  }
}
```

- [ ] **Step 4: Implement wrapSqliteError.ts**

```ts
import {
  ConnectionError,
  ConstraintError,
  DatabaseError,
  IntegrityError,
} from './errors';

interface CodedError extends Error {
  code: string;
}

function isSqliteCodedError(error: unknown): error is CodedError {
  return (
    error instanceof Error &&
    typeof (error as Partial<CodedError>).code === 'string' &&
    (error as CodedError).code.startsWith('SQLITE_')
  );
}

/**
 * Converts any thrown value into the DatabaseError taxonomy.
 * The wrapped message carries only our context + the SQLite result code —
 * the raw driver message (which can embed schema/data details) stays on cause.
 */
export function wrapSqliteError(error: unknown, context: string): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }
  if (isSqliteCodedError(error)) {
    const { code } = error;
    const message = `${context}: database operation failed (${code})`;
    if (code.startsWith('SQLITE_CONSTRAINT')) {
      return new ConstraintError(message, { cause: error });
    }
    if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' || code === 'SQLITE_CANTOPEN') {
      return new ConnectionError(message, { cause: error });
    }
    if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB' || code === 'SQLITE_MISMATCH') {
      return new IntegrityError(message, { cause: error });
    }
    return new DatabaseError(message, 'DB_UNKNOWN', { cause: error });
  }
  return new DatabaseError(`${context}: unexpected database failure`, 'DB_UNKNOWN', {
    cause: error,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- wrapSqliteError`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/database/errors
git commit -m "feat(db): database error taxonomy with sqlite code mapping"
```

---

### Task 4: Helpers and constants (ids, time, paths, pragmas, table names, version)

**Files:**
- Create: `apps/desktop/electron/database/helpers/ids.ts`
- Create: `apps/desktop/electron/database/helpers/time.ts`
- Create: `apps/desktop/electron/database/constants/paths.ts`
- Create: `apps/desktop/electron/database/constants/pragmas.ts`
- Create: `apps/desktop/electron/database/constants/version.ts`
- Create: `apps/desktop/electron/database/schema/tableNames.ts`
- Test: `apps/desktop/electron/database/constants/paths.test.ts`

**Interfaces:**
- Produces:
  - `newId(): string` — UUID v4.
  - `nowIso(): string` — ISO-8601 UTC timestamp.
  - `interface DatabasePaths { directory: string; databaseFile: string; backupsDirectory: string }` and `resolveDatabasePaths(userDataDir: string): DatabasePaths`.
  - `PRAGMAS` const + `applyPragmas(db)` lives later in Database.ts; this task only defines values.
  - `DATABASE_VERSION = 1`.
  - `TableNames` const object with every platform table name.

- [ ] **Step 1: Write the failing test**

`apps/desktop/electron/database/constants/paths.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDatabasePaths } from './paths';

describe('resolveDatabasePaths', () => {
  it('derives all paths from the user data directory', () => {
    const paths = resolveDatabasePaths(path.join('C:', 'Users', 'x', 'AppData', 'nemis-desktop'));
    expect(paths.directory.endsWith(path.join('nemis-desktop', 'database'))).toBe(true);
    expect(paths.databaseFile).toBe(path.join(paths.directory, 'nemis.db'));
    expect(paths.backupsDirectory).toBe(path.join(paths.directory, 'backups'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- constants/paths`
Expected: FAIL — cannot resolve `./paths`.

- [ ] **Step 3: Implement the modules**

`helpers/ids.ts`:

```ts
import { randomUUID } from 'node:crypto';

/** UUID v4 primary keys — required for all rows; never auto-increment. */
export function newId(): string {
  return randomUUID();
}
```

`helpers/time.ts`:

```ts
/** Canonical timestamp format for every createdAt/updatedAt: ISO-8601 UTC. */
export function nowIso(): string {
  return new Date().toISOString();
}
```

`constants/paths.ts`:

```ts
import path from 'node:path';

export interface DatabasePaths {
  /** <userData>/database — owns the db file, WAL/SHM siblings, and backups. */
  directory: string;
  /** <userData>/database/nemis.db */
  databaseFile: string;
  /** <userData>/database/backups */
  backupsDirectory: string;
}

export const DATABASE_FILE_NAME = 'nemis.db';

/** Pure so tests never need Electron's app.getPath(). */
export function resolveDatabasePaths(userDataDir: string): DatabasePaths {
  const directory = path.join(userDataDir, 'database');
  return {
    directory,
    databaseFile: path.join(directory, DATABASE_FILE_NAME),
    backupsDirectory: path.join(directory, 'backups'),
  };
}
```

`constants/pragmas.ts`:

```ts
/**
 * SQLite configuration for a single-user desktop workload.
 *
 * journal_mode = WAL          — readers never block the writer; survives crashes;
 *                               required for online backup while the app runs.
 * synchronous = NORMAL        — with WAL, NORMAL only risks losing the last
 *                               transactions on OS/power failure, never corruption.
 *                               FULL would double fsync cost for no integrity gain.
 * foreign_keys = ON           — SQLite defaults OFF per connection; we require
 *                               referential integrity everywhere.
 * busy_timeout = 5000 ms      — a second process (backup validation, tooling)
 *                               waits instead of failing instantly with SQLITE_BUSY.
 * cache_size = -64000 (64 MiB)— negative = KiB units; desktop machines can afford
 *                               a large page cache; biggest single query-speed lever.
 * temp_store = MEMORY         — temp b-trees (ORDER BY/GROUP BY spills) stay in RAM.
 * wal_autocheckpoint = 1000   — default made explicit: checkpoint every ~4 MB of WAL.
 * journal_size_limit = 64 MiB — caps WAL file growth after big transactions.
 */
export const PRAGMAS = {
  journalMode: 'WAL',
  synchronous: 'NORMAL',
  foreignKeys: 'ON',
  busyTimeoutMs: 5000,
  cacheSizeKib: 64000,
  tempStore: 'MEMORY',
  walAutocheckpointPages: 1000,
  journalSizeLimitBytes: 64 * 1024 * 1024,
} as const;
```

`constants/version.ts`:

```ts
/**
 * Platform data-format version (recorded in sync_metadata.databaseVersion).
 * Distinct from the migration schema version: bump only when the on-disk
 * platform contract changes incompatibly (e.g. encryption introduced).
 */
export const DATABASE_VERSION = 1;
```

`schema/tableNames.ts`:

```ts
/** Canonical platform table names — single source of truth for services/tests. */
export const TableNames = {
  schemaMigrations: 'schema_migrations',
  devices: 'devices',
  appSettings: 'app_settings',
  syncMetadata: 'sync_metadata',
  syncQueue: 'sync_queue',
  syncErrors: 'sync_errors',
  auditLog: 'audit_log',
} as const;

export type TableName = (typeof TableNames)[keyof typeof TableNames];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- constants/paths`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/database/helpers apps/desktop/electron/database/constants apps/desktop/electron/database/schema
git commit -m "feat(db): ids/time helpers, path resolution, documented pragma set, table name constants"
```

---

### Task 5: Database connection wrapper + test factory

**Files:**
- Create: `apps/desktop/electron/database/Database.ts`
- Create: `apps/desktop/electron/database/testing/createTestDatabase.ts`
- Test: `apps/desktop/electron/database/Database.test.ts`

**Interfaces:**
- Consumes: `PRAGMAS`, `wrapSqliteError`, `ConnectionError`, `IntegrityError`.
- Produces:
  - `interface DatabaseOptions { filePath: string; readonly?: boolean }`
  - `class Database { static open(options: DatabaseOptions): Database; get raw(): SqliteDatabase; get filePath(): string; get isOpen(): boolean; close(): void }` — `close()` is idempotent; checkpoints WAL and runs `PRAGMA optimize` before closing.
  - `createTestDatabase(): { db: Database; filePath: string; cleanup(): void }` — temp-file DB with automatic dir removal; throws an actionable error on Node/Electron ABI mismatch.

- [ ] **Step 1: Write the test factory (needed by this and every later test)**

`apps/desktop/electron/database/testing/createTestDatabase.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from '../Database';

export interface TestDatabase {
  db: Database;
  filePath: string;
  cleanup(): void;
}

function isAbiMismatch(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (
      current.message.includes('NODE_MODULE_VERSION') ||
      (current as Error & { code?: string }).code === 'ERR_DLOPEN_FAILED'
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/** Temp-file database (file-backed so WAL behaves exactly like production). */
export function createTestDatabase(): TestDatabase {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-db-test-'));
  const filePath = path.join(directory, 'test.db');
  let db: Database;
  try {
    db = Database.open({ filePath });
  } catch (error) {
    if (isAbiMismatch(error)) {
      throw new Error(
        'better-sqlite3 is compiled for Electron, not Node. Run `pnpm rebuild:node` ' +
          'and re-run tests. (`pnpm start`/`pnpm make` rebuild it for Electron again.)',
      );
    }
    throw error;
  }
  return {
    db,
    filePath,
    cleanup(): void {
      db.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

`apps/desktop/electron/database/Database.test.ts`:

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from './Database';
import { IntegrityError } from './errors/errors';
import { createTestDatabase } from './testing/createTestDatabase';

describe('Database', () => {
  it('opens with WAL mode, foreign keys, and configured pragmas', () => {
    const { db, cleanup } = createTestDatabase();
    try {
      expect(db.isOpen).toBe(true);
      expect(db.raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.raw.pragma('synchronous', { simple: true })).toBe(1); // NORMAL
      expect(db.raw.pragma('busy_timeout', { simple: true })).toBe(5000);
      expect(db.raw.pragma('temp_store', { simple: true })).toBe(2); // MEMORY
    } finally {
      cleanup();
    }
  });

  it('creates the parent directory and database file when missing', () => {
    const { filePath, cleanup } = createTestDatabase();
    try {
      expect(fs.existsSync(filePath)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('close() is idempotent and flips isOpen', () => {
    const { db, cleanup } = createTestDatabase();
    db.close();
    expect(db.isOpen).toBe(false);
    db.close(); // second call must not throw
    cleanup();
  });

  it('rejects a file that is not a SQLite database', () => {
    const { filePath, cleanup, db } = createTestDatabase();
    db.close();
    fs.writeFileSync(filePath, 'this is not a database');
    expect(() => Database.open({ filePath })).toThrow(IntegrityError);
    cleanup();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- database/Database`
Expected: FAIL — cannot resolve `./Database`.

- [ ] **Step 4: Implement Database.ts**

```ts
import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { PRAGMAS } from './constants/pragmas';
import { ConnectionError, IntegrityError } from './errors/errors';
import { wrapSqliteError } from './errors/wrapSqliteError';

export interface DatabaseOptions {
  filePath: string;
  readonly?: boolean;
}

/**
 * Owns exactly one better-sqlite3 connection: creation, validation,
 * pragma configuration, and clean close. Nothing else touches the driver
 * constructor — services receive `raw` by injection.
 */
export class Database {
  #raw: SqliteDatabase | null;
  readonly #filePath: string;

  private constructor(raw: SqliteDatabase, filePath: string) {
    this.#raw = raw;
    this.#filePath = filePath;
  }

  static open(options: DatabaseOptions): Database {
    const { filePath, readonly = false } = options;
    if (filePath !== ':memory:') {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    let raw: SqliteDatabase;
    try {
      raw = new BetterSqlite3(filePath, { readonly });
    } catch (error) {
      throw new ConnectionError(`Cannot open database at ${filePath}`, { cause: error });
    }
    try {
      if (!readonly) {
        Database.#applyPragmas(raw);
      }
      const check = raw.pragma('quick_check', { simple: true }) as string;
      if (check !== 'ok') {
        throw new IntegrityError(`Database failed validation at open: ${check}`);
      }
      return new Database(raw, filePath);
    } catch (error) {
      raw.close();
      throw wrapSqliteError(error, `open ${filePath}`);
    }
  }

  static #applyPragmas(raw: SqliteDatabase): void {
    raw.pragma(`busy_timeout = ${PRAGMAS.busyTimeoutMs}`);
    raw.pragma(`journal_mode = ${PRAGMAS.journalMode}`);
    raw.pragma(`synchronous = ${PRAGMAS.synchronous}`);
    raw.pragma(`foreign_keys = ${PRAGMAS.foreignKeys}`);
    raw.pragma(`cache_size = -${PRAGMAS.cacheSizeKib}`);
    raw.pragma(`temp_store = ${PRAGMAS.tempStore}`);
    raw.pragma(`wal_autocheckpoint = ${PRAGMAS.walAutocheckpointPages}`);
    raw.pragma(`journal_size_limit = ${PRAGMAS.journalSizeLimitBytes}`);
    if ((raw.pragma('foreign_keys', { simple: true }) as number) !== 1) {
      throw new ConnectionError('foreign_keys pragma did not take effect');
    }
  }

  get raw(): SqliteDatabase {
    if (this.#raw === null) {
      throw new ConnectionError('Database is closed');
    }
    return this.#raw;
  }

  get filePath(): string {
    return this.#filePath;
  }

  get isOpen(): boolean {
    return this.#raw !== null && this.#raw.open;
  }

  /**
   * Checkpoints the WAL into the main file, lets SQLite refresh query-planner
   * statistics, then closes. Idempotent: safe to call from multiple shutdown paths.
   */
  close(): void {
    if (this.#raw === null) {
      return;
    }
    const raw = this.#raw;
    this.#raw = null;
    try {
      if (!raw.readonly) {
        raw.pragma('wal_checkpoint(TRUNCATE)');
        raw.pragma('optimize');
      }
    } catch {
      // Best-effort maintenance; close() below is what must not fail silently.
    } finally {
      raw.close();
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- database/Database`
Expected: PASS (4 tests). If ABI error appears, run `pnpm rebuild:node` first.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/database/Database.ts apps/desktop/electron/database/Database.test.ts apps/desktop/electron/database/testing
git commit -m "feat(db): connection wrapper with validated open, documented pragmas, idempotent close; test factory"
```

---

### Task 6: Migration framework (types + MigrationService)

Tested against inline fake migrations; the real migration arrives in Task 7.

**Files:**
- Create: `apps/desktop/electron/database/migrations/types.ts`
- Create: `apps/desktop/electron/database/services/MigrationService.ts`
- Test: `apps/desktop/electron/database/services/MigrationService.test.ts`

**Interfaces:**
- Consumes: `Database`/`SqliteDatabase`, `MigrationError`, `TableNames.schemaMigrations`, `nowIso`.
- Produces:
  - `interface Migration { readonly version: number; readonly name: string; up(db: SqliteDatabase): void; down?(db: SqliteDatabase): void }`
  - `interface AppliedMigration { version: number; name: string; appliedAt: string; durationMs: number }`
  - `class MigrationService { constructor(db: SqliteDatabase, registry: readonly Migration[]); migrateToLatest(): AppliedMigration[]; rollbackLast(): AppliedMigration | null; appliedMigrations(): AppliedMigration[]; currentVersion(): number }`
  - Each migration runs in its own transaction; history row + `PRAGMA user_version` update are atomic with the DDL.

- [ ] **Step 1: Write the failing test**

`apps/desktop/electron/database/services/MigrationService.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { MigrationError } from '../errors/errors';
import type { Migration } from '../migrations/types';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { MigrationService } from './MigrationService';

const m1: Migration = {
  version: 1,
  name: 'create-alpha',
  up: (db: SqliteDatabase) => {
    db.exec('CREATE TABLE alpha (id TEXT PRIMARY KEY)');
  },
  down: (db: SqliteDatabase) => {
    db.exec('DROP TABLE alpha');
  },
};

const m2: Migration = {
  version: 2,
  name: 'create-beta',
  up: (db: SqliteDatabase) => {
    db.exec('CREATE TABLE beta (id TEXT PRIMARY KEY)');
  },
};

describe('MigrationService', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('applies pending migrations in order and records history', () => {
    const service = new MigrationService(test.db.raw, [m1, m2]);
    const applied = service.migrateToLatest();
    expect(applied.map((m) => m.version)).toEqual([1, 2]);
    expect(service.currentVersion()).toBe(2);
    expect(test.db.raw.pragma('user_version', { simple: true })).toBe(2);
    const history = service.appliedMigrations();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ version: 1, name: 'create-alpha' });
  });

  it('is idempotent: second run applies nothing', () => {
    const service = new MigrationService(test.db.raw, [m1, m2]);
    service.migrateToLatest();
    expect(service.migrateToLatest()).toEqual([]);
  });

  it('rolls back the whole migration when up() throws mid-way', () => {
    const bad: Migration = {
      version: 1,
      name: 'bad',
      up: (db: SqliteDatabase) => {
        db.exec('CREATE TABLE gamma (id TEXT PRIMARY KEY)');
        throw new Error('boom');
      },
    };
    const service = new MigrationService(test.db.raw, [bad]);
    expect(() => service.migrateToLatest()).toThrow(MigrationError);
    expect(service.currentVersion()).toBe(0);
    const table = test.db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gamma'")
      .get();
    expect(table).toBeUndefined();
  });

  it('rejects an invalid registry (duplicate or non-ascending versions)', () => {
    expect(() => new MigrationService(test.db.raw, [m2, m1]).migrateToLatest()).toThrow(
      MigrationError,
    );
    expect(() =>
      new MigrationService(test.db.raw, [m1, { ...m2, version: 1 }]).migrateToLatest(),
    ).toThrow(MigrationError);
  });

  it('detects drift: applied migration missing from the registry', () => {
    new MigrationService(test.db.raw, [m1]).migrateToLatest();
    expect(() => new MigrationService(test.db.raw, [m2]).migrateToLatest()).toThrow(MigrationError);
  });

  it('rollbackLast() reverses the last migration when down() exists', () => {
    const service = new MigrationService(test.db.raw, [m1]);
    service.migrateToLatest();
    const rolledBack = service.rollbackLast();
    expect(rolledBack?.version).toBe(1);
    expect(service.currentVersion()).toBe(0);
  });

  it('rollbackLast() refuses when the migration has no down()', () => {
    const service = new MigrationService(test.db.raw, [m1, m2]);
    service.migrateToLatest();
    expect(() => service.rollbackLast()).toThrow(MigrationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- MigrationService`
Expected: FAIL — cannot resolve `../migrations/types` / `./MigrationService`.

- [ ] **Step 3: Implement migrations/types.ts**

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';

/**
 * One schema change. `version` is a positive integer, unique across the
 * registry, applied in ascending order. `down` is optional — destructive
 * migrations may be irreversible; rollbackLast() refuses those explicitly.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  up(db: SqliteDatabase): void;
  down?(db: SqliteDatabase): void;
}
```

- [ ] **Step 4: Implement services/MigrationService.ts**

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { MigrationError } from '../errors/errors';
import { nowIso } from '../helpers/time';
import type { Migration } from '../migrations/types';
import { TableNames } from '../schema/tableNames';

export interface AppliedMigration {
  version: number;
  name: string;
  appliedAt: string;
  durationMs: number;
}

const CREATE_HISTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TableNames.schemaMigrations} (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    appliedAt TEXT NOT NULL,
    durationMs INTEGER NOT NULL
  )
`;

/**
 * Versioned, transactional migrations with recorded history.
 * Each migration (DDL + history row + user_version bump) is one transaction:
 * a failure leaves the database exactly at the previous version.
 */
export class MigrationService {
  readonly #db: SqliteDatabase;
  readonly #registry: readonly Migration[];

  constructor(db: SqliteDatabase, registry: readonly Migration[]) {
    this.#db = db;
    this.#registry = registry;
  }

  migrateToLatest(): AppliedMigration[] {
    this.#db.exec(CREATE_HISTORY_TABLE);
    this.#validateRegistry();
    this.#validateHistory();
    const current = this.currentVersion();
    const pending = this.#registry.filter((m) => m.version > current);
    const applied: AppliedMigration[] = [];
    for (const migration of pending) {
      applied.push(this.#apply(migration));
    }
    return applied;
  }

  rollbackLast(): AppliedMigration | null {
    this.#db.exec(CREATE_HISTORY_TABLE);
    const history = this.appliedMigrations();
    const last = history.at(-1);
    if (!last) {
      return null;
    }
    const migration = this.#registry.find((m) => m.version === last.version);
    if (!migration) {
      throw new MigrationError(`Cannot roll back v${last.version}: not in the registry`);
    }
    const down = migration.down?.bind(migration);
    if (!down) {
      throw new MigrationError(`Cannot roll back v${last.version} (${last.name}): no down()`);
    }
    const previousVersion = history.at(-2)?.version ?? 0;
    try {
      this.#db.transaction(() => {
        down(this.#db);
        this.#db
          .prepare(`DELETE FROM ${TableNames.schemaMigrations} WHERE version = ?`)
          .run(last.version);
        this.#db.pragma(`user_version = ${previousVersion}`);
      })();
    } catch (error) {
      throw new MigrationError(`Rollback of v${last.version} (${last.name}) failed`, {
        cause: error,
      });
    }
    return last;
  }

  appliedMigrations(): AppliedMigration[] {
    return this.#db
      .prepare(
        `SELECT version, name, appliedAt, durationMs
         FROM ${TableNames.schemaMigrations} ORDER BY version`,
      )
      .all() as AppliedMigration[];
  }

  currentVersion(): number {
    const row = this.#db
      .prepare(`SELECT MAX(version) AS version FROM ${TableNames.schemaMigrations}`)
      .get() as { version: number | null };
    return row.version ?? 0;
  }

  #apply(migration: Migration): AppliedMigration {
    const start = performance.now();
    const appliedAt = nowIso();
    try {
      this.#db.transaction(() => {
        migration.up(this.#db);
        const durationMs = Math.round(performance.now() - start);
        this.#db
          .prepare(
            `INSERT INTO ${TableNames.schemaMigrations} (version, name, appliedAt, durationMs)
             VALUES (?, ?, ?, ?)`,
          )
          .run(migration.version, migration.name, appliedAt, durationMs);
        this.#db.pragma(`user_version = ${migration.version}`);
      })();
    } catch (error) {
      throw new MigrationError(`Migration v${migration.version} (${migration.name}) failed`, {
        cause: error,
      });
    }
    return {
      version: migration.version,
      name: migration.name,
      appliedAt,
      durationMs: Math.round(performance.now() - start),
    };
  }

  #validateRegistry(): void {
    let previous = 0;
    const seen = new Set<number>();
    for (const migration of this.#registry) {
      if (!Number.isInteger(migration.version) || migration.version < 1) {
        throw new MigrationError(`Invalid migration version: ${migration.version}`);
      }
      if (seen.has(migration.version) || migration.version <= previous) {
        throw new MigrationError(
          `Migration registry must be strictly ascending; problem at v${migration.version}`,
        );
      }
      seen.add(migration.version);
      previous = migration.version;
    }
  }

  /** Every applied migration must still exist in the registry (same version+name). */
  #validateHistory(): void {
    const byVersion = new Map(this.#registry.map((m) => [m.version, m]));
    for (const applied of this.appliedMigrations()) {
      const match = byVersion.get(applied.version);
      if (!match || match.name !== applied.name) {
        throw new MigrationError(
          `History drift: applied v${applied.version} (${applied.name}) is missing from the registry`,
        );
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- MigrationService`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/database/migrations/types.ts apps/desktop/electron/database/services/MigrationService.ts apps/desktop/electron/database/services/MigrationService.test.ts
git commit -m "feat(db): transactional migration service with history, drift detection, rollback"
```

---

### Task 7: Migration 001 — platform tables + registry

**Files:**
- Create: `apps/desktop/electron/database/migrations/001-create-platform-tables.ts`
- Create: `apps/desktop/electron/database/migrations/registry.ts`
- Test: `apps/desktop/electron/database/migrations/001-create-platform-tables.test.ts`

**Interfaces:**
- Consumes: `Migration`, `MigrationService`, `TableNames`.
- Produces:
  - `createPlatformTables: Migration` (version 1).
  - `migrations: readonly Migration[]` (the registry every caller uses).
  - Tables: `devices`, `app_settings`, `sync_metadata`, `sync_queue`, `sync_errors`, `audit_log` (+ `schema_migrations` from Task 6). All UUID TEXT PKs, ISO TEXT timestamps.

- [ ] **Step 1: Write the failing test**

`apps/desktop/electron/database/migrations/001-create-platform-tables.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { TableNames } from '../schema/tableNames';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { migrations } from './registry';

describe('001-create-platform-tables', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('creates every platform table', () => {
    const names = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    for (const table of [
      TableNames.devices,
      TableNames.appSettings,
      TableNames.syncMetadata,
      TableNames.syncQueue,
      TableNames.syncErrors,
      TableNames.auditLog,
    ]) {
      expect(names).toContain(table);
    }
  });

  it('creates the documented indexes', () => {
    const indexes = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(indexes.sort()).toEqual([
      'idx_app_settings_key',
      'idx_audit_log_category_createdAt',
      'idx_sync_errors_createdAt',
      'idx_sync_errors_operationId',
      'idx_sync_queue_entity',
      'idx_sync_queue_status_createdAt',
    ]);
  });

  it('enforces sync_queue CHECK constraints', () => {
    const insert = test.db.raw.prepare(
      `INSERT INTO ${TableNames.syncQueue}
       (id, entityType, entityId, operationType, payload, createdAt, updatedAt)
       VALUES (?, 'student', 'e1', ?, '{}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    );
    expect(() => insert.run('q1', 'create')).not.toThrow();
    expect(() => insert.run('q2', 'upsert')).toThrow();
  });

  it('enforces the sync_metadata singleton CHECK', () => {
    expect(() =>
      test.db.raw
        .prepare(
          `INSERT INTO ${TableNames.syncMetadata}
           (id, schemaVersion, databaseVersion, syncStatus, createdAt, updatedAt)
           VALUES ('another-row', 1, 1, 'never', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
        )
        .run(),
    ).toThrow();
  });

  it('sync_errors.operationId nulls out when the queue row is deleted', () => {
    const now = '2026-01-01T00:00:00Z';
    test.db.raw
      .prepare(
        `INSERT INTO ${TableNames.syncQueue}
         (id, entityType, entityId, operationType, payload, createdAt, updatedAt)
         VALUES ('q1', 'student', 'e1', 'create', '{}', ?, ?)`,
      )
      .run(now, now);
    test.db.raw
      .prepare(
        `INSERT INTO ${TableNames.syncErrors} (id, operationId, message, createdAt)
         VALUES ('err1', 'q1', 'network unreachable', ?)`,
      )
      .run(now);
    test.db.raw.prepare(`DELETE FROM ${TableNames.syncQueue} WHERE id = 'q1'`).run();
    const row = test.db.raw
      .prepare(`SELECT operationId FROM ${TableNames.syncErrors} WHERE id = 'err1'`)
      .get() as { operationId: string | null };
    expect(row.operationId).toBeNull();
  });

  it('down() removes every platform table', () => {
    const service = new MigrationService(test.db.raw, migrations);
    service.rollbackLast();
    const count = test.db.raw
      .prepare(
        `SELECT COUNT(*) AS n FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != ?`,
      )
      .get(TableNames.schemaMigrations) as { n: number };
    expect(count.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- 001-create-platform-tables`
Expected: FAIL — cannot resolve `./registry`.

- [ ] **Step 3: Implement the migration**

`apps/desktop/electron/database/migrations/001-create-platform-tables.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/**
 * Platform tables only — no business entities (those arrive with sync in
 * later phases). Conventions: TEXT UUID PKs, ISO-8601 UTC TEXT timestamps.
 *
 * Deliberate deviations from the UUID-PK rule (documented, local-only tables):
 * - sync_metadata uses a fixed 'singleton' PK with a CHECK — it is a
 *   single-row table by design and is never synchronized.
 *
 * Indexes:
 * - idx_app_settings_key            UNIQUE — settings are addressed by key.
 * - idx_sync_queue_status_createdAt — the sync worker polls "oldest pending first".
 * - idx_sync_queue_entity           — lookups/dedup by (entityType, entityId).
 * - idx_sync_errors_operationId     — join errors to their queue operation.
 * - idx_sync_errors_createdAt       — error triage is time-ordered.
 * - idx_audit_log_category_createdAt — audit queries filter by category, newest first.
 */
export const createPlatformTables: Migration = {
  version: 1,
  name: 'create-platform-tables',

  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        deviceName TEXT NOT NULL,
        platform TEXT NOT NULL,
        osVersion TEXT NOT NULL,
        appVersion TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE app_settings (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_app_settings_key ON app_settings (key);

      CREATE TABLE sync_metadata (
        id TEXT PRIMARY KEY CHECK (id = 'singleton'),
        lastSyncAt TEXT,
        schemaVersion INTEGER NOT NULL,
        databaseVersion INTEGER NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'never'
          CHECK (syncStatus IN ('never', 'idle', 'syncing', 'failed')),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE sync_queue (
        id TEXT PRIMARY KEY,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        operationType TEXT NOT NULL
          CHECK (operationType IN ('create', 'update', 'delete')),
        payload TEXT,
        retryCount INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'in_flight', 'completed', 'failed')),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_sync_queue_status_createdAt ON sync_queue (status, createdAt);
      CREATE INDEX idx_sync_queue_entity ON sync_queue (entityType, entityId);

      CREATE TABLE sync_errors (
        id TEXT PRIMARY KEY,
        operationId TEXT REFERENCES sync_queue (id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        stack TEXT,
        retryCount INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX idx_sync_errors_operationId ON sync_errors (operationId);
      CREATE INDEX idx_sync_errors_createdAt ON sync_errors (createdAt);

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL
          CHECK (category IN ('application', 'database', 'sync', 'security')),
        event TEXT NOT NULL,
        details TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX idx_audit_log_category_createdAt ON audit_log (category, createdAt);
    `);
  },

  down(db: SqliteDatabase): void {
    db.exec(`
      DROP TABLE audit_log;
      DROP TABLE sync_errors;
      DROP TABLE sync_queue;
      DROP TABLE sync_metadata;
      DROP TABLE app_settings;
      DROP TABLE devices;
    `);
  },
};
```

`apps/desktop/electron/database/migrations/registry.ts`:

```ts
import type { Migration } from './types';
import { createPlatformTables } from './001-create-platform-tables';

/**
 * Every migration, ascending by version. Append only — never edit or reorder
 * a shipped migration; MigrationService rejects drift at startup.
 */
export const migrations: readonly Migration[] = [createPlatformTables];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- 001-create-platform-tables`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/database/migrations
git commit -m "feat(db): migration 001 — platform tables, constraints, documented indexes"
```

---

### Task 8: TransactionManager

**Files:**
- Create: `apps/desktop/electron/database/transaction/TransactionManager.ts`
- Test: `apps/desktop/electron/database/transaction/TransactionManager.test.ts`

**Interfaces:**
- Consumes: `SqliteDatabase`, `TransactionError`, `wrapSqliteError`.
- Produces: `class TransactionManager { constructor(db: SqliteDatabase); run<T>(work: () => T): T; runImmediate<T>(work: () => T): T; runExclusive<T>(work: () => T): T }`.
- Design decision (document in code + docs): explicit `begin()/commit()/rollback()` handles are intentionally **not** exposed — a callback API makes a leaked open transaction unrepresentable, which is how the "no connection leaks" guarantee extends to transactions. Nested `run` calls become SAVEPOINTs automatically (better-sqlite3 semantics). Errors thrown by `work` propagate unchanged after rollback so callers keep their own error types; only transaction-machinery failures surface as `TransactionError`/taxonomy errors.

- [ ] **Step 1: Write the failing test**

`apps/desktop/electron/database/transaction/TransactionManager.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { TransactionManager } from './TransactionManager';

describe('TransactionManager', () => {
  let test: TestDatabase;
  let tx: TransactionManager;

  beforeEach(() => {
    test = createTestDatabase();
    test.db.raw.exec('CREATE TABLE items (id TEXT PRIMARY KEY, label TEXT NOT NULL)');
    tx = new TransactionManager(test.db.raw);
  });

  afterEach(() => {
    test.cleanup();
  });

  const count = (): number =>
    (test.db.raw.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n;

  it('commits when work succeeds and returns its result', () => {
    const result = tx.run(() => {
      test.db.raw.prepare("INSERT INTO items VALUES ('1', 'a')").run();
      return 42;
    });
    expect(result).toBe(42);
    expect(count()).toBe(1);
  });

  it('rolls back everything when work throws, rethrowing the original error', () => {
    const boom = new Error('domain failure');
    expect(() =>
      tx.run(() => {
        test.db.raw.prepare("INSERT INTO items VALUES ('1', 'a')").run();
        throw boom;
      }),
    ).toThrow(boom);
    expect(count()).toBe(0);
  });

  it('nests safely: inner failure caught by outer keeps outer work', () => {
    tx.run(() => {
      test.db.raw.prepare("INSERT INTO items VALUES ('outer', 'o')").run();
      try {
        tx.run(() => {
          test.db.raw.prepare("INSERT INTO items VALUES ('inner', 'i')").run();
          throw new Error('inner fails');
        });
      } catch {
        // inner savepoint rolled back; outer continues
      }
    });
    expect(count()).toBe(1);
    const row = test.db.raw.prepare('SELECT id FROM items').get() as { id: string };
    expect(row.id).toBe('outer');
  });

  it('runImmediate acquires a write transaction and commits', () => {
    tx.runImmediate(() => {
      test.db.raw.prepare("INSERT INTO items VALUES ('1', 'a')").run();
    });
    expect(count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- TransactionManager`
Expected: FAIL — cannot resolve `./TransactionManager`.

- [ ] **Step 3: Implement TransactionManager.ts**

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { DatabaseError, TransactionError } from '../errors/errors';
import { wrapSqliteError } from '../errors/wrapSqliteError';

type TransactionMode = 'deferred' | 'immediate' | 'exclusive';

/**
 * Callback-scoped transactions over better-sqlite3's transaction().
 *
 * No begin()/commit()/rollback() handles are exposed on purpose: with a
 * callback API a forgotten-open transaction cannot exist, which extends the
 * platform's "no leaks" guarantee to transactions. Nested run* calls become
 * SAVEPOINTs automatically, so repository code composes freely.
 *
 * Errors thrown by `work` propagate unchanged (after rollback) so domain
 * errors keep their type; driver-level failures are wrapped in the taxonomy.
 */
export class TransactionManager {
  readonly #db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  /** DEFERRED transaction (default): lock escalates on first write. */
  run<T>(work: () => T): T {
    return this.#exec(work, 'deferred');
  }

  /** IMMEDIATE: takes the write lock up front; use for known write batches. */
  runImmediate<T>(work: () => T): T {
    return this.#exec(work, 'immediate');
  }

  /** EXCLUSIVE: blocks all other connections; reserve for maintenance. */
  runExclusive<T>(work: () => T): T {
    return this.#exec(work, 'exclusive');
  }

  #exec<T>(work: () => T, mode: TransactionMode): T {
    let inWork = false;
    const marked = (): T => {
      inWork = true;
      try {
        return work();
      } finally {
        inWork = false;
      }
    };
    try {
      const transaction = this.#db.transaction(marked);
      switch (mode) {
        case 'deferred':
          return transaction.deferred();
        case 'immediate':
          return transaction.immediate();
        case 'exclusive':
          return transaction.exclusive();
      }
    } catch (error) {
      if (inWork || error instanceof DatabaseError) {
        throw error; // work's own error (already rolled back) or already wrapped
      }
      if (error instanceof Error && 'code' in error) {
        throw wrapSqliteError(error, `transaction (${mode})`);
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new TransactionError(`transaction (${mode}) failed`, { cause: error });
    }
  }
}
```

Note: `inWork` distinguishes "the callback threw" (rethrow as-is — could be a domain error) from "begin/commit failed" (wrap). better-sqlite3 rolls back automatically when the callback throws.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- TransactionManager`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/database/transaction
git commit -m "feat(db): callback-scoped transaction manager with savepoint nesting"
```

---

### Task 9: Metadata seed (device row, sync_metadata singleton, default settings)

**Files:**
- Create: `apps/desktop/electron/database/seed/initializeMetadata.ts`
- Test: `apps/desktop/electron/database/seed/initializeMetadata.test.ts`

**Interfaces:**
- Consumes: migrated database (Task 7), `newId`, `nowIso`, `DATABASE_VERSION`, `TableNames`.
- Produces:
  - `interface DeviceInfo { deviceName: string; platform: string; osVersion: string; appVersion: string }`
  - `interface MetadataInitResult { deviceId: string; deviceCreated: boolean }`
  - `initializeMetadata(db: SqliteDatabase, device: DeviceInfo, schemaVersion: number): MetadataInitResult` — idempotent; runs in one transaction.
  - Default settings: `theme = "system"`, `language = "en"` (JSON-encoded values).

- [ ] **Step 1: Write the failing test**

`apps/desktop/electron/database/seed/initializeMetadata.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { migrations } from '../migrations/registry';
import { TableNames } from '../schema/tableNames';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { initializeMetadata, type DeviceInfo } from './initializeMetadata';

const device: DeviceInfo = {
  deviceName: 'school-laptop-01',
  platform: 'win32',
  osVersion: '10.0.19045',
  appVersion: '1.0.0',
};

describe('initializeMetadata', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('creates the device row, singleton metadata, and default settings', () => {
    const result = initializeMetadata(test.db.raw, device, 1);
    expect(result.deviceCreated).toBe(true);
    expect(result.deviceId).toMatch(/^[0-9a-f-]{36}$/);

    const meta = test.db.raw
      .prepare(`SELECT * FROM ${TableNames.syncMetadata} WHERE id = 'singleton'`)
      .get() as { schemaVersion: number; databaseVersion: number; syncStatus: string };
    expect(meta.schemaVersion).toBe(1);
    expect(meta.databaseVersion).toBe(1);
    expect(meta.syncStatus).toBe('never');

    const settings = test.db.raw
      .prepare(`SELECT key, value FROM ${TableNames.appSettings} ORDER BY key`)
      .all() as Array<{ key: string; value: string }>;
    expect(settings.map((s) => s.key)).toEqual(['language', 'theme']);
    expect(JSON.parse(settings[1].value)).toBe('system');
  });

  it('is idempotent: keeps the same device id and does not duplicate rows', () => {
    const first = initializeMetadata(test.db.raw, device, 1);
    const second = initializeMetadata(test.db.raw, device, 1);
    expect(second.deviceCreated).toBe(false);
    expect(second.deviceId).toBe(first.deviceId);
    const devices = test.db.raw
      .prepare(`SELECT COUNT(*) AS n FROM ${TableNames.devices}`)
      .get() as { n: number };
    expect(devices.n).toBe(1);
  });

  it('updates osVersion/appVersion on the existing device when they change', () => {
    const { deviceId } = initializeMetadata(test.db.raw, device, 1);
    initializeMetadata(test.db.raw, { ...device, appVersion: '1.1.0' }, 1);
    const row = test.db.raw
      .prepare(`SELECT appVersion FROM ${TableNames.devices} WHERE id = ?`)
      .get(deviceId) as { appVersion: string };
    expect(row.appVersion).toBe('1.1.0');
  });

  it('does not overwrite user-modified settings', () => {
    initializeMetadata(test.db.raw, device, 1);
    test.db.raw
      .prepare(`UPDATE ${TableNames.appSettings} SET value = ? WHERE key = 'theme'`)
      .run(JSON.stringify('dark'));
    initializeMetadata(test.db.raw, device, 1);
    const theme = test.db.raw
      .prepare(`SELECT value FROM ${TableNames.appSettings} WHERE key = 'theme'`)
      .get() as { value: string };
    expect(JSON.parse(theme.value)).toBe('dark');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- initializeMetadata`
Expected: FAIL — cannot resolve `./initializeMetadata`.

- [ ] **Step 3: Implement initializeMetadata.ts**

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { DATABASE_VERSION } from '../constants/version';
import { newId } from '../helpers/ids';
import { nowIso } from '../helpers/time';
import { TableNames } from '../schema/tableNames';

export interface DeviceInfo {
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
}

export interface MetadataInitResult {
  deviceId: string;
  deviceCreated: boolean;
}

interface DeviceRow {
  id: string;
  deviceName: string;
  osVersion: string;
  appVersion: string;
}

/** Settings created on first run only; user changes are never overwritten. */
const DEFAULT_SETTINGS: Readonly<Record<string, unknown>> = {
  theme: 'system',
  language: 'en',
};

/**
 * Idempotent platform-metadata seed, run on every startup after migrations:
 * ensures this installation's device identity, the sync_metadata singleton
 * (with current schema/database versions), and first-run default settings.
 * Platform infrastructure only — no business data.
 */
export function initializeMetadata(
  db: SqliteDatabase,
  device: DeviceInfo,
  schemaVersion: number,
): MetadataInitResult {
  return db.transaction((): MetadataInitResult => {
    const now = nowIso();

    const existing = db
      .prepare(
        `SELECT id, deviceName, osVersion, appVersion FROM ${TableNames.devices} LIMIT 1`,
      )
      .get() as DeviceRow | undefined;

    let deviceId: string;
    let deviceCreated = false;
    if (!existing) {
      deviceId = newId();
      deviceCreated = true;
      db.prepare(
        `INSERT INTO ${TableNames.devices}
         (id, deviceName, platform, osVersion, appVersion, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(deviceId, device.deviceName, device.platform, device.osVersion, device.appVersion, now, now);
    } else {
      deviceId = existing.id;
      const changed =
        existing.deviceName !== device.deviceName ||
        existing.osVersion !== device.osVersion ||
        existing.appVersion !== device.appVersion;
      if (changed) {
        db.prepare(
          `UPDATE ${TableNames.devices}
           SET deviceName = ?, osVersion = ?, appVersion = ?, updatedAt = ?
           WHERE id = ?`,
        ).run(device.deviceName, device.osVersion, device.appVersion, now, deviceId);
      }
    }

    db.prepare(
      `INSERT INTO ${TableNames.syncMetadata}
       (id, lastSyncAt, schemaVersion, databaseVersion, syncStatus, createdAt, updatedAt)
       VALUES ('singleton', NULL, ?, ?, 'never', ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         schemaVersion = excluded.schemaVersion,
         databaseVersion = excluded.databaseVersion,
         updatedAt = excluded.updatedAt`,
    ).run(schemaVersion, DATABASE_VERSION, now, now);

    const insertSetting = db.prepare(
      `INSERT INTO ${TableNames.appSettings} (id, key, value, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (key) DO NOTHING`,
    );
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insertSetting.run(newId(), key, JSON.stringify(value), now, now);
    }

    return { deviceId, deviceCreated };
  })();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- initializeMetadata`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/database/seed
git commit -m "feat(db): idempotent metadata seed — device identity, sync singleton, default settings"
```

---

### Task 10: DatabaseManager (lifecycle orchestrator)

**Files:**
- Create: `apps/desktop/electron/database/DatabaseManager.ts`
- Test: `apps/desktop/electron/database/DatabaseManager.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `interface DatabaseLogger { info(message: string): void; warn(message: string): void; error(message: string, error?: unknown): void }`
  - `type DatabaseState = 'idle' | 'ready' | 'closed' | 'failed'`
  - `interface DatabaseManagerOptions { userDataDir: string; device: DeviceInfo; log?: DatabaseLogger }`
  - `class DatabaseManager { constructor(options); initialize(): void; shutdown(): void; get state(): DatabaseState; get deviceId(): string; get connection(): SqliteDatabase; get transactions(): TransactionManager; get paths(): DatabasePaths }`
  - Startup order: open → validate/pragmas (inside `Database.open`) → migrate → seed metadata → audit `database.started` → ready. Shutdown: audit `database.stopped` → checkpoint/optimize/close (inside `Database.close`) → closed. Both idempotent; initialize() cleans up the connection on failure (no leaks).

- [ ] **Step 1: Write the failing test**

`apps/desktop/electron/database/DatabaseManager.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from './DatabaseManager';
import { ConnectionError } from './errors/errors';
import { TableNames } from './schema/tableNames';
import type { DeviceInfo } from './seed/initializeMetadata';

const device: DeviceInfo = {
  deviceName: 'test-device',
  platform: 'win32',
  osVersion: '10.0.19045',
  appVersion: '1.0.0',
};

describe('DatabaseManager', () => {
  let userDataDir: string;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-manager-test-'));
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('initialize() runs the full lifecycle to ready', () => {
    const manager = new DatabaseManager({ userDataDir, device });
    manager.initialize();
    try {
      expect(manager.state).toBe('ready');
      expect(manager.deviceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(fs.existsSync(manager.paths.databaseFile)).toBe(true);
      const audit = manager.connection
        .prepare(`SELECT event FROM ${TableNames.auditLog} WHERE category = 'database'`)
        .all() as Array<{ event: string }>;
      expect(audit.map((a) => a.event)).toContain('database.started');
    } finally {
      manager.shutdown();
    }
  });

  it('initialize() and shutdown() are idempotent; connection access after close throws', () => {
    const manager = new DatabaseManager({ userDataDir, device });
    manager.initialize();
    manager.initialize(); // no-op
    manager.shutdown();
    manager.shutdown(); // no-op
    expect(manager.state).toBe('closed');
    expect(() => manager.connection).toThrow(ConnectionError);
  });

  it('persists across restarts: same device id, no duplicate migrations', () => {
    const first = new DatabaseManager({ userDataDir, device });
    first.initialize();
    const deviceId = first.deviceId;
    first.shutdown();

    const second = new DatabaseManager({ userDataDir, device });
    second.initialize();
    try {
      expect(second.deviceId).toBe(deviceId);
      const history = second.connection
        .prepare(`SELECT COUNT(*) AS n FROM ${TableNames.schemaMigrations}`)
        .get() as { n: number };
      expect(history.n).toBe(1);
    } finally {
      second.shutdown();
    }
  });

  it('fails to ready and leaves no open connection when the db file is corrupt', () => {
    const manager = new DatabaseManager({ userDataDir, device });
    const dbFile = manager.paths.databaseFile;
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    fs.writeFileSync(dbFile, 'garbage that is not sqlite');
    expect(() => manager.initialize()).toThrow();
    expect(manager.state).toBe('failed');
    expect(() => manager.connection).toThrow(ConnectionError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- DatabaseManager`
Expected: FAIL — cannot resolve `./DatabaseManager`.

- [ ] **Step 3: Implement DatabaseManager.ts**

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { Database } from './Database';
import { resolveDatabasePaths, type DatabasePaths } from './constants/paths';
import { ConnectionError } from './errors/errors';
import { newId } from './helpers/ids';
import { nowIso } from './helpers/time';
import { migrations } from './migrations/registry';
import { TableNames } from './schema/tableNames';
import { initializeMetadata, type DeviceInfo } from './seed/initializeMetadata';
import { MigrationService } from './services/MigrationService';
import { TransactionManager } from './transaction/TransactionManager';

export interface DatabaseLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export type DatabaseState = 'idle' | 'ready' | 'closed' | 'failed';

export interface DatabaseManagerOptions {
  userDataDir: string;
  device: DeviceInfo;
  log?: DatabaseLogger;
}

const silentLogger: DatabaseLogger = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * The single lifecycle owner and the only database entry point main.ts uses:
 *
 *   initialize(): open → validate + pragmas → migrate → seed metadata → ready
 *   shutdown():   audit stop → checkpoint WAL → optimize → close → closed
 *
 * Both are idempotent. A failed initialize() closes any partially opened
 * connection before rethrowing — a connection can never leak.
 */
export class DatabaseManager {
  readonly #options: DatabaseManagerOptions;
  readonly #paths: DatabasePaths;
  readonly #log: DatabaseLogger;
  #db: Database | null = null;
  #transactions: TransactionManager | null = null;
  #deviceId: string | null = null;
  #state: DatabaseState = 'idle';

  constructor(options: DatabaseManagerOptions) {
    this.#options = options;
    this.#paths = resolveDatabasePaths(options.userDataDir);
    this.#log = options.log ?? silentLogger;
  }

  initialize(): void {
    if (this.#state === 'ready') {
      return;
    }
    try {
      this.#log.info(`Opening database: ${this.#paths.databaseFile}`);
      this.#db = Database.open({ filePath: this.#paths.databaseFile });

      const migrationService = new MigrationService(this.#db.raw, migrations);
      const applied = migrationService.migrateToLatest();
      for (const migration of applied) {
        this.#log.info(
          `Applied migration v${migration.version} (${migration.name}) in ${migration.durationMs}ms`,
        );
      }

      const seeded = initializeMetadata(
        this.#db.raw,
        this.#options.device,
        migrationService.currentVersion(),
      );
      this.#deviceId = seeded.deviceId;
      this.#transactions = new TransactionManager(this.#db.raw);

      this.#writeAudit('database.started', {
        schemaVersion: migrationService.currentVersion(),
        migrationsApplied: applied.length,
        deviceCreated: seeded.deviceCreated,
      });
      this.#state = 'ready';
      this.#log.info('Database ready');
    } catch (error) {
      this.#state = 'failed';
      this.#log.error('Database initialization failed', error);
      this.#db?.close();
      this.#db = null;
      this.#transactions = null;
      throw error;
    }
  }

  /**
   * better-sqlite3 is synchronous, so no cross-tick transaction can be
   * pending here; "complete pending transactions" is guaranteed by the
   * driver's execution model. Close still checkpoints + optimizes.
   */
  shutdown(): void {
    if (this.#db === null || !this.#db.isOpen) {
      this.#state = this.#state === 'idle' ? 'idle' : 'closed';
      return;
    }
    try {
      this.#writeAudit('database.stopped', null);
    } catch (error) {
      this.#log.warn(`Could not write shutdown audit entry: ${String(error)}`);
    }
    this.#log.info('Closing database');
    this.#db.close();
    this.#db = null;
    this.#transactions = null;
    this.#state = 'closed';
  }

  get state(): DatabaseState {
    return this.#state;
  }

  get paths(): DatabasePaths {
    return this.#paths;
  }

  get deviceId(): string {
    if (this.#deviceId === null) {
      throw new ConnectionError('Database is not initialized');
    }
    return this.#deviceId;
  }

  get connection(): SqliteDatabase {
    if (this.#db === null || this.#state !== 'ready') {
      throw new ConnectionError('Database is not ready');
    }
    return this.#db.raw;
  }

  get transactions(): TransactionManager {
    if (this.#transactions === null || this.#state !== 'ready') {
      throw new ConnectionError('Database is not ready');
    }
    return this.#transactions;
  }

  #writeAudit(event: string, details: object | null): void {
    this.#db?.raw
      .prepare(
        `INSERT INTO ${TableNames.auditLog} (id, category, event, details, createdAt)
         VALUES (?, 'database', ?, ?, ?)`,
      )
      .run(newId(), event, details === null ? null : JSON.stringify(details), nowIso());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- DatabaseManager`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/database/DatabaseManager.ts apps/desktop/electron/database/DatabaseManager.test.ts
git commit -m "feat(db): DatabaseManager lifecycle orchestrator with audit trail and leak-safe failure path"
```

---

### Task 11: BackupService + restore

**Files:**
- Create: `apps/desktop/electron/database/backup/BackupService.ts`
- Create: `apps/desktop/electron/database/backup/backupFileName.ts`
- Test: `apps/desktop/electron/database/backup/BackupService.test.ts`
- Test: `apps/desktop/electron/database/backup/backupFileName.test.ts`

(Backup gets its own `backup/` folder per the phase spec's suggested structure.)

**Interfaces:**
- Consumes: `SqliteDatabase`, `BackupError`, `nowIso`.
- Produces:
  - `buildBackupFileName(date: Date, label?: string): string` — `nemis-YYYY-MM-DDTHH-mm-ss[-label].db`, label sanitized to `[a-z0-9-]`.
  - `interface BackupResult { filePath: string; sizeBytes: number; createdAt: string }`
  - `class BackupService { constructor(db: SqliteDatabase, backupsDirectory: string); createBackup(label?: string): Promise<BackupResult>; listBackups(): string[]; validateBackup(filePath: string): boolean }` — uses SQLite's online backup API (works while WAL connection is live); every backup is validated with `quick_check` before being reported.
  - `restoreBackup(sourceFile: string, databaseFile: string): void` — standalone function taking plain paths because the main connection MUST be closed first (documented contract; DatabaseManager.shutdown() → restoreBackup() → initialize() is the future orchestration).

- [ ] **Step 1: Write the failing tests**

`apps/desktop/electron/database/backup/backupFileName.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildBackupFileName } from './backupFileName';

describe('buildBackupFileName', () => {
  const date = new Date('2026-07-15T09:30:05Z');

  it('formats a sortable UTC timestamp', () => {
    expect(buildBackupFileName(date)).toBe('nemis-2026-07-15T09-30-05.db');
  });

  it('appends a sanitized label', () => {
    expect(buildBackupFileName(date, 'Before Upgrade!')).toBe(
      'nemis-2026-07-15T09-30-05-before-upgrade.db',
    );
  });
});
```

`apps/desktop/electron/database/backup/BackupService.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { BackupError } from '../errors/errors';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { BackupService, restoreBackup } from './BackupService';

describe('BackupService', () => {
  let test: TestDatabase;
  let backupsDir: string;
  let service: BackupService;

  beforeEach(() => {
    test = createTestDatabase();
    test.db.raw.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)");
    test.db.raw.prepare("INSERT INTO notes VALUES ('1', 'hello')").run();
    backupsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-backups-'));
    service = new BackupService(test.db.raw, backupsDir);
  });

  afterEach(() => {
    test.cleanup();
    fs.rmSync(backupsDir, { recursive: true, force: true });
  });

  it('creates a validated backup while the source connection is open', async () => {
    const result = await service.createBackup('unit');
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(service.validateBackup(result.filePath)).toBe(true);
    const copy = new BetterSqlite3(result.filePath, { readonly: true });
    const row = copy.prepare('SELECT body FROM notes WHERE id = ?').get('1') as { body: string };
    copy.close();
    expect(row.body).toBe('hello');
  });

  it('lists backups newest-first', async () => {
    await service.createBackup('a');
    await service.createBackup('b');
    const listed = service.listBackups();
    expect(listed).toHaveLength(2);
    // Names embed a sortable timestamp; same-second backups differ by label,
    // and descending name order still puts 'b' first.
    expect(listed[0].endsWith('-b.db')).toBe(true);
    expect(listed[1].endsWith('-a.db')).toBe(true);
  });

  it('validateBackup rejects a non-database file', () => {
    const bogus = path.join(backupsDir, 'bogus.db');
    fs.writeFileSync(bogus, 'not a database');
    expect(service.validateBackup(bogus)).toBe(false);
  });

  it('restoreBackup replaces the target and rejects invalid sources', async () => {
    const backup = await service.createBackup('restore-me');
    test.db.raw.prepare("UPDATE notes SET body = 'changed' WHERE id = '1'").run();
    test.db.close(); // contract: connection must be closed before restore

    restoreBackup(backup.filePath, test.filePath);
    const restored = new BetterSqlite3(test.filePath, { readonly: true });
    const row = restored.prepare("SELECT body FROM notes WHERE id = '1'").get() as {
      body: string;
    };
    restored.close();
    expect(row.body).toBe('hello');

    const bogus = path.join(backupsDir, 'bogus.db');
    fs.writeFileSync(bogus, 'junk');
    expect(() => restoreBackup(bogus, test.filePath)).toThrow(BackupError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- backup`
Expected: FAIL — cannot resolve `./backupFileName` / `./BackupService`.

- [ ] **Step 3: Implement backupFileName.ts**

```ts
/** nemis-YYYY-MM-DDTHH-mm-ss[-label].db — UTC, lexicographically sortable. */
export function buildBackupFileName(date: Date, label?: string): string {
  const stamp = date.toISOString().slice(0, 19).replaceAll(':', '-');
  const suffix = label
    ? `-${label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')}`
    : '';
  return `nemis-${stamp}${suffix}.db`;
}
```

- [ ] **Step 4: Implement BackupService.ts**

```ts
import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { BackupError } from '../errors/errors';
import { nowIso } from '../helpers/time';
import { buildBackupFileName } from './backupFileName';

export interface BackupResult {
  filePath: string;
  sizeBytes: number;
  createdAt: string;
}

function isValidSqliteFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  let raw: SqliteDatabase | null = null;
  try {
    raw = new BetterSqlite3(filePath, { readonly: true });
    return (raw.pragma('quick_check', { simple: true }) as string) === 'ok';
  } catch {
    return false;
  } finally {
    raw?.close();
  }
}

/**
 * Online backups via SQLite's backup API: safe while the app is running
 * (WAL readers/writers continue). Every backup is quick_check-validated
 * before being reported; a backup that fails validation is deleted.
 * Infrastructure only — scheduling/retention/UI arrive in later phases.
 */
export class BackupService {
  readonly #db: SqliteDatabase;
  readonly #backupsDirectory: string;

  constructor(db: SqliteDatabase, backupsDirectory: string) {
    this.#db = db;
    this.#backupsDirectory = backupsDirectory;
  }

  async createBackup(label?: string): Promise<BackupResult> {
    fs.mkdirSync(this.#backupsDirectory, { recursive: true });
    const filePath = path.join(this.#backupsDirectory, buildBackupFileName(new Date(), label));
    try {
      await this.#db.backup(filePath);
    } catch (error) {
      fs.rmSync(filePath, { force: true });
      throw new BackupError(`Backup to ${filePath} failed`, { cause: error });
    }
    if (!isValidSqliteFile(filePath)) {
      fs.rmSync(filePath, { force: true });
      throw new BackupError(`Backup at ${filePath} failed validation and was removed`);
    }
    return { filePath, sizeBytes: fs.statSync(filePath).size, createdAt: nowIso() };
  }

  /** Full paths, newest first (file names embed a sortable UTC timestamp). */
  listBackups(): string[] {
    if (!fs.existsSync(this.#backupsDirectory)) {
      return [];
    }
    return fs
      .readdirSync(this.#backupsDirectory)
      .filter((name) => name.startsWith('nemis-') && name.endsWith('.db'))
      .sort()
      .reverse()
      .map((name) => path.join(this.#backupsDirectory, name));
  }

  validateBackup(filePath: string): boolean {
    return isValidSqliteFile(filePath);
  }
}

/**
 * Replaces the live database file with a validated backup.
 * CONTRACT: the main connection must be CLOSED before calling
 * (DatabaseManager.shutdown() → restoreBackup() → initialize()).
 * Copies to a temp sibling then renames, and removes stale -wal/-shm files
 * so SQLite cannot pair the restored file with an old journal.
 */
export function restoreBackup(sourceFile: string, databaseFile: string): void {
  if (!isValidSqliteFile(sourceFile)) {
    throw new BackupError(`Restore source is not a valid database: ${sourceFile}`);
  }
  const tempFile = `${databaseFile}.restore-tmp`;
  try {
    fs.copyFileSync(sourceFile, tempFile);
    fs.renameSync(tempFile, databaseFile);
    fs.rmSync(`${databaseFile}-wal`, { force: true });
    fs.rmSync(`${databaseFile}-shm`, { force: true });
  } catch (error) {
    fs.rmSync(tempFile, { force: true });
    throw new BackupError(`Restore to ${databaseFile} failed`, { cause: error });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- backup`
Expected: PASS (6 tests across both files).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/database/backup
git commit -m "feat(db): online backup with validation, newest-first listing, safe restore"
```

---

### Task 12: DatabaseHealthService

**Files:**
- Create: `apps/desktop/electron/database/services/DatabaseHealthService.ts`
- Test: `apps/desktop/electron/database/services/DatabaseHealthService.test.ts`

**Interfaces:**
- Consumes: `SqliteDatabase`.
- Produces:
  - `interface HealthReport { ok: boolean; quickCheck: string; foreignKeyViolations: number; pageCount: number; pageSize: number; databaseSizeBytes: number; walSizeBytes: number; schemaVersion: number; checkedAt: string }`
  - `class DatabaseHealthService { constructor(db: SqliteDatabase, databaseFile: string); check(): HealthReport; fullIntegrityCheck(): { ok: boolean; errors: string[] } }` — `check()` is cheap (startup/diagnostics); `fullIntegrityCheck()` is thorough (support tooling, pre-backup).

- [ ] **Step 1: Write the failing test**

`apps/desktop/electron/database/services/DatabaseHealthService.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from './MigrationService';
import { migrations } from '../migrations/registry';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { DatabaseHealthService } from './DatabaseHealthService';

describe('DatabaseHealthService', () => {
  let test: TestDatabase;
  let service: DatabaseHealthService;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
    service = new DatabaseHealthService(test.db.raw, test.filePath);
  });

  afterEach(() => {
    test.cleanup();
  });

  it('reports a healthy database', () => {
    const report = service.check();
    expect(report.ok).toBe(true);
    expect(report.quickCheck).toBe('ok');
    expect(report.foreignKeyViolations).toBe(0);
    expect(report.pageCount).toBeGreaterThan(0);
    expect(report.pageSize).toBeGreaterThan(0);
    expect(report.databaseSizeBytes).toBeGreaterThan(0);
    expect(report.schemaVersion).toBe(1);
  });

  it('full integrity check passes on a healthy database', () => {
    const result = service.fullIntegrityCheck();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('counts foreign key violations', () => {
    test.db.raw.pragma('foreign_keys = OFF');
    test.db.raw
      .prepare(
        `INSERT INTO sync_errors (id, operationId, message, createdAt)
         VALUES ('e1', 'missing-op', 'orphan', '2026-01-01T00:00:00Z')`,
      )
      .run();
    test.db.raw.pragma('foreign_keys = ON');
    const report = service.check();
    expect(report.foreignKeyViolations).toBeGreaterThan(0);
    expect(report.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- DatabaseHealthService`
Expected: FAIL — cannot resolve `./DatabaseHealthService`.

- [ ] **Step 3: Implement DatabaseHealthService.ts**

```ts
import fs from 'node:fs';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { nowIso } from '../helpers/time';

export interface HealthReport {
  ok: boolean;
  quickCheck: string;
  foreignKeyViolations: number;
  pageCount: number;
  pageSize: number;
  databaseSizeBytes: number;
  walSizeBytes: number;
  schemaVersion: number;
  checkedAt: string;
}

function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Read-only diagnostics. check() is cheap enough for startup and future
 * status surfaces; fullIntegrityCheck() walks every page — reserve it for
 * support tooling and pre-restore validation.
 */
export class DatabaseHealthService {
  readonly #db: SqliteDatabase;
  readonly #databaseFile: string;

  constructor(db: SqliteDatabase, databaseFile: string) {
    this.#db = db;
    this.#databaseFile = databaseFile;
  }

  check(): HealthReport {
    const quickCheck = this.#db.pragma('quick_check', { simple: true }) as string;
    const foreignKeyViolations = (this.#db.pragma('foreign_key_check') as unknown[]).length;
    const pageCount = this.#db.pragma('page_count', { simple: true }) as number;
    const pageSize = this.#db.pragma('page_size', { simple: true }) as number;
    const schemaVersion = this.#db.pragma('user_version', { simple: true }) as number;
    return {
      ok: quickCheck === 'ok' && foreignKeyViolations === 0,
      quickCheck,
      foreignKeyViolations,
      pageCount,
      pageSize,
      databaseSizeBytes: fileSize(this.#databaseFile),
      walSizeBytes: fileSize(`${this.#databaseFile}-wal`),
      schemaVersion,
      checkedAt: nowIso(),
    };
  }

  fullIntegrityCheck(): { ok: boolean; errors: string[] } {
    const rows = this.#db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const errors = rows.map((row) => row.integrity_check).filter((line) => line !== 'ok');
    return { ok: errors.length === 0, errors };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- DatabaseHealthService`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/database/services/DatabaseHealthService.ts apps/desktop/electron/database/services/DatabaseHealthService.test.ts
git commit -m "feat(db): health service — quick check, fk violations, size stats, full integrity check"
```

---

### Task 13: Wire the platform into main.ts

**Files:**
- Modify: `apps/desktop/electron/main/main.ts`

**Interfaces:**
- Consumes: `DatabaseManager`, `DeviceInfo`, existing `logger`/`loadConfig`.
- Produces: database initialized after `initLogger` and before any window; clean shutdown on `will-quit`; fatal DB failure → error dialog + quit. No IPC exposure (no repositories this phase).

- [ ] **Step 1: Apply the edits**

In `apps/desktop/electron/main/main.ts`:

Imports — add:

```ts
import os from 'node:os';
import { app, BrowserWindow, dialog } from 'electron';
import { DatabaseManager } from '@app/database/DatabaseManager';
```

(`dialog` joins the existing electron import; keep one import line.)

Inside `bootstrap()`, next to `let mainWindow`:

```ts
  let databaseManager: DatabaseManager | null = null;
```

Inside `.then(() => { ... })`, immediately after `logger.info(...)`:

```ts
      databaseManager = new DatabaseManager({
        userDataDir: app.getPath('userData'),
        device: {
          deviceName: os.hostname(),
          platform: process.platform,
          osVersion: os.release(),
          appVersion: app.getVersion(),
        },
        log: {
          info: (message) => logger.info(message),
          warn: (message) => logger.warn(message),
          error: (message, error) => logger.error(message, error),
        },
      });
      databaseManager.initialize();
```

Extend the existing `.catch` to surface database failures to the user before quitting:

```ts
    .catch((error: unknown) => {
      logger.error('Fatal startup failure:', error);
      dialog.showErrorBox(
        'NEMIS Desktop',
        'The application could not start because the local database failed to open. ' +
          'Please contact support and provide the application logs.',
      );
      app.quit();
    });
```

Add the shutdown hook beside `window-all-closed`:

```ts
  app.on('will-quit', () => {
    try {
      databaseManager?.shutdown();
    } catch (error) {
      logger.error('Database shutdown failed:', error);
    }
  });
```

- [ ] **Step 2: Verify gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass.

- [ ] **Step 3: Manual dev smoke test**

Run: `pnpm dev` (or `pnpm --filter @nemis-desktop/app start` for the packaged-renderer path). Wait for the window, then quit it.
Expected in the console: `Opening database: …\nemis.db`, `Applied migration v1 (create-platform-tables) …`, `Database ready`, and `Closing database` on quit. Verify the file exists at `%APPDATA%\nemis-desktop\database\nemis.db` (dev userData dir may be `%APPDATA%\Electron` when unpackaged — check the logged path).
Note: `pnpm start` rebuilds better-sqlite3 for Electron — run `pnpm rebuild:node` before the next `pnpm test`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron/main/main.ts
git commit -m "feat(app): initialize database platform on startup, close cleanly on will-quit"
```

---

### Task 14: Documentation

**Files:**
- Create: `docs/database.md`
- Modify: `docs/conventions.md` (folder-responsibilities table: add the database row)

- [ ] **Step 1: Write docs/database.md**

Full content:

```markdown
# NEMIS Desktop — Local Data Platform

SQLite is the local working database only. PostgreSQL remains the national
authoritative database; nothing here is a source of truth.

## Architecture

    main.ts
      └── DatabaseManager            lifecycle orchestrator (sole entry point)
            ├── Database             one better-sqlite3 connection: open/validate/pragmas/close
            ├── MigrationService     versioned, transactional migrations + history
            ├── initializeMetadata   idempotent seed: device row, sync singleton, defaults
            ├── TransactionManager   callback-scoped transactions (savepoint nesting)
            ├── BackupService        online backup / validate / restore (infrastructure only)
            └── DatabaseHealthService quick_check, fk violations, sizes, integrity_check

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
- Backups:  `<userData>/database/backups/nemis-<UTC-timestamp>[-label].db`

## PRAGMAs (see constants/pragmas.ts for full rationale)

| PRAGMA | Value | Why |
| --- | --- | --- |
| journal_mode | WAL | non-blocking reads, crash safety, online backup |
| synchronous | NORMAL | safe with WAL; FULL doubles fsync for no integrity gain |
| foreign_keys | ON | per-connection; enforced and verified at open |
| busy_timeout | 5000 ms | wait, don't fail, on rare cross-process contention |
| cache_size | -64000 (64 MiB) | desktop RAM is cheap; largest query-speed lever |
| temp_store | MEMORY | temp b-trees in RAM |
| wal_autocheckpoint | 1000 pages | default, made explicit |
| journal_size_limit | 64 MiB | caps WAL growth after large transactions |

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
automatically. Errors thrown by `work` propagate unchanged after rollback;
driver failures surface as the DatabaseError taxonomy.

## Errors

`DatabaseError` (base, with `code`) → `ConnectionError`, `MigrationError`,
`TransactionError`, `ConstraintError`, `IntegrityError`, `BackupError`.
Raw SQLite errors never leave the layer: `wrapSqliteError` maps result codes
and keeps the original on `cause`. Nothing database-shaped crosses IPC yet.

## Backup & restore

Online backup via SQLite's backup API (safe while the app runs), validated
with `quick_check` before being reported (invalid output is deleted).
Restore contract: close the connection first —
`DatabaseManager.shutdown()` → `restoreBackup(source, target)` →
`initialize()`; restore copies then renames, and removes stale `-wal`/`-shm`.
Scheduling, retention, and UI are future phases.

## Testing

- `pnpm test` (Vitest, colocated `*.test.ts`, relative imports inside the
  database layer).
- `testing/createTestDatabase.ts` gives every test an isolated temp-file DB.
- ABI note: `pnpm start`/`pnpm make` rebuild better-sqlite3 for Electron's
  ABI; run `pnpm rebuild:node` before `pnpm test` after any Electron run
  (the test factory detects the mismatch and prints this instruction).

## Future extension (Phase 3+)

- Repositories consume `DatabaseManager.connection` + `.transactions`; they
  must not construct connections.
- The sync engine builds on `sync_queue`/`sync_errors`/`sync_metadata` as-is.
- SQLCipher (preferred eventually): swap the driver behind `Database.open`,
  bump `DATABASE_VERSION`, add a migration path — the taxonomy and lifecycle
  are already encryption-agnostic.
```

- [ ] **Step 2: Add the folder-responsibilities row**

In `docs/conventions.md`, add to the folder table after the `services/` row:

```markdown
| `apps/desktop/electron/database/` | Local SQLite platform (lifecycle, migrations, backup) — see docs/database.md |
```

- [ ] **Step 3: Verify formatting and commit**

Run: `pnpm format:check` (run `pnpm format` if it complains about the new md files).

```bash
git add docs/database.md docs/conventions.md
git commit -m "docs(db): local data platform architecture, pragmas, migration/backup strategy"
```

---

### Task 15: Full verification gate + packaged-app proof + phase report

**Files:**
- Create: `docs/phase-2-report-2026-07-15.md`

- [ ] **Step 1: Run the complete gate**

```bash
pnpm rebuild:node
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm --filter @nemis-desktop/app build:renderer
```

Expected: everything passes; test count = 28 pre-existing + ~33 new.

- [ ] **Step 2: Prove the native module in a packaged build**

```bash
pnpm make
```

Expected: build succeeds (script self-heals the Squirrel 7z gap). Then launch the packaged exe from `apps/desktop/out/nemis-desktop-win32-x64/nemis-desktop.exe`, let the window appear, and quit. Verify:
- `%APPDATA%\nemis-desktop\database\nemis.db` exists.
- electron-log file (`%APPDATA%\nemis-desktop\logs\main.log`) contains `Database ready` and `Closing database`.
- Confirm `better_sqlite3.node` was auto-unpacked: `apps/desktop/out/nemis-desktop-win32-x64/resources/app.asar.unpacked/node_modules/better-sqlite3/` exists.

(If headless verification is needed, use the Phase-1 CDP pattern: launch the exe with `--remote-debugging-port` and drive `Runtime.evaluate`; DB proof via the log file is sufficient here since nothing is exposed to the renderer.)

- [ ] **Step 3: Write the phase report**

Create `docs/phase-2-report-2026-07-15.md` covering the 11 required deliverables: final folder structure; architecture diagram (reuse docs/database.md tree); every PRAGMA (table from docs/database.md); every table + every index (from migration 001); migration strategy; transaction strategy (incl. the no-exposed-begin/commit decision); error strategy; backup strategy; remaining technical debt (at minimum: Node/Electron ABI juggling for tests; no CI running the gate; rollback untested against real data volumes; backups unscheduled/unretained; SQLCipher deferred); recommendations before Phase 3 (stand up CI per the architecture review; decide SQLCipher timing before business data lands; define repository interface conventions on top of DatabaseManager; first parameterized IPC endpoint checklist from the Phase-1 review).

- [ ] **Step 4: Commit**

```bash
git add docs/phase-2-report-2026-07-15.md
git commit -m "docs: Phase 2 report — deliverables, debt register, Phase 3 recommendations"
```

---

## Acceptance-criteria coverage map

| Criterion | Where proven |
| --- | --- |
| Database opens successfully | Task 5 tests; Task 13/15 smoke |
| Foreign keys enabled | Task 5 test (`foreign_keys = 1`, verified at open) |
| WAL mode enabled | Task 5 test (`journal_mode = wal`) |
| Migration system works | Task 6 tests |
| Migration history recorded | Task 6 (`schema_migrations` + history assertions) |
| Database closes cleanly | Task 5 idempotent close; Task 10 shutdown; Task 15 log proof |
| Transactions work | Task 8 tests |
| Native module works packaged | Task 15 (`pnpm make` + unpacked `.node` + log proof) |
| No connection leaks | Task 10 failure-path test; callback-scoped transactions |
| TypeScript passes | every task gate; Task 15 |
| ESLint passes | every task gate; Task 15 |
| Production build succeeds | Task 15 (`pnpm make`) |
