# Pending Changes Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking "N pending changes" in the desktop status bar opens a page listing every piece of local work not yet on the national server — grouped, plain-language labels, with an opt-in technical view — and the badge counts the same four sources the page lists.

**Architecture:** A main-process `PendingChangesService` composes four `PendingSourceAdapter`s (generic outbox, assignments, grade completions, fee reversals) plus a batched `PendingLabelResolver`, exposed over two new IPC channels (`sync:list-pending` summary, `sync:list-pending-records` lazy paging). The "what is unsynced / what blocks it" SQL is extracted into shared constants so the push code and the page can't drift. The renderer gets a `SyncPendingPage` under each portal and the status-bar count becomes a link; `sync:run` releases backoff before syncing.

**Tech Stack:** Electron main (better-sqlite3), TypeScript strict, Next.js renderer (React 19, Tailwind), `@nemis-desktop/{types,shared,ui}`, Vitest (node + jsdom projects), Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-16-sync-pending-changes-design.md`

## Global Constraints

- Branch: `feature/sync-pending-changes` (already created, spec committed at 58e6dd8). Do NOT commit `apps/desktop/renderer/app/government/school-admin/students/createbulk/page.tsx` — it is the user's own uncommitted edit.
- Pending = pending + in-flight, excluding failures. Dead letters (`status='failed' AND deadLetter=1`) and `grade_completions.syncState='rejected'` count only in `failedCount`.
- `DesktopSyncStatus.pending` = the four-source total = `PendingSummary.total`.
- `sync:list-pending-records` validation: `groupKey` matches `^(outbox|assignments|grade_completions|fee_reversals):[a-z_]+$`; `limit` integer 1–200; `offset` integer ≥ 0.
- Record pages: 50 per "Load more"; any single request ≤ 200.
- Technical details: visible to all roles, off by default, not persisted.
- `sync:run` calls `worker.releaseBackoff()` before `worker.syncActive()`.
- No new UI primitives; existing `@nemis-desktop/ui` (`Alert`, `Badge`, `Button`, `EmptyState`, `ErrorState`, `Skeleton`) and tokens (`rounded-card`, `text-pending`, `text-error`), no shadows, Lucide icons.
- State is always conveyed in text, never colour alone. Group headers are `<button aria-expanded>`.
- SQL stays in the main process; the renderer only touches `window.nemis` via `@/services/nemis-bridge`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **better-sqlite3 ABI:** before running node-project tests run `pnpm rebuild:node`; after the final task run `pnpm rebuild:electron` so the app still starts.
- Test command (repo root): `pnpm vitest run <path>`; typecheck `pnpm typecheck`; lint `pnpm lint`.

## Deviations from the spec (deliberate, small)

- `PendingChangesService` is constructed inside `DesktopSyncWorker` (like `AssignmentSyncService` etc.), not injected via `main.ts` — no `main.ts` change is needed and it matches the existing pattern.
- Attendance labels show the stored ISO date (`2026-10-14`), not `14 Oct 2026` — formatting dates in SQL is brittle and ISO is unambiguous.

## Review Focus

1. **A very large queue** (hundreds/thousands of attendance rows) — summary is one group with an exact total, and a records page returns exactly `limit` rows. Test added to Task 3.
2. **A `sync_queue.payload` that is NULL or not valid JSON** — the page still lists the row (payload `null` or the raw string) instead of the whole call throwing. Test added to Task 3.
3. **A group that finishes syncing between the summary load and the user expanding it** — expanding shows "These changes have just synced." rather than an empty box or an error. Test added to Task 8.
4. **The bridge call failing** (workspace locked after logout, main-process error) — the page shows an `ErrorState` with Retry; it never stays on a skeleton forever. Test added to Task 8.
5. **A grade completion stored for a different institution on a shared device** — it is neither counted nor listed, matching what the push path would send. Test added to Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/sync-labels.ts` (create) | `humanizeEntityType`, `pickEntityLabel` — moved from the renderer so main and renderer share one fallback label. |
| `packages/types/src/sync.ts` (modify) | Pending-changes wire types. |
| `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts` (modify) | Export `OUTBOX_BLOCKER_SQL`. |
| `apps/desktop/electron/sync/pendingPredicates.ts` (create) | Shared "unsynced" / "gate" SQL for the bespoke push paths. |
| `apps/desktop/electron/sync/pending/types.ts` (create) | `PendingContext`, `RawPendingRow`, `PendingSourceAdapter`, `parsePayload`. |
| `apps/desktop/electron/sync/pending/groups.ts` (create) | Group keys, labels, `buildGroup`. |
| `apps/desktop/electron/sync/pending/OutboxPendingSource.ts` (create) | Generic outbox adapter. |
| `apps/desktop/electron/sync/pending/AssignmentPendingSource.ts`, `GradeCompletionPendingSource.ts`, `FeeReversalPendingSource.ts` (create) | Bespoke adapters. |
| `apps/desktop/electron/sync/pending/PendingLabelResolver.ts` (create) | Batched label lookups. |
| `apps/desktop/electron/sync/pending/PendingChangesService.ts` (create) | Composes adapters + resolver. |
| `apps/desktop/electron/sync/pending/pending.test-support.ts` (create) | In-memory DB + seed helpers for the pending tests. |
| `apps/desktop/electron/sync/DesktopSyncWorker.ts` (modify) | `getStatus().pending`, `listPending`, `listPendingRecords`; use shared predicates. |
| `apps/desktop/electron/security/validateIpc.ts` (modify) | `assertListPendingRecordsArgs`. |
| `apps/desktop/electron/ipc/handlers/shared/sync.ts` (modify) | New channels; `SYNC_RUN` releases backoff. |
| `packages/types/src/ipc.ts`, `packages/types/src/api.ts`, `apps/desktop/electron/preload/shared/sync-api.ts`, `apps/desktop/renderer/services/nemis-bridge.ts`, `apps/desktop/renderer/services/nemis-bridge/shared/sync-bridge.ts` (modify) | Wiring. |
| `apps/desktop/renderer/components/sync/shared.tsx` (modify) | Re-export moved helpers; add `retryCountdown`. |
| `apps/desktop/renderer/components/sync/SyncPendingPage.tsx` (create) | The page. |
| `apps/desktop/renderer/app/government/{ministry-portal,county,deo,school-admin,teacher}/sync-pending/page.tsx` (create) | Routes. |
| `apps/desktop/renderer/components/shell/StatusBar.tsx` (modify) | Count becomes a link. |

---

### Task 1: Shared label helpers + pending wire types

**Files:**
- Create: `packages/shared/src/sync-labels.ts`
- Create: `packages/shared/src/sync-labels.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/desktop/renderer/components/sync/shared.tsx` (remove `NAME_KEYS`, `humanizeEntityType`, `pickEntityLabel` definitions; re-export)
- Modify: `packages/types/src/sync.ts`

**Interfaces:**
- Produces: `humanizeEntityType(entityType: string): string`, `pickEntityLabel(localPayload: unknown, remotePayload: unknown, entityType: string, entityId: string): string` from `@nemis-desktop/shared`.
- Produces (types): `PendingSource`, `PendingItemState`, `PendingGroupSummary`, `PendingRecord`, `PendingSummary`, `ListPendingRecordsRequest`, `ListPendingRecordsResult` from `@nemis-desktop/types`.

- [ ] **Step 1: Write the failing test** — `packages/shared/src/sync-labels.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { humanizeEntityType, pickEntityLabel } from './sync-labels';

describe('humanizeEntityType', () => {
  it('title-cases snake and upper case', () => {
    expect(humanizeEntityType('student_guardians')).toBe('Student Guardians');
    expect(humanizeEntityType('FEE_PAYMENT')).toBe('Fee Payment');
  });
});

describe('pickEntityLabel', () => {
  it('uses a name key from the edited record', () => {
    expect(pickEntityLabel({ record: { name: 'Grade 5A' } }, null, 'classes', 'c1')).toBe('Grade 5A');
  });
  it('joins first and last name', () => {
    expect(pickEntityLabel({ record: { firstName: 'Musu', lastName: 'Kollie' } }, null, 'students', 's1')).toBe('Musu Kollie');
  });
  it('falls back to the envelope base for a delete', () => {
    expect(pickEntityLabel({ base: { firstName: 'Ada', lastName: 'Lovelace' } }, null, 'students', 's1')).toBe('Ada Lovelace');
  });
  it('reads a bare (non-envelope) row', () => {
    expect(pickEntityLabel({ title: 'Essay 1' }, null, 'assignments', 'a1')).toBe('Essay 1');
  });
  it('falls back to type and a short id', () => {
    expect(pickEntityLabel(null, null, 'widgets', 'abcdef123456')).toBe('Widgets · abcdef12…');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm rebuild:node` (once per session), then `pnpm vitest run packages/shared/src/sync-labels.test.ts`
Expected: FAIL — cannot resolve `./sync-labels`.

- [ ] **Step 3: Create `packages/shared/src/sync-labels.ts`** (logic moved verbatim from `renderer/components/sync/shared.tsx`)

```ts
/** Human labels for a sync payload, shared by the main process (pending
 * changes page) and the renderer (sync conflicts page) so both fall back to
 * the same text for a record they can't otherwise name. */
import { isPlainObject, unwrapLocalPayload } from './sync-conflict';

const NAME_KEYS = [
  'fullName', 'name', 'title', 'displayName',
  'studentName', 'staffName', 'className', 'subjectName',
];

/** "FEE_PAYMENT" -> "Fee Payment". */
export function humanizeEntityType(entityType: string): string {
  return entityType
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function pickEntityLabel(
  localPayload: unknown,
  remotePayload: unknown,
  entityType: string,
  entityId: string,
): string {
  const { edited, original } = unwrapLocalPayload(localPayload);
  for (const payload of [edited, original, remotePayload]) {
    if (!isPlainObject(payload)) continue;
    for (const key of NAME_KEYS) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    const first = payload['firstName'];
    const last = payload['lastName'];
    if ((typeof first === 'string' && first) || (typeof last === 'string' && last)) {
      return [first, last].filter((part) => typeof part === 'string' && part).join(' ');
    }
  }
  const shortId = entityId.length > 8 ? `${entityId.slice(0, 8)}…` : entityId;
  return `${humanizeEntityType(entityType)} · ${shortId}`;
}
```

Before relying on "reads a bare row": open `packages/shared/src/sync-conflict.ts` and confirm `unwrapLocalPayload` returns `{ edited: payload, original: null }` for a non-envelope object (its branch after line 27). If it does not, the bare-row test fails — in that case keep the test and change nothing else; report it instead of altering `unwrapLocalPayload` (the conflicts screen depends on it).

- [ ] **Step 4: Export it** — append to `packages/shared/src/index.ts`:

```ts
export * from './sync-labels';
```

- [ ] **Step 5: Point the renderer at the shared copy** — in `apps/desktop/renderer/components/sync/shared.tsx` delete the `NAME_KEYS` constant, the `humanizeEntityType` function and the `pickEntityLabel` function, and change the export line under the import to:

```ts
export { isPlainObject, unwrapLocalPayload };
export { humanizeEntityType, pickEntityLabel } from '@nemis-desktop/shared';
```

If anything left in `shared.tsx` still calls `humanizeEntityType` itself, add it to the existing `import { … } from '@nemis-desktop/shared'` line too.

- [ ] **Step 6: Add the wire types** — append to `packages/types/src/sync.ts`:

```ts
/** Where a piece of unsynced work is recorded on this device. */
export type PendingSource = 'outbox' | 'assignments' | 'grade_completions' | 'fee_reversals';

/** sending = in flight; waiting = goes on the next sync; retrying = backed
 * off until nextAttemptAt; held = waits for an earlier item to sync first. */
export type PendingItemState = 'sending' | 'waiting' | 'retrying' | 'held';

export interface PendingGroupSummary {
  /** `${source}:${entityType}`, e.g. 'outbox:attendance'. */
  groupKey: string;
  source: PendingSource;
  label: string;
  total: number;
  byState: Record<PendingItemState, number>;
  oldestAt: string;
}

export interface PendingRecord {
  /** sync_queue.id for the outbox; the entity's own id for bespoke sources. */
  id: string;
  entityType: string;
  entityId: string;
  operationType: 'create' | 'update' | 'delete';
  label: string;
  state: PendingItemState;
  createdAt: string;
  nextAttemptAt: string | null;
  retryCount: number;
  lastError: string | null;
  payload: unknown;
}

export interface PendingSummary {
  groups: PendingGroupSummary[];
  total: number;
  /** Dead-lettered outbox rows + rejected grade completions. */
  failedCount: number;
  /** True when at least one source could not be read. */
  partial: boolean;
}

export interface ListPendingRecordsRequest {
  groupKey: string;
  limit: number;
  offset: number;
}

export interface ListPendingRecordsResult {
  records: PendingRecord[];
  total: number;
}
```

Also update the `DesktopSyncStatus.pending` field in the same file with a doc comment (no type change):

```ts
  /** Unsynced work across the outbox and every bespoke push path (pending +
   * in flight, excluding failures) — same number as PendingSummary.total. */
  pending: number;
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm vitest run packages/shared/src/sync-labels.test.ts` → PASS.
Run: `pnpm typecheck` → no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/sync-labels.ts packages/shared/src/sync-labels.test.ts packages/shared/src/index.ts apps/desktop/renderer/components/sync/shared.tsx packages/types/src/sync.ts
git commit -m "feat(sync): share entity label helpers and add pending-changes wire types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Extract the shared "unsynced" predicates (no behaviour change)

