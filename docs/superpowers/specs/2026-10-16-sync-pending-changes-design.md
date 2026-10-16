# Pending changes page — design

Date: 2026-10-16
Repo: desktop-client-nemis
Entry point: `apps/desktop/renderer/components/shell/StatusBar.tsx` ("N pending changes")

## Goal

Let every desktop user (all 5 portal roles) see **what work on this computer has
not reached the national server yet**, in plain language, with an opt-in
technical view for support. Clicking "N pending changes" in the status bar opens
a dedicated page that lists it.

Success: the badge and the page always agree; a teacher can find "my attendance
for Grade 5A Math on 14 Oct" or "my entry for Musu Kollie" and see whether it is
sending, waiting, retrying or held — and why.

## Decisions (agreed in brainstorming)

| # | Decision |
|---|---|
| 1 | Plain-language grouped view by default **plus** a "Show technical details" toggle (raw rows). |
| 2 | "Pending" covers **all four** unsynced-work stores, not just `sync_queue`. The status-bar count changes meaning to match. |
| 3 | A **dedicated page** at `/<portal>/sync-pending`, beside `/sync-conflicts`. |
| 4 | Groups by entity type; each group **expands to individual records** with resolved labels. |
| 5 | Technical details visible to **everyone** (off by default, not persisted). |
| 6 | **Sync now** releases backoff first, and the status-bar sync button gets the same behaviour. Dead letters are not listed here — a banner links to Sync conflicts. No per-item retry/discard. |
| 7 | Approach A: a main-process `PendingChangesService` with one adapter per store; lazy record loading over two new IPC channels. |

## Background: what is "pending" today

- `DesktopSyncWorker.getStatus()` counts `sync_queue WHERE status='pending'`
  only. It excludes `in_flight` rows and every bespoke push path.
- `sync_queue` rows are **per table-row mutation**, written by outbox triggers
  (`installOutboxTriggers`, migration 010). Marking attendance for 40 students
  = 40 rows; creating a student = students + enrollments + guardians +
  student_guardians rows. Rows carry only the table name, id, operation and a
  JSON envelope (`{record}` / `{base, record}` / `{base}`).
- Three stores sync through bespoke services and never touch `sync_queue`:

| Store | Unsynced predicate (owned by) |
|---|---|
| `assignments` | `syncedAt IS NULL OR updatedAt > syncedAt` (`AssignmentSyncService`) |
| `assignment_submissions` | `grade IS NOT NULL AND (syncedAt IS NULL OR updatedAt > syncedAt)`, joined to assignment (`AssignmentSyncService`) |
| `grade_completions` | `syncState='pending'` (`GradeCompletionSyncService`) |
| `fee_payment_reversals` | `syncedAt IS NULL` (`FeeReversalSyncService`) |

  Assignment outbox triggers were dropped in migration 019 and reversals never
  had any (migration 023), so no store double-counts another. `fee_payments`
  themselves do go through the outbox.
- **Ordering barrier**: `SqliteSyncQueueRepository.nextBatch` lets the
  lowest-`seq` backed-off pending row (`nextAttemptAt > now`, `deadLetter=0`)
  hold back every row with a higher `seq`, so dependants are never pushed before
  their parent.
- **Manual sync does not retry backed-off rows**: `releaseBackoff()` is called
  only on reconnect (`main.ts`), so `SYNC_RUN` skips rows whose `nextAttemptAt`
  is in the future.

## 1. Data contract (`packages/types/src/sync.ts`)

```ts
export type PendingSource = 'outbox' | 'assignments' | 'grade_completions' | 'fee_reversals';

export type PendingItemState =
  | 'sending'   // outbox in_flight
  | 'waiting'   // due; goes on the next sync (UI shows "Waiting for connection" when offline)
  | 'retrying'  // backed off; nextAttemptAt in the future
  | 'held';     // blocked by an earlier item

export interface PendingGroupSummary {
  groupKey: string;            // `${source}:${entityType}`, e.g. 'outbox:attendance'
  source: PendingSource;
  label: string;               // 'Attendance', 'Student guardians', 'Assignment grades'
  total: number;
  byState: Record<PendingItemState, number>;
  oldestAt: string;            // ISO
}

export interface PendingRecord {
  id: string;                  // sync_queue.id for outbox; entity id for bespoke sources
  entityType: string;
  entityId: string;
  operationType: 'create' | 'update' | 'delete';
  label: string;               // resolved, e.g. 'Musu Kollie · Grade 5A · Mathematics · 14 Oct 2026'
  state: PendingItemState;
  createdAt: string;
  nextAttemptAt: string | null;
  retryCount: number;          // 0 for bespoke sources
  lastError: string | null;    // latest sync_errors.message (outbox) / syncError (grade completions)
  payload: unknown;            // outbox envelope; for bespoke sources the local row
}

export interface PendingSummary {
  groups: PendingGroupSummary[];
  total: number;               // sum of groups[].total
  failedCount: number;         // dead letters + rejected grade completions
  partial: boolean;            // true when at least one source failed to load
}

export interface ListPendingRecordsRequest { groupKey: string; limit: number; offset: number; }
export interface ListPendingRecordsResult { records: PendingRecord[]; total: number; }
```

