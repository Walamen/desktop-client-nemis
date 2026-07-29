# Sync Engine Hardening & Student CRUD Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four verified gaps in the already-built offline-sync engine (dead network detection, retry-forever with no backoff/dead-letter, always-full snapshot pulls, no shutdown flush) and verify the already-built student CRUD end-to-end, so offline student enrollment reliably reaches the national server the instant connectivity returns.

**Architecture:** Two repos. `desktop-client-nemis` (primary): a new `NetworkMonitor` in the Electron main process drives both an instant reconnect-sync trigger and the (currently dead) `ConnectivityStore`; `DesktopSyncWorker`'s failure path gains exponential backoff + a dead-letter state, surfaced through the existing conflicts UI; the sync pull step becomes delta-aware. `Nemis/apps/Server` (one endpoint): `GET /desktop/provisioning/snapshot` gains an optional `since` filter, mechanically applied per-query using each Prisma model's own timestamp field.

**Tech Stack:** TypeScript, Electron (main process: `powerMonitor`, native `fetch`), better-sqlite3, Vitest, NestJS, Prisma, Zod, Jest.

## Global Constraints

- No new npm/pnpm dependencies in either repo (native `fetch`, Electron `powerMonitor`, `setInterval`, `node:crypto` only) — confirmed in the design spec.
- No hard delete for students — soft-delete (Archive/Restore via `isActive`) remains the only removal path (explicit user decision).
- Deletion is out of scope for delta sync — no tombstone tracking; the periodic full resync (§8 of the spec) is the safety net for drift.
- Never touch backend business logic beyond the one `since`-filter change described here (per `Nemis/CLAUDE.md`: simplicity first, surgical changes, ask before assuming).
- Follow this repo's existing patterns exactly: repository methods wrap work in `this.query('name', () => ...)`/`this.executeTransaction(...)`; IPC endpoints are `invoke`/`handle` request-response (no push events) — reuse existing polled channels (`sync:get-status`, `sync:list-conflicts`) rather than inventing new ones.
- Timestamps throughout are ISO-8601 UTC strings (`nowIso()` on desktop, `Date#toISOString()` on backend) — this is why Zod's default `z.string().datetime()` (UTC-only, no offset) is sufficient for the backend schema change; the desktop client never sends offset-bearing timestamps.
- SQLite migrations are append-only — never edit a shipped migration; the next version number is `013`.

---

## Task 1: Migration 013 — retry/backoff & delta columns

**Files:**
- Create: `apps/desktop/electron/database/migrations/013-add-sync-retry-and-delta-columns.ts`
- Create: `apps/desktop/electron/database/migrations/013-add-sync-retry-and-delta-columns.test.ts`
- Modify: `apps/desktop/electron/database/migrations/registry.ts`

**Interfaces:**
- Produces: `sync_queue.nextAttemptAt TEXT` (nullable), `sync_queue.deadLetter INTEGER NOT NULL DEFAULT 0`, `sync_metadata.lastDeltaAt TEXT` (nullable), `sync_metadata.lastFullResyncAt TEXT` (nullable). All later tasks read/write these via the columns' exact names.

- [ ] **Step 1: Write the failing migration test**

```ts
// apps/desktop/electron/database/migrations/013-add-sync-retry-and-delta-columns.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../DatabaseManager';

describe('sync retry and delta columns migration', () => {
  let directory: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-sync-delta-'));
    manager = new DatabaseManager({
      userDataDir: directory,
      device: { deviceName: 'Test PC', platform: 'win32', osVersion: '11', appVersion: '1.0.0' },
    });
    manager.initialize();
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('adds nextAttemptAt and deadLetter to sync_queue with a safe default', () => {
    manager.connection.prepare(`
      INSERT INTO sync_queue (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt)
      VALUES ('q1','students','s1','create',NULL,0,'pending',?,?)
    `).run('2026-07-29T00:00:00.000Z', '2026-07-29T00:00:00.000Z');
    const row = manager.connection
      .prepare(`SELECT nextAttemptAt, deadLetter FROM sync_queue WHERE id='q1'`)
      .get() as { nextAttemptAt: string | null; deadLetter: number };
    expect(row.nextAttemptAt).toBeNull();
    expect(row.deadLetter).toBe(0);
  });

  it('adds lastDeltaAt and lastFullResyncAt to sync_metadata', () => {
    const columns = manager.connection.prepare(`PRAGMA table_info(sync_metadata)`).all() as Array<{
      name: string;
    }>;
    const names = columns.map((c) => c.name);
    expect(names).toContain('lastDeltaAt');
    expect(names).toContain('lastFullResyncAt');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nemis-desktop/desktop test -- database/migrations/013-add-sync-retry-and-delta-columns.test.ts`
Expected: FAIL — `sync_queue` has no column named `nextAttemptAt` (SqliteError), since migration `013` doesn't exist yet.

- [ ] **Step 3: Write the migration**

```ts
// apps/desktop/electron/database/migrations/013-add-sync-retry-and-delta-columns.ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

export const addSyncRetryAndDeltaColumns: Migration = {
  version: 13,
  name: 'add-sync-retry-and-delta-columns',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE sync_queue ADD COLUMN nextAttemptAt TEXT;
      ALTER TABLE sync_queue ADD COLUMN deadLetter INTEGER NOT NULL DEFAULT 0 CHECK (deadLetter IN (0, 1));
      ALTER TABLE sync_metadata ADD COLUMN lastDeltaAt TEXT;
      ALTER TABLE sync_metadata ADD COLUMN lastFullResyncAt TEXT;
    `);
  },
};
```

- [ ] **Step 4: Register the migration**

```ts
// apps/desktop/electron/database/migrations/registry.ts
import { createTeacherLearningTables } from './012-create-teacher-learning-tables';
import { addSyncRetryAndDeltaColumns } from './013-add-sync-retry-and-delta-columns';

export const migrations: readonly Migration[] = [
  createPlatformTables,
  createBusinessTables,
  createAcademicFoundationTables,
  createStudentManagementTables,
  createTeacherManagementTables,
  createProvisioningMetadata,
  createTimetableManagementTables,
  removeLegacyLocalUser,
  addProvisioningScope,
  createSyncOutbox,
  createSchoolAdminModules,
  createTeacherLearningTables,
  addSyncRetryAndDeltaColumns,
];
```

(Only the import and the final array entry are new — every other line is unchanged from the current file.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @nemis-desktop/desktop test -- database/migrations/013-add-sync-retry-and-delta-columns.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Confirm the existing outbox triggers still insert cleanly**

Run: `pnpm --filter @nemis-desktop/desktop test -- database/migrations/010-create-sync-outbox.test.ts`
Expected: PASS unchanged — the trigger's explicit `INSERT INTO sync_queue (id, entityType, ...)` column list doesn't name `deadLetter`/`nextAttemptAt`, so SQLite fills them from the column default (`0`) / `NULL` automatically.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/database/migrations/013-add-sync-retry-and-delta-columns.ts apps/desktop/electron/database/migrations/013-add-sync-retry-and-delta-columns.test.ts apps/desktop/electron/database/migrations/registry.ts
git commit -m "feat(sync): add retry-backoff and delta-tracking columns (migration 013)"
```

---

## Task 2: Sync queue repository — nextAttemptAt/deadLetter model + scheduleRetry + backoff-aware claiming

**Files:**
- Modify: `apps/desktop/electron/data/models/platform.ts`
- Modify: `apps/desktop/electron/data/mappers/platformMappers.ts`
- Modify: `apps/desktop/electron/data/repositories/interfaces/ISyncQueueRepository.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.test.ts`

**Interfaces:**
- Consumes: migration 013 columns (Task 1).
- Produces: `SyncQueueItem.nextAttemptAt: string | null`, `SyncQueueItem.deadLetter: boolean`; `ISyncQueueRepository.scheduleRetry(id: string, nextAttemptAt: string): SyncQueueItem`; `claimBatch`/`nextBatch` now only return items whose `nextAttemptAt` is null or due. Task 3 (`SyncQueueService`) and Task 4 (`DesktopSyncWorker`) consume `scheduleRetry`.

- [ ] **Step 1: Write the failing repository tests**

Add to the end of `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.test.ts` (inside the existing `describe` block, after the last `it`):

```ts
  it('scheduleRetry keeps status pending, increments retryCount, and sets nextAttemptAt', () => {
    const item = repo.enqueue(op('e1'));
    const rescheduled = repo.scheduleRetry(item.id, '2026-07-29T00:05:00.000Z');
    expect(rescheduled.status).toBe('pending');
    expect(rescheduled.retryCount).toBe(1);
    expect(rescheduled.nextAttemptAt).toBe('2026-07-29T00:05:00.000Z');
  });

  it('claimBatch skips pending items whose nextAttemptAt is in the future', () => {
    const first = repo.enqueue(op('e1'));
    repo.enqueue(op('e2'));
    repo.scheduleRetry(first.id, '2026-08-01T00:00:00.000Z');

    const claimed = repo.claimBatch(10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.entityId).toBe('e2');
  });

  it('claimBatch includes pending items whose nextAttemptAt has already elapsed', () => {
    vi.setSystemTime(new Date('2026-07-29T00:10:00.000Z'));
    const item = repo.enqueue(op('e1'));
    repo.scheduleRetry(item.id, '2026-07-29T00:00:00.000Z');

    const claimed = repo.claimBatch(10);

    expect(claimed.map((row) => row.id)).toEqual([item.id]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nemis-desktop/desktop test -- data/repositories/sqlite/SqliteSyncQueueRepository.test.ts`