**Files:**
- Create: `apps/desktop/electron/sync/pendingPredicates.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts:85-97`
- Modify: `apps/desktop/electron/sync/AssignmentSyncService.ts:40-64`
- Modify: `apps/desktop/electron/sync/GradeCompletionSyncService.ts:44-53` and `#loadGroups`
- Modify: `apps/desktop/electron/sync/FeeReversalSyncService.ts:24-41`
- Modify: `apps/desktop/electron/sync/DesktopSyncWorker.ts:114-123` (`reversalPending`, `completionPending`)
- Test: existing `SqliteSyncQueueRepository.test.ts`, `AssignmentSyncService*.test.ts`, `GradeCompletionSyncService.test.ts`, `FeeReversalSyncService.test.ts`, `DesktopSyncWorker.test.ts`

**Interfaces:**
- Produces: `OUTBOX_BLOCKER_SQL` (bind: now ISO; returns `{ blocker: number | null }`) from `SqliteSyncQueueRepository.ts`.
- Produces from `sync/pendingPredicates.ts`: `ASSIGNMENT_DIRTY`, `SUBMISSION_DIRTY` (alias `s`), `GRADE_COMPLETION_PENDING` (one `?` = institutionId), `STUDENT_RECORDS_UNSETTLED`, `FEE_REVERSAL_PENDING`, `feePaymentUnsettled(paymentIdExpr: string): string`.

- [ ] **Step 1: Run the guarding tests first (they must be green before the refactor)**

Run: `pnpm vitest run apps/desktop/electron/sync apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.test.ts`
Expected: PASS. Note the count; it must be identical after the refactor.

- [ ] **Step 2: Create `apps/desktop/electron/sync/pendingPredicates.ts`**

```ts
/** "Not yet on the server" predicates for the bespoke push paths, and the
 * ordering gates that hold them back. Each push service and its
 * pending-changes source (sync/pending/) read the same constant, so the
 * Pending changes page can never list something the push would skip, or
 * miss something it would send. */

/** assignments: never pushed, or edited since the last push. */
export const ASSIGNMENT_DIRTY = `(syncedAt IS NULL OR updatedAt > syncedAt)`;

/** assignment_submissions aliased `s`: only graded rows ever push. */
export const SUBMISSION_DIRTY = `(s.grade IS NOT NULL AND (s.syncedAt IS NULL OR s.updatedAt > s.syncedAt))`;

/** grade_completions queued for this institution. Bind: institutionId. */
export const GRADE_COMPLETION_PENDING = `syncState='pending' AND institutionId=?`;

/** Ordering gate for grade completions: the server can only stamp students
 * and enrolments it already has. Waits only on rows that can still go
 * through — dead-lettered ones ('failed') never self-resolve. */
export const STUDENT_RECORDS_UNSETTLED = `EXISTS (
  SELECT 1 FROM sync_queue
  WHERE entityType IN ('students','enrollments') AND status IN ('pending','in_flight')
)`;

/** fee_payment_reversals not yet accepted by the server. */
export const FEE_REVERSAL_PENDING = `syncedAt IS NULL`;

/** Ordering gate for a reversal: the server can only reverse a payment it
 * already has, so anything but a completed create holds it back.
 * `paymentIdExpr` is `?` or a column reference. */
export function feePaymentUnsettled(paymentIdExpr: string): string {
  return `EXISTS (
    SELECT 1 FROM sync_queue
    WHERE entityType='fee_payments' AND entityId=${paymentIdExpr} AND status<>'completed'
  )`;
}
```

- [ ] **Step 3: Export the outbox blocker SQL** — in `SqliteSyncQueueRepository.ts`, above the class:

```ts
/** Lowest seq of a backed-off pending row. Every row written after it waits
 * (nextBatch), so a student's guardian link and enrolment are never pushed
 * before the student. Shared with the Pending changes page's "held" state.
 * Bind: now (ISO). */
export const OUTBOX_BLOCKER_SQL = `SELECT MIN(seq) AS blocker FROM sync_queue
         WHERE status = 'pending' AND deadLetter = 0
           AND nextAttemptAt IS NOT NULL AND nextAttemptAt > ?`;
```

and in `nextBatch` replace the inline SQL string passed to `this.statements.get(...)` with `OUTBOX_BLOCKER_SQL` (keep the existing comment above it).

- [ ] **Step 4: Use the predicates in the three services and the worker**

`AssignmentSyncService.pushPending`:
```ts
         FROM assignments WHERE ${ASSIGNMENT_DIRTY}`,
```
```ts
         WHERE ${SUBMISSION_DIRTY}
           AND a.remoteId IS NOT NULL`,
```

`GradeCompletionSyncService` — gate:
```ts
        const { blocked } = db
          .prepare(`SELECT ${STUDENT_RECORDS_UNSETTLED} AS blocked`)
          .get() as { blocked: number };
        if (blocked) continue;
```
`#loadGroups`:
```ts
         WHERE ${GRADE_COMPLETION_PENDING}
```

`FeeReversalSyncService.pushPending`:
```ts
        `SELECT id, paymentId, reason, notes FROM fee_payment_reversals WHERE ${FEE_REVERSAL_PENDING}`,
```
gate (keep the existing comment):
```ts
      const { blocked } = db
        .prepare(`SELECT ${feePaymentUnsettled('?')} AS blocked`)
        .get(row.paymentId) as { blocked: number };
      if (blocked) continue;
```

`DesktopSyncWorker.#runCycle`:
```ts
      reversalPending = workspace.database.connection.prepare(
        `SELECT 1 found FROM fee_payment_reversals WHERE ${FEE_REVERSAL_PENDING} LIMIT 1`,
      ).get() as { found: number } | undefined;
```
```ts
      completionPending = workspace.database.connection.prepare(
        `SELECT 1 found FROM grade_completions WHERE ${GRADE_COMPLETION_PENDING} LIMIT 1`,
      ).get(institutionIdOf(workspace.user)) as { found: number } | undefined;
```

Add the imports (`import { … } from './pendingPredicates';` in the sync services and worker).

- [ ] **Step 5: Re-run the guarding tests**

Run: same command as Step 1. Expected: PASS with the same test count.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/sync/pendingPredicates.ts apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts apps/desktop/electron/sync/AssignmentSyncService.ts apps/desktop/electron/sync/GradeCompletionSyncService.ts apps/desktop/electron/sync/FeeReversalSyncService.ts apps/desktop/electron/sync/DesktopSyncWorker.ts
git commit -m "refactor(sync): share unsynced-work predicates between push paths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Adapter contract + outbox source

**Files:**
- Create: `apps/desktop/electron/sync/pending/types.ts`
- Create: `apps/desktop/electron/sync/pending/groups.ts`
- Create: `apps/desktop/electron/sync/pending/pending.test-support.ts`
- Create: `apps/desktop/electron/sync/pending/OutboxPendingSource.ts`
- Test: `apps/desktop/electron/sync/pending/OutboxPendingSource.test.ts`

**Interfaces:**
- Consumes: `OUTBOX_BLOCKER_SQL` (Task 2); pending types (Task 1); `humanizeEntityType` (Task 1).
- Produces (`types.ts`):
  ```ts
  interface PendingContext { db: SqliteDatabase; institutionId: string; now: string }
  type RawPendingRow = Omit<PendingRecord, 'label'>
  interface PendingSourceAdapter {
    readonly source: PendingSource;
    summarize(ctx: PendingContext): PendingGroupSummary[];
    listRecords(ctx: PendingContext, entityType: string, limit: number, offset: number): { rows: RawPendingRow[]; total: number };
    countPending(ctx: PendingContext): number;
    countFailed(ctx: PendingContext): number;
  }
  function parsePayload(text: string | null): unknown
  ```
- Produces (`groups.ts`): `groupKeyOf(source, entityType): string`, `groupLabelOf(source, entityType): string`, `parseGroupKey(groupKey): { source: PendingSource; entityType: string } | null`, `buildGroup(source, entityType, byState: Partial<Record<PendingItemState, number>>, oldestAt: string): PendingGroupSummary`.
- Produces: `class OutboxPendingSource implements PendingSourceAdapter` (`source = 'outbox'`).
- Produces (test support): `NOW`, `PAST`, `FUTURE`, `SCHOOL`, `memoryDb()`, `ctx(db, now?)`, `queueRow(db, row)`, `seedStudent`, `seedClass`, `seedSubject`, `seedAssignment`, `seedSubmission`, `seedGradeCompletion`, `seedReversal`.

- [ ] **Step 1: Create `types.ts`**

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  PendingGroupSummary,
  PendingRecord,
  PendingSource,
} from '@nemis-desktop/types';

/** What every pending source reads against: the active workspace's
 * connection, its institution (grade completions are institution-scoped,
 * like their push), and one clock reading for the whole call. */
export interface PendingContext {
  db: SqliteDatabase;
  institutionId: string;
  now: string;
}

/** A record before PendingLabelResolver names it. */
export type RawPendingRow = Omit<PendingRecord, 'label'>;

export interface PendingSourceAdapter {
  readonly source: PendingSource;
  summarize(ctx: PendingContext): PendingGroupSummary[];
  listRecords(
    ctx: PendingContext,
    entityType: string,
    limit: number,
    offset: number,
  ): { rows: RawPendingRow[]; total: number };
  countPending(ctx: PendingContext): number;
  countFailed(ctx: PendingContext): number;
}

