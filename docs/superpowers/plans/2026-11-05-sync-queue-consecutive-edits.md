# Sync Queue Consecutive Edits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any number of consecutive offline edits to a record in the shared outbox sync without a false conflict, while genuine conflicts still ask the user.

**Architecture:** The server returns a server-issued concurrency token (`serverToken`) for every accepted change; the desktop rebases still-queued changes onto it, merges edits into an unsent queued change, and sends at most one change per record per batch, looping rounds within a sync cycle. Conflicts fold later queued edits before deciding, and "Keep mine" rebases onto the server's token.

**Tech Stack:** Desktop: Electron + better-sqlite3 (SQLite triggers), TypeScript, Vitest. Server: NestJS + Prisma + Postgres, Jest.

**Spec:** `docs/superpowers/specs/2026-11-05-sync-queue-consecutive-edits-design.md` (desktop repo). Read it before any task.

## Global Constraints

- The desktop clock is never used for a conflict decision or for a server-side `updatedAt`.
- Token field rule everywhere (server and desktop): the first of `updatedAt`, `assignedAt`, `createdAt` present (string or Date, parseable) on **both** the local row and the server row. Same rule as `sharedTimestamp` in `desktop-sync-applier.ts`.
- `serverToken` wire shape: `{ field: 'updatedAt' | 'assignedAt' | 'createdAt'; value: string /* ISO */ }`, optional, only on `accepted` non-delete results.
- Each outbox table keeps exactly the columns its current trigger captures (never rebuild from live table columns).
- Backed-off rows (`nextAttemptAt IS NOT NULL`) are never merged into.
- Out of scope: `AssignmentSyncService`, fee reversals, grade completions, school registrations.
- Branch `feat/sync-consecutive-edits` in **both** repos, off `main`. Server tasks first (server-first release order).
- Desktop SQLite tests run from the desktop repo root (bash): `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>`. Pure TS tests may use `pnpm exec vitest run <paths>`.
- Server tests: from `Nemis/apps/Server`, `pnpm jest <path>`. After editing `Nemis/packages/types`, rebuild it: `pnpm --filter @nemis/types build` (from `Nemis`).
- Commit after each task; end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **App killed mid-push** — `recoverStaleInFlight` returns an already-applied op to `pending`; the replay must get the stored receipt (including `serverToken`) and rebase the follower. Test in Task 4.
2. **Delete of a record whose create is still queued** (create → delete offline) — both push in order across two rounds and the delete is accepted. Test in Task 9.
3. **Server without `serverToken` (old server)** — behaviour identical to today, no crash, no rebase. Test in Task 6.
4. **Malformed `serverToken`** (wrong field name, unparseable value) — ignored, not written into payloads or rows. Test in Task 5.
5. **Pull/import and internal corrections write with capture off** — must neither enqueue nor merge into a queued row. Test in Task 3.

---

### Task 0: Branches and spec commit

- [ ] **Step 1:** In both repos: `git checkout main && git checkout -b feat/sync-consecutive-edits`.
- [ ] **Step 2:** In the desktop repo, commit the spec and this plan:

```bash
git add docs/superpowers/specs/2026-11-05-sync-queue-consecutive-edits-design.md docs/superpowers/plans/2026-11-05-sync-queue-consecutive-edits.md
git commit -m "docs: spec and plan for conflict-free consecutive offline edits"
```

---

### Task 1 (Nemis): `serverToken` on every accepted change