State rules, per source:

| Source | sending | waiting | retrying | held |
|---|---|---|---|---|
| outbox | `status='in_flight'` | pending, due, `seq` < blocker (or no blocker / null seq) | pending, `nextAttemptAt > now` | pending, due, `seq` > blocker |
| assignments | — | every unsynced row | — | — |
| assignment submissions | — | parent assignment has `remoteId` | — | parent assignment has no `remoteId` |
| grade completions | — | no pending/in-flight `students`/`enrollments` outbox rows | — | such rows exist (mirrors `GradeCompletionSyncService` gate) |
| fee reversals | — | no non-completed `fee_payments` outbox row for the payment | — | such a row exists (mirrors `FeeReversalSyncService` gate) |

Group labels: a fixed map from `groupKey` to an English label (e.g.
`outbox:student_guardians` → "Guardian links", `assignments:submissions` →
"Assignment grades"); unknown keys fall back to the humanised entity type.

Not pending: `sync_queue` rows with `status='completed'` or dead letters
(`status='failed' AND deadLetter=1`); grade completions with
`syncState='rejected'`. Dead letters and rejected grade completions are counted
in `failedCount`. Showing rejected grade completions on the Sync conflicts page
is out of scope (follow-up — see Open items).

### `DesktopSyncStatus.pending` — changed meaning

Becomes the four-source total (pending + in-flight, excluding failures) — the
same number as `PendingSummary.total`. The field name stays; `inFlight` stays in
the type for compatibility but nothing renders it.

### IPC

| Channel | Args | Result |
|---|---|---|
| `sync:list-pending` (`SYNC_LIST_PENDING`) | none | `PendingSummary` |
| `sync:list-pending-records` (`SYNC_LIST_PENDING_RECORDS`) | `ListPendingRecordsRequest` | `ListPendingRecordsResult` |

`assertListPendingRecordsArgs`: `groupKey` a non-empty string matching
`^(outbox|assignments|grade_completions|fee_reversals):[a-z_]+$`; `limit` an
integer 1–200; `offset` an integer ≥ 0. Anything else throws a validation error.
An unknown-but-well-formed `groupKey` returns `{ records: [], total: 0 }`.

Authorization: not added to any role-restricted set in `authorizeChannel.ts` —
default authenticated access, identical to the existing `sync:*` channels.

## 2. Main process

New folder `apps/desktop/electron/sync/pending/`:

- **`PendingSource.ts`**: the interface

  ```ts
  interface PendingSource {
    readonly source: PendingSource;
    summarize(db, now: string): PendingGroupSummary[];
    listRecords(db, groupKey: string, limit: number, offset: number, now: string): { rows: RawPendingRow[]; total: number };
    countPending(db): number;
    countFailed(db): number;
  }
  ```

  `RawPendingRow` is a `PendingRecord` without `label`, plus the raw record
  object the resolver needs.

- **`OutboxPendingSource.ts`**: groups `sync_queue WHERE status IN
  ('pending','in_flight')` by `entityType`; classifies state per the table
  above. `lastError` is the latest `sync_errors.message` for the row.
  `countFailed` counts dead letters.
- **`AssignmentPendingSource.ts`**, **`GradeCompletionPendingSource.ts`**,
  **`FeeReversalPendingSource.ts`**: one group per store (assignments yields two:
  `assignments:assignments` and `assignments:submissions`).

**One predicate, one place.** The "what is unsynced" SQL and the "what blocks
it" checks move out of the bespoke sync services and the repository into
exported helpers that both the push code and the pending sources call:

- `SqliteSyncQueueRepository`: export the blocker query (currently inline in
  `nextBatch`) as a helper; `nextBatch` uses it.
- `AssignmentSyncService`, `GradeCompletionSyncService`,
  `FeeReversalSyncService`: export their pending-selection SQL / gate checks;
  the services keep using them unchanged in behaviour.