/** sync_queue.payload is TEXT; a NULL or malformed one must not hide the row. */
export function parsePayload(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
```

- [ ] **Step 2: Create `groups.ts`**

```ts
import { humanizeEntityType } from '@nemis-desktop/shared';
import type { PendingGroupSummary, PendingItemState, PendingSource } from '@nemis-desktop/types';

const SOURCES: readonly PendingSource[] = ['outbox', 'assignments', 'grade_completions', 'fee_reversals'];

const LABELS: Readonly<Record<string, string>> = {
  'outbox:academic_years': 'Academic years',
  'outbox:terms': 'Terms',
  'outbox:classes': 'Classes',
  'outbox:subjects': 'Subjects',
  'outbox:class_subjects': 'Class subjects',
  'outbox:students': 'Students',
  'outbox:guardians': 'Guardians',
  'outbox:student_guardians': 'Guardian links',
  'outbox:enrollments': 'Enrollments',
  'outbox:attendance': 'Attendance',
  'outbox:staff': 'Staff',
  'outbox:subject_teachers': 'Subject teachers',
  'outbox:class_teachers': 'Class teachers',
  'outbox:class_subject_teachers': 'Class subject teachers',
  'outbox:timetable_entries': 'Timetable',
  'outbox:assessment_templates': 'Assessment templates',
  'outbox:assessments': 'Assessments',
  'outbox:grades': 'Grades',
  'outbox:grading_periods': 'Grading periods',
  'outbox:grade_entry_windows': 'Grade entry windows',
  'outbox:fee_rules': 'Fee rules',
  'outbox:fee_obligations': 'Fee obligations',
  'outbox:fee_payments': 'Fee payments',
  'assignments:assignments': 'Assignments',
  'assignments:assignment_submissions': 'Assignment grades',
  'grade_completions:grade_completions': 'End-of-year outcomes',
  'fee_reversals:fee_payment_reversals': 'Payment reversals',
};

export function groupKeyOf(source: PendingSource, entityType: string): string {
  return `${source}:${entityType}`;
}

export function groupLabelOf(source: PendingSource, entityType: string): string {
  return LABELS[groupKeyOf(source, entityType)] ?? humanizeEntityType(entityType);
}

export function parseGroupKey(groupKey: string): { source: PendingSource; entityType: string } | null {
  const at = groupKey.indexOf(':');
  if (at <= 0) return null;
  const source = groupKey.slice(0, at) as PendingSource;
  const entityType = groupKey.slice(at + 1);
  return SOURCES.includes(source) && entityType ? { source, entityType } : null;
}

export function buildGroup(
  source: PendingSource,
  entityType: string,
  byState: Partial<Record<PendingItemState, number>>,
  oldestAt: string,
): PendingGroupSummary {
  const full: Record<PendingItemState, number> = {
    sending: byState.sending ?? 0,
    waiting: byState.waiting ?? 0,
    retrying: byState.retrying ?? 0,
    held: byState.held ?? 0,
  };
  return {
    groupKey: groupKeyOf(source, entityType),
    source,
    label: groupLabelOf(source, entityType),
    total: full.sending + full.waiting + full.retrying + full.held,
    byState: full,
    oldestAt,
  };
}
```

- [ ] **Step 3: Create `pending.test-support.ts`**

```ts
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { migrations } from '@app/database/migrations/registry';
import type { PendingContext } from './types';

export const NOW = '2026-10-16T12:00:00.000Z';
export const PAST = '2026-10-16T11:00:00.000Z';
export const FUTURE = '2026-10-16T12:05:00.000Z';
export const SCHOOL = 'school-1';

export function memoryDb(): SqliteDatabase {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(db);
  // Seeds write tracked tables directly; keep the outbox triggers from
  // adding queue rows the tests didn't ask for.
  db.prepare(`UPDATE sync_runtime SET captureEnabled = 0`).run();
  return db;
}

export function ctx(db: SqliteDatabase, now = NOW): PendingContext {
  return { db, institutionId: SCHOOL, now };
}

export interface QueueRowInput {
  id: string;
  seq: number;
  entityType?: string;
  entityId?: string;
  operationType?: 'create' | 'update' | 'delete';
  status?: 'pending' | 'in_flight' | 'completed' | 'failed';
  nextAttemptAt?: string | null;
  deadLetter?: 0 | 1;
  retryCount?: number;
  createdAt?: string;
  payload?: string | null;
}

export function queueRow(db: SqliteDatabase, row: QueueRowInput): void {
  db.prepare(
    `INSERT INTO sync_queue
       (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt,nextAttemptAt,deadLetter,seq)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id,
    row.entityType ?? 'students',
    row.entityId ?? `e-${row.id}`,
    row.operationType ?? 'create',
    row.payload === undefined ? '{"record":{}}' : row.payload,
    row.retryCount ?? 0,
    row.status ?? 'pending',
    row.createdAt ?? PAST,
    row.createdAt ?? PAST,
    row.nextAttemptAt ?? null,
    row.deadLetter ?? 0,
    row.seq,
  );
}

export function seedStudent(db: SqliteDatabase, id: string, firstName: string, lastName: string, nemisId: string | null = null): void {
  db.prepare(
    `INSERT INTO students (id,institutionId,firstName,lastName,dateOfBirth,gender,version,updatedAt,nemisId)
     VALUES (?,?,?,?,'2015-01-01','FEMALE',1,?,?)`,
  ).run(id, SCHOOL, firstName, lastName, PAST, nemisId);
}

export function seedClass(db: SqliteDatabase, id: string, name: string): void {
  db.prepare(
    `INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,version,updatedAt)
     VALUES (?,?,'y1',?,'GRADE_5',1,?)`,
  ).run(id, SCHOOL, name, PAST);
}

export function seedSubject(db: SqliteDatabase, id: string, name: string): void {
  db.prepare(
    `INSERT INTO subjects (id,institutionId,name,code,version,updatedAt) VALUES (?,?,?,?,1,?)`,
  ).run(id, SCHOOL, name, id, PAST);
}

export function seedAssignment(
  db: SqliteDatabase,
  id: string,
  opts: { title?: string; remoteId?: string | null; updatedAt?: string; syncedAt?: string | null } = {},
): void {
  db.prepare(
    `INSERT INTO assignments (id,classId,subjectId,teacherId,title,type,status,dueDate,createdAt,updatedAt,remoteId,syncedAt)
     VALUES (?,'c1',NULL,'t1',?,'HOMEWORK','PUBLISHED','2026-11-01',?,?,?,?)`,
  ).run(id, opts.title ?? 'Essay', PAST, opts.updatedAt ?? PAST, opts.remoteId ?? null, opts.syncedAt ?? null);
}

export function seedSubmission(
  db: SqliteDatabase,
  id: string,
  assignmentId: string,
  opts: { studentId?: string; grade?: number | null; updatedAt?: string; syncedAt?: string | null } = {},
): void {
  db.prepare(
    `INSERT INTO assignment_submissions (id,assignmentId,studentId,status,grade,createdAt,updatedAt,syncedAt)
     VALUES (?,?,?,'GRADED',?,?,?,?)`,
  ).run(id, assignmentId, opts.studentId ?? 's1', opts.grade === undefined ? 80 : opts.grade, PAST, opts.updatedAt ?? PAST, opts.syncedAt ?? null);
}

export function seedGradeCompletion(
  db: SqliteDatabase,
  id: string,
  opts: { studentId?: string; state?: 'pending' | 'synced' | 'rejected'; institutionId?: string; updatedAt?: string; syncError?: string | null } = {},
): void {
  db.prepare(
    `INSERT INTO grade_completions
       (id,studentId,institutionId,academicYearId,gradeLevel,outcome,nextGradeLevel,createdAt,updatedAt,syncState,syncError)
     VALUES (?,?,?,'y1','GRADE_7','PROMOTED','GRADE_8',?,?,?,?)`,
  ).run(id, opts.studentId ?? 's1', opts.institutionId ?? SCHOOL, PAST, opts.updatedAt ?? PAST, opts.state ?? 'pending', opts.syncError ?? null);
}

export function seedReversal(
  db: SqliteDatabase,
  id: string,
  paymentId: string,
  opts: { syncedAt?: string | null; updatedAt?: string } = {},
): void {
  db.prepare(
    `INSERT INTO fee_payment_reversals
       (id,paymentId,institutionId,reason,notes,reversedBy,reversedAt,createdAt,updatedAt,syncedAt)
     VALUES (?,?,?,'wrong amount',NULL,'admin-1',?,?,?,?)`,
  ).run(id, paymentId, SCHOOL, PAST, PAST, opts.updatedAt ?? PAST, opts.syncedAt ?? null);
}
```

- [ ] **Step 4: Write the failing tests** — `OutboxPendingSource.test.ts`

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DatabaseManager } from '@app/database/DatabaseManager';
import { createDataLayer } from '@app/data/factories/createDataLayer';
import { OutboxPendingSource } from './OutboxPendingSource';
import { FUTURE, NOW, PAST, ctx, memoryDb, queueRow } from './pending.test-support';

const source = new OutboxPendingSource();

describe('OutboxPendingSource', () => {
  it('classifies sending, waiting, retrying and held', () => {
    const db = memoryDb();
    queueRow(db, { id: 'a', seq: 1, status: 'in_flight' });
    queueRow(db, { id: 'b', seq: 2 });
    queueRow(db, { id: 'c', seq: 3, nextAttemptAt: FUTURE, retryCount: 1 });
    queueRow(db, { id: 'd', seq: 4 });
    queueRow(db, { id: 'e', seq: 5, nextAttemptAt: PAST });

    const [group] = source.summarize(ctx(db));
    expect(group).toMatchObject({
      groupKey: 'outbox:students',
      label: 'Students',
      total: 5,
      byState: { sending: 1, waiting: 1, retrying: 1, held: 2 },
      oldestAt: PAST,
    });
    const { rows } = source.listRecords(ctx(db), 'students', 50, 0);
    expect(rows.map((row) => [row.id, row.state])).toEqual([
      ['a', 'sending'], ['b', 'waiting'], ['c', 'retrying'], ['d', 'held'], ['e', 'held'],
    ]);
  });

  it('excludes completed rows and dead letters, and counts dead letters as failed', () => {
    const db = memoryDb();
    queueRow(db, { id: 'done', seq: 1, status: 'completed' });
    queueRow(db, { id: 'dead', seq: 2, status: 'failed', deadLetter: 1 });
    queueRow(db, { id: 'live', seq: 3 });
    expect(source.countPending(ctx(db))).toBe(1);
    expect(source.countFailed(ctx(db))).toBe(1);
    expect(source.summarize(ctx(db))[0]?.total).toBe(1);
  });

  it('groups by entity type and reports the latest error', () => {
    const db = memoryDb();
    queueRow(db, { id: 'att', seq: 1, entityType: 'attendance', nextAttemptAt: FUTURE, retryCount: 2 });
    queueRow(db, { id: 'stu', seq: 2, entityType: 'students' });
    db.prepare(`INSERT INTO sync_errors (id,operationId,message,retryCount,createdAt) VALUES ('e1','att','old',1,?),('e2','att','Server said no',2,?)`).run(PAST, NOW);

    expect(source.summarize(ctx(db)).map((g) => g.groupKey).sort()).toEqual(['outbox:attendance', 'outbox:students']);
    const [row] = source.listRecords(ctx(db), 'attendance', 50, 0).rows;
    expect(row).toMatchObject({ id: 'att', entityType: 'attendance', retryCount: 2, lastError: 'Server said no', nextAttemptAt: FUTURE });
  });

  it('pages a large group with an exact total', () => {
    const db = memoryDb();
    for (let i = 1; i <= 500; i += 1) queueRow(db, { id: `q${i}`, seq: i, entityType: 'attendance' });
    expect(source.summarize(ctx(db))[0]?.total).toBe(500);
    const page = source.listRecords(ctx(db), 'attendance', 50, 100);
    expect(page.total).toBe(500);
    expect(page.rows).toHaveLength(50);
    expect(page.rows[0]?.id).toBe('q101');
  });

  it('survives a NULL or malformed payload', () => {
    const db = memoryDb();
    queueRow(db, { id: 'n', seq: 1, payload: null });
    queueRow(db, { id: 'm', seq: 2, payload: '{not json' });
    const { rows } = source.listRecords(ctx(db), 'students', 50, 0);
    expect(rows.map((row) => row.payload)).toEqual([null, '{not json']);
  });

  it('labels exactly the rows nextBatch would claim as waiting', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-pending-parity-'));
    const manager = new DatabaseManager({
      userDataDir: directory,
      device: { deviceName: 'parity', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0' },
    });
    try {
      manager.initialize();
      const data = createDataLayer(manager, { info: () => {}, warn: () => {}, error: () => {} });
      const db = manager.connection;
      const future = new Date(Date.now() + 10 * 60_000).toISOString();
      const past = new Date(Date.now() - 10 * 60_000).toISOString();
      queueRow(db, { id: 'w1', seq: 1 });
      queueRow(db, { id: 'w2', seq: 2, nextAttemptAt: past });
      queueRow(db, { id: 'r1', seq: 3, nextAttemptAt: future });
      queueRow(db, { id: 'h1', seq: 4 });
      queueRow(db, { id: 'f1', seq: 5, status: 'in_flight' });
      queueRow(db, { id: 'x1', seq: 6, status: 'failed', deadLetter: 1 });

      const claimable = data.repositories.syncQueue.nextBatch(10_000).map((item) => item.id).sort();
      const waiting = source
        .listRecords({ db, institutionId: 'school-1', now: new Date().toISOString() }, 'students', 200, 0)
        .rows.filter((row) => row.state === 'waiting')
        .map((row) => row.id)
        .sort();
      expect(waiting).toEqual(claimable);
      expect(waiting).toEqual(['w1', 'w2']);
    } finally {
      manager.shutdown();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `pnpm vitest run apps/desktop/electron/sync/pending/OutboxPendingSource.test.ts`
Expected: FAIL — cannot resolve `./OutboxPendingSource`.

- [ ] **Step 6: Implement `OutboxPendingSource.ts`**

```ts
import { OUTBOX_BLOCKER_SQL } from '@app/data/repositories/sqlite/SqliteSyncQueueRepository';
import type { PendingGroupSummary, PendingItemState } from '@nemis-desktop/types';
import { buildGroup } from './groups';
import { parsePayload, type PendingContext, type PendingSourceAdapter, type RawPendingRow } from './types';

/** Mirrors SqliteSyncQueueRepository.nextBatch: a due row with seq above the
 * blocker is held, not waiting. Order matters — a held row that is itself
 * backed off reports 'retrying'. */
const STATE_SQL = `CASE
  WHEN q.status = 'in_flight' THEN 'sending'
  WHEN q.nextAttemptAt IS NOT NULL AND q.nextAttemptAt > @now THEN 'retrying'
  WHEN @blocker IS NOT NULL AND q.seq IS NOT NULL AND q.seq > @blocker THEN 'held'
  ELSE 'waiting'
END`;
const OPEN = `q.status IN ('pending','in_flight')`;

interface SummaryRow {
  entityType: string;
  sending: number;
  waiting: number;
  retrying: number;
  held: number;
  oldestAt: string;
}

interface RecordRow {
  id: string;
  entityType: string;
  entityId: string;
  operationType: RawPendingRow['operationType'];
  payload: string | null;
  createdAt: string;
  nextAttemptAt: string | null;
  retryCount: number;
  state: PendingItemState;
  lastError: string | null;
}

export class OutboxPendingSource implements PendingSourceAdapter {
  readonly source = 'outbox' as const;

  summarize(ctx: PendingContext): PendingGroupSummary[] {
    const rows = ctx.db.prepare(`
      SELECT entityType,
             SUM(state = 'sending') AS sending, SUM(state = 'waiting') AS waiting,
             SUM(state = 'retrying') AS retrying, SUM(state = 'held') AS held,
             MIN(createdAt) AS oldestAt
      FROM (SELECT q.entityType, q.createdAt, ${STATE_SQL} AS state FROM sync_queue q WHERE ${OPEN})
      GROUP BY entityType
    `).all(this.#params(ctx)) as SummaryRow[];
    return rows.map((row) =>
      buildGroup('outbox', row.entityType, {
        sending: row.sending, waiting: row.waiting, retrying: row.retrying, held: row.held,
      }, row.oldestAt),
    );
  }

  listRecords(ctx: PendingContext, entityType: string, limit: number, offset: number) {
    const params = { ...this.#params(ctx), entityType, limit, offset };
    const rows = ctx.db.prepare(`
      SELECT q.id, q.entityType, q.entityId, q.operationType, q.payload, q.createdAt,
             q.nextAttemptAt, q.retryCount, ${STATE_SQL} AS state,
             (SELECT e.message FROM sync_errors e WHERE e.operationId = q.id
              ORDER BY e.createdAt DESC, e.id DESC LIMIT 1) AS lastError
      FROM sync_queue q
      WHERE ${OPEN} AND q.entityType = @entityType
      ORDER BY q.seq, q.createdAt, q.id
      LIMIT @limit OFFSET @offset
    `).all(params) as RecordRow[];
    const { total } = ctx.db.prepare(
      `SELECT COUNT(*) AS total FROM sync_queue q WHERE ${OPEN} AND q.entityType = ?`,
    ).get(entityType) as { total: number };
    return {
      rows: rows.map((row): RawPendingRow => ({ ...row, payload: parsePayload(row.payload) })),
      total,
    };
  }

  countPending(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM sync_queue WHERE status IN ('pending','in_flight')`,
    ).get() as { n: number }).n;
  }

  countFailed(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'failed' AND deadLetter = 1`,
    ).get() as { n: number }).n;
  }

  #params(ctx: PendingContext): { now: string; blocker: number | null } {
    const { blocker } = ctx.db.prepare(OUTBOX_BLOCKER_SQL).get(ctx.now) as { blocker: number | null };
    return { now: ctx.now, blocker };
  }
}
```

If the `@app/...` alias import of the repository constant trips the main-process import rules, use the relative path `../../data/repositories/sqlite/SqliteSyncQueueRepository` instead (both resolve in Vitest and the Vite main build).

- [ ] **Step 7: Run tests**

Run: `pnpm vitest run apps/desktop/electron/sync/pending/OutboxPendingSource.test.ts` → PASS (6 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/electron/sync/pending/
git commit -m "feat(sync): outbox source for the pending changes page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Bespoke sources (assignments, grade completions, fee reversals)

**Files:**
- Create: `apps/desktop/electron/sync/pending/AssignmentPendingSource.ts`
- Create: `apps/desktop/electron/sync/pending/GradeCompletionPendingSource.ts`
- Create: `apps/desktop/electron/sync/pending/FeeReversalPendingSource.ts`
- Test: `apps/desktop/electron/sync/pending/BespokePendingSources.test.ts`

**Interfaces:**
- Consumes: predicates (Task 2), `PendingSourceAdapter`, `buildGroup`, test support (Task 3).
- Produces: `AssignmentPendingSource` (`source='assignments'`, entity types `assignments`, `assignment_submissions`), `GradeCompletionPendingSource` (`source='grade_completions'`, entity type `grade_completions`), `FeeReversalPendingSource` (`source='fee_reversals'`, entity type `fee_payment_reversals`). All return `{ rows: [], total: 0 }` for an entity type they don't own.

- [ ] **Step 1: Write the failing tests** — `BespokePendingSources.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { AssignmentPendingSource } from './AssignmentPendingSource';
import { FeeReversalPendingSource } from './FeeReversalPendingSource';
import { GradeCompletionPendingSource } from './GradeCompletionPendingSource';
import { NOW, PAST, ctx, memoryDb, queueRow, seedAssignment, seedGradeCompletion, seedReversal, seedSubmission } from './pending.test-support';

describe('AssignmentPendingSource', () => {
  const source = new AssignmentPendingSource();

  it('lists unsynced and edited assignments, not synced ones', () => {
    const db = memoryDb();
    seedAssignment(db, 'new');
    seedAssignment(db, 'edited', { remoteId: 'r1', syncedAt: PAST, updatedAt: NOW });
    seedAssignment(db, 'clean', { remoteId: 'r2', syncedAt: NOW, updatedAt: PAST });
    const groups = source.summarize(ctx(db));
    expect(groups.find((g) => g.groupKey === 'assignments:assignments')).toMatchObject({ total: 2, byState: { waiting: 2 } });
    const { rows } = source.listRecords(ctx(db), 'assignments', 50, 0);
    expect(rows.map((r) => [r.id, r.operationType])).toEqual([['new', 'create'], ['edited', 'update']]);
  });

  it('holds graded submissions whose assignment has no remote id; ignores ungraded ones', () => {
    const db = memoryDb();
    seedAssignment(db, 'local');
    seedAssignment(db, 'remote', { remoteId: 'r1', syncedAt: NOW, updatedAt: PAST });
    seedSubmission(db, 'held', 'local');
    seedSubmission(db, 'ready', 'remote');
    seedSubmission(db, 'ungraded', 'remote', { grade: null, studentId: 's2' });
    const group = source.summarize(ctx(db)).find((g) => g.groupKey === 'assignments:assignment_submissions');
    expect(group).toMatchObject({ label: 'Assignment grades', total: 2, byState: { held: 1, waiting: 1 } });
    const { rows } = source.listRecords(ctx(db), 'assignment_submissions', 50, 0);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.state]))).toEqual({ held: 'held', ready: 'waiting' });
    expect(source.countPending(ctx(db))).toBe(3);
  });
});

describe('GradeCompletionPendingSource', () => {
  const source = new GradeCompletionPendingSource();

  it('counts pending for this institution only; rejected ones are failures', () => {
    const db = memoryDb();
    seedGradeCompletion(db, 'mine', { studentId: 's1' });
    seedGradeCompletion(db, 'other-school', { studentId: 's2', institutionId: 'school-2' });
    seedGradeCompletion(db, 'rejected', { studentId: 's3', state: 'rejected', syncError: 'bad' });
    seedGradeCompletion(db, 'done', { studentId: 's4', state: 'synced' });
    expect(source.countPending(ctx(db))).toBe(1);
    expect(source.countFailed(ctx(db))).toBe(1);
    expect(source.listRecords(ctx(db), 'grade_completions', 50, 0).rows.map((r) => r.id)).toEqual(['mine']);
  });

  it('is held while student or enrolment rows are still queued', () => {
    const db = memoryDb();
    seedGradeCompletion(db, 'gc1');
    expect(source.summarize(ctx(db))[0]?.byState).toMatchObject({ waiting: 1, held: 0 });
    queueRow(db, { id: 'q1', seq: 1, entityType: 'enrollments' });
    expect(source.summarize(ctx(db))[0]?.byState).toMatchObject({ waiting: 0, held: 1 });
    expect(source.listRecords(ctx(db), 'grade_completions', 50, 0).rows[0]?.state).toBe('held');
  });
});

describe('FeeReversalPendingSource', () => {
  const source = new FeeReversalPendingSource();

  it('holds a reversal whose payment has not finished syncing', () => {
    const db = memoryDb();
    seedReversal(db, 'rev1', 'pay-1');
    seedReversal(db, 'rev2', 'pay-2');
    seedReversal(db, 'rev3', 'pay-3', { syncedAt: NOW });
    queueRow(db, { id: 'q1', seq: 1, entityType: 'fee_payments', entityId: 'pay-1' });
    queueRow(db, { id: 'q2', seq: 2, entityType: 'fee_payments', entityId: 'pay-2', status: 'completed' });
    expect(source.summarize(ctx(db))[0]).toMatchObject({
      groupKey: 'fee_reversals:fee_payment_reversals', total: 2, byState: { held: 1, waiting: 1 },
    });
    const { rows } = source.listRecords(ctx(db), 'fee_payment_reversals', 50, 0);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.state]))).toEqual({ rev1: 'held', rev2: 'waiting' });
  });

  it('returns nothing for an entity type it does not own', () => {
    expect(source.listRecords(ctx(memoryDb()), 'students', 50, 0)).toEqual({ rows: [], total: 0 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/desktop/electron/sync/pending/BespokePendingSources.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement `AssignmentPendingSource.ts`**

```ts
import type { PendingGroupSummary } from '@nemis-desktop/types';
import { ASSIGNMENT_DIRTY, SUBMISSION_DIRTY } from '../pendingPredicates';
import { buildGroup } from './groups';
import type { PendingContext, PendingSourceAdapter, RawPendingRow } from './types';

const SUBMISSIONS_FROM = `FROM assignment_submissions s JOIN assignments a ON a.id = s.assignmentId WHERE ${SUBMISSION_DIRTY}`;

/** Assignments and their grades push through AssignmentSyncService, not the
 * outbox. No backoff there, so nothing is ever 'retrying'; a grade waits
 * ('held') until its assignment has a server id. */
export class AssignmentPendingSource implements PendingSourceAdapter {
  readonly source = 'assignments' as const;

  summarize(ctx: PendingContext): PendingGroupSummary[] {
    const groups: PendingGroupSummary[] = [];
    const a = ctx.db.prepare(
      `SELECT COUNT(*) AS total, MIN(updatedAt) AS oldestAt FROM assignments WHERE ${ASSIGNMENT_DIRTY}`,
    ).get() as { total: number; oldestAt: string | null };
    if (a.total > 0 && a.oldestAt) groups.push(buildGroup('assignments', 'assignments', { waiting: a.total }, a.oldestAt));
    const s = ctx.db.prepare(
      `SELECT COUNT(*) AS total, SUM(a.remoteId IS NULL) AS held, MIN(s.updatedAt) AS oldestAt ${SUBMISSIONS_FROM}`,
    ).get() as { total: number; held: number | null; oldestAt: string | null };
    if (s.total > 0 && s.oldestAt) {
      const held = s.held ?? 0;
      groups.push(buildGroup('assignments', 'assignment_submissions', { waiting: s.total - held, held }, s.oldestAt));
    }
    return groups;
  }

  listRecords(ctx: PendingContext, entityType: string, limit: number, offset: number) {
    if (entityType === 'assignments') {
      const rows = ctx.db.prepare(
        `SELECT * FROM assignments WHERE ${ASSIGNMENT_DIRTY} ORDER BY updatedAt, id LIMIT ? OFFSET ?`,
      ).all(limit, offset) as Array<Record<string, unknown> & { id: string; remoteId: string | null; updatedAt: string }>;
      return {
        rows: rows.map((row): RawPendingRow => ({
          ...base(row.id, 'assignments', row.updatedAt, row),
          operationType: row.remoteId ? 'update' : 'create',
          state: 'waiting',
        })),
        total: this.#count(ctx, `SELECT COUNT(*) AS n FROM assignments WHERE ${ASSIGNMENT_DIRTY}`),
      };
    }
    if (entityType === 'assignment_submissions') {
      const rows = ctx.db.prepare(
        `SELECT s.*, a.remoteId AS assignmentRemoteId ${SUBMISSIONS_FROM} ORDER BY s.updatedAt, s.id LIMIT ? OFFSET ?`,
      ).all(limit, offset) as Array<Record<string, unknown> & { id: string; updatedAt: string; assignmentRemoteId: string | null }>;
      return {
        rows: rows.map((row): RawPendingRow => ({
          ...base(row.id, 'assignment_submissions', row.updatedAt, row),
          operationType: 'update',
          state: row.assignmentRemoteId ? 'waiting' : 'held',
        })),
        total: this.#count(ctx, `SELECT COUNT(*) AS n ${SUBMISSIONS_FROM}`),
      };
    }
    return { rows: [], total: 0 };
  }

  countPending(ctx: PendingContext): number {
    return this.#count(ctx, `SELECT COUNT(*) AS n FROM assignments WHERE ${ASSIGNMENT_DIRTY}`)
      + this.#count(ctx, `SELECT COUNT(*) AS n ${SUBMISSIONS_FROM}`);
  }

  countFailed(): number {
    return 0;
  }

  #count(ctx: PendingContext, sql: string): number {
    return (ctx.db.prepare(sql).get() as { n: number }).n;
  }
}

function base(id: string, entityType: string, changedAt: string, payload: unknown) {
  return { id, entityType, entityId: id, createdAt: changedAt, nextAttemptAt: null, retryCount: 0, lastError: null, payload };
}
```

- [ ] **Step 4: Implement `GradeCompletionPendingSource.ts`**

```ts
import type { PendingGroupSummary } from '@nemis-desktop/types';
import { GRADE_COMPLETION_PENDING, STUDENT_RECORDS_UNSETTLED } from '../pendingPredicates';
import { buildGroup } from './groups';
import type { PendingContext, PendingSourceAdapter, RawPendingRow } from './types';

/** End-of-year decisions push through GradeCompletionSyncService, scoped to
 * the workspace's institution, and wait while any student/enrolment row can
 * still sync (the same gate the push uses). */
export class GradeCompletionPendingSource implements PendingSourceAdapter {
  readonly source = 'grade_completions' as const;

  summarize(ctx: PendingContext): PendingGroupSummary[] {
    const { total, oldestAt } = ctx.db.prepare(
      `SELECT COUNT(*) AS total, MIN(updatedAt) AS oldestAt FROM grade_completions WHERE ${GRADE_COMPLETION_PENDING}`,
    ).get(ctx.institutionId) as { total: number; oldestAt: string | null };
    if (total === 0 || !oldestAt) return [];
    const byState = this.#blocked(ctx) ? { held: total } : { waiting: total };
    return [buildGroup('grade_completions', 'grade_completions', byState, oldestAt)];
  }

  listRecords(ctx: PendingContext, entityType: string, limit: number, offset: number) {
    if (entityType !== 'grade_completions') return { rows: [], total: 0 };
    const state = this.#blocked(ctx) ? 'held' : 'waiting';
    const rows = ctx.db.prepare(
      `SELECT * FROM grade_completions WHERE ${GRADE_COMPLETION_PENDING} ORDER BY updatedAt, id LIMIT ? OFFSET ?`,
    ).all(ctx.institutionId, limit, offset) as Array<Record<string, unknown> & { id: string; updatedAt: string }>;
    return {
      rows: rows.map((row): RawPendingRow => ({
        id: row.id,
        entityType: 'grade_completions',
        entityId: row.id,
        operationType: 'create',
        state,
        createdAt: row.updatedAt,
        nextAttemptAt: null,
        retryCount: 0,
        lastError: null,
        payload: row,
      })),
      total: this.countPending(ctx),
    };
  }

  countPending(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM grade_completions WHERE ${GRADE_COMPLETION_PENDING}`,
    ).get(ctx.institutionId) as { n: number }).n;
  }

  countFailed(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM grade_completions WHERE syncState='rejected' AND institutionId=?`,
    ).get(ctx.institutionId) as { n: number }).n;
  }

  #blocked(ctx: PendingContext): boolean {
    return (ctx.db.prepare(`SELECT ${STUDENT_RECORDS_UNSETTLED} AS blocked`).get() as { blocked: number }).blocked === 1;
  }
}
```

- [ ] **Step 5: Implement `FeeReversalPendingSource.ts`**

```ts
import type { PendingGroupSummary } from '@nemis-desktop/types';
import { FEE_REVERSAL_PENDING, feePaymentUnsettled } from '../pendingPredicates';
import { buildGroup } from './groups';
import type { PendingContext, PendingSourceAdapter, RawPendingRow } from './types';

const HELD = feePaymentUnsettled('fee_payment_reversals.paymentId');

/** Payment reversals push through FeeReversalSyncService and wait for their
 * payment's create to finish — the same gate the push uses. */
export class FeeReversalPendingSource implements PendingSourceAdapter {
  readonly source = 'fee_reversals' as const;

  summarize(ctx: PendingContext): PendingGroupSummary[] {
    const row = ctx.db.prepare(
      `SELECT COUNT(*) AS total, SUM(${HELD}) AS held, MIN(updatedAt) AS oldestAt
       FROM fee_payment_reversals WHERE ${FEE_REVERSAL_PENDING}`,
    ).get() as { total: number; held: number | null; oldestAt: string | null };
    if (row.total === 0 || !row.oldestAt) return [];
    const held = row.held ?? 0;
    return [buildGroup('fee_reversals', 'fee_payment_reversals', { waiting: row.total - held, held }, row.oldestAt)];
  }

  listRecords(ctx: PendingContext, entityType: string, limit: number, offset: number) {
    if (entityType !== 'fee_payment_reversals') return { rows: [], total: 0 };
    const rows = ctx.db.prepare(
      `SELECT *, ${HELD} AS isHeld FROM fee_payment_reversals
       WHERE ${FEE_REVERSAL_PENDING} ORDER BY updatedAt, id LIMIT ? OFFSET ?`,
    ).all(limit, offset) as Array<Record<string, unknown> & { id: string; updatedAt: string; isHeld: number }>;
    return {
      rows: rows.map(({ isHeld, ...row }): RawPendingRow => ({
        id: row.id,
        entityType: 'fee_payment_reversals',
        entityId: row.id,
        operationType: 'create',
        state: isHeld ? 'held' : 'waiting',
        createdAt: row.updatedAt,
        nextAttemptAt: null,
        retryCount: 0,
        lastError: null,
        payload: row,
      })),
      total: this.countPending(ctx),
    };
  }

  countPending(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM fee_payment_reversals WHERE ${FEE_REVERSAL_PENDING}`,
    ).get() as { n: number }).n;
  }

  countFailed(): number {
    return 0;
  }
}
```

- [ ] **Step 6: Run tests** — `pnpm vitest run apps/desktop/electron/sync/pending/BespokePendingSources.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/sync/pending/
git commit -m "feat(sync): pending sources for assignments, grade completions and reversals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Batched label resolver

**Files:**
- Create: `apps/desktop/electron/sync/pending/PendingLabelResolver.ts`
- Test: `apps/desktop/electron/sync/pending/PendingLabelResolver.test.ts`

**Interfaces:**
- Consumes: `RawPendingRow` (Task 3), `pickEntityLabel` (Task 1), `logger` from `@app/services/logger`.
- Produces: `class PendingLabelResolver { resolve(db: SqliteDatabase, rows: readonly RawPendingRow[]): PendingRecord[] }` — order preserved.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { PendingLabelResolver } from './PendingLabelResolver';
import type { RawPendingRow } from './types';
import { PAST, memoryDb, seedClass, seedStudent, seedSubject } from './pending.test-support';

function raw(entityType: string, entityId: string, payload: unknown = null): RawPendingRow {
  return { id: `q-${entityId}`, entityType, entityId, operationType: 'create', state: 'waiting', createdAt: PAST, nextAttemptAt: null, retryCount: 0, lastError: null, payload };
}

function seedAttendance(db: ReturnType<typeof memoryDb>, id: string, studentId: string, subjectId: string | null) {
  db.prepare(
    `INSERT INTO attendance (id,studentId,classId,subjectId,date,status,version,updatedAt) VALUES (?,?,'c1',?,'2026-10-14','PRESENT',1,?)`,
  ).run(id, studentId, subjectId, PAST);
}

describe('PendingLabelResolver', () => {
  const resolver = new PendingLabelResolver();

  it('names students, enrolments and attendance from local tables', () => {
    const db = memoryDb();
    seedStudent(db, 's1', 'Musu', 'Kollie', '123456789012');
    seedClass(db, 'c1', 'Grade 5A');
    seedSubject(db, 'sub1', 'Mathematics');
    seedAttendance(db, 'att1', 's1', 'sub1');
    seedAttendance(db, 'att2', 's1', null);
    db.prepare(
      `INSERT INTO enrollments (id,studentId,classId,academicYearId,termId,enrollmentDate,status,version,updatedAt) VALUES ('en1','s1','c1','y1','t1','2026-09-01','ACTIVE',1,?)`,
    ).run(PAST);

    const labels = resolver.resolve(db, [raw('students', 's1'), raw('attendance', 'att1'), raw('attendance', 'att2'), raw('enrollments', 'en1')]).map((r) => r.label);
    expect(labels).toEqual([
      'Musu Kollie · 123456789012',
      'Musu Kollie · Grade 5A · Mathematics · 2026-10-14',
      'Musu Kollie · Grade 5A · 2026-10-14',
      'Musu Kollie · Grade 5A',
    ]);
  });

  it('falls back to the payload when the row is gone (e.g. a delete)', () => {
    const db = memoryDb();
    const [record] = resolver.resolve(db, [raw('students', 'gone', { base: { firstName: 'Ada', lastName: 'Lovelace' } })]);
    expect(record?.label).toBe('Ada Lovelace');
  });

  it('falls back to type and short id for an unknown entity type', () => {
    const [record] = resolver.resolve(memoryDb(), [raw('widgets', 'abcdef123456')]);
    expect(record?.label).toBe('Widgets · abcdef12…');
  });

  it('runs one lookup per entity type, not one per row', () => {
    const db = memoryDb();
    seedStudent(db, 's1', 'Musu', 'Kollie');
    seedStudent(db, 's2', 'Ama', 'Doe');
    seedClass(db, 'c1', 'Grade 5A');
    seedAttendance(db, 'a1', 's1', null);
    seedAttendance(db, 'a2', 's2', null);
    seedAttendance(db, 'a3', 's1', null);
    const prepare = vi.spyOn(db, 'prepare');
    resolver.resolve(db, [raw('students', 's1'), raw('students', 's2'), raw('attendance', 'a1'), raw('attendance', 'a2'), raw('attendance', 'a3')]);
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run apps/desktop/electron/sync/pending/PendingLabelResolver.test.ts` → FAIL.

- [ ] **Step 3: Implement `PendingLabelResolver.ts`**

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { pickEntityLabel } from '@nemis-desktop/shared';
import type { PendingRecord } from '@nemis-desktop/types';
import { logger } from '@app/services/logger';
import type { RawPendingRow } from './types';

const STUDENT = `s.firstName || ' ' || s.lastName`;

function named(table: string, column: string): string {
  return `SELECT id, ${column} AS label FROM ${table} WHERE id IN (__IDS__)`;
}

/** One SELECT per entity type per page (ids bound into IN (…)). A NULL label
 * — a join partner missing — falls through to the payload fallback. */
const LOOKUPS: Readonly<Record<string, string>> = {
  students: `SELECT id, firstName || ' ' || lastName || COALESCE(' · ' || nemisId, '') AS label FROM students WHERE id IN (__IDS__)`,
  guardians: named('guardians', `firstName || ' ' || lastName`),
  staff: named('staff', `firstName || ' ' || lastName`),
  student_guardians: `SELECT sg.id, g.firstName || ' ' || g.lastName || ' → ' || ${STUDENT} AS label
    FROM student_guardians sg JOIN guardians g ON g.id = sg.guardianId JOIN students s ON s.id = sg.studentId
    WHERE sg.id IN (__IDS__)`,
  enrollments: `SELECT e.id, ${STUDENT} || ' · ' || c.name AS label
    FROM enrollments e JOIN students s ON s.id = e.studentId JOIN classes c ON c.id = e.classId
    WHERE e.id IN (__IDS__)`,
  attendance: `SELECT a.id, ${STUDENT} || ' · ' || c.name || COALESCE(' · ' || sub.name, '') || ' · ' || a.date AS label
    FROM attendance a JOIN students s ON s.id = a.studentId JOIN classes c ON c.id = a.classId
    LEFT JOIN subjects sub ON sub.id = a.subjectId
    WHERE a.id IN (__IDS__)`,
  grades: `SELECT g.id, ${STUDENT} || ' · ' || sub.name AS label
    FROM grades g JOIN students s ON s.id = g.studentId JOIN subjects sub ON sub.id = g.subjectId
    WHERE g.id IN (__IDS__)`,
  assignment_submissions: `SELECT x.id, ${STUDENT} || ' · ' || a.title AS label
    FROM assignment_submissions x JOIN students s ON s.id = x.studentId JOIN assignments a ON a.id = x.assignmentId
    WHERE x.id IN (__IDS__)`,
  grade_completions: `SELECT gc.id, ${STUDENT} || ' · ' || gc.gradeLevel || ' · ' || gc.outcome AS label
    FROM grade_completions gc JOIN students s ON s.id = gc.studentId
    WHERE gc.id IN (__IDS__)`,
  fee_payments: `SELECT p.id, ${STUDENT} || ' · receipt ' || p.receiptNumber AS label
    FROM fee_payments p JOIN students s ON s.id = p.studentId
    WHERE p.id IN (__IDS__)`,
  fee_obligations: `SELECT o.id, ${STUDENT} AS label
    FROM fee_obligations o JOIN students s ON s.id = o.studentId
    WHERE o.id IN (__IDS__)`,
  fee_payment_reversals: `SELECT r.id, ${STUDENT} || ' · receipt ' || p.receiptNumber AS label
    FROM fee_payment_reversals r JOIN fee_payments p ON p.id = r.paymentId JOIN students s ON s.id = p.studentId
    WHERE r.id IN (__IDS__)`,
  classes: named('classes', 'name'),
  subjects: named('subjects', 'name'),
  academic_years: named('academic_years', 'code'),
  terms: named('terms', 'name'),
  assessment_templates: named('assessment_templates', 'name'),
  assessments: named('assessments', 'name'),
  assignments: named('assignments', 'title'),
  grading_periods: named('grading_periods', 'name'),
  grade_entry_windows: named('grade_entry_windows', 'name'),
  fee_rules: named('fee_rules', 'name'),
  announcements: named('announcements', 'title'),
};

export class PendingLabelResolver {
  resolve(db: SqliteDatabase, rows: readonly RawPendingRow[]): PendingRecord[] {
    const idsByType = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!LOOKUPS[row.entityType]) continue;
      const ids = idsByType.get(row.entityType) ?? new Set<string>();
      ids.add(row.entityId);
      idsByType.set(row.entityType, ids);
    }

    const labels = new Map<string, string>();
    for (const [entityType, ids] of idsByType) {
      const template = LOOKUPS[entityType];
      if (!template) continue;
      const list = [...ids];
      const sql = template.replace('__IDS__', list.map(() => '?').join(','));
      try {
        for (const found of db.prepare(sql).all(...list) as Array<{ id: string; label: string | null }>) {
          if (found.label) labels.set(`${entityType}\u0000${found.id}`, found.label);
        }
      } catch (error) {
        logger.warn(`PendingLabelResolver: label lookup failed for ${entityType}`, error);
      }
    }

    return rows.map((row) => ({
      ...row,
      label:
        labels.get(`${row.entityType}\u0000${row.entityId}`)
        ?? pickEntityLabel(row.payload, null, row.entityType, row.entityId),
    }));
  }
}
```

- [ ] **Step 4: Run tests** — PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/sync/pending/PendingLabelResolver.ts apps/desktop/electron/sync/pending/PendingLabelResolver.test.ts
git commit -m "feat(sync): batched readable labels for pending records

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: PendingChangesService

**Files:**
- Create: `apps/desktop/electron/sync/pending/PendingChangesService.ts`
- Test: `apps/desktop/electron/sync/pending/PendingChangesService.test.ts`

**Interfaces:**
- Consumes: all four adapters (Tasks 3–4), `PendingLabelResolver` (Task 5), `parseGroupKey` (Task 3).
- Produces:
  ```ts
  export const MAX_PENDING_PAGE = 200;
  export class PendingChangesService {
    constructor(sources?: readonly PendingSourceAdapter[], labels?: PendingLabelResolver);
    getSummary(ctx: PendingContext): PendingSummary;
    listRecords(ctx: PendingContext, request: ListPendingRecordsRequest): ListPendingRecordsResult;
    countPending(ctx: PendingContext): number;
  }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { PendingGroupSummary, PendingSource } from '@nemis-desktop/types';
import { buildGroup } from './groups';
import { PendingChangesService } from './PendingChangesService';
import type { PendingSourceAdapter, RawPendingRow } from './types';
import { NOW, PAST, ctx, memoryDb, queueRow, seedAssignment, seedGradeCompletion } from './pending.test-support';

function fake(source: PendingSource, groups: PendingGroupSummary[], opts: { throws?: boolean; failed?: number; rows?: RawPendingRow[] } = {}): PendingSourceAdapter {
  return {
    source,
    summarize: vi.fn(() => {
      if (opts.throws) throw new Error('boom');
      return groups;
    }),
    listRecords: vi.fn(() => ({ rows: opts.rows ?? [], total: opts.rows?.length ?? 0 })),
    countPending: vi.fn(() => groups.reduce((n, g) => n + g.total, 0)),
    countFailed: vi.fn(() => opts.failed ?? 0),
  };
}

describe('PendingChangesService', () => {
  it('sums sources, sorts groups oldest first and adds failures', () => {
    const service = new PendingChangesService([
      fake('outbox', [buildGroup('outbox', 'students', { waiting: 3 }, NOW)], { failed: 2 }),
      fake('assignments', [buildGroup('assignments', 'assignments', { waiting: 1 }, PAST)]),
    ]);
    const summary = service.getSummary(ctx(memoryDb()));
    expect(summary.groups.map((g) => g.groupKey)).toEqual(['assignments:assignments', 'outbox:students']);
    expect(summary).toMatchObject({ total: 4, failedCount: 2, partial: false });
  });

  it('marks the summary partial when a source throws, keeping the others', () => {
    const service = new PendingChangesService([
      fake('outbox', [], { throws: true }),
      fake('assignments', [buildGroup('assignments', 'assignments', { waiting: 1 }, PAST)]),
    ]);
    const summary = service.getSummary(ctx(memoryDb()));
    expect(summary).toMatchObject({ total: 1, partial: true });
  });

  it('routes records by group key and caps the page size', () => {
    const outbox = fake('outbox', []);
    const service = new PendingChangesService([outbox]);
    service.listRecords(ctx(memoryDb()), { groupKey: 'outbox:attendance', limit: 5000, offset: 10 });
    expect(outbox.listRecords).toHaveBeenCalledWith(expect.anything(), 'attendance', 200, 10);
  });

  it('returns nothing for an unknown group key', () => {
    const service = new PendingChangesService([fake('outbox', [])]);
    expect(service.listRecords(ctx(memoryDb()), { groupKey: 'fee_reversals:fee_payment_reversals', limit: 50, offset: 0 }))
      .toEqual({ records: [], total: 0 });
  });

  it('counts every real source', () => {
    const db = memoryDb();
    queueRow(db, { id: 'q1', seq: 1 });
    queueRow(db, { id: 'q2', seq: 2, status: 'in_flight' });
    seedAssignment(db, 'a1');
    seedGradeCompletion(db, 'gc1');
    expect(new PendingChangesService().countPending(ctx(db))).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (module missing).

- [ ] **Step 3: Implement `PendingChangesService.ts`**

```ts
import type {
  ListPendingRecordsRequest,
  ListPendingRecordsResult,
  PendingGroupSummary,
  PendingSummary,
} from '@nemis-desktop/types';
import { logger } from '@app/services/logger';
import { AssignmentPendingSource } from './AssignmentPendingSource';
import { FeeReversalPendingSource } from './FeeReversalPendingSource';
import { GradeCompletionPendingSource } from './GradeCompletionPendingSource';
import { parseGroupKey } from './groups';
import { OutboxPendingSource } from './OutboxPendingSource';
import { PendingLabelResolver } from './PendingLabelResolver';
import type { PendingContext, PendingSourceAdapter } from './types';

export const MAX_PENDING_PAGE = 200;

/** Everything on this device not yet accepted by the server, across the
 * generic outbox and every bespoke push path — the read model behind the
 * Pending changes page and the status bar's pending count. */
export class PendingChangesService {
  constructor(
    private readonly sources: readonly PendingSourceAdapter[] = [
      new OutboxPendingSource(),
      new AssignmentPendingSource(),
      new GradeCompletionPendingSource(),
      new FeeReversalPendingSource(),
    ],
    private readonly labels = new PendingLabelResolver(),
  ) {}

  getSummary(ctx: PendingContext): PendingSummary {
    const groups: PendingGroupSummary[] = [];
    let failedCount = 0;
    let partial = false;
    for (const source of this.sources) {
      try {
        const sourceGroups = source.summarize(ctx);
        const sourceFailed = source.countFailed(ctx);
        groups.push(...sourceGroups);
        failedCount += sourceFailed;
      } catch (error) {
        partial = true;
        logger.error(`PendingChangesService: the ${source.source} source could not be read`, error);
      }
    }
    groups.sort((a, b) => a.oldestAt.localeCompare(b.oldestAt) || a.groupKey.localeCompare(b.groupKey));
    return { groups, total: groups.reduce((sum, group) => sum + group.total, 0), failedCount, partial };
  }

  listRecords(ctx: PendingContext, request: ListPendingRecordsRequest): ListPendingRecordsResult {
    const parsed = parseGroupKey(request.groupKey);
    const source = parsed ? this.sources.find((candidate) => candidate.source === parsed.source) : undefined;
    if (!parsed || !source) return { records: [], total: 0 };
    const limit = Math.min(Math.max(request.limit, 1), MAX_PENDING_PAGE);
    const offset = Math.max(request.offset, 0);
    const { rows, total } = source.listRecords(ctx, parsed.entityType, limit, offset);
    return { records: this.labels.resolve(ctx.db, rows), total };
  }

  countPending(ctx: PendingContext): number {
    return this.sources.reduce((sum, source) => sum + source.countPending(ctx), 0);
  }
}
```

- [ ] **Step 4: Run tests** — `pnpm vitest run apps/desktop/electron/sync/pending` → PASS (all pending tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/sync/pending/PendingChangesService.ts apps/desktop/electron/sync/pending/PendingChangesService.test.ts
git commit -m "feat(sync): PendingChangesService composing every pending source

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Worker, IPC contract, validation, preload and bridge

**Files:**
- Modify: `apps/desktop/electron/sync/DesktopSyncWorker.ts` (`getStatus`, new methods)
- Modify: `apps/desktop/electron/security/validateIpc.ts` (after `assertResolveSyncConflictArgs`)
- Modify: `apps/desktop/electron/ipc/handlers/shared/sync.ts`
- Modify: `packages/types/src/ipc.ts` (import line ~100, `IpcContract`, `IpcChannels`)
- Modify: `packages/types/src/api.ts` (import line ~85, `SyncApi`)
- Modify: `apps/desktop/electron/preload/shared/sync-api.ts`
- Modify: `apps/desktop/renderer/services/nemis-bridge.ts` (`nemisBridge`)
- Modify: `apps/desktop/renderer/services/nemis-bridge/shared/sync-bridge.ts`
- Test: `apps/desktop/electron/sync/DesktopSyncWorker.test.ts` (append), `apps/desktop/electron/security/validateIpc.test.ts` (append), `apps/desktop/electron/ipc/handlers/shared/sync.test.ts` (create)

**Interfaces:**
- Consumes: `PendingChangesService`, `PendingContext` (Task 6).
- Produces: `IpcChannels.SYNC_LIST_PENDING = 'sync:list-pending'`, `IpcChannels.SYNC_LIST_PENDING_RECORDS = 'sync:list-pending-records'`; `SyncApi.listPending(): Promise<PendingSummary>`, `SyncApi.listPendingRecords(request: ListPendingRecordsRequest): Promise<ListPendingRecordsResult>`; `nemisBridge.listPendingChanges(): Promise<PendingSummary>`, `nemisBridge.listPendingRecords(request: ListPendingRecordsRequest): Promise<ListPendingRecordsResult>`; `assertListPendingRecordsArgs(args)`; `DesktopSyncWorker.listPending()`, `DesktopSyncWorker.listPendingRecords(request)`.

- [ ] **Step 1: Write the failing tests**

Append inside the first `describe('DesktopSyncWorker retry policy', …)` block of `DesktopSyncWorker.test.ts` (it owns the `manager`/`workspaces` fixture):

```ts
  it('reports pending work from every source in getStatus and listPending', () => {
    const db = manager.connection;
    const now = new Date().toISOString();
    db.prepare(`UPDATE sync_runtime SET captureEnabled=0`).run();
    db.prepare(
      `INSERT INTO sync_queue (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt,seq)
       VALUES ('q1','students','s1','create','{}',0,'pending',?,?,1),('q2','students','s2','create','{}',0,'in_flight',?,?,2)`,
    ).run(now, now, now, now);
    db.prepare(
      `INSERT INTO assignments (id,classId,subjectId,teacherId,title,type,status,dueDate,createdAt,updatedAt)
       VALUES ('a1','c1',NULL,'t1','Essay','HOMEWORK','PUBLISHED','2026-11-01',?,?)`,
    ).run(now, now);
    const worker = new DesktopSyncWorker(workspaces, {} as BackendProvisioningGateway, alwaysOnline());

    expect(worker.getStatus()).toMatchObject({ pending: 3, inFlight: 1 });
    expect(worker.listPending().total).toBe(3);
    expect(worker.listPendingRecords({ groupKey: 'outbox:students', limit: 50, offset: 0 }).records.map((r) => r.id))
      .toEqual(['q1', 'q2']);
  });
```

Append to `validateIpc.test.ts` (add `assertListPendingRecordsArgs` to its import list):

```ts
describe('assertListPendingRecordsArgs', () => {
  const ok = { groupKey: 'outbox:attendance', limit: 50, offset: 0 };
  it('accepts a well-formed request', () => {
    expect(() => assertListPendingRecordsArgs([ok])).not.toThrow();
    expect(() => assertListPendingRecordsArgs([{ ...ok, groupKey: 'fee_reversals:fee_payment_reversals', limit: 200 }])).not.toThrow();
  });
  it.each([
    [{ ...ok, groupKey: 'bogus:attendance' }],
    [{ ...ok, groupKey: 'outbox:' }],
    [{ ...ok, groupKey: 'outbox:DROP TABLE' }],
    [{ ...ok, limit: 0 }],
    [{ ...ok, limit: 201 }],
    [{ ...ok, limit: 1.5 }],
    [{ ...ok, offset: -1 }],
    [{ ...ok, extra: true }],
  ])('rejects %j', (request) => {
    expect(() => assertListPendingRecordsArgs([request])).toThrow();
  });
  it('rejects the wrong arity', () => {
    expect(() => assertListPendingRecordsArgs([])).toThrow();
  });
});
```

Create `apps/desktop/electron/ipc/handlers/shared/sync.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { IpcChannel } from '@nemis-desktop/types';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import type { DesktopSyncWorker } from '@app/sync/DesktopSyncWorker';
import { registerSyncHandlers } from './sync';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function makeHarness() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  return { calls, handle };
}

describe('registerSyncHandlers', () => {
  it('releases backoff before a manual sync', async () => {
    const order: string[] = [];
    const worker = {
      releaseBackoff: vi.fn(() => order.push('release')),
      syncActive: vi.fn(async () => { order.push('sync'); }),
      getStatus: vi.fn(() => ({ pending: 0 })),
    } as unknown as DesktopSyncWorker;
    const { calls, handle } = makeHarness();
    registerSyncHandlers(handle, worker);
    await calls.get(IpcChannels.SYNC_RUN)!.handler();
    expect(order).toEqual(['release', 'sync']);
  });

  it('serves the pending summary and validated record pages', async () => {
    const listPending = vi.fn(() => ({ groups: [], total: 0, failedCount: 0, partial: false }));
    const listPendingRecords = vi.fn(() => ({ records: [], total: 0 }));
    const worker = { listPending, listPendingRecords } as unknown as DesktopSyncWorker;
    const { calls, handle } = makeHarness();
    registerSyncHandlers(handle, worker);

    const summary = calls.get(IpcChannels.SYNC_LIST_PENDING)!;
    expect(() => summary.validate(['x'])).toThrow();
    expect(await summary.handler()).toEqual({ groups: [], total: 0, failedCount: 0, partial: false });

    const records = calls.get(IpcChannels.SYNC_LIST_PENDING_RECORDS)!;
    const request = { groupKey: 'outbox:attendance', limit: 50, offset: 0 };
    expect(() => records.validate([{ ...request, limit: 999 }])).toThrow();
    await records.handler(request);
    expect(listPendingRecords).toHaveBeenCalledWith(request);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/desktop/electron/sync/DesktopSyncWorker.test.ts apps/desktop/electron/security/validateIpc.test.ts apps/desktop/electron/ipc/handlers/shared/sync.test.ts`
Expected: FAIL (missing methods/exports/channels).

- [ ] **Step 3: Contract types**

`packages/types/src/ipc.ts` — extend the `./sync` import:
```ts
import type {
  DesktopSyncStatus,
  ListPendingRecordsRequest,
  ListPendingRecordsResult,
  PendingSummary,
  ResolveSyncConflictRequest,
  SyncConflictResult,
} from './sync';
```
In `IpcContract`, after `'sync:resolve-conflict'`:
```ts
  'sync:list-pending': { args: []; result: PendingSummary };
  'sync:list-pending-records': {
    args: [request: ListPendingRecordsRequest];
    result: ListPendingRecordsResult;
  };
```
In `IpcChannels`, after `SYNC_RESOLVE_CONFLICT`:
```ts
  SYNC_LIST_PENDING: 'sync:list-pending',
  SYNC_LIST_PENDING_RECORDS: 'sync:list-pending-records',
```

`packages/types/src/api.ts` — same import extension, and in `SyncApi`:
```ts
  listPending(): Promise<PendingSummary>;
  listPendingRecords(request: ListPendingRecordsRequest): Promise<ListPendingRecordsResult>;
```

- [ ] **Step 4: Preload and bridges**

`apps/desktop/electron/preload/shared/sync-api.ts` — add:
```ts
  listPending: () => invoke(IpcChannels.SYNC_LIST_PENDING),
  listPendingRecords: (request) => invoke(IpcChannels.SYNC_LIST_PENDING_RECORDS, request),
```

`apps/desktop/renderer/services/nemis-bridge.ts` — add `ListPendingRecordsRequest` to the existing `import type { … } from '@nemis-desktop/types'` block, and after `resolveSyncConflict`:
```ts
  listPendingChanges: () => api().sync.listPending(),
  listPendingRecords: (request: ListPendingRecordsRequest) => api().sync.listPendingRecords(request),
```

`apps/desktop/renderer/services/nemis-bridge/shared/sync-bridge.ts`:
```ts
import type { ListPendingRecordsRequest } from '@nemis-desktop/types';
import { api } from '../api';

/** Offline sync — shared by every portal's StatusBar, sync-conflicts and sync-pending screens. */
export const syncBridge = {
  runSync: () => api().sync.run(),
  getSyncStatus: () => api().sync.getStatus(),
  listSyncConflicts: () => api().sync.listConflicts(),
  resolveSyncConflict: (conflictId: string, resolution: 'keep_local' | 'accept_remote') =>
    api().sync.resolveConflict({ conflictId, resolution }),
  listPendingChanges: () => api().sync.listPending(),
  listPendingRecords: (request: ListPendingRecordsRequest) => api().sync.listPendingRecords(request),
};
```

- [ ] **Step 5: Validator** — in `validateIpc.ts` after `assertResolveSyncConflictArgs`:

```ts
const PENDING_GROUP_KEY = /^(outbox|assignments|grade_completions|fee_reversals):[a-z_]+$/;

export function assertListPendingRecordsArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['groupKey', 'limit', 'offset']);
  if (
    typeof request.groupKey !== 'string'
    || request.groupKey.length > 100
    || !PENDING_GROUP_KEY.test(request.groupKey)
  ) {
    throw new IPCError('Invalid groupKey.');
  }
  assertInt(request.limit, 'limit', 1, 200);
  assertInt(request.offset, 'offset', 0, 1_000_000);
}
```

- [ ] **Step 6: Handlers** — replace the body of `registerSyncHandlers` in `handlers/shared/sync.ts`:

```ts
import { IpcChannels } from '@nemis-desktop/types';
import {
  assertListPendingRecordsArgs,
  assertNoArgs,
  assertResolveSyncConflictArgs,
} from '@app/security/validateIpc';
import type { DesktopSyncWorker } from '@app/sync/DesktopSyncWorker';
import type { IpcHandle } from '@app/ipc/registrar';

export function registerSyncHandlers(handle: IpcHandle, worker: DesktopSyncWorker): void {
  handle(IpcChannels.SYNC_RUN, assertNoArgs, async () => {
    // A person pressing "Sync now" expects everything to be attempted, so
    // backed-off rows go now instead of waiting out their timers.
    worker.releaseBackoff();
    await worker.syncActive();
    return worker.getStatus();
  });
  handle(IpcChannels.SYNC_GET_STATUS, assertNoArgs, () => worker.getStatus());
  handle(IpcChannels.SYNC_LIST_CONFLICTS, assertNoArgs, () => worker.listConflicts());
  handle(IpcChannels.SYNC_RESOLVE_CONFLICT, assertResolveSyncConflictArgs, (request) =>
    worker.resolveConflict(request),
  );
  handle(IpcChannels.SYNC_LIST_PENDING, assertNoArgs, () => worker.listPending());
  handle(IpcChannels.SYNC_LIST_PENDING_RECORDS, assertListPendingRecordsArgs, (request) =>
    worker.listPendingRecords(request),
  );
}
```

No `authorizeChannel.ts` change: channels not in a role-restricted set get default authenticated access, same as the existing `sync:*` channels.

- [ ] **Step 7: Worker** — in `DesktopSyncWorker.ts`:

Imports:
```ts
import type {
  DesktopSyncOperation,
  DesktopSyncStatus,
  ListPendingRecordsRequest,
  ListPendingRecordsResult,
  PendingSummary,
  ResolveSyncConflictRequest,
  SyncConflictResult,
} from '@nemis-desktop/types';
import { PendingChangesService } from './pending/PendingChangesService';
import type { PendingContext } from './pending/types';
```

Field (next to the other services):
```ts
  private readonly pendingChanges = new PendingChangesService();
```

Replace `getStatus()`:
```ts
  getStatus(): DesktopSyncStatus {
    const workspace = this.workspaces.active;
    const db = workspace.database.connection;
    const inFlight = (db.prepare(
      `SELECT COUNT(*) count FROM sync_queue WHERE status='in_flight'`,
    ).get() as { count: number }).count;
    const metadata = db.prepare(
      `SELECT lastSyncAt,syncStatus FROM sync_metadata WHERE id='singleton'`,
    ).get() as { lastSyncAt: string | null; syncStatus: DesktopSyncStatus['status'] };
    const conflicts = (db.prepare(
      `SELECT COUNT(*) count FROM sync_conflicts WHERE status='unresolved'`,
    ).get() as { count: number }).count;
    return {
      pending: this.pendingChanges.countPending(this.#pendingContext(workspace)),
      inFlight,
      conflicts,
      lastSyncAt: metadata.lastSyncAt,
      status: this.#running ? 'syncing' : metadata.syncStatus,
      isOnline: this.connectivity.isOnline(),
    };
  }

  listPending(): PendingSummary {
    return this.pendingChanges.getSummary(this.#pendingContext(this.workspaces.active));
  }

  listPendingRecords(request: ListPendingRecordsRequest): ListPendingRecordsResult {
    return this.pendingChanges.listRecords(this.#pendingContext(this.workspaces.active), request);
  }

  #pendingContext(workspace: ActiveWorkspace): PendingContext {
    return {
      db: workspace.database.connection,
      institutionId: institutionIdOf(workspace.user),
      now: new Date().toISOString(),
    };
  }
```

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm vitest run apps/desktop/electron/sync apps/desktop/electron/security/validateIpc.test.ts apps/desktop/electron/ipc/handlers/shared/sync.test.ts` → PASS.
Run: `pnpm typecheck` → no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/electron/sync/DesktopSyncWorker.ts apps/desktop/electron/sync/DesktopSyncWorker.test.ts apps/desktop/electron/security/validateIpc.ts apps/desktop/electron/security/validateIpc.test.ts apps/desktop/electron/ipc/handlers/shared/sync.ts apps/desktop/electron/ipc/handlers/shared/sync.test.ts packages/types/src/ipc.ts packages/types/src/api.ts apps/desktop/electron/preload/shared/sync-api.ts apps/desktop/renderer/services/nemis-bridge.ts apps/desktop/renderer/services/nemis-bridge/shared/sync-bridge.ts
git commit -m "feat(sync): pending-changes IPC; badge counts every source; Sync now retries backed-off work

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: SyncPendingPage + routes

**Files:**
- Modify: `apps/desktop/renderer/components/sync/shared.tsx` (add `retryCountdown`)
- Create: `apps/desktop/renderer/components/sync/SyncPendingPage.tsx`
- Create: `apps/desktop/renderer/app/government/{ministry-portal,county,deo,school-admin,teacher}/sync-pending/page.tsx` (5 files)
- Test: `apps/desktop/renderer/components/sync/SyncPendingPage.test.tsx`

**Interfaces:**
- Consumes: `nemisBridge.listPendingChanges`, `nemisBridge.listPendingRecords`, `nemisBridge.getSyncStatus`, `nemisBridge.runSync` (Task 7); `relativeTime` (existing).
- Produces: `SyncPendingPage` (named export), `retryCountdown(iso: string, now?: number): string`.

- [ ] **Step 1: Write the failing tests** — `SyncPendingPage.test.tsx`

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopSyncStatus, PendingRecord, PendingSummary } from '@nemis-desktop/types';

vi.mock('next/navigation', () => ({ usePathname: () => '/government/teacher/sync-pending' }));
vi.mock('@/hooks/use-revalidate-on-sync', async () => {
  const { useEffect } = await import('react');
  return {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useRevalidateOnSync: (load: () => void | (() => void), deps: readonly unknown[]) => useEffect(load, deps),
  };
});
const bridge = vi.hoisted(() => ({
  listPendingChanges: vi.fn(),
  listPendingRecords: vi.fn(),
  getSyncStatus: vi.fn(),
  runSync: vi.fn(),
}));
vi.mock('@/services/nemis-bridge', () => ({ nemisBridge: bridge }));

import { SyncPendingPage } from './SyncPendingPage';
import { retryCountdown } from './shared';

const ONLINE: DesktopSyncStatus = { pending: 41, inFlight: 0, conflicts: 0, lastSyncAt: null, status: 'idle', isOnline: true };
const SUMMARY: PendingSummary = {
  groups: [{
    groupKey: 'outbox:attendance', source: 'outbox', label: 'Attendance', total: 41,
    byState: { sending: 0, waiting: 38, retrying: 2, held: 1 }, oldestAt: new Date().toISOString(),
  }],
  total: 41, failedCount: 0, partial: false,
};
function record(i: number, over: Partial<PendingRecord> = {}): PendingRecord {
  return {
    id: `q${i}`, entityType: 'attendance', entityId: `att${i}`, operationType: 'create',
    label: `Student ${i} · Grade 5A · 2026-10-14`, state: 'waiting', createdAt: new Date().toISOString(),
    nextAttemptAt: null, retryCount: 0, lastError: null, payload: { record: { id: `att${i}` } }, ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getSyncStatus.mockResolvedValue(ONLINE);
  bridge.listPendingChanges.mockResolvedValue(SUMMARY);
  bridge.runSync.mockResolvedValue(ONLINE);
});

describe('SyncPendingPage', () => {
  it('shows groups with state counts in text', async () => {
    render(<SyncPendingPage />);
    const header = await screen.findByRole('button', { name: /Attendance/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(within(header).getByText('38 waiting')).toBeInTheDocument();
    expect(within(header).getByText('2 retrying')).toBeInTheDocument();
    expect(within(header).getByText('1 held')).toBeInTheDocument();
  });

  it('expands a group, then loads more', async () => {
    bridge.listPendingRecords
      .mockResolvedValueOnce({ records: Array.from({ length: 50 }, (_, i) => record(i)), total: 60 })
      .mockResolvedValueOnce({ records: Array.from({ length: 10 }, (_, i) => record(50 + i)), total: 60 });
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    await user.click(await screen.findByRole('button', { name: /Attendance/ }));
    expect(await screen.findByText('Student 0 · Grade 5A · 2026-10-14')).toBeInTheDocument();
    expect(bridge.listPendingRecords).toHaveBeenCalledWith({ groupKey: 'outbox:attendance', limit: 50, offset: 0 });
    await user.click(screen.getByRole('button', { name: /Load more/ }));
    expect(await screen.findByText('Student 59 · Grade 5A · 2026-10-14')).toBeInTheDocument();
    expect(bridge.listPendingRecords).toHaveBeenLastCalledWith({ groupKey: 'outbox:attendance', limit: 50, offset: 50 });
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('says a group has just synced when it comes back empty', async () => {
    bridge.listPendingRecords.mockResolvedValue({ records: [], total: 0 });
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    await user.click(await screen.findByRole('button', { name: /Attendance/ }));
    expect(await screen.findByText('These changes have just synced.')).toBeInTheDocument();
  });

  it('describes waiting rows as waiting for connection when offline', async () => {
    bridge.getSyncStatus.mockResolvedValue({ ...ONLINE, isOnline: false });
    bridge.listPendingRecords.mockResolvedValue({ records: [record(1)], total: 1 });
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    expect(await screen.findByText(/You're offline/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Attendance/ }));
    expect(await screen.findByText(/Waiting for connection/)).toBeInTheDocument();
  });

  it('links failures to the conflicts page and warns when partial', async () => {
    bridge.listPendingChanges.mockResolvedValue({ ...SUMMARY, failedCount: 3, partial: true });
    render(<SyncPendingPage />);
    expect(await screen.findByText(/3 items failed to sync/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review sync conflicts/ })).toHaveAttribute('href', '/government/teacher/sync-conflicts');
    expect(screen.getByText(/couldn't be listed/)).toBeInTheDocument();
  });

  it('shows the empty state when nothing is pending', async () => {
    bridge.listPendingChanges.mockResolvedValue({ groups: [], total: 0, failedCount: 0, partial: false });
    render(<SyncPendingPage />);
    expect(await screen.findByText('Everything is synced')).toBeInTheDocument();
  });

  it('shows an error with retry when loading fails', async () => {
    bridge.listPendingChanges.mockRejectedValueOnce(new Error('locked')).mockResolvedValue(SUMMARY);
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    expect(await screen.findByText(/Could not load pending changes/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Try again|Retry/i }));
    expect(await screen.findByRole('button', { name: /Attendance/ })).toBeInTheDocument();
  });

  it('toggles technical details and the raw payload', async () => {
    bridge.listPendingRecords.mockResolvedValue({
      records: [record(1, { state: 'retrying', retryCount: 2, lastError: 'Server said no', nextAttemptAt: new Date(Date.now() + 4 * 60_000).toISOString() })],
      total: 1,
    });
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    await user.click(await screen.findByRole('button', { name: /Attendance/ }));
    expect(await screen.findByText(/Retrying in 4 min/)).toBeInTheDocument();
    expect(screen.queryByText('Server said no')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Show technical details' }));
    expect(screen.getByText('Server said no')).toBeInTheDocument();
    expect(screen.getByText('outbox:attendance')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /View payload/ }));
    expect(screen.getByText(/"id": "att1"/)).toBeInTheDocument();
  });

  it('syncs now and reloads', async () => {
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    await screen.findByRole('button', { name: /Attendance/ });
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(bridge.runSync).toHaveBeenCalledOnce();
    await waitFor(() => expect(bridge.listPendingChanges).toHaveBeenCalledTimes(2));
  });

  it('opens a group from the keyboard', async () => {
    bridge.listPendingRecords.mockResolvedValue({ records: [record(1)], total: 1 });
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    const header = await screen.findByRole('button', { name: /Attendance/ });
    header.focus();
    await user.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('retryCountdown', () => {
  const now = Date.parse('2026-10-16T12:00:00.000Z');
  it.each([
    ['2026-10-16T11:59:00.000Z', 'now'],
    ['2026-10-16T12:00:30.000Z', 'in under a minute'],
    ['2026-10-16T12:04:00.000Z', 'in 4 min'],
    ['2026-10-16T14:00:00.000Z', 'in 2 h'],
  ])('%s → %s', (iso, expected) => {
    expect(retryCountdown(iso, now)).toBe(expected);
  });
});
```

Check `ErrorState`'s default retry button label in `packages/ui/src/ErrorState.tsx`; the regex `/Try again|Retry/i` covers both common defaults — tighten it to the actual label once you've looked.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/desktop/renderer/components/sync/SyncPendingPage.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Add `retryCountdown` to `components/sync/shared.tsx`** (below `relativeTime`)

```ts
/** "in 4 min" for a future retry time; "now" once it has passed. */
export function retryCountdown(dateStr: string, now = Date.now()): string {
  const ms = new Date(dateStr).getTime() - now;
  if (!(ms > 0)) return 'now';
  if (ms <= 60_000) return 'in under a minute';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  return `in ${Math.round(mins / 60)} h`;
}
```

- [ ] **Step 4: Implement `SyncPendingPage.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  DesktopSyncStatus,
  PendingGroupSummary,
  PendingItemState,
  PendingRecord,
  PendingSummary,
} from '@nemis-desktop/types';
import { Alert, Badge, Button, EmptyState, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { nemisBridge } from '@/services/nemis-bridge';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { relativeTime, retryCountdown } from './shared';

const PAGE_SIZE = 50;
const MAX_REQUEST = 200;
const POLL_MS = 5_000;

const STATE_ORDER: readonly PendingItemState[] = ['sending', 'waiting', 'retrying', 'held'];
const CHIP_VARIANT: Record<PendingItemState, 'primary' | 'neutral' | 'warning'> = {
  sending: 'primary',
  waiting: 'neutral',
  retrying: 'warning',
  held: 'warning',
};
const OPERATION_LABEL: Record<PendingRecord['operationType'], string> = {
  create: 'New',
  update: 'Edited',
  delete: 'Deleted',
};

function stateText(record: PendingRecord, isOnline: boolean): string {
  switch (record.state) {
    case 'sending':
      return 'Sending';
    case 'waiting':
      return isOnline ? 'Waiting' : 'Waiting for connection';
    case 'retrying':
      return record.nextAttemptAt ? `Retrying ${retryCountdown(record.nextAttemptAt)}` : 'Retrying';
    case 'held':
      return 'Held behind an earlier item';
  }
}

export function SyncPendingPage() {
  const pathname = usePathname();
  const portalBase = (pathname ?? '/government/school-admin').split('/').slice(0, 3).join('/');
  const [summary, setSummary] = useState<PendingSummary | null>(null);
  const [status, setStatus] = useState<DesktopSyncStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  // Bumped on every successful summary load so expanded groups refresh too.
  const [refreshToken, setRefreshToken] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    void Promise.all([nemisBridge.listPendingChanges(), nemisBridge.getSyncStatus()])
      .then(([nextSummary, nextStatus]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setStatus(nextStatus);
        setLoadError(null);
        setRefreshToken((token) => token + 1);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load pending changes. Your work is still saved on this computer.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useRevalidateOnSync(load, []);
  useEffect(() => {
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await nemisBridge.runSync();
    } catch {
      setSyncError('Sync could not finish. Your changes are still saved on this computer and will be retried.');
    } finally {
      setSyncing(false);
      load();
    }
  };

  const isOnline = status?.isOnline ?? true;
  const failed = summary?.failedCount ?? 0;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pending changes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Work saved on this computer that hasn&apos;t reached the national server yet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {status?.lastSyncAt && (
            <span className="text-xs text-slate-500">Last synced {relativeTime(status.lastSyncAt)}</span>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showTechnical}
              onChange={(event) => setShowTechnical(event.target.checked)}
            />
            Show technical details
          </label>
          <Button size="sm" loading={syncing} onClick={() => void syncNow()}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </div>

      {!isOnline && (
        <Alert variant="info">
          You&apos;re offline. These changes are safe on this computer and will send automatically when you reconnect.
        </Alert>
      )}
      {syncError && <Alert variant="error">{syncError}</Alert>}
      {failed > 0 && (
        <Alert variant="error">
          {failed} item{failed === 1 ? '' : 's'} failed to sync and need{failed === 1 ? 's' : ''} attention.{' '}
          <Link className="font-semibold underline" href={`${portalBase}/sync-conflicts`}>
            Review sync conflicts →
          </Link>
        </Alert>
      )}
      {summary?.partial && (
        <Alert variant="warning">Some pending items couldn&apos;t be listed. They are still saved and will sync.</Alert>
      )}
      {loadError && summary && <Alert variant="warning">{loadError}</Alert>}

      {summary === null ? (
        loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
          </div>
        )
      ) : summary.groups.length === 0 ? (
        <EmptyState
          title="Everything is synced"
          description={status?.lastSyncAt ? `Last synced ${relativeTime(status.lastSyncAt)}.` : undefined}
        />
      ) : (
        <section aria-live="polite" aria-label="Pending changes by type" className="space-y-3">
          {summary.groups.map((group) => (
            <GroupCard
              key={group.groupKey}
              group={group}
              isOnline={isOnline}
              showTechnical={showTechnical}
              refreshToken={refreshToken}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function GroupCard({
  group,
  isOnline,
  showTechnical,
  refreshToken,
}: {
  group: PendingGroupSummary;
  isOnline: boolean;
  showTechnical: boolean;
  refreshToken: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [records, setRecords] = useState<PendingRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedCount = useRef(0);

  /** Reads [offset, offset+count) in requests of at most MAX_REQUEST. */
  const fetchRange = useCallback(
    async (offset: number, count: number) => {
      const out: PendingRecord[] = [];
      let latestTotal = 0;
      for (let start = offset; start < offset + count; start += MAX_REQUEST) {
        const page = await nemisBridge.listPendingRecords({
          groupKey: group.groupKey,
          limit: Math.min(MAX_REQUEST, offset + count - start),
          offset: start,
        });
        out.push(...page.records);
        latestTotal = page.total;
        if (page.records.length === 0 || start + page.records.length >= page.total) break;
      }
      return { records: out, total: latestTotal };
    },
    [group.groupKey],
  );

  const apply = (next: PendingRecord[], nextTotal: number) => {
    setRecords(next);
    setTotal(nextTotal);
    loadedCount.current = next.length;
  };

  const loadFirstPage = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRange(0, PAGE_SIZE);
      apply(result.records, result.total);
    } catch {
      setError('Could not load these items. Try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!records) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRange(records.length, PAGE_SIZE);
      apply([...records, ...result.records], result.total);
    } catch {
      setError('Could not load more items. Try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && records === null) void loadFirstPage();
  };

  // Keep an open group in step with each summary refresh.
  useEffect(() => {
    if (!expanded || loadedCount.current === 0) return;
    let cancelled = false;
    void fetchRange(0, Math.max(loadedCount.current, PAGE_SIZE))
      .then((result) => {
        if (!cancelled) apply(result.records, result.total);
      })
      .catch(() => {
        if (!cancelled) setError('Could not refresh these items. Showing the last list loaded.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  return (
    <article className="rounded-card border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={toggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left"
      >
        <span className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-semibold text-slate-900">{group.label}</span>
          <span className="text-sm text-slate-500">{group.total}</span>
          {showTechnical && <code className="text-xs text-slate-400">{group.groupKey}</code>}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {STATE_ORDER.filter((state) => group.byState[state] > 0).map((state) => (
            <Badge key={state} size="sm" variant={CHIP_VARIANT[state]}>
              {`${group.byState[state]} ${state}`}
            </Badge>
          ))}
          <span className="text-xs text-slate-500">Oldest: {relativeTime(group.oldestAt)}</span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5">
          {error && <Alert variant="error" className="mt-4">{error}</Alert>}
          {records === null ? (
            loading && <Skeleton className="mt-4 h-16 w-full" />
          ) : records.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">These changes have just synced.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {records.map((record) => (
                <RecordRow key={record.id} record={record} isOnline={isOnline} showTechnical={showTechnical} />
              ))}
            </ul>
          )}
          {records !== null && records.length < total && (
            <Button size="sm" variant="secondary" className="mt-3" loading={loading} onClick={() => void loadMore()}>
              Load more ({total - records.length} remaining)
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function RecordRow({
  record,
  isOnline,
  showTechnical,
}: {
  record: PendingRecord;
  isOnline: boolean;
  showTechnical: boolean;
}) {
  const [showPayload, setShowPayload] = useState(false);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{record.label}</p>
          <p className="text-xs text-slate-500">
            {OPERATION_LABEL[record.operationType]} · {stateText(record, isOnline)}
          </p>
        </div>
        <time className="whitespace-nowrap text-xs text-slate-500" dateTime={record.createdAt}>
          {relativeTime(record.createdAt)}
        </time>
      </div>
      {showTechnical && (
        <div className="mt-2 text-xs text-slate-500">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            <dt>Entity</dt>
            <dd><code>{record.entityType}</code> · <code>{record.entityId}</code></dd>
            <dt>Record ID</dt>
            <dd><code>{record.id}</code></dd>
            <dt>Retries</dt>
            <dd>{record.retryCount}</dd>
            <dt>Last error</dt>
            <dd>{record.lastError ?? '—'}</dd>
          </dl>
          <button
            type="button"
            className="mt-2 flex items-center gap-1 font-medium hover:text-slate-700"
            aria-expanded={showPayload}
            onClick={() => setShowPayload((prev) => !prev)}
          >
            {showPayload ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {showPayload ? 'Hide' : 'View'} payload
          </button>
          {showPayload && (
            <pre className="mt-2 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(record.payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
```

Check: `Alert` accepts `className` (it spreads `HTMLAttributes`); `Button` accepts `className` (extends button attributes). If either drops `className`, wrap in a `<div className="mt-…">` instead.

- [ ] **Step 5: Routes** — create each of these five files with the same single line:

`apps/desktop/renderer/app/government/ministry-portal/sync-pending/page.tsx`
`apps/desktop/renderer/app/government/county/sync-pending/page.tsx`
`apps/desktop/renderer/app/government/deo/sync-pending/page.tsx`
`apps/desktop/renderer/app/government/school-admin/sync-pending/page.tsx`
`apps/desktop/renderer/app/government/teacher/sync-pending/page.tsx`

```tsx
export { SyncPendingPage as default } from '@/components/sync/SyncPendingPage';
```

- [ ] **Step 6: Run tests** — `pnpm vitest run apps/desktop/renderer/components/sync` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/components/sync/ apps/desktop/renderer/app/government/*/sync-pending/
git commit -m "feat(sync): Pending changes page for every portal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Status bar count links to the page

**Files:**
- Modify: `apps/desktop/renderer/components/shell/StatusBar.tsx:76`
- Test: `apps/desktop/renderer/components/shell/StatusBar.test.tsx`

**Interfaces:**
- Consumes: route `/<portal>/sync-pending` (Task 8).

- [ ] **Step 1: Write the failing tests** — replace the mocks block at the top of `StatusBar.test.tsx` and add two tests:

```tsx
import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectivityStore = createStore(() => ({ isOnline: true, syncStatus: 'idle', lastSyncAt: null }));

vi.mock('../../lib/presentation/hooks/shared', () => ({
  useConnectivityStore: () => ({
    store: connectivityStore,
    setOnline: vi.fn(),
    markSyncCompleted: vi.fn(),
    setSyncStatus: vi.fn(),
  }),
  useSyncViewModel: () => ({ store: connectivityStore }),
}));
vi.mock('../../hooks/useAppVersion', () => ({ useAppVersion: () => ({ version: '1.0.0', error: null }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/government/teacher/dashboard' }));
const getSyncStatus = vi.hoisted(() => vi.fn());
vi.mock('@/services/nemis-bridge', () => ({ nemisBridge: { getSyncStatus, runSync: vi.fn() } }));

import { StatusBar } from './StatusBar';

const status = (pending: number) => ({
  pending, inFlight: 0, conflicts: 0, lastSyncAt: null, status: 'idle' as const, isOnline: true,
});

beforeEach(() => {
  getSyncStatus.mockReset();
  getSyncStatus.mockRejectedValue(new Error('bridge unavailable'));
});

describe('StatusBar', () => {
  it('shows online status, database ready, and app version', () => {
    render(<StatusBar />);
    expect(screen.getByText(/Online/i)).toBeInTheDocument();
    expect(screen.getByText(/Local database ready/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Not synced yet/i)).toBeInTheDocument();
  });

  it('links the pending count to the pending changes page', async () => {
    getSyncStatus.mockResolvedValue(status(47));
    render(<StatusBar />);
    const link = await screen.findByRole('link', { name: '47 pending changes' });
    expect(link).toHaveAttribute('href', '/government/teacher/sync-pending');
  });

  it('uses the singular for one pending change', async () => {
    getSyncStatus.mockResolvedValue(status(1));
    render(<StatusBar />);
    expect(await screen.findByRole('link', { name: '1 pending change' })).toBeInTheDocument();
  });
});
```

If `StatusBar.tsx` imports the bridge as `@/services/nemis-bridge` (it does today), the mock path above matches; keep them identical.

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run apps/desktop/renderer/components/shell/StatusBar.test.tsx` → the two new tests FAIL (no link).

- [ ] **Step 3: Implement** — in `StatusBar.tsx` replace line 76:

```tsx
        <span>{localSync?.pending ?? 0} pending changes</span>
```

with:

```tsx
        <Link className="hover:text-blue-700" href={`${portalBase}/sync-pending`}>
          {pendingLabel(localSync?.pending ?? 0)}
        </Link>
```

and add below the component:

```tsx
function pendingLabel(count: number): string {
  return `${count} pending change${count === 1 ? '' : 's'}`;
}
```

- [ ] **Step 4: Run tests** — PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/shell/StatusBar.tsx apps/desktop/renderer/components/shell/StatusBar.test.tsx
git commit -m "feat(shell): status bar pending count opens the Pending changes page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Whole-branch verification

**Files:** none new.

- [ ] **Step 1: Typecheck** — `pnpm typecheck` → no errors.
- [ ] **Step 2: Lint** — `pnpm lint` → 0 errors (main was 0 errors at 458afad). Fix any new ones in the files this plan touched only.
- [ ] **Step 3: Full test suite** — `pnpm rebuild:node` then `pnpm vitest run` → all pass. Any failure in a file this plan didn't touch: confirm it also fails on `main` (`git stash` is not needed — check out `main` in a worktree) before treating it as pre-existing; report it either way.
- [ ] **Step 4: Restore the Electron ABI** — `pnpm rebuild:electron`.
- [ ] **Step 5: Confirm the user's file is untouched** — `git status` shows `apps/desktop/renderer/app/government/school-admin/students/createbulk/page.tsx` still modified and uncommitted, and nothing else dirty.
- [ ] **Step 6: Manual GUI check (hand to the user; do not claim it was done)**
  1. `pnpm dev`, sign in as a teacher, go offline.
  2. Mark attendance for a class; as school admin, add a student.
  3. Status bar "N pending changes" equals the page total; labels read as names/classes/dates.
  4. Turn technical details on: raw ids, retries, payload visible; off again on reload.
  5. Go online with the server stopped so a push fails → rows show "Retrying in …" and later rows "Held behind an earlier item"; start the server, press Sync now → they clear without waiting for the backoff.