**Files:**
- Modify: `Nemis/packages/types/src/desktop-sync.ts` (`DesktopSyncOperationResult`)
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.ts` (`SyncApplyDecision`, `apply`, `sharedTimestamp`)
- Test: `Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.spec.ts`

**Interfaces:**
- Produces (types): `export interface DesktopSyncToken { field: "updatedAt" | "assignedAt" | "createdAt"; value: string }`; `serverToken?: DesktopSyncToken` on `DesktopSyncOperationResult` and `SyncApplyDecision`.
- Produces (applier, exported for tests): `tokenField(local: Record<string, unknown>, remote: Record<string, unknown>): DesktopSyncToken["field"] | null` — the shared rule; `sharedTimestamp` is refactored to use it. `SYNC_TOKEN_MODELS: Readonly<Record<string, string>>` — entityType → Prisma delegate name (same models `existingInScope` uses, plus `attendance`, `student_guardians`, teacher-assignment tables).

- [ ] **Step 1: Write failing tests**
  - `"returns the stored updatedAt as serverToken for an accepted update"`: mock a `gradeEntryWindow` delegate whose post-write `findUnique` returns `updatedAt: new Date("2026-11-05T13:51:57.000Z")`; expect `result.serverToken` toEqual `{ field: "updatedAt", value: "2026-11-05T13:51:57.000Z" }`.
  - `"picks createdAt for student_guardians when the local row has no updatedAt"`: local `record` has only `createdAt`, server row has `updatedAt` and `createdAt` → `field: "createdAt"`.
  - `"picks assignedAt for class_teachers"`: local record has `updatedAt`, server row has only `assignedAt` → `field: "assignedAt"`.
  - `"returns no serverToken for deletes or conflicts"`.
  - `"uses redirectedTo's row for a redirected guardian"`: token read from `findUnique({ where: { id: redirectedTo } })`.
  - `"has a token model for every entity type the applier writes"`: every entityType in the INSTITUTION_ADMIN `roleAllowed` set plus `"attendance"` is a key of `SYNC_TOKEN_MODELS`.
- [ ] **Step 2:** `pnpm jest src/desktop-provisioning/desktop-sync-applier.spec.ts` → the new tests FAIL.
- [ ] **Step 3: Implement.** Rename the current `apply` body to `private async applyOperation(operation)`; new `apply` calls it and, when `status === "accepted"` and `operationType !== "delete"`, reads `this.prisma[SYNC_TOKEN_MODELS[entityType]].findUnique({ where: { id: redirectedTo ?? entityId } })` and sets `serverToken` from `tokenField(record, row)` (value as `new Date(row[field]).toISOString()`). Missing row or null field → omit `serverToken`. Add `serverToken` to the types; rebuild `@nemis/types`. No change to `desktop-provisioning.service.ts` — the decision is spread into the result and receipt already, so replays return the same token (add one assertion for this to `desktop-provisioning.service.spec.ts` if a push-receipt test exists there; otherwise note it in the commit body).
- [ ] **Step 4:** Applier spec and `pnpm jest src/desktop-provisioning` PASS; `pnpm tsc --noEmit -p .` clean.
- [ ] **Step 5:** Commit `feat(sync): return the server's concurrency token for accepted desktop changes`.

---

### Task 2 (Nemis): Attendance stops storing the desktop clock

**Files:**
- Modify: `desktop-sync-applier.ts` `attendance()` (`updatedAt` line ~293 and its comment block)
- Test: `desktop-sync-applier.spec.ts`

- [ ] **Step 1: Failing test** `"stamps attendance updatedAt with the server clock, ignoring the desktop's"`: record `updatedAt: "2020-01-01T00:00:00.000Z"`; with fake timers at `2026-11-05T12:00:00.000Z`, the upsert's `update.updatedAt` equals that server time. Update any existing test asserting the verbatim behaviour.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Set `updatedAt: new Date()`; replace the long comment with one line: server clock only; consecutive edits are handled by `serverToken` (spec 5.1/5.2). `Attendance.updatedAt` has no `@updatedAt`, so it must stay explicit.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `fix(sync): attendance updatedAt uses the server clock`.

---

### Task 3 (desktop): Merging outbox triggers (migration 046)

**Files:**
- Create: `apps/desktop/electron/database/outbox/mergingOutboxTriggers.ts`
- Create: `apps/desktop/electron/database/migrations/046-merge-outbox-edits.ts` (+ `.test.ts`)
- Modify: `apps/desktop/electron/database/migrations/registry.ts` (append `mergeOutboxEdits`)
- Modify: `apps/desktop/electron/database/migrations/010-create-sync-outbox.ts` (doc comment on `installOutboxTriggers`: new migrations use the merging installer)

**Interfaces:**
- Produces: `capturedOutboxColumns(db, table: string): string[]` — parses the existing `outbox_<table>_insert` trigger SQL from `sqlite_master` (pattern `'<col>',NEW."<col>"`), in order. `installMergingOutboxTriggers(db, table: string, columns: readonly string[]): void` — creates `outbox_<table>_insert`, `outbox_<table>_update`, `outbox_<table>_update_merge`, `outbox_<table>_delete`, `outbox_<table>_delete_merge`. `export const mergeOutboxEdits: Migration` (version 46, name `merge-outbox-edits`).
- Trigger names `outbox_<table>_insert` must stay (`resolveConflict` checks it).

