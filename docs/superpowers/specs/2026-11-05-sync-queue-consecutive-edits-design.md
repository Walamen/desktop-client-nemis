# Sync queue: consecutive offline edits without false conflicts — design

Date: 2026-11-05
Repos: `desktop-client-nemis` (most of the work) and `Nemis` (server applier).

## 1. Why

The desktop app is offline-first. A user must be able to change a record, change it
again, and again, while it is still waiting to sync, and have all of it sync cleanly
when the internet returns.

Today the **second** change to any record made before a sync is refused by the
server with *"The server record changed after the offline edit began."* Two
everyday examples:

- School Admin closes a grade window, then publishes it. Publish is refused; the
  window stays CLOSED on the server and grades are never published.
- A teacher enters scores and presses **Send to Students**. Send to Students
  saves the grade rows and then updates the same rows again to publish them; the
  second write is refused.

This is not specific to those screens. It affects every record type that syncs
through the shared outbox (`sync_queue`).

### Root cause

1. Every local write to an outbox table fires a SQLite trigger
   (`apps/desktop/electron/database/migrations/010-create-sync-outbox.ts`,
   `installOutboxTriggers`) that inserts **one new** `sync_queue` row. An update's
   payload is `{ base: <OLD row>, record: <NEW row> }`. Edits are never merged.
2. Local writes stamp `updatedAt` with the **desktop clock**
   (`SchoolAdminModuleService.save`, and the other write services).
3. The server decides every update/delete with one rule
   (`Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.ts`,
   `mutationDecision` → `sharedTimestamp`): refuse if `base.updatedAt` (falling
   back to `assignedAt`, then `createdAt`) differs from the server row's value.
4. When the server applies a change, Prisma's `@updatedAt` writes the **server
   clock**. The desktop never learns that value until the next pull, and the pull
   only runs once the queue is empty.

So the first edit carries a base the server issued (from the last pull) and is
accepted; the second edit's base is the desktop-clock value written by the first
edit, which the server has never seen → refused. Every time.

### Related defects found while tracing (in scope)

- **"Keep mine" can never win.** `DesktopSyncWorker.resolveConflict('keep_local')`
  re-queues the local payload verbatim, with its original, now-stale base, so the
  server refuses it again.
- **The attendance patch is unsafe.** Attendance was previously "fixed" by having
  the server store the desktop's `updatedAt` verbatim (applier `attendance()`,
  `updatedAt: optionalDate(record.updatedAt) ?? new Date()`). Delta pulls select
  rows by `updatedAt > since` (`desktop-provisioning.service.ts`, `sinceFilter`),
  so an edit from a desktop whose clock is behind can be skipped by every other
  device's delta pull. It also only ever fixed attendance.
- **List fields always look different in the conflict screen.** SQLite stores a
  list such as `allowedRoles` as JSON text (`'["TEACHER"]'`); the server returns a
  real array. `valuesEqual` in `packages/shared/src/sync-conflict.ts` compares them
  with `JSON.stringify`, so they never match. That makes every grade-window
  conflict look "real" and blocks the existing silent auto-resolve
  (`hasRealDisagreement`).

## 2. Goals

- Any number of consecutive edits to the same record while it is queued, offline or
  online, sync without a conflict — for **every** entity type in the shared outbox.
- The server's clock is the only clock used for conflict detection. The desktop's
  clock is never trusted for it.