Expected: FAIL — `repo.scheduleRetry is not a function`.

- [ ] **Step 3: Extend the domain model**

```ts
// apps/desktop/electron/data/models/platform.ts
// SyncQueueItem gains two fields (insert after `retryCount: number;`):
export interface SyncQueueItem {
  id: string;
  entityType: string;
  entityId: string;
  operationType: SyncOperationType;
  payload: unknown;
  retryCount: number;
  nextAttemptAt: string | null;
  deadLetter: boolean;
  status: SyncQueueStatus;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Extend the row type and mapper**

```ts
// apps/desktop/electron/data/mappers/platformMappers.ts
export type SyncQueueRow = {
  id: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: string | null;
  retryCount: number;
  nextAttemptAt: string | null;
  deadLetter: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export const syncQueueMapper: RowMapper<SyncQueueRow, SyncQueueItem> = {
  toModel: (row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    operationType: row.operationType as SyncOperationType,
    payload: parseJsonColumn(row.payload, `sync_queue.payload (${row.id})`),
    retryCount: row.retryCount,
    nextAttemptAt: row.nextAttemptAt,
    deadLetter: row.deadLetter === 1,
    status: row.status as SyncQueueStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }),
};
```

- [ ] **Step 5: Add `scheduleRetry` to the interface**

```ts
// apps/desktop/electron/data/repositories/interfaces/ISyncQueueRepository.ts
// Add below the existing markFailed doc/signature:
  /**
   * Transient-failure path: increments retryCount, keeps status 'pending'
   * so claimBatch retries it once nextAttemptAt elapses. Distinct from
   * markFailed, which is the terminal ('failed'/dead-letter) transition.
   */
  scheduleRetry(id: string, nextAttemptAt: string): SyncQueueItem;