This is a refactor of existing code with no behaviour change, covered by the
existing tests of those services.

- **`PendingLabelResolver.ts`**: given a page of raw rows, batches one
  `SELECT … WHERE id IN (…)` per entity type (never N+1) and returns labels:

| Entity type | Label |
|---|---|
| `students` | full name (· NEMIS ID when set) |
| `enrollments` | student name · class name |
| `student_guardians`, `guardians` | guardian name (→ student name for links) |
| `attendance` | student name · class · subject (when set) · date |
| `classes`, `subjects`, `academic_years`, `terms`, `assessment_templates`, `assessments`, `assignments` | own name / title |
| `assignment_submissions` | student name · assignment title |
| `grade_completions` | student name · grade level · outcome |
| `fee_payments` | student name · receipt number |
| `fee_payment_reversals` | student name · receipt number of the reversed payment |
| anything else, or the row no longer exists | payload fallback (below) |

  The fallback is `pickEntityLabel`'s logic (name keys, then first/last name,
  then "Humanised type · shortId"). It moves from
  `renderer/components/sync/shared.tsx` to `packages/shared` so the main process
  and the renderer use one implementation; `shared.tsx` re-exports it.

  For delete operations the live row is gone; the label comes from the
  envelope's `base`.

- **`PendingChangesService.ts`**: composes the four sources and the resolver
  over `workspaces.active.database.connection`:
  - `getSummary(): PendingSummary` — calls each source inside its own
    try/catch; a throwing source is logged with `electron-log` (source name +
    error) and its groups are omitted, setting `partial: true`. Groups are
    sorted by `oldestAt` ascending.
  - `listRecords(req): ListPendingRecordsResult` — routes by the `groupKey`
    prefix, then resolves labels for that page only. Ordered by `seq`, then
    `createdAt`, then `id` for outbox; by `updatedAt`, then `id` for bespoke
    sources.
  - `countPending(): number` — four `COUNT(*)`s on indexed predicates; cheap
    enough for the status bar's 5-second poll.

**`DesktopSyncWorker` changes**
- Receives `PendingChangesService` (constructor injection, as with its other
  collaborators). `getStatus().pending = pendingChanges.countPending()`.
- New `listPending()` / `listPendingRecords(req)` delegating to the service.

**`handlers/shared/sync.ts`**
- `SYNC_RUN`: `worker.releaseBackoff()` then `await worker.syncActive()` then
  `return worker.getStatus()`. This changes the behaviour of the status-bar sync
  button too (decision 6).
- Register `SYNC_LIST_PENDING` (`assertNoArgs`) and `SYNC_LIST_PENDING_RECORDS`
  (`assertListPendingRecordsArgs`).

**Wiring**
- `packages/types/src/ipc.ts`: two channel constants + `IpcContract` entries.
- `packages/types/src/api.ts`: `listPending()`, `listPendingRecords(req)` on
  the sync API.
- `electron/preload/shared/sync-api.ts`: two `invoke` entries.
- `renderer/services/nemis-bridge/shared/sync-bridge.ts` (and the
  `nemis-bridge.ts` facade): `listPendingChanges()`, `listPendingRecords(req)`.

**Errors.** No active workspace → throw as `getStatus` already does. A label
lookup failing never fails the page — the record falls back to the payload
label. A source failing → `partial: true` (above).

## 3. UI

**Routes**: `renderer/app/government/{ministry-portal,county,deo,school-admin,teacher}/sync-pending/page.tsx`,
each rendering `<SyncPendingPage />` — the same pattern as `sync-conflicts`.

**`renderer/components/sync/SyncPendingPage.tsx`**, top to bottom:

1. **Header** — "Pending changes"; subtitle "Work saved on this computer that
   hasn't reached the national server yet." Right: **Sync now** (`Button`,
   `loading` while running) and "Last synced 4m ago" (`relativeTime`); a
   "Show technical details" toggle.
2. **Alerts**
   - offline: `Alert` "You're offline. These changes are safe on this computer
     and will send automatically when you reconnect."
   - `failedCount > 0`: error `Alert` "N item(s) failed to sync and need
     attention." + link "Review sync conflicts →" (`${portalBase}/sync-conflicts`).
   - `partial`: warning `Alert` "Some pending items couldn't be listed. They are
     still saved and will sync."