- A **genuine** conflict — the web portal or another device changed the record
  after this device last saw it — still stops and asks the user to choose, exactly
  as today (Alvin's decision).
- "Keep mine" on a conflict actually wins.
- Global push order is preserved (a student still reaches the server before its
  enrolment).

## 3. Non-goals

- The four bespoke push paths: homework (`AssignmentSyncService`), payment
  reversals, end-of-year grade completions, county school registrations. They do
  not use `sync_queue` (Alvin's decision: out of scope for now).
- Changing what counts as a genuine conflict, or adding automatic merging of
  genuine conflicts (no "last write wins").
- Renderer/UI redesign of the Sync Conflicts or Pending Changes pages.

## 4. Anti-goals (this would be a failure even if it "works")

- Per-screen or per-entity workarounds (the attendance-style patch).
- Hiding genuine conflicts from other users/devices.
- Trusting the desktop clock anywhere in the conflict decision or in `updatedAt` on
  the server.
- Losing an offline edit, or pushing a dependant before the record it depends on.

## 5. The design

This is the standard offline outbox pattern (same shape as AWS Amplify DataStore's
outbox and CouchDB/PouchDB revisions): a server-issued concurrency token, one
in-flight change per record, and merging of queued edits.

### 5.1 Server returns the new token on every accepted change (Nemis)

- Add an optional field to the per-operation result,
  `serverToken?: { field: 'updatedAt' | 'assignedAt' | 'createdAt'; value: string }`
  (value is ISO), in both `Nemis` `DesktopSyncOperationResult` and
  `desktop-client-nemis/packages/types/src/sync.ts`.
- After an accepted create/update, the applier reads the row back and picks the
  field with **exactly `sharedTimestamp`'s rule**: the first of
  `updatedAt`/`assignedAt`/`createdAt` present on both the operation's local row
  (`record`) and the stored server row. It returns that field's name and stored
  value. Not sent for deletes or conflicts. (Reviewer finding: local and server
  columns differ per table — e.g. `student_guardians` is `createdAt`-only locally
  but has `updatedAt` on the server; the teacher-assignment tables have only
  `assignedAt` on the server — so the server must name the field, and the desktop
  must write into the named field only, never guess.)
- Implement it once, generically (e.g. a `currentToken(entityType, entityId)` in
  the applier next to `existingInScope`, or by returning the upserted row from each
  handler). Every entity type in the applier's switch must be covered; a test
  asserts that.
- The token is stored in the idempotency receipt with the rest of the result, so a
  replayed operation returns the same token.
- `mutationDecision` itself does not change: it still compares base vs server.

### 5.2 Server stops storing the desktop clock for attendance (Nemis)

- In `attendance()`, write `updatedAt: new Date()` (server clock).
  `Attendance.updatedAt` is nullable and has no `@updatedAt`, so it must be set
  explicitly. Remove the old explanatory comment; replace it with a short one
  pointing at 5.1.

### 5.3 The desktop adopts the token on acknowledgement (desktop)

In the push-acknowledgement transaction in `DesktopSyncWorker` (the same
`runImmediate` that marks rows `completed`), for each accepted result with a
`serverToken`:

1. **Rebase queued changes:** every `sync_queue` row for the same
   `(entityType, entityId)` that is still `pending` (including backed-off) gets
   `base[serverToken.field] = serverToken.value`. Only that field changes; the rest
   of `base` stays as captured.
2. **Write the token back to the local row** with outbox capture disabled
   (`sync_runtime.captureEnabled = 0`, same pattern as the existing NEMIS-ID
   correction), so the next edit's trigger captures the server token as its base
   even if the follow-up pull never happens (offline right after the push).
   Builder's call whether to skip this when the row has a pending change; either
   is correct because 5.4 keeps that pending change's base.

If an older server sends no `serverToken`, behave as today.

### 5.4 Merge edits into a queued change that hasn't been sent (desktop)

Replace the outbox triggers (new migration) so that, for a record that already has
a `sync_queue` row in status `pending` that is **not backed off**
(`nextAttemptAt IS NULL`), not `in_flight`, and not dead-lettered, the trigger
**updates that row** instead of inserting a new one.

**Each table keeps exactly the columns its current trigger captures.** The
migration must rebuild from the existing triggers' column lists (read from
`sqlite_master`), not from the live table columns. Rebuilding from live columns
would silently start pushing columns that are deliberately or accidentally not
pushed today (`students.createdAt` per migration 031; `students.nationalId`,
`students.photoUrl`, `guardians.photoUrl`, `grades.enteredAtClose`). Whether any of
those should be pushed is a separate decision, not part of this work. A test pins
each table's captured column list before and after the migration.

Merge rules:

| Queued (pending) | New local write | Result |
|---|---|---|
| update | update | one update: **original `base`**, latest `record`; moved to the end of the queue (new `seq`) |
| update | delete | one delete with the **original `base`**; new `seq` |
| create | update / delete | **not merged** — a second row is queued as today; 5.5 + 5.3 make it safe |
| none, or only `in_flight` / backed-off / failed | anything | new row as today |

Rationale for the choices (my calls):

- Keeping the original `base` is the point: it is the server-issued token.
- A merged update moves to the end because its latest `record` may point at a
  record created after the original edit (e.g. a timetable entry moved to a
  newly created subject); the end of the queue is after that record's create.
- Creates are not merged because a create keeps its place for dependants created
  after it (student → enrolment). Moving it would break them; keeping its place
  while carrying a later `record` could reference something created later. Not
  merging plus 5.5 avoids both.
- A merge changes only the row's payload, `seq` and `updatedAt`.
- Backed-off rows are never merged into: a backed-off row holds back every row
  written after it (`OUTBOX_BLOCKER_SQL`), and moving it to a new `seq` would let
  those rows overtake it. The new edit becomes its own row behind it; 5.5 and 5.3
  carry it through once the held row succeeds.

Bulk paths that write with capture disabled (pull/import, corrections) are
unaffected, since the triggers don't fire.

### 5.5 One change per record per batch, in order (desktop)

Change `SqliteSyncQueueRepository.nextBatch`/`claimBatch` so a batch is the
longest run of due rows, in `seq` order, that:

- contains at most one row per `(entityType, entityId)`, and
- contains no row for a record that already has an `in_flight` row.

The batch **stops** at the first row that breaks either rule (rather than skipping
it), so global order is never reordered. The existing backed-off-row blocker rule
stays.

`DesktopSyncWorker` then loops within one cycle — push batch, acknowledge (5.3
rebases the next change), claim again — until nothing is claimable, with a sane
cap on rounds per cycle (builder's call, e.g. 20). The pull still runs only when
the queue has drained.

### 5.6 Genuine conflicts (desktop)

- Unchanged: a stale base still produces the server's conflict, and the user is
  asked.
- **Fold first, then decide.** When a change for a record is refused as a conflict,
  first fold any later **pending** changes for the same record into it: the
  conflict's local side becomes the latest local `record` (a later delete makes the
  folded operation a `delete`), keeping the refused change's `base`, and those rows
  leave the queue. Only then run the existing silent auto-resolve check
  (`hasRealDisagreement`) — against the **latest** local record, so a stale
  follower never surfaces as its own conflict. Auto-resolved → nothing recorded,
  followers gone, server version wins (today's meaning). Real disagreement →
  one conflict row for the record. (Deletes are still never auto-resolved.)
- If an unresolved conflict already exists for that record, update it instead of
  inserting a second one.
- **Keep mine:**
  - update/delete: re-queue the folded operation with `base`'s token set from the
    conflict's `remotePayload`, using `sharedTimestamp`'s field rule. The server
    then accepts it unless the record changed yet again — then the user is asked
    again, which is correct.
  - create refused because the record already exists on the server: re-queue as an
    **update** of the local record, based on `remotePayload`'s token. A create can
    never succeed against an existing record, so "keep mine" has to mean "overwrite
    it".
  - no `remotePayload` (constraint-violation conflicts — the server stores `null`):
    keep today's behaviour (re-queue as-is). The refusal there isn't about the
    token, so rebasing has nothing to fix.
- **Accept theirs:** unchanged.

### 5.7 Conflict comparer treats JSON text and structured values as equal (shared)

In `valuesEqual` (`packages/shared/src/sync-conflict.ts`): if one side is a string
that parses as a JSON array/object and the other side is an array/object, compare
the parsed value. Covers `allowedRoles`, `gradeScale`, etc. The same function backs
the worker's silent auto-resolve and the Sync Conflicts page's diff, so both
improve.

## 6. Rollout

- Server first (matches the existing rule for this programme). An old desktop
  ignores `serverToken`; a new desktop on an old server falls back to today's
  behaviour.
- The attendance change (5.2) means an old desktop that creates then immediately
  edits attendance offline will see the old false conflict again until it updates.
  Acceptable during internal prod testing (my call — flag if not).
- Migration: the new trigger migration only replaces triggers; existing queued rows
  are left as-is. Existing unresolved false conflicts can be cleared with "Accept
  theirs" / "Keep mine" (which now works).

## 7. Testing expectations

- Server: per-entity test that an accepted change returns `serverToken` equal to
  the stored row token; replay returns the same token; attendance stores server
  clock.
- Desktop, against real SQLite: trigger merge table (5.4) row by row; claim
  rules (5.5) including "stops, doesn't skip"; ack rebase (5.3); conflict folding
  and keep-mine rebase (5.6); comparer (5.7).
- End-to-end scenarios (fake gateway acting like the real applier, using its
  timestamp rule):
  - grade window: create → open → close → publish, all offline, then sync → zero
    conflicts, server PUBLISHED;
  - gradebook: create grades → Send to Students in one go → zero conflicts;
  - edit while a push is in flight → the second edit syncs next round with no
    conflict;
  - web edits the record in between → exactly one conflict; Keep mine then
    succeeds;
  - three queued edits, the first refused as a genuine conflict → one conflict
    showing the latest edit; Keep mine succeeds; a queued delete after the edit
    makes it a delete conflict;
  - token field per table: `student_guardians` (createdAt locally), the
    teacher-assignment tables (assignedAt on the server), a normal `updatedAt`
    table.

## 8. Known limits (documented, not fixed here)

- **Server-side cascades.** When a desktop publish makes the server update other
  rows (e.g. publishing a grade window flips that period's grades to PUBLISHED), the
  desktop learns those rows' new tokens only on the next pull. Editing one of those
  grades offline before a pull will still raise a conflict. Rare; it is a genuine
  server-side change.
- **Guardian redirect.** When the server redirects a guardian create to an
  existing guardian, pending queue rows for the old guardian id are not retargeted
  (pre-existing behaviour).
- The four bespoke push paths (section 3).

## 9. Left to the builder

- Exact SQL for the merging triggers and the claim query.
- Where `currentToken` lives in the applier and how each handler supplies the row.
- Round cap per sync cycle.
- Whether to write the token back to a row that has a pending change (5.3).