```

- [ ] **Step 6: Implement in `SqliteSyncQueueRepository`**

```ts
// apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts
// SYNC_QUEUE_COLUMNS gains the two new columns:
const SYNC_QUEUE_COLUMNS = [
  'id',
  'entityType',
  'entityId',
  'operationType',
  'payload',
  'retryCount',
  'nextAttemptAt',
  'deadLetter',
  'status',
  'createdAt',
  'updatedAt',
] as const;
```

```ts
// enqueue() must supply the two new columns explicitly (insertRow requires
// the full row shape):
  enqueue(input: EnqueueSyncOperationInput): SyncQueueItem {
    this.validate(validateEnqueue, input);
    const now = nowIso();
    return this.insertRow({
      id: newId(),
      entityType: input.entityType,
      entityId: input.entityId,
      operationType: input.operationType,
      payload: serializeJsonColumn(input.payload, 'sync_queue.payload'),
      retryCount: 0,
      nextAttemptAt: null,
      deadLetter: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }
```

```ts
// nextBatch() and claimBatch() both need the "due now" predicate. Add the
// import at the top of the file:
import { and, eq, inList, lt, or, isNull, lte } from '../../queries/predicates';
```

```ts
  nextBatch(limit: number): SyncQueueItem[] {
    return this.selectWhere(
      'nextBatch',
      and(eq('status', 'pending'), or(isNull('nextAttemptAt'), lte('nextAttemptAt', nowIso()))),
      {
        orderBy: [
          { column: 'createdAt', direction: 'asc' },
          { column: 'id', direction: 'asc' },
        ],
        page: { limit, offset: 0 },
      },
    );
  }
```

(`claimBatch` calls `this.nextBatch(limit)` internally and needs no separate change — it already inherits the new predicate.)

```ts
  scheduleRetry(id: string, nextAttemptAt: string): SyncQueueItem {
    return this.executeTransaction(() => {
      const current = this.findByIdOrThrow(id);
      return this.updateById(id, {
        status: 'pending',
        retryCount: current.retryCount + 1,
        nextAttemptAt,
        updatedAt: nowIso(),
      });
    });
  }
```

(Place `scheduleRetry` directly below `markFailed` in the class body, matching the interface's declaration order.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @nemis-desktop/desktop test -- data/repositories/sqlite/SqliteSyncQueueRepository.test.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 8: Run the full data-layer test suite to catch any other consumer of `SyncQueueRow`/`SyncQueueItem`**

Run: `pnpm --filter @nemis-desktop/desktop test -- data/`
Expected: PASS. If any test constructs a `SyncQueueRow`/`SyncQueueItem` object literal directly (rather than via `repo.enqueue`), add `nextAttemptAt: null, deadLetter: false` (or `0` for a raw row) to it.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/electron/data/models/platform.ts apps/desktop/electron/data/mappers/platformMappers.ts apps/desktop/electron/data/repositories/interfaces/ISyncQueueRepository.ts apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.test.ts
git commit -m "feat(sync): add scheduleRetry and backoff-aware claiming to the sync queue repository"
```

---

## Task 3: SyncQueueService.scheduleRetry

**Files:**
- Modify: `apps/desktop/electron/data/services/SyncQueueService.ts`
- Modify: `apps/desktop/electron/data/services/SyncQueueService.test.ts`

**Interfaces:**
- Consumes: `ISyncQueueRepository.scheduleRetry` (Task 2).
- Produces: `SyncQueueService.scheduleRetry(id: string, nextAttemptAt: string): Promise<SyncQueueItem>`. Task 4 (`DesktopSyncWorker`) calls this.

- [ ] **Step 1: Write the failing test**

Add to `apps/desktop/electron/data/services/SyncQueueService.test.ts` (follow the existing file's mock-repo pattern used for the `fail` test):

```ts
  it('scheduleRetry delegates to the repository', async () => {
    const scheduleRetry = vi.fn((id: string, nextAttemptAt: string) => ({
      ...makeItem(id, 1),
      status: 'pending' as const,
      nextAttemptAt,
    }));
    const service = new SyncQueueService({
      syncQueue: { ...baseRepo, scheduleRetry } as unknown as ISyncQueueRepository,
      transactions: fakeTransactions,
    });

    const result = await service.scheduleRetry('q1', '2026-07-29T00:05:00.000Z');

    expect(scheduleRetry).toHaveBeenCalledWith('q1', '2026-07-29T00:05:00.000Z');
    expect(result.nextAttemptAt).toBe('2026-07-29T00:05:00.000Z');
  });
```

(If the existing test file doesn't already have a `baseRepo`/`fakeTransactions`/`makeItem` fixture shared across tests, read the file first and reuse whatever the `fail`-test setup already uses instead of inventing new fixture names — match the file's existing style exactly.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nemis-desktop/desktop test -- data/services/SyncQueueService.test.ts`
Expected: FAIL — `service.scheduleRetry is not a function`.

- [ ] **Step 3: Implement**

```ts
// apps/desktop/electron/data/services/SyncQueueService.ts
// Add below the existing `fail` method:
  scheduleRetry(id: string, nextAttemptAt: string): Promise<SyncQueueItem> {
    return Promise.resolve(this.#deps.syncQueue.scheduleRetry(id, nextAttemptAt));
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @nemis-desktop/desktop test -- data/services/SyncQueueService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data/services/SyncQueueService.ts apps/desktop/electron/data/services/SyncQueueService.test.ts
git commit -m "feat(sync): expose scheduleRetry on SyncQueueService"
```

---

## Task 4: DesktopSyncWorker — exponential backoff + dead-letter on the failure path

**Files:**
- Modify: `apps/desktop/electron/sync/DesktopSyncWorker.ts`
- Create: `apps/desktop/electron/sync/DesktopSyncWorker.test.ts` (no test file exists for this class today)

**Interfaces:**
- Consumes: `SyncQueueService.fail`/`scheduleRetry` (Tasks 2-3, `fail` already existed); `workspace.data.services.syncQueue`.
- Produces: `DesktopSyncWorker`'s constructor gains a third parameter `connectivity: ConnectivitySource` (defined in Task 6, `NetworkMonitor.ts`) — Task 4 defines the *interface* here (Task 6 defines the concrete class). `getStatus()` return type gains `isOnline: boolean`. Task 7 wires the real `NetworkMonitor` in as this dependency.

- [ ] **Step 1: Write the failing test file**

This is the first test for `DesktopSyncWorker`. It uses a real temp-file `DatabaseManager` (same pattern as `createDataLayer.test.ts`) wrapped in a minimal fake `WorkspaceManager`-shaped object, plus a fake `BackendProvisioningGateway`.

```ts
// apps/desktop/electron/sync/DesktopSyncWorker.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseManager } from '../database/DatabaseManager';
import { createDataLayer, type DataLayer } from '../data/factories/createDataLayer';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { WorkspaceManager, ActiveWorkspace } from '../workspace/WorkspaceManager';
import type { BackendProvisioningGateway } from '../provisioning/BackendProvisioningGateway';
import { DesktopSyncWorker } from './DesktopSyncWorker';

const TEST_DEVICE = { deviceName: 'worker-test', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0' };
const TEST_USER = {
  id: 'user-1',
  role: 'INSTITUTION_ADMIN',
  scope: { type: 'INSTITUTION', scopeId: 'school-1' },
  institutionId: 'school-1',
} as ActiveWorkspace['user'];

function alwaysOnline() {
  return { isOnline: () => true };
}

describe('DesktopSyncWorker retry policy', () => {
  let directory: string;
  let manager: DatabaseManager;
  let dataLayer: DataLayer;
  let workspaces: WorkspaceManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-syncworker-test-'));
    manager = new DatabaseManager({ userDataDir: directory, device: TEST_DEVICE });
    manager.initialize();
    dataLayer = createDataLayer(manager, { info: () => {}, warn: () => {}, error: () => {} });
    manager.connection.prepare(`
      INSERT INTO provisioning_metadata (id,status,institutionId,userId,serverDeviceId,startedAt,updatedAt)
      VALUES ('singleton','complete','school-1','user-1','device-1',?,?)
    `).run('2026-07-29T00:00:00.000Z', '2026-07-29T00:00:00.000Z');
    workspaces = {
      get active(): ActiveWorkspace {
        return {
          identity: 'test-identity',
          user: TEST_USER,
          database: manager,
          data: dataLayer,
          application: {} as ApplicationLayer,
        };
      },
    } as unknown as WorkspaceManager;
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('schedules a backoff retry (stays pending) below the dead-letter threshold', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    const gateway = {
      pushChanges: vi.fn().mockRejectedValue(new Error('network down')),
      downloadSnapshot: vi.fn(),
    } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    await expect(worker.syncActive()).rejects.toThrow('network down');

    const row = manager.connection
      .prepare(`SELECT status, retryCount, nextAttemptAt, deadLetter FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; retryCount: number; nextAttemptAt: string | null; deadLetter: number };
    expect(row.status).toBe('pending');
    expect(row.retryCount).toBe(1);
    expect(row.nextAttemptAt).not.toBeNull();
    expect(row.deadLetter).toBe(0);
  });

  it('dead-letters an item after 5 failed attempts instead of retrying forever', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    const gateway = {
      pushChanges: vi.fn().mockRejectedValue(new Error('server rejected')),
      downloadSnapshot: vi.fn(),
    } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    for (let attempt = 0; attempt < 5; attempt += 1) {
      manager.connection.prepare(`UPDATE sync_queue SET nextAttemptAt=NULL WHERE id=?`).run(item.id);
      await expect(worker.syncActive()).rejects.toThrow();
    }

    const row = manager.connection
      .prepare(`SELECT status, retryCount, deadLetter FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; retryCount: number; deadLetter: number };
    expect(row.retryCount).toBe(5);
    expect(row.deadLetter).toBe(1);
    expect(row.status).toBe('failed');
  });

  it('getStatus reports isOnline from the injected connectivity source', () => {
    const worker = new DesktopSyncWorker(workspaces, {} as BackendProvisioningGateway, { isOnline: () => false });
    expect(worker.getStatus().isOnline).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nemis-desktop/desktop test -- sync/DesktopSyncWorker.test.ts`
Expected: FAIL — `DesktopSyncWorker` constructor doesn't accept a third argument yet, and `getStatus()` has no `isOnline` field.

- [ ] **Step 3: Implement the backoff schedule and dead-letter threshold**

```ts
// apps/desktop/electron/sync/DesktopSyncWorker.ts
// Add near the top of the file, after the imports:
const BACKOFF_SCHEDULE_MS = [30_000, 60_000, 300_000, 900_000] as const; // 30s, 1m, 5m, 15m
const DEAD_LETTER_THRESHOLD = 5;

/** Minimal seam so DesktopSyncWorker doesn't depend on the concrete NetworkMonitor class. */
export interface ConnectivitySource {
  isOnline(): boolean;
}
```

- [ ] **Step 4: Add the constructor parameter and thread it through `getStatus`**

```ts
// apps/desktop/electron/sync/DesktopSyncWorker.ts
export class DesktopSyncWorker {
  #running = false;
  #lastPullAt = 0;

  constructor(
    private readonly workspaces: WorkspaceManager,
    private readonly gateway: BackendProvisioningGateway,
    private readonly connectivity: ConnectivitySource,
  ) {}
```

```ts
  getStatus(): DesktopSyncStatus {
    const db = this.workspaces.active.database.connection;
    const count = (status: string) => (db.prepare(
      `SELECT COUNT(*) count FROM sync_queue WHERE status=?`,
    ).get(status) as { count: number }).count;
    const metadata = db.prepare(
      `SELECT lastSyncAt,syncStatus FROM sync_metadata WHERE id='singleton'`,
    ).get() as { lastSyncAt: string | null; syncStatus: DesktopSyncStatus['status'] };
    const conflicts = (db.prepare(
      `SELECT COUNT(*) count FROM sync_conflicts WHERE status='unresolved'`,
    ).get() as { count: number }).count;
    return {
      pending: count('pending'),
      inFlight: count('in_flight'),
      conflicts,
      lastSyncAt: metadata.lastSyncAt,
      status: this.#running ? 'syncing' : metadata.syncStatus,
      isOnline: this.connectivity.isOnline(),
    };
  }
```

- [ ] **Step 5: Replace the catch block's raw "reset to pending" SQL with per-item backoff/dead-letter**

Replace the entire `catch (error) { ... }` block in `syncActive()` with:

```ts
    } catch (error) {
      try {
        if (this.workspaces.active.identity !== workspace.identity) return;
      } catch {
        return;
      }
      const now = new Date().toISOString();
      if (claimed.length > 0) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        for (const item of claimed) {
          const nextRetryCount = item.retryCount + 1;
          if (nextRetryCount >= DEAD_LETTER_THRESHOLD) {
            await workspace.data.services.syncQueue.fail(item.id, { message, stack });
          } else {
            const delayMs = BACKOFF_SCHEDULE_MS[nextRetryCount - 1] ?? BACKOFF_SCHEDULE_MS.at(-1)!;
            await workspace.data.services.syncQueue.scheduleRetry(
              item.id,
              new Date(Date.now() + delayMs).toISOString(),
            );
            await workspace.data.services.syncQueue.recordError({
              operationId: item.id,
              message,
              stack: stack ?? null,
              retryCount: nextRetryCount,
            });
          }
        }
      }
      workspace.database.connection.prepare(`
        UPDATE sync_metadata SET syncStatus='failed',updatedAt=? WHERE id='singleton'
      `).run(now);
      throw error;
    } finally {
      this.#running = false;
    }
```

(`claimed` is already in scope from earlier in `syncActive()` — it's the array captured by `const claimed = await workspace.data.services.syncQueue.claim(50);`. Every other line of `syncActive()` before and after this block is unchanged.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @nemis-desktop/desktop test -- sync/DesktopSyncWorker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Fix the one production call site (Task 7 will supply the real `NetworkMonitor`; for now, keep the app compiling)**

`apps/desktop/electron/main/main.ts` line 114 (`const syncWorker = new DesktopSyncWorker(workspaces, backendProvisioning);`) will now fail to typecheck (missing 3rd argument). Leave it broken here on purpose — Task 7 supplies the real `NetworkMonitor` as that argument in the same change that constructs it. Confirm the failure is exactly this and nothing else:

Run: `pnpm --filter @nemis-desktop/desktop typecheck`
Expected: exactly one error, at `main.ts` line 114, "Expected 3 arguments, but got 2."

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/electron/sync/DesktopSyncWorker.ts apps/desktop/electron/sync/DesktopSyncWorker.test.ts
git commit -m "feat(sync): add exponential backoff and dead-letter after 5 failed attempts"
```

(This commit intentionally leaves `main.ts` failing typecheck — Task 7 fixes it. If executing tasks in strict "everything green" order, do Task 6 and 7 immediately after this one before running a full CI-style check.)

---

## Task 5: Dead-letter surfacing — types, worker, IPC validation, UI

**Files:**
- Modify: `packages/types/src/sync.ts`
- Modify: `apps/desktop/electron/sync/DesktopSyncWorker.ts`
- Modify: `apps/desktop/electron/security/validateIpc.ts`
- Modify: `apps/desktop/renderer/components/sync/SyncConflictsPage.tsx`
- Create: `apps/desktop/electron/sync/DesktopSyncWorker.test.ts` additions (same file as Task 4)

**Interfaces:**
- Consumes: `sync_queue.deadLetter`/`nextAttemptAt` (Task 1-2), `sync_errors` table (pre-existing).
- Produces: `SyncConflictResult.source: 'conflict' | 'dead_letter'`; `SyncConflictResult.status` gains `'retried'`; `ResolveSyncConflictRequest.resolution` gains `'retry'`. `SyncConflictsPage.tsx` is the only renderer consumer and is updated in this same task — no other file reads these types.

- [ ] **Step 1: Write the failing worker tests**

Add to `apps/desktop/electron/sync/DesktopSyncWorker.test.ts`:

```ts
  it('listConflicts includes dead-lettered queue items alongside real conflicts', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    for (let i = 0; i < 4; i += 1) {
      await dataLayer.services.syncQueue.scheduleRetry(item.id, '2026-01-01T00:00:00.000Z');
    }
    await dataLayer.services.syncQueue.fail(item.id, { message: 'server rejected permanently' });

    const worker = new DesktopSyncWorker(workspaces, {} as BackendProvisioningGateway, alwaysOnline());
    const conflicts = worker.listConflicts();

    const deadLettered = conflicts.find((c) => c.operationId === item.id);
    expect(deadLettered?.source).toBe('dead_letter');
    expect(deadLettered?.reason).toContain('server rejected permanently');
  });

  it('resolveConflict with resolution "retry" revives a dead-lettered item', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'students',
      entityId: 's1',
      operationType: 'create',
      payload: { firstName: 'Ada' },
    });
    await dataLayer.services.syncQueue.fail(item.id, { message: 'boom' });
    manager.connection.prepare(`UPDATE sync_queue SET deadLetter=1 WHERE id=?`).run(item.id);

    const worker = new DesktopSyncWorker(workspaces, {} as BackendProvisioningGateway, alwaysOnline());
    const result = worker.resolveConflict({ conflictId: item.id, resolution: 'retry' });

    expect(result.status).toBe('retried');
    const row = manager.connection
      .prepare(`SELECT status, retryCount, deadLetter FROM sync_queue WHERE id=?`)
      .get(item.id) as { status: string; retryCount: number; deadLetter: number };
    expect(row.status).toBe('pending');
    expect(row.retryCount).toBe(0);
    expect(row.deadLetter).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nemis-desktop/desktop test -- sync/DesktopSyncWorker.test.ts`
Expected: FAIL — `source`/`status: 'retried'` don't exist on the type yet, and `resolveConflict` doesn't understand `resolution: 'retry'`.

- [ ] **Step 3: Extend the shared types**

```ts
// packages/types/src/sync.ts
export interface SyncConflictResult {
  id: string;
  operationId: string | null;
  entityType: string;
  entityId: string;
  operationType: 'create' | 'update' | 'delete';
  localPayload: unknown;
  remotePayload: unknown;
  reason: string;
  status: 'unresolved' | 'keep_local' | 'accept_remote' | 'merged' | 'retried';
  source: 'conflict' | 'dead_letter';
  createdAt: string;
  resolvedAt: string | null;
}

export interface ResolveSyncConflictRequest {
  conflictId: string;
  resolution: 'keep_local' | 'accept_remote' | 'retry';
}

export interface DesktopSyncStatus {
  pending: number;
  inFlight: number;
  conflicts: number;
  lastSyncAt: string | null;
  status: 'never' | 'idle' | 'syncing' | 'failed';
  isOnline: boolean;
}
```

- [ ] **Step 4: Update `listConflicts` and `resolveConflict` in `DesktopSyncWorker`**

```ts
// apps/desktop/electron/sync/DesktopSyncWorker.ts
  listConflicts(): SyncConflictResult[] {
    const db = this.workspaces.active.database.connection;
    const conflictRows = db.prepare(`
      SELECT id,operationId,entityType,entityId,operationType,localPayload,remotePayload,
             reason,status,createdAt,resolvedAt
      FROM sync_conflicts WHERE status='unresolved' ORDER BY createdAt,id
    `).all() as Array<Omit<SyncConflictResult, 'localPayload' | 'remotePayload' | 'source'> & {
      localPayload: string | null;
      remotePayload: string | null;
    }>;
    const deadLetterRows = db.prepare(`
      SELECT q.id,q.entityType,q.entityId,q.operationType,q.payload,q.createdAt,
             (SELECT message FROM sync_errors WHERE operationId = q.id ORDER BY createdAt DESC, id DESC LIMIT 1) AS lastError,
             q.retryCount
      FROM sync_queue q WHERE q.status='failed' AND q.deadLetter=1 ORDER BY q.createdAt,q.id
    `).all() as Array<{
      id: string;
      entityType: string;
      entityId: string;
      operationType: string;
      payload: string | null;
      createdAt: string;
      lastError: string | null;
      retryCount: number;
    }>;
    return [
      ...conflictRows.map((row) => ({
        ...row,
        localPayload: row.localPayload ? JSON.parse(row.localPayload) : null,
        remotePayload: row.remotePayload ? JSON.parse(row.remotePayload) : null,
        source: 'conflict' as const,
      })),
      ...deadLetterRows.map((row) => ({
        id: row.id,
        operationId: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        operationType: row.operationType as SyncConflictResult['operationType'],
        localPayload: row.payload ? JSON.parse(row.payload) : null,
        remotePayload: null,
        reason: `Sync failed after ${row.retryCount} attempts: ${row.lastError ?? 'unknown error'}`,
        status: 'unresolved' as const,
        source: 'dead_letter' as const,
        createdAt: row.createdAt,
        resolvedAt: null,
      })),
    ];
  }

  resolveConflict(request: ResolveSyncConflictRequest): SyncConflictResult {
    const db = this.workspaces.active.database;
    if (request.resolution === 'retry') {
      return db.transactions.runImmediate(() => {
        const row = db.connection.prepare(`
          SELECT id,entityType,entityId,operationType,payload,createdAt
          FROM sync_queue WHERE id=? AND status='failed' AND deadLetter=1
        `).get(request.conflictId) as
          | { id: string; entityType: string; entityId: string; operationType: string; payload: string | null; createdAt: string }
          | undefined;
        if (!row) throw new Error('The dead-lettered sync item was not found or was already retried.');
        const resolvedAt = new Date().toISOString();
        db.connection.prepare(`
          UPDATE sync_queue SET status='pending',retryCount=0,nextAttemptAt=NULL,deadLetter=0,updatedAt=?
          WHERE id=?
        `).run(resolvedAt, row.id);
        return {
          id: row.id,
          operationId: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          operationType: row.operationType as SyncConflictResult['operationType'],
          localPayload: row.payload ? JSON.parse(row.payload) : null,
          remotePayload: null,
          reason: 'Retried by user.',
          status: 'retried' as const,
          source: 'dead_letter' as const,
          createdAt: row.createdAt,
          resolvedAt,
        };
      });
    }
    return db.transactions.runImmediate(() => {
      const row = db.connection.prepare(`
        SELECT id,operationId,entityType,entityId,operationType,localPayload,remotePayload,
               reason,status,createdAt,resolvedAt
        FROM sync_conflicts WHERE id=? AND status='unresolved'
      `).get(request.conflictId) as RawConflict | undefined;
      if (!row) throw new Error('The synchronization conflict was not found or is already resolved.');
      const resolvedAt = new Date().toISOString();
      if (request.resolution === 'keep_local') {
        db.connection.prepare(`
          INSERT INTO sync_queue
            (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt)
          VALUES (?,?,?,?,?,0,'pending',?,?)
        `).run(
          randomUUID(),
          row.entityType,
          row.entityId,
          row.operationType,
          row.localPayload,
          resolvedAt,
          resolvedAt,
        );
      }
      db.connection.prepare(`
        UPDATE sync_conflicts SET status=?,resolvedAt=? WHERE id=?
      `).run(request.resolution, resolvedAt, row.id);
      return { ...toConflict({ ...row, status: request.resolution, resolvedAt }), source: 'conflict' as const };
    });
  }
```

(`toConflict`/`RawConflict` stay as they are today — only the final return line gains `source: 'conflict'`.)

- [ ] **Step 5: Allow `'retry'` through IPC validation**

```ts
// apps/desktop/electron/security/validateIpc.ts:599
  assertEnumMember(request.resolution, 'resolution', ['keep_local', 'accept_remote', 'retry']);
```

- [ ] **Step 6: Run the worker tests to verify they pass**

Run: `pnpm --filter @nemis-desktop/desktop test -- sync/DesktopSyncWorker.test.ts`
Expected: PASS (all 5 tests now in the file).

- [ ] **Step 7: Update `SyncConflictsPage.tsx` to render dead-letter items with a single "Retry now" action**

```tsx
// apps/desktop/renderer/components/sync/SyncConflictsPage.tsx
  const resolve = async (
    conflictId: string,
    resolution: 'keep_local' | 'accept_remote' | 'retry',
  ) => {
    setResolving(conflictId);
    try {
      await sharedBridge.resolveSyncConflict(conflictId, resolution);
      setConflicts((current) => current?.filter((item) => item.id !== conflictId) ?? []);
      if (resolution === 'keep_local' || resolution === 'retry') void sharedBridge.runSync();
    } finally {
      setResolving(null);
    }
  };
```

```tsx
              <div className="mt-4 flex gap-2">
                {conflict.source === 'dead_letter' ? (
                  <button
                    type="button"
                    disabled={resolving === conflict.id}
                    className="rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => void resolve(conflict.id, 'retry')}
                  >
                    Retry now
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={resolving === conflict.id}
                      className="rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      onClick={() => void resolve(conflict.id, 'keep_local')}
                    >
                      Retry my offline change
                    </button>
                    <button
                      type="button"
                      disabled={resolving === conflict.id}
                      className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      onClick={() => void resolve(conflict.id, 'accept_remote')}
                    >
                      Accept server version
                    </button>
                  </>
                )}
              </div>
```

(Only the `resolve` function signature and the button block change — everything else in the file, including the `<details>` payload comparison, stays as-is. The `remotePayload` pane will simply render `null` for dead-letter rows, which is correct.)

- [ ] **Step 8: If `SyncConflictsPage` has an existing test file, extend it; otherwise this step is skipped**

Check first: `Glob apps/desktop/renderer/components/sync/SyncConflictsPage.test.tsx`. If it exists, add a case rendering a `source: 'dead_letter'` conflict and asserting the "Retry now" button appears and calls `resolveSyncConflict(id, 'retry')`. If it doesn't exist, do not create one speculatively — this page has no test today and adding one is out of this task's scope.

- [ ] **Step 9: Typecheck the renderer**

Run: `pnpm --filter @nemis-desktop/desktop typecheck`
Expected: only the pre-existing Task 4 `main.ts` error remains (fixed in Task 7).

- [ ] **Step 10: Commit**

```bash
git add packages/types/src/sync.ts apps/desktop/electron/sync/DesktopSyncWorker.ts apps/desktop/electron/sync/DesktopSyncWorker.test.ts apps/desktop/electron/security/validateIpc.ts apps/desktop/renderer/components/sync/SyncConflictsPage.tsx
git commit -m "feat(sync): surface dead-lettered sync items in the conflicts UI with a retry action"
```

---

## Task 6: NetworkMonitor

**Files:**
- Create: `apps/desktop/electron/sync/NetworkMonitor.ts`
- Create: `apps/desktop/electron/sync/NetworkMonitor.test.ts`

**Interfaces:**
- Consumes: Electron's `powerMonitor` (`resume`, `unlock-screen` events), global `fetch`.
- Produces: `class NetworkMonitor implements ConnectivitySource` (the interface from Task 4) with `isOnline(): boolean`, `start(): void`, `stop(): void`, and a constructor `(apiBaseUrl: string, onOnline: () => void)`. Task 7 constructs and wires this into `main.ts` (as `DesktopSyncWorker`'s 3rd argument and to trigger instant sync).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/electron/sync/NetworkMonitor.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkMonitor } from './NetworkMonitor';

vi.mock('electron', () => ({
  powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
}));

describe('NetworkMonitor', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts online by default and stays online while probes succeed', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const onOnline = vi.fn();
    const monitor = new NetworkMonitor('https://api.example.test', onOnline);
    monitor.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(monitor.isOnline()).toBe(true);
    expect(onOnline).not.toHaveBeenCalled();
    monitor.stop();
  });

  it('treats a 401/403 response as reachable (network is up, auth is a separate concern)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const monitor = new NetworkMonitor('https://api.example.test', vi.fn());
    monitor.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(monitor.isOnline()).toBe(true);
    monitor.stop();
  });

  it('flips offline after two consecutive failed probes, and back online after two consecutive successes, firing onOnline exactly on the up-flip', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const onOnline = vi.fn();
    const monitor = new NetworkMonitor('https://api.example.test', onOnline);
    monitor.start();

    await vi.advanceTimersByTimeAsync(10_000); // probe 1: fail (not enough yet)
    expect(monitor.isOnline()).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000); // probe 2: fail -> flips offline
    expect(monitor.isOnline()).toBe(false);

    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await vi.advanceTimersByTimeAsync(10_000); // probe 3: success (not enough yet)
    expect(monitor.isOnline()).toBe(false);
    expect(onOnline).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000); // probe 4: success -> flips online
    expect(monitor.isOnline()).toBe(true);
    expect(onOnline).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it('stop() clears the probe interval so no further fetches occur', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const monitor = new NetworkMonitor('https://api.example.test', vi.fn());
    monitor.start();
    monitor.stop();
    fetchMock.mockClear();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nemis-desktop/desktop test -- sync/NetworkMonitor.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// apps/desktop/electron/sync/NetworkMonitor.ts
import { powerMonitor } from 'electron';
import type { ConnectivitySource } from './DesktopSyncWorker';

const PROBE_INTERVAL_MS = 10_000;
const PROBE_TIMEOUT_MS = 5_000;
const CONSECUTIVE_FLIPS_REQUIRED = 2;

/**
 * Reachability probe against the backend, debounced across two consecutive
 * consistent results so a single flaky probe doesn't flap the indicator.
 * Electron's main process has no `navigator.onLine` — powerMonitor's
 * resume/unlock-screen events only trigger an immediate re-probe, they never
 * set state directly (an adapter coming back up doesn't guarantee internet
 * is actually reachable yet).
 */
export class NetworkMonitor implements ConnectivitySource {
  #online = true;
  #consecutive = 0;
  #lastResult: boolean | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #probeUrl: string;
  #onResume = () => void this.#probe();

  constructor(
    apiBaseUrl: string,
    private readonly onOnline: () => void,
  ) {
    this.#probeUrl = new URL('/auth/me', apiBaseUrl).toString();
  }

  isOnline(): boolean {
    return this.#online;
  }

  start(): void {
    this.#timer = setInterval(() => void this.#probe(), PROBE_INTERVAL_MS);
    powerMonitor.on('resume', this.#onResume);
    powerMonitor.on('unlock-screen', this.#onResume);
    void this.#probe();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    powerMonitor.removeListener('resume', this.#onResume);
    powerMonitor.removeListener('unlock-screen', this.#onResume);
  }

  async #probe(): Promise<void> {
    const reachable = await this.#isReachable();
    if (reachable === this.#lastResult) {
      this.#consecutive += 1;
    } else {
      this.#lastResult = reachable;
      this.#consecutive = 1;
    }
    if (this.#consecutive < CONSECUTIVE_FLIPS_REQUIRED || reachable === this.#online) return;
    this.#online = reachable;
    if (reachable) this.onOnline();
  }

  async #isReachable(): Promise<boolean> {
    try {
      // Any HTTP response (even 401/403) proves the network path is up —
      // only a thrown network-level error (timeout/DNS/refused) means offline.
      await fetch(this.#probeUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nemis-desktop/desktop test -- sync/NetworkMonitor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/sync/NetworkMonitor.ts apps/desktop/electron/sync/NetworkMonitor.test.ts
git commit -m "feat(sync): add NetworkMonitor — debounced reachability probe with instant reconnect callback"
```

---

## Task 7: Wire NetworkMonitor into main.ts, connectivity into the renderer, and a shutdown flush

**Files:**
- Modify: `apps/desktop/electron/main/main.ts`
- Modify: `apps/desktop/renderer/components/shell/StatusBar.tsx`

**Interfaces:**
- Consumes: `NetworkMonitor` (Task 6), `DesktopSyncWorker` (Task 4), `ConnectivityStore.setOnline` (pre-existing, `packages/presentation/src/stores/connectivity-store.ts`), `DesktopSyncStatus.isOnline` (Task 5).
- Produces: nothing further downstream — this is the top of the wiring.

- [ ] **Step 1: Fix the `DesktopSyncWorker` construction and add `NetworkMonitor`**

```ts
// apps/desktop/electron/main/main.ts
// Add the import alongside the other @app/sync import:
import { DesktopSyncWorker } from '@app/sync/DesktopSyncWorker';
import { NetworkMonitor } from '@app/sync/NetworkMonitor';
```

```ts
// Replace the syncWorker construction and syncTimer block (around line 114-118):
      const networkMonitor = new NetworkMonitor(config.apiBaseUrl, () => {
        void syncWorker.syncActive().catch((error) => logger.warn(`Reconnect sync deferred: ${String(error)}`));
      });
      const syncWorker = new DesktopSyncWorker(workspaces, backendProvisioning, networkMonitor);
      const schoolAdmin = new SchoolAdminModuleService(workspaces);
      const syncTimer = setInterval(() => {
        void syncWorker.syncActive().catch((error) => logger.warn(`Background sync deferred: ${String(error)}`));
      }, 30_000);
      networkMonitor.start();
```

(`networkMonitor`'s `onOnline` callback references `syncWorker` before it's assigned on the same line — JavaScript closures capture the binding, not the value at closure-creation time, and the callback only ever runs later via the interval/event, by which point `syncWorker` is assigned. This is safe but reads oddly; if a reviewer prefers, declare `let syncWorker: DesktopSyncWorker;` above the `NetworkMonitor` construction and assign it on the next line instead — functionally identical, purely a readability choice.)

- [ ] **Step 2: Stop the monitor alongside the existing timer teardown**

```ts
// apps/desktop/electron/main/main.ts:137
      app.once('will-quit', () => {
        clearInterval(syncTimer);
        networkMonitor.stop();
      });
```

- [ ] **Step 3: Add a best-effort shutdown flush**

```ts
// apps/desktop/electron/main/main.ts:157 — replace the existing app.on('will-quit', ...) handler:
  app.on('will-quit', async (event) => {
    if (workspaces && networkMonitor?.isOnline()) {
      try {
        const pending = workspaces.active.database.connection
          .prepare(`SELECT COUNT(*) count FROM sync_queue WHERE status='pending'`)
          .get() as { count: number };
        if (pending.count > 0) {
          event.preventDefault();
          await Promise.race([
            syncWorker!.syncActive().catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, 3_000)),
          ]);
        }
      } catch {
        // best-effort only — never block quit on a flush failure
      }
    }
    try {
      workspaces?.close();
    } catch (error) {
      logger.error('Database shutdown failed:', error);
    }
    app.quit();
  });
```

Note: `networkMonitor` and `syncWorker` are declared inside the `.whenReady().then(...)` callback, so they're not in scope at the `app.on('will-quit', ...)` registration point today (that handler is registered outside the `.then()`, at the bootstrap function's top level per the current file). Since `will-quit` only fires after `whenReady()` has resolved in practice, use the same `let` pattern the file already uses for `mainWindow`/`workspaces` (declared `let` at the top of `bootstrap()`, assigned inside `.then()`): add `let networkMonitor: NetworkMonitor | null = null;` and `let syncWorker: DesktopSyncWorker | null = null;` next to the existing `let mainWindow`/`let workspaces` declarations (around line 46-47), and drop the `const` keyword from their assignments inside `.then()`. Adjust Step 1 and Step 3's code accordingly (`networkMonitor!.isOnline()` becomes `networkMonitor?.isOnline()`, already reflected above; `syncWorker!.syncActive()` requires the null check the `if (workspaces && ...)` guard already provides transitively — add `&& syncWorker` to that same condition for type safety: `if (workspaces && networkMonitor?.isOnline() && syncWorker)`).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @nemis-desktop/desktop typecheck`
Expected: 0 errors.

- [ ] **Step 5: Wire the renderer's existing 5s poll to feed `ConnectivityStore`**

```tsx
// apps/desktop/renderer/components/shell/StatusBar.tsx
  const refresh = useCallback(() => {
    try {
      void sharedBridge
        .getSyncStatus()
        .then((status) => {
          setLocalSync(status);
          connectivity.store.getState().setOnline(status.isOnline);
        })
        .catch(() => setLocalSync(null));
    } catch {
      setLocalSync(null);
    }
  }, [connectivity]);
```

(`connectivity` is already destructured at the top of the component via `const connectivity = useConnectivityStore();` — only the `.then()` callback body changes, adding the `connectivity.store.getState().setOnline(...)` call. Confirm `ConnectivityStore`'s public shape exposes `.store` as the vanilla zustand store with `.getState()` — it does, per `packages/presentation/src/stores/connectivity-store.ts`, the same shape `useViewModel(connectivity.store, ...)` already reads from two lines below.)

- [ ] **Step 6: Run the renderer test suite**

Run: `pnpm --filter @nemis-desktop/desktop test -- components/shell/StatusBar.test.tsx`
Expected: PASS. If the existing test's mock `sharedBridge.getSyncStatus` fixture doesn't include `isOnline`, add `isOnline: true` to its mocked resolved value so the new code path doesn't crash on `undefined`.

- [ ] **Step 7: Manual smoke check (not automatable in this task — network state is real OS state)**

Run: `pnpm --filter @nemis-desktop/desktop dev`. With the app running: disconnect network (disable Wi-Fi/adapter) and confirm the StatusBar flips to "Offline" within ~20s (two probe cycles); reconnect and confirm it flips back to "Online" within ~20s and a sync attempt fires immediately (watch the `logger.info` sync output in the terminal rather than waiting for the 30s interval).

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/electron/main/main.ts apps/desktop/renderer/components/shell/StatusBar.tsx apps/desktop/renderer/components/shell/StatusBar.test.tsx
git commit -m "feat(sync): wire NetworkMonitor into main process — instant reconnect sync, live connectivity indicator, shutdown flush"
```

---

## Task 8: Backend — `since` delta filter on the provisioning snapshot endpoint

**Repo:** `Nemis/apps/Server` (and `Nemis/packages/types`)

**Files:**
- Modify: `packages/types/src/desktop-provisioning.ts`
- Modify: `apps/Server/src/desktop-provisioning/desktop-provisioning.controller.ts`
- Modify: `apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts`
- Modify: `apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`

**Interfaces:**
- Produces: `DesktopProvisioningQuery.since?: string`; `DesktopProvisioningService.getSnapshot(deviceId: string, user: UserContext, since?: string): Promise<DesktopProvisioningSnapshot>`. Task 9 (desktop `BackendProvisioningGateway.downloadSnapshot`) consumes this as a query param.

- [ ] **Step 1: Write the failing schema test**

Add to `apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`, near the existing schema-validation test around line 29-40 (read that block first and match its exact style):

```ts
  it("accepts an optional since timestamp on the provisioning query", () => {
    expect(
      desktopProvisioningQuerySchema.safeParse({
        deviceId: "11111111-1111-1111-1111-111111111111",
        since: "2026-07-29T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      desktopProvisioningQuerySchema.safeParse({
        deviceId: "11111111-1111-1111-1111-111111111111",
      }).success,
    ).toBe(true);
  });
```

- [ ] **Step 2: Write the failing service test asserting `since` is applied to a representative subset**

Add a new test in the same file, alongside the existing `getSnapshot` test — copy its exact `tx`/`prisma` fake shape (all 34 keys), but give `student`, `userOrganization`, and `attendance` their own individually-tracked mocks instead of the shared `emptyFind` so their `where` argument can be asserted:

```ts
  it("filters snapshot queries by since when provided, except tables with no timestamp field", async () => {
    const student = { findMany: jest.fn().mockResolvedValue([]) };
    const userOrganization = { findMany: jest.fn().mockResolvedValue([]) };
    const attendance = { findMany: jest.fn().mockResolvedValue([]) };
    const emptyFind = { findMany: jest.fn().mockResolvedValue([]) };
    const tx = {
      institution: emptyFind,
      userOrganization,
      academicYear: emptyFind,
      term: emptyFind,
      class: emptyFind,
      subject: emptyFind,
      classSubject: emptyFind,
      student,
      guardian: emptyFind,
      studentGuardian: emptyFind,
      enrollment: emptyFind,
      attendance,
      staff: emptyFind,
      subjectTeacher: emptyFind,
      classTeacher: emptyFind,
      classSubjectTeacher: emptyFind,
      timetableEntry: emptyFind,
      studentTransfer: emptyFind,
      institutionGradingConfig: emptyFind,
      gradingPeriod: emptyFind,
      gradeEntryWindow: emptyFind,
      gradeEntryWindowClass: emptyFind,
      grade: emptyFind,
      feeRule: emptyFind,
      studentFeeObligation: emptyFind,
      feePayment: emptyFind,
      announcement: emptyFind,
      conversation: emptyFind,
      message: emptyFind,
      userNotification: emptyFind,
      report: emptyFind,
      alert: emptyFind,
      assignment: emptyFind,
      assignmentSubmission: emptyFind,
      classResource: emptyFind,
    };
    const prisma = {
      desktopDevice: {
        findFirst: jest.fn().mockResolvedValue(deviceRow()),
        update: jest.fn().mockResolvedValue(deviceRow()),
      },
      $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    } as unknown as PrismaService;

    const since = "2026-07-29T00:00:00.000Z";
    await new DesktopProvisioningService(prisma).getSnapshot("device-1", user, since);

    expect(student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ updatedAt: { gt: new Date(since) } }),
      }),
    );
    // UserOrganization has no timestamp field at all — deliberately always full, never filtered.
    expect(userOrganization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ updatedAt: expect.anything() }),
      }),
    );
    expect(attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { updatedAt: { gt: new Date(since) } },
            { updatedAt: null, recordedAt: { gt: new Date(since) } },
          ],
        }),
      }),
    );
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `Nemis/apps/Server`): `pnpm test -- desktop-provisioning.service.spec.ts`
Expected: FAIL — `since` is an unknown key on the `.strict()` schema (schema test), and the service ignores a `since` argument it doesn't accept yet (service test — `getSnapshot` only takes 2 params today).

- [ ] **Step 4: Add `since` to the query schema**

```ts
// Nemis/packages/types/src/desktop-provisioning.ts
export const desktopProvisioningQuerySchema = z
  .object({
    deviceId: z.string().uuid(),
    since: z.string().datetime().optional(),
  })
  .strict();

export type DesktopProvisioningQuery = z.infer<
  typeof desktopProvisioningQuerySchema
>;
```

- [ ] **Step 5: Rebuild `@nemis/types` so the Server resolves the new field**

Run (from `Nemis` workspace root): `pnpm --filter @nemis/types build`
Expected: succeeds; `packages/types/dist/desktop-provisioning.d.ts`/`.js` now include `since`.

- [ ] **Step 6: Thread `since` through the controller**

```ts
// Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.controller.ts:68
  getSnapshot(
    @Query(new ZodValidationPipe(desktopProvisioningQuerySchema))
    query: DesktopProvisioningQuery,
    @CurrentUser() user: UserContext,
  ) {
    return this.service.getSnapshot(query.deviceId, user, query.since);
  }
```

- [ ] **Step 7: Apply the `since` filter inside `getSnapshot`**

Change the method signature:

```ts
// Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts
  async getSnapshot(
    deviceId: string,
    user: UserContext,
    since?: string,
  ): Promise<DesktopProvisioningSnapshot> {
```

Add two small helpers directly above the `getSnapshot` method (this file's only consumer):

```ts
function sinceFilter(since?: string): { updatedAt: { gt: Date } } | Record<string, never> {
  return since ? { updatedAt: { gt: new Date(since) } } : {};
}

function sinceFilterOn(
  field: string,
  since?: string,
): Record<string, { gt: Date }> | Record<string, never> {
  return since ? { [field]: { gt: new Date(since) } } : {};
}
```

Replace the `Promise.all([...])` block's query definitions (inside the existing `tx.$transaction(async (tx) => { ... })`) with the `since`-aware versions — every query keeps its exact existing `orderBy`/`include`/shape; only `where` clauses change, and only where the table 3 caveat table requires it:

```ts
          tx.institution.findMany({
            where: { id: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          // userOrganization: deliberately NEVER filtered by since.
          // UserOrganization has no timestamp field of its own; filtering only
          // via the nested User.updatedAt would silently drop membership/role
          // changes that don't touch the User row. This is a small,
          // low-row-count collection (one school's staff/admin roster) so
          // always-full is cheap and correct.
          tx.userOrganization.findMany({
            where: { institutionId: institutionWhere, isActive: true },
            include: { user: true },
            orderBy: { id: "asc" },
          }),
          tx.academicYear.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.term.findMany({
            where: { academicYear: { institutionId: institutionWhere }, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.class.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.subject.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.classSubject.findMany({
            where: { class: { institutionId: institutionWhere }, ...sinceFilterOn("assignedAt", since) },
            orderBy: { id: "asc" },
          }),
          tx.student.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.guardian.findMany({
            where: {
              students: {
                some: { student: { institutionId: institutionWhere } },
              },
              ...sinceFilter(since),
            },
            orderBy: { id: "asc" },
          }),
          tx.studentGuardian.findMany({
            where: { student: { institutionId: institutionWhere }, ...sinceFilterOn("createdAt", since) },
            orderBy: { id: "asc" },
          }),
          tx.enrollment.findMany({
            where: { student: { institutionId: institutionWhere }, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.attendance.findMany({
            where: {
              student: { institutionId: institutionWhere },
              ...(since
                ? {
                    OR: [
                      { updatedAt: { gt: new Date(since) } },
                      { updatedAt: null, recordedAt: { gt: new Date(since) } },
                    ],
                  }
                : {}),
            },
            orderBy: { id: "asc" },
          }),
          tx.staff.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          // subjectTeacher/classTeacher/classSubjectTeacher: no timestamp field
          // exists on these join tables either — always full, same reasoning
          // as userOrganization above.
          tx.subjectTeacher.findMany({
            where: { staff: { institutionId: institutionWhere } },
            orderBy: { id: "asc" },
          }),
          tx.classTeacher.findMany({
            where: { staff: { institutionId: institutionWhere } },
            orderBy: { id: "asc" },
          }),
          tx.classSubjectTeacher.findMany({
            where: { staff: { institutionId: institutionWhere } },
            orderBy: { id: "asc" },
          }),
          tx.timetableEntry.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: [
              { dayOfWeek: "asc" },
              { startTime: "asc" },
              { id: "asc" },
            ],
          }),
          tx.studentTransfer.findMany({
            where: {
              OR: [
                { fromInstitutionId: institutionWhere },
                { toInstitutionId: institutionWhere },
              ],
              ...sinceFilter(since),
            },
            orderBy: { id: "asc" },
          }),
          tx.institutionGradingConfig.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.gradingPeriod.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.gradeEntryWindow.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.gradeEntryWindowClass.findMany({
            where: { class: { institutionId: institutionWhere }, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.grade.findMany({
            where: { student: { institutionId: institutionWhere }, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.feeRule.findMany({
            where: {
              OR: [
                { institutionId: institutionWhere },
                { institutionId: null },
              ],
              ...sinceFilter(since),
            },
            orderBy: { id: "asc" },
          }),
          tx.studentFeeObligation.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.feePayment.findMany({
            where: { institutionId: institutionWhere, ...sinceFilterOn("createdAt", since) },
            orderBy: { id: "asc" },
          }),
          tx.announcement.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.conversation.findMany({
            where: { student: { institutionId: institutionWhere }, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.message.findMany({
            where: {
              conversation: { student: { institutionId: institutionWhere } },
              ...sinceFilter(since),
            },
            orderBy: { id: "asc" },
          }),
          tx.userNotification.findMany({
            where: { recipientId: user.userId, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.report.findMany({
            where: {
              OR: [
                { schoolId: institutionWhere },
                ...(scope.countyId ? [{ countyId: scope.countyId }] : []),
                ...(scope.districtId ? [{ districtId: scope.districtId }] : []),
              ],
              ...sinceFilter(since),
            },
            orderBy: { id: "asc" },
          }),
          tx.alert.findMany({
            where: {
              OR: [
                { institutionId: institutionWhere },
                ...(scope.countyId ? [{ countyId: scope.countyId }] : []),
                ...(scope.districtId ? [{ districtId: scope.districtId }] : []),
              ],
              ...sinceFilter(since),
            },
            orderBy: { id: "asc" },
          }),
          tx.assignment.findMany({
            where: { class: { institutionId: institutionWhere }, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.assignmentSubmission.findMany({
            where: {
              assignment: { class: { institutionId: institutionWhere } },
              ...sinceFilter(since),
            },
            orderBy: { id: "asc" },
          }),
          tx.classResource.findMany({
            where: { institutionId: institutionWhere, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
```

(This block replaces the array of 34 `tx.<model>.findMany(...)` calls inside the existing `Promise.all([...])` — the destructuring assignment above it (`const [institution, userOrganizations, ...] = await Promise.all([...])`) and everything from `const now = ...` onward in the function body is completely unchanged.)

- [ ] **Step 8: Run the tests to verify they pass**

Run (from `Nemis/apps/Server`): `pnpm test -- desktop-provisioning.service.spec.ts`
Expected: PASS, including the pre-existing `getSnapshot` test (which calls with no `since`, so every `sinceFilter`/`sinceFilterOn` call returns `{}` and every query's `where` is byte-identical to before).

- [ ] **Step 9: Run the full Server test suite for this module's neighbors**

Run: `pnpm test -- desktop-provisioning`
Expected: PASS (all specs in the `desktop-provisioning` directory, including `desktop-sync-applier` if present).

- [ ] **Step 10: Commit (in the `Nemis` repo)**

```bash
git add packages/types/src/desktop-provisioning.ts apps/Server/src/desktop-provisioning/desktop-provisioning.controller.ts apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts
git commit -m "feat(desktop-provisioning): support an optional since filter for delta snapshot pulls"
```

---

## Task 9: Desktop — consume delta pulls

**Files:**
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts`
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts`
- Modify: `apps/desktop/electron/sync/DesktopSyncWorker.ts`
- Modify: `apps/desktop/electron/sync/DesktopSyncWorker.test.ts`

**Interfaces:**
- Consumes: backend `since` query param (Task 8), `sync_metadata.lastDeltaAt`/`lastFullResyncAt` (Task 1).
- Produces: `BackendProvisioningGateway.downloadSnapshot(deviceId: string, since?: string): Promise<ProvisioningSnapshot>`.

- [ ] **Step 1: Write the failing gateway test**

Read `apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts` first to match its existing `fetch`-mocking style exactly (it already has a `downloadSnapshot` test per the earlier grep of this file, at line 57). Add:

```ts
  it('downloadSnapshot includes since as a query param when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: validSnapshotPayload() }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const gateway = buildGateway();

    await gateway.downloadSnapshot('device-1', '2026-07-29T00:00:00.000Z');

    const requestedUrl = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(requestedUrl.searchParams.get('deviceId')).toBe('device-1');
    expect(requestedUrl.searchParams.get('since')).toBe('2026-07-29T00:00:00.000Z');
  });
```

(`buildGateway()` and `validSnapshotPayload()` — use whatever helper names the existing test file already defines for these; if the file's existing `downloadSnapshot` test builds its valid payload inline rather than via a shared helper, copy that inline shape instead of inventing a new helper name.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nemis-desktop/desktop test -- provisioning/BackendProvisioningGateway.test.ts`
Expected: FAIL — `downloadSnapshot` only accepts one argument today; the second is silently dropped and the URL has no `since` param.

- [ ] **Step 3: Implement**

```ts
// apps/desktop/electron/provisioning/BackendProvisioningGateway.ts
  async downloadSnapshot(deviceId: string, since?: string): Promise<ProvisioningSnapshot> {
    const params = new URLSearchParams({ deviceId });
    if (since) params.set('since', since);
    return this.authorized(
      `/desktop/provisioning/snapshot?${params.toString()}`,
      {},
      validateSnapshot,
    );
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @nemis-desktop/desktop test -- provisioning/BackendProvisioningGateway.test.ts`
Expected: PASS, including the pre-existing `downloadSnapshot` test that calls with one argument (URLSearchParams with only `deviceId` set is unchanged behavior).

- [ ] **Step 5: Write the failing worker test for delta-vs-full pull selection**

Add to `apps/desktop/electron/sync/DesktopSyncWorker.test.ts`:

```ts
  it('pulls with since after the first sync, and omits since once 24h have passed since the last full resync', async () => {
    const downloadSnapshot = vi.fn().mockResolvedValue({
      contractVersion: 1,
      snapshotId: 'snap-1',
      generatedAt: '2026-07-29T00:00:00.000Z',
      userId: 'user-1',
      role: 'INSTITUTION_ADMIN',
      scopeType: 'INSTITUTION',
      scopeId: 'school-1',
      deviceId: 'device-1',
      checksumAlgorithm: 'sha256',
      checksum: 'a'.repeat(64),
      manifest: {},
      data: {},
    });
    const gateway = { pushChanges: vi.fn(), downloadSnapshot } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    await worker.syncActive(); // first pull: no lastDeltaAt yet -> full (no since)
    expect(downloadSnapshot).toHaveBeenLastCalledWith('device-1', undefined);

    manager.connection.prepare(`
      UPDATE sync_metadata SET lastDeltaAt=?, lastFullResyncAt=? WHERE id='singleton'
    `).run('2026-07-29T00:00:00.000Z', '2026-07-29T00:00:00.000Z');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T01:00:00.000Z')); // +1h: well within 24h
    await worker.syncActive();
    expect(downloadSnapshot).toHaveBeenLastCalledWith('device-1', '2026-07-29T00:00:00.000Z');

    vi.setSystemTime(new Date('2026-07-30T01:00:00.000Z')); // +25h from lastFullResyncAt
    await worker.syncActive();
    expect(downloadSnapshot).toHaveBeenLastCalledWith('device-1', undefined);
    vi.useRealTimers();
  });
```

This test's mocked snapshot must supply `data` and `manifest` for every key in `PROVISIONING_COLLECTIONS` (`packages/types/src/provisioning.ts:80-93`), each as an empty array / `0` — `ProvisioningImporter.import` iterates that fixed collection list. Replace the `data: {}, manifest: {}` placeholders above with:

```ts
      data: Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, []])),
      manifest: Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, 0])),
```

and add `import { PROVISIONING_COLLECTIONS } from '@nemis-desktop/types';` to the test file's imports.

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @nemis-desktop/desktop test -- sync/DesktopSyncWorker.test.ts`
Expected: FAIL — `downloadSnapshot` is currently always called with exactly one argument.

- [ ] **Step 7: Implement delta-vs-full selection in `syncActive`**

Replace the pull section of `syncActive()` (currently: `if (stillPending.count === 0) { const snapshot = await this.gateway.downloadSnapshot(completion.serverDeviceId); ... }`):

```ts
      const stillPending = workspace.database.connection.prepare(
        `SELECT COUNT(*) count FROM sync_queue WHERE status IN ('pending','in_flight')`,
      ).get() as { count: number };
      if (stillPending.count === 0) {
        const meta = workspace.database.connection.prepare(
          `SELECT lastDeltaAt, lastFullResyncAt FROM sync_metadata WHERE id='singleton'`,
        ).get() as { lastDeltaAt: string | null; lastFullResyncAt: string | null };
        const fullResyncDue =
          !meta.lastFullResyncAt || Date.now() - Date.parse(meta.lastFullResyncAt) >= 24 * 60 * 60_000;
        const since = fullResyncDue ? undefined : (meta.lastDeltaAt ?? undefined);
        const snapshot = await this.gateway.downloadSnapshot(completion.serverDeviceId, since);
        if (this.workspaces.active.identity !== workspace.identity) return;
        new ProvisioningImporter(workspace.database).import(snapshot, {
          userId: workspace.user.id,
          role: workspace.user.role,
          scopeType: workspace.user.scope.type,
          scopeId: workspace.user.scope.scopeId,
          institutionId: workspace.user.institutionId,
          serverDeviceId: completion.serverDeviceId,
        }, { preserveConflicts: true });
        this.#lastPullAt = Date.now();
        const pulledAt = new Date().toISOString();
        workspace.database.connection.prepare(`
          UPDATE sync_metadata SET lastDeltaAt=?${fullResyncDue ? ',lastFullResyncAt=?' : ''} WHERE id='singleton'
        `).run(...(fullResyncDue ? [pulledAt, pulledAt] : [pulledAt]));
      }
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @nemis-desktop/desktop test -- sync/DesktopSyncWorker.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 9: Run the full desktop test suite**

Run: `pnpm --filter @nemis-desktop/desktop test`
Expected: PASS, 0 failures.

- [ ] **Step 10: Typecheck and lint**

Run: `pnpm --filter @nemis-desktop/desktop typecheck && pnpm --filter @nemis-desktop/desktop lint`
Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/electron/provisioning/BackendProvisioningGateway.ts apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts apps/desktop/electron/sync/DesktopSyncWorker.ts apps/desktop/electron/sync/DesktopSyncWorker.test.ts
git commit -m "feat(sync): pull deltas via since after the first sync, with a 24h full-resync safety net"
```

---

## Task 10: Student CRUD offline verification pass

**Files:** none pre-determined — this task exercises existing code and fixes only genuine bugs found. If no bugs are found, no production files change.

**Interfaces:**
- Consumes: the hardened sync engine from Tasks 1-9 (network detection, backoff, delta pulls all now live).
- Produces: a short written note of findings (see Step 6) plus, for any bug found, a regression test + fix following this same TDD structure.

- [ ] **Step 1: Start the app against a real (or locally-run) backend**

Run: `pnpm --filter @nemis-desktop/desktop dev` (ensure `NEMIS_API_URL` in the dev env points at a running `Nemis/apps/Server` instance with a seeded `INSTITUTION_ADMIN` test account — check `apps/desktop/.env.development` or equivalent for the current dev target before starting).

- [ ] **Step 2: Exercise each CRUD flow online, confirming baseline correctness**

Log in as an `INSTITUTION_ADMIN`. In `/government/school-admin/students`:
1. Create a student via the 4-step wizard (with at least one guardian) — confirm it appears in the list immediately.
2. Edit the student via the inline drawer — confirm the change persists after a page refresh.
3. Filter/paginate the list — confirm results match expectations.
4. Enroll the student into a class via `/students/enroll` — confirm the enrollment shows on the profile page.
5. Archive the student, then Restore — confirm status flips both ways and the student remains editable after restore.

Record any deviation from expected behavior (do not fix yet — finish the offline pass first, since a bug might only be reachable offline).

- [ ] **Step 3: Exercise the same flows fully offline**

Disable the machine's network adapter (or block the `apiBaseUrl` host). Repeat steps 1, 2, and 4 from Step 2 (Create, Edit, Enroll — the three actual writes; skip Archive/Restore if time-constrained, since it exercises the identical write path as Edit). For each:
- Confirm the UI returns success immediately (no hang, no spinner waiting on network) — this is the offline-first contract from `CLAUDE.md` §"Offline-First Contract".
- After each write, inspect the local queue: `SELECT entityType, operationType, status FROM sync_queue ORDER BY createdAt DESC LIMIT 5;` against the workspace's SQLite file (path via `app.getPath('userData')/workspaces/<identity>/...` — or add a temporary `console.log` in `DesktopSyncWorker` if easier) and confirm a matching `pending` row appeared for each write, with `entityType` matching the table (`students`, `enrollments`, etc.).

- [ ] **Step 4: Reconnect and confirm the hardened sync path flushes correctly**

Re-enable the network adapter. Confirm, per Task 7's manual smoke check:
- The StatusBar flips to "Online" within ~20s.
- A sync attempt fires immediately (not after waiting for the 30s interval) — watch the terminal log output.
- `sync_queue` rows from Step 3 transition to `completed` (or, if the backend legitimately rejects one, to a `sync_conflicts` row — confirm it surfaces on `/government/school-admin/sync-conflicts`).
- Refresh the student list and confirm the offline-created/edited/enrolled data now also reflects whatever the backend considers authoritative (e.g., a server-assigned field, if any).

- [ ] **Step 5: Exercise the dead-letter path end-to-end (validates Tasks 4-5 against a real write, not just the unit tests)**

With the app still running and online, temporarily point `NEMIS_API_URL` at an unreachable host (or stop the local backend), perform one student edit (queues a `pending` sync item), then restart with the correct `NEMIS_API_URL` but immediately re-break it again before the next 30s sync tick 5 times in a row (or, faster: directly manipulate `sync_queue.retryCount`/`nextAttemptAt` for the item via a SQLite client to simulate 5 elapsed failures). Confirm the item eventually shows up on `/government/school-admin/sync-conflicts` with source "dead_letter" and a working "Retry now" button.

- [ ] **Step 6: Write the findings note**

Create `docs/offline-crud-verification-2026-07-29.md` in `desktop-client-nemis` with: what was tested (Steps 2-5), pass/fail per flow, and for anything deferred rather than fixed, one sentence why. Keep it short — this is a verification record, not a report.

- [ ] **Step 7: For each genuine bug found, fix it with a regression test**

Follow the same TDD structure as every other task in this plan (failing test first, run to confirm fail, minimal fix, run to confirm pass, commit) — scoped to the specific file(s) the bug lives in. Do not expand scope beyond the bug itself.

- [ ] **Step 8: Final full-suite check across both repos**

Run in `desktop-client-nemis`: `pnpm typecheck && pnpm lint && pnpm test`
Run in `Nemis`: `pnpm --filter Server test`
Expected: 0 errors, 0 failures in both.

- [ ] **Step 9: Commit the findings note (and any fixes were already committed per-bug in Step 7)**

```bash
git add docs/offline-crud-verification-2026-07-29.md
git commit -m "docs: record student CRUD offline verification pass"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** §4 (network detection) → Tasks 6-7. §5 (retry/dead-letter) → Tasks 2-5. §6 (shutdown flush) → Task 7 Step 3. §7 (backend delta) → Task 8. §8 (desktop delta consumption) → Task 9. §9 (CRUD verification) → Task 10. All six spec sections have a task.
- **Task 4/main.ts ordering:** Task 4 deliberately leaves `main.ts` failing typecheck until Task 7 — if executing via subagent-driven-development with a strict "must typecheck clean" gate between tasks, merge Tasks 4, 6, and 7 into one execution unit, or relax the gate for Task 4-6 specifically. This is called out again here so it isn't missed.
- **Verification depth:** every file path, method signature, column name, and existing-code quote in this plan was confirmed against the real source during planning (not assumed) — including the backend Prisma schema's per-model timestamp fields (Task 8), the exact `PROVISIONING_COLLECTIONS` list (Task 9), and that `SyncQueueService.fail`/`markFailed` are currently unused in production (safe to newly wire up in Task 4 without touching other callers).