3. **Groups** — one card per group (`rounded-card`, bordered, no shadow). Header
   is a `<button aria-expanded>`: label · total · state chips (`Badge`, text
   always present: "38 waiting", "2 retrying", "1 held", "3 sending") · "oldest
   3h ago". Expanding fetches the first 50 records; **Load more** fetches the
   next 50 (offset paging) until `total` is reached.
   Record row: label · operation ("New" / "Edited" / "Deleted") · state text
   ("Sending", "Waiting", "Waiting for connection" when offline, "Retrying in
   4 min" from `nextAttemptAt`, "Held behind an earlier item") · relative
   `createdAt`.
4. **Technical details on** — group headers also show `groupKey`; each record
   row also shows `entityType`, raw `entityId`, row `id`, `retryCount`,
   `lastError`, and a **View payload** toggle that expands
   `JSON.stringify(payload, null, 2)` in the conflicts page's `<pre>` style.
5. **Empty** — `EmptyState` "Everything is synced" with "Last synced …" when
   known. **Loading** — `Skeleton` cards. **Load error** — `ErrorState` with
   retry.

**Refresh** — reload the summary via `useRevalidateOnSync` plus a 5-second
interval while mounted; expanded groups re-fetch the range they already show
from `offset 0`, in consecutive requests of at most 200 until the previously
loaded count (or the new `total`) is covered. Synced records drop out on
the next refresh; no animation. **Sync now** calls `nemisBridge.runSync()`
then reloads.

**`StatusBar.tsx`** — the `<span>{n} pending changes</span>` becomes
`<Link href={`${portalBase}/sync-pending`}>` with singular/plural wording ("1
pending change"). The sync button is unchanged in the renderer (backoff release
happens in `SYNC_RUN`).

**Accessibility** — keyboard-operable group headers with `aria-expanded`;
`aria-live="polite"` on the list region; state never conveyed by colour alone.

**Styling** — existing tokens (`text-pending`, `text-error`, `rounded-card`,
8-pt spacing, no shadows) and existing `@nemis-desktop/ui` components only.

## 4. Testing (TDD per task, co-located Vitest)

**Main process — real migrated SQLite:**
- `OutboxPendingSource`: each state classified correctly; dead letters excluded
  from groups and counted in `countFailed`; completed rows excluded.
  **Parity test**: for a seeded queue, the ids `nextBatch()` would claim equal
  the ids the source labels `waiting`.
- Bespoke sources: pending vs synced rows split by the shared predicates; held
  cases (submission whose assignment lacks `remoteId`; grade completion behind
  pending students/enrollments; reversal behind a pending `fee_payments` row);
  rejected grade completions counted as failed.
- `PendingLabelResolver`: each mapped entity type; deleted-row fallback to
  payload (including delete operations using `base`); unknown type fallback;
  one query per entity type per page.
- `PendingChangesService`: totals across sources; a throwing source → `partial`
  with the other groups present; paging and the 200 cap; ordering.
- `DesktopSyncWorker`: `getStatus().pending` equals the four-source total.
- `SYNC_RUN` handler: a backed-off row is claimed on a manual run.
- `assertListPendingRecordsArgs`: rejects malformed `groupKey`, `limit` 0 /
  201 / non-integer, negative `offset`.
- Existing tests for the three bespoke sync services and
  `SqliteSyncQueueRepository` stay green after the predicate extraction.

**Renderer — Testing Library, `nemisBridge` mocked:**
- `SyncPendingPage`: skeleton → groups with chips; expand fetches; Load more
  appends; offline / failed / partial alerts (failed links to
  `sync-conflicts`); empty state; technical toggle shows and hides advanced
  fields and the payload; Sync now calls `runSync` then reloads; keyboard
  operation and `aria-expanded`.
- `StatusBar.test.tsx`: pending count links to `<portalBase>/sync-pending`;
  singular/plural.

**Environment gotcha** — main-process SQLite tests need `better-sqlite3` built
for the Node ABI; rebuild before those tests and run `rebuild:electron`
afterwards.

**Manual check (post-merge)** — offline: mark attendance for a class and add a
student; confirm the badge equals the page total and labels read well; force a
backoff, see "Retrying" and "Held"; Sync now clears them.

## Out of scope

- Per-item retry or discard.
- Grouping by originating user action (no action id exists in the queue).
- Surfacing rejected grade completions on the Sync conflicts page.
- Sidebar entry for the page (reached from the status bar and the conflicts
  banner only).

## Open items

- Rejected `grade_completions` are counted in `failedCount` but no page lists
  them yet; the banner links to Sync conflicts, which won't show them. Follow-up
  spec to add them to `listConflicts()`.