"Mergeable target" for entity (T, NEW/OLD.id): the entity's highest-`seq` row among `status IN ('pending','in_flight')` is `operationType='update'`, `status='pending'`, `deadLetter=0`, `nextAttemptAt IS NULL`.

| Trigger | WHEN (plus captureEnabled=1) | Action |
|---|---|---|
| `_insert` | always | INSERT create (as today) |
| `_update` | NOT EXISTS mergeable target | INSERT update `{base: OLD, record: NEW}` (as today) |
| `_update_merge` | EXISTS mergeable target | UPDATE target: `payload = json_set(payload,'$.record',json(<NEW json_object>))`, `seq = MAX(seq)+1`, `updatedAt = now` |
| `_delete` | NOT EXISTS mergeable target | INSERT delete `{base: OLD}` (as today) |
| `_delete_merge` | EXISTS mergeable target | UPDATE target: `operationType='delete'`, `payload = json_remove(payload,'$.record')`, `seq = MAX(seq)+1`, `updatedAt = now` |

Migration: for every table that currently has an `outbox_%_insert` trigger, read `capturedOutboxColumns`, drop that table's `outbox_` triggers, call `installMergingOutboxTriggers` with the captured list. Existing queue rows untouched.

- [ ] **Step 1: Failing tests** in `046-merge-outbox-edits.test.ts` (real SQLite, all migrations):
  - `"keeps every table's captured column list identical"` — snapshot `capturedOutboxColumns` for every outbox table after migration 45 and after 46; equal. Explicitly assert `students` excludes `createdAt`, `nationalId`, `photoUrl`; `grades` excludes `enteredAtClose`.
  - `"update then update makes one row: original base, latest record, new seq"`.
  - `"update then delete makes one delete row with the original base and no record"`.
  - `"create then update is not merged"` (2 rows).
  - `"an update after an in_flight row creates a new row"`; `"an update after a backed-off row creates a new row"`; `"an update after a dead-lettered row creates a new row"`.
  - `"merging moves the row after rows written in between"` (seq greater than an intervening row's seq).
  - Review Focus 5: `"writes with capture disabled neither enqueue nor merge"`.
- [ ] **Step 2:** Run (Electron-as-Node) → FAIL.
- [ ] **Step 3:** Implement module and migration; register it.
- [ ] **Step 4:** Run the new test plus `010-create-sync-outbox.test.ts`, `026-add-sync-queue-sequence.test.ts`, `apps/desktop/electron/database/DatabaseManager.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(sync): merge consecutive edits into an unsent queued change`.

---

### Task 4 (desktop): One change per record per batch, never reordered

**Files:**
- Modify: `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts` (`nextBatch`; `claimBatch` uses it unchanged)
- Test: the repository's existing test file (`SqliteSyncQueueRepository.test.ts`; create if absent beside it)

**Interfaces:** `nextBatch(limit)` keeps its signature. Rule: take due rows in `seq` order (existing blocker rule kept), stop at the first row whose `(entityType, entityId)` is already in the batch or currently has an `in_flight` row. Stop — never skip.

- [ ] **Step 1: Failing tests:**
  - `"stops the batch at a second change for the same record"` — rows A1, B1, A2, C1 → batch [A1, B1].
  - `"stops at a record that already has an in_flight change"`.
  - `"still respects the backed-off blocker"` (existing behaviour, keep green).
  - Review Focus 1 (repository half): `"after in_flight recovery, two pending rows for one record go out in two batches"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (select due rows ordered, up to `limit`, plus one query for `in_flight` entity keys; build the prefix in TS).
- [ ] **Step 4:** Run → PASS, plus `DesktopSyncWorker.test.ts` still green.
- [ ] **Step 5:** Commit `feat(sync): send at most one change per record per batch`.

---

### Task 5 (desktop): Token types, validation and helpers

**Files:**
- Modify: `packages/types/src/sync.ts` (`DesktopSyncToken`, `serverToken?` on `DesktopSyncOperationResult`)
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts` `validateSyncResult`
- Create: `apps/desktop/electron/sync/syncToken.ts` (+ `.test.ts`)

**Interfaces (produces):**
- `DesktopSyncToken` — same shape as the server's.
- `validateSyncResult`: a `serverToken` that is not `{field ∈ the three names, value: parseable date string}` is deleted from the entry (not an error).
- `tokenFromRemote(local: Record<string, unknown>, remote: Record<string, unknown>): DesktopSyncToken | null` — the Global Constraints rule; value normalised to ISO.
- `rebaseQueued(db: SqliteDatabase, entityType: string, entityId: string, token: DesktopSyncToken): number` — sets `$.base.<field>` on that record's rows with `status='pending'` (including backed-off) that have a `base`; returns count.
- `writeBackToken(db: SqliteDatabase, entityType: string, entityId: string, token: DesktopSyncToken): void` — if the table has column `token.field`, `UPDATE <table> SET <field>=? WHERE id=?` with `captureEnabled` 0 then restored to 1 in `finally`. Table names come only from `sync_queue.entityType` validated against existing outbox triggers.

- [ ] **Step 1: Failing tests:** rule cases (student_guardians/createdAt, assignedAt, updatedAt, none → null); rebase touches only pending rows of that record and only the named field; write-back does not enqueue; Review Focus 4: gateway drops `{field:"version"}` and `{value:"not-a-date"}`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(sync): desktop token helpers and response validation`.

---

### Task 6 (desktop): Push rounds and rebase on acknowledgement

**Files:**
- Modify: `apps/desktop/electron/sync/DesktopSyncWorker.ts` (`#runCycle` push section, ack transaction)
- Test: `apps/desktop/electron/sync/DesktopSyncWorker.test.ts`

**Interfaces:** consumes Task 4 `claimBatch`, Task 5 helpers. `const MAX_PUSH_ROUNDS = 20`. Each round: claim(50) → push → ack transaction. In the ack transaction, for each `accepted` result with `serverToken`: `rebaseQueued` then `writeBackToken` (entityId = `redirectedTo ?? entityId`). The catch block reschedules/dead-letters only the **current round's** claimed rows (earlier rounds are already `completed`). Pull/reversal/completion/registration steps run once after the rounds, as today; the `claimed.length > 0` pull condition becomes "any round claimed something".

- [ ] **Step 1: Failing tests** (fake gateway that accepts and returns `serverToken`):
  - `"rebases a queued follow-up onto the server token and pushes it in the same cycle"` — create then update the same row → two `pushChanges` calls; the second operation's `base.updatedAt` equals the first result's token.
  - `"writes the token back so the next edit's base is the server's"`.
  - `"an edit made while a push is in flight goes out next round with the server's base"` (perform the local update inside the mocked `pushChanges`).
  - Review Focus 1 (worker half): stranded `in_flight` op recovered, gateway replays the receipt with a token, follower is rebased.
  - Review Focus 3: `"without serverToken nothing is rebased and nothing breaks"`.
  - `"stops after MAX_PUSH_ROUNDS"`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Whole `DesktopSyncWorker.test.ts` PASS.
- [ ] **Step 5:** Commit `feat(sync): rebase queued changes on the server token, push in rounds`.

---

### Task 7 (desktop): Conflicts fold later edits, then decide

**Files:**
- Create: `apps/desktop/electron/sync/foldConflict.ts` (+ `.test.ts`)
- Modify: `DesktopSyncWorker.ts` conflict branch of the ack transaction
- Test: `DesktopSyncWorker.test.ts`

**Interfaces:**
- `foldPendingFollowers(db, refused: { entityType: string; entityId: string; operationType: 'create'|'update'|'delete'; payload: unknown }): { operationType: 'create'|'update'|'delete'; payload: { base?: unknown; record?: unknown } }` — reads that record's `status='pending'` rows in `seq` order, deletes them, returns: base = refused base; record = last follower's record (or refused record); a final delete → `operationType 'delete'`, no record; refused create + updates → stays `create` with the latest record.
- Worker: fold first, then the existing auto-resolve test (`isAcademicYearRejection` / delete / `hasRealDisagreement`) on the folded result's `record`. Recorded conflict: if an `unresolved` row exists for `(entityType, entityId)`, UPDATE its `operationType, localPayload, remotePayload, reason, operationId` instead of INSERT.

- [ ] **Step 1: Failing tests:** fold cases (update+update, update+delete, create+update, no followers); worker: `"three queued edits, first refused → one conflict showing the latest edit, queue empty for that record"`; `"a follower that matches the server auto-resolves with nothing recorded"`; `"a second refusal for the same record updates the existing conflict"`.
- [ ] **Step 2–4:** Run → FAIL; implement; run → PASS.
- [ ] **Step 5:** Commit `feat(sync): fold queued edits into a conflict before deciding`.

---

### Task 8 (desktop): "Keep mine" wins

**Files:**
- Modify: `DesktopSyncWorker.ts` `resolveConflict` keep_local branch
- Test: `DesktopSyncWorker.test.ts` (update the three existing keep_local tests as needed)

**Interfaces:** consumes `tokenFromRemote`. Rule:
- `remotePayload` null → today's behaviour (re-queue verbatim).
- update/delete → re-queue with `base[token.field] = token.value`, token = `tokenFromRemote(local edited-or-base row, remotePayload)`.
- create → re-queue as `update` with `{ base: { ...remotePayload, [field]: value }, record: localRecord }`.
- Re-queued row goes to the end (`MAX(seq)+1`, as today).

- [ ] **Step 1: Failing tests:** `"keep mine on an update conflict sends the server's token as base"`; `"keep mine on a create conflict re-queues an update"`; `"keep mine on a delete conflict keeps it a delete with the server token"`; `"keep mine with no remote payload re-queues as-is"`.
- [ ] **Step 2–4:** Run → FAIL; implement; run → PASS.
- [ ] **Step 5:** Commit `fix(sync): keep-mine rebases onto the server's version`.

---

### Task 9 (desktop): Comparer treats JSON text as its value, plus end-to-end scenarios

**Files:**
- Modify: `packages/shared/src/sync-conflict.ts` `valuesEqual`
- Test: `packages/shared/src/sync-conflict.test.ts`
- Create: `apps/desktop/electron/sync/consecutiveEdits.e2e.test.ts`

**Interfaces:** `valuesEqual(a, b)`: if one side is a string that `JSON.parse`s to an array/object and the other is an array/object, compare `JSON.stringify` of both parsed values (key order as produced). Failed parse → existing behaviour.

The e2e test uses a **fake applier gateway**: an in-memory server map per `(entityType, id)` that applies the real rule — refuse update/delete when `base[tokenField]` ≠ stored token; on accept store record with a server-clock token strictly later than any previous one and return `serverToken`; can be told to "edit on the web" (bump a record's token).

- [ ] **Step 1: Failing tests:**
  - shared: `'["TEACHER"]'` equals `["TEACHER"]`; `'{"a":1}'` equals `{a:1}`; `'["A"]'` ≠ `["B"]`; `hasRealDisagreement` false for a grade window differing only in `allowedRoles` representation.
  - e2e (via `SchoolAdminModuleService.save` on real SQLite, all offline, then `syncActive`):
    - `"grade window create → open → close → publish offline syncs with zero conflicts and ends PUBLISHED"`;
    - `"grades saved then sent to students in one go sync with zero conflicts"`;
    - Review Focus 2: `"create then delete offline syncs both, no conflict"`;
    - `"a web edit in between yields exactly one conflict; keep mine then syncs"`.
- [ ] **Step 2–4:** Run → FAIL; implement the comparer (e2e should pass from Tasks 3–8; fix what it exposes); run → PASS.
- [ ] **Step 5:** Full verification: desktop `pnpm lint`, `pnpm typecheck`, full Electron-as-Node vitest run (note pre-existing unrelated failures from memory: `app/page.test.tsx`, `teacher/timetable.test.tsx`); server `pnpm jest src/desktop-provisioning` and `pnpm tsc --noEmit -p .`.
- [ ] **Step 6:** Commit `fix(sync): JSON-text lists compare equal in conflicts; e2e consecutive-edit scenarios`.

---

## Release order

Merge and deploy Nemis (Tasks 1–2) before releasing the desktop build. Old desktops ignore `serverToken`; a new desktop on an old server behaves as today (Task 6 test).
