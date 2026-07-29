# Sync Engine Hardening & Student CRUD Verification — Design

Date: 2026-07-29
Repos touched: `desktop-client-nemis` (primary), `Nemis/apps/Server` (backend, one endpoint)

## 1. Context

The user asked for "full CRUD for School Admin students" plus a full offline
synchronization engine (outbox, inbox, change tracking, sync queue, delta
sync, retry policies, background sync, network detection, sync status UI,
idempotent operations), with the goal: students can be enrolled fully
offline, and the moment the device regains internet it pushes to the
national server automatically; while online, the app should keep checking
the national server and pull down new records automatically.

Investigation (this session) found the branch `feature/offline-sync` already
has most of this built and working, not merely planned:

- Auth/login against the real backend, roles modeled, route-guarded — **done, out of scope here** (confirmed by user).
- Student Create / Read / Update / Enroll / Archive-Restore — real IPC → SQLite, no fakes.
- Outbox: SQLite triggers on 15 mutable tables (incl. `students`) auto-populate `sync_queue` on every write.
- `SyncQueueService` (atomic `claimBatch`), `DesktopSyncWorker` (push → conflict-record → complete → pull-on-drain), `sync_conflicts` table + resolve UI, `StatusBar` sync/online display.
- Backend `POST /desktop/sync/push` is already idempotent per-`operationId` via `desktopSyncReceipt` (replays stored result on retry).

Real gaps found (verified by reading the code, not assumed):

1. `ConnectivityStore.setOnline()` exists but is **never called** — the "Online" indicator is permanently `true`; nothing detects real connectivity or reacts to reconnect.
2. `DesktopSyncWorker`'s failure path resets failed items to `pending` and retries immediately, forever — no backoff, no cap, no dead-letter.
3. `GET /desktop/provisioning/snapshot` is always a full point-in-time dump — no incremental/`since` pull.
4. No sync attempt on `before-quit`.

This spec covers closing exactly those four gaps, plus a verification pass
(not a rebuild) of the already-built student CRUD. Hard delete was
considered and explicitly rejected by the user — soft-delete
(Archive/Restore) remains the only removal path, which is also the safer
choice under offline sync (a hard delete on one device cannot safely
destroy data another device still holds pending changes against).

## 2. Goals

- The "Online/Offline" indicator reflects real connectivity, not a hardcoded value.
- Reconnecting triggers a sync attempt within ~1-2s, not "up to 30s later."
- A permanently-failing sync item stops retrying forever and surfaces to a human instead of looping.
- Steady-state background pulls fetch only changed rows, not the whole school's data every time.
- Best-effort flush of pending changes on app quit.
- Student CRUD is verified end-to-end, including offline → reconnect, with any real bugs found fixed.

## 3. Non-goals

- No hard-delete for students (soft-delete only, per decision).
- No CDC/event-log rearchitecture of the backend — the existing per-table Prisma queries are extended, not replaced.
- No new IPC channels for CRUD (they exist); at most new channels for sync status detail (dead-letter list) if the existing conflicts channel doesn't already cover it.
- No change to push-side idempotency (already correct).
- No new npm/pnpm dependencies in either repo — everything below uses native `fetch`, Electron's `powerMonitor`/`net`, `setInterval`, and `node:crypto`.

## 4. Desktop: Network Detection

New `apps/desktop/electron/sync/NetworkMonitor.ts`:

- Combines two signals because neither alone is reliable:
  - Electron `powerMonitor` events (`resume`, `unlock-screen`) and Chromium's `net.isOnline()` for a fast local-adapter signal.
  - An active reachability probe: reuse the existing session-check call already implemented in `BackendAuthenticationGateway` (the same request `RestoreSession`/`getCurrentUser` issues against `/auth/me`) rather than adding a new backend endpoint — a successful or auth-rejected response both prove reachability; only a network-level failure (timeout/DNS/connection-refused) counts as offline. Run every 10s, and immediately whenever the local-adapter signal flips to online (adapter-up does not guarantee internet-up).
- On a debounced state change (avoid flapping — require 2 consecutive consistent probe results before flipping), it:
  1. Emits an IPC event the renderer preload already has a channel shape for (new `sync:connectivity-changed` channel, following the existing 7-step IPC checklist in `docs/conventions.md`), which the renderer uses to call `ConnectivityStore.setOnline()`.
  2. On transition **offline → online**, immediately calls `syncWorker.syncActive()` (in addition to the existing 30s interval, which remains as the steady-state heartbeat).
- Instantiated and started in `main.ts` alongside the existing `syncTimer`; stopped on `will-quit`.

## 5. Desktop: Retry Policy & Dead-Letter

Migration `013-add-sync-retry-backoff.ts`:
- `ALTER TABLE sync_queue ADD COLUMN nextAttemptAt TEXT` (nullable; `NULL`/`<= now` means eligible now).
- Widen the `status` CHECK constraint (SQLite requires table rebuild for this) to add `'dead_letter'`.

`SqliteSyncQueueRepository.claimBatch` gets an added `AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?)` clause.

`DesktopSyncWorker.syncActive()`'s catch path is replaced: instead of the raw
`UPDATE ... SET status='pending'`, it calls `syncQueueService.fail(id, error)`
for each affected item (this already exists and already increments
`retryCount` + records into `sync_errors` — currently unused code, this
wires it in). After `fail()`, compute backoff from the new `retryCount`:

```
30s, 1m, 5m, 15m, 1h  (index by retryCount, cap at 1h)
```

and set `nextAttemptAt = now + backoff`. If `retryCount >= 5`, set
`status = 'dead_letter'` instead of `pending` (no `nextAttemptAt` needed —
it's out of the claim pool until a human acts).

Dead-lettered items are surfaced by extending the existing
`listConflicts`-style query (or a small sibling method) to also return
`dead_letter` sync-queue rows, reusing `SyncConflictsPage` UI with a
"Sync failed after 5 attempts: <message>" row instead of building new UI.
Resolution action: "Retry now" (resets `retryCount=0`, `status='pending'`,
clears `nextAttemptAt`) — reusing the existing resolve-action plumbing.

## 6. Desktop: Shutdown Flush

In `main.ts`'s existing `app.on('will-quit', ...)` handler, before
`workspaces?.close()`: if `NetworkMonitor` currently reports online and
`sync_queue` has pending rows, `await` a single bounded `syncWorker.syncActive()`
call with a short timeout (e.g. 3s race against a timer) — best effort only,
never blocks quit past that bound, matching CLAUDE.md's "before shutdown
when possible."

## 7. Backend: Delta Snapshot (`Nemis/apps/Server`)

`desktopProvisioningQuerySchema` (in `@nemis/types`) gains an optional
`since: z.string().datetime().optional()`. `DesktopProvisioningController.getSnapshot`
passes it through unchanged to `DesktopProvisioningService.getSnapshot(deviceId, user, since?)`.

Inside the existing `$transaction` in `getSnapshot`, every one of the ~34
`findMany` calls gets `since` folded into its existing `where`, keyed off
the same timestamp field the function already maps to `updatedAt` for that
entity (e.g. `row.updatedAt`, or `recordedAt` for attendance — matching
what's already in the row-mapping code below each query). Concretely, a
helper:

```ts
function sinceFilter(since?: string) {
  return since ? { updatedAt: { gt: new Date(since) } } : {};
}
```

spread into each `where`. This is a mechanical, uniform change across the
existing queries — no new query shapes, no schema change, same response
contract (`DesktopProvisioningSnapshot`), just fewer rows when `since` is
present.

**Deletions are explicitly out of scope for delta.** The backend has no
delete-tracking for these entities today (a full snapshot simply omits rows
that no longer exist; delta pulls have no way to observe that a row is
gone). Since the desktop side never hard-deletes and no hard-delete path
was found server-side for these entities either, this is treated as
acceptable for v1. As a safety net against any drift this assumption
doesn't cover, the desktop performs a **full (no `since`) resync once every
24h** regardless of delta pulls in between — see §8.

## 8. Desktop: Consuming Delta

`sync_metadata` gains `lastDeltaAt TEXT` and `lastFullResyncAt TEXT` (same
migration `013`; kept distinct from the existing `lastSyncAt`, which the
StatusBar already uses for a different purpose — push-completion time).
`DesktopSyncWorker.syncActive()`'s pull step changes from unconditional
`downloadSnapshot(deviceId)` to:

```
sinceForPull = (now - lastFullResyncAt >= 24h) ? undefined : lastDeltaAt
snapshot = gateway.downloadSnapshot(deviceId, sinceForPull)
import snapshot (existing ProvisioningImporter, unchanged — upserts are
  already idempotent regardless of full vs partial row sets)
if sinceForPull === undefined: lastFullResyncAt = now
lastDeltaAt = snapshot.generatedAt
```

`lastFullResyncAt` is the new dedicated column from §8's migration — it is
never conflated with `lastSyncAt` (push-completion time, unrelated).

## 9. Student CRUD Verification

Not a rebuild. Exercise each flow (create wizard, edit drawer, list/filter/
pagination, enroll, archive/restore) both online and with network disabled,
confirming each write lands in `sync_queue` and later flushes on reconnect
per §4. Fix genuine bugs found; do not add scope. Any deliberately deferred
issue gets a short written note rather than silent omission.

## 10. Testing

- `NetworkMonitor`: unit test the debounce logic with fake timers and a stubbed probe.
- Retry/backoff: unit test `DesktopSyncWorker` failure path — assert `retryCount` increments, `nextAttemptAt` backoff schedule, and dead-letter transition at retry 5.
- Backend: extend `desktop-provisioning.service.spec.ts` with a `since`-filtered case per a representative subset of entities (not all 34 — spot-check the pattern plus students, since that's the entity this work is anchored on).
- Desktop delta consumption: extend existing sync worker tests with a fixture where the gateway returns a partial snapshot; assert `ProvisioningImporter` still upserts correctly and `lastDeltaAt`/full-resync-timer bookkeeping is correct.
- CRUD verification: any bug fixes get a regression test; no new test infrastructure needed given existing coverage patterns.

## 11. Rollout Order

1. Desktop: retry/backoff + dead-letter (§5) — self-contained, no backend dependency.
2. Desktop: network detection + instant reconnect sync (§4) — self-contained.
3. Desktop: shutdown flush (§6) — small, depends on §4 for the online check.
4. Backend: delta `since` param (§7).
5. Desktop: consume delta (§8) — depends on §7 shipping first.
6. Student CRUD verification (§9) — can run in parallel with any of the above; do last so it also exercises the hardened sync path.

## 12. Open Assumption to Confirm

Deletion-via-delta is assumed out of scope because no hard-delete path was
found for snapshot-tracked entities. If any of these entities can in fact
be hard-deleted server-side today (e.g. an admin tool, a cascade from
institution rejection, etc.), the 24h full-resync in §8 is the only thing
catching that — flag now if that gap window is unacceptable for any
specific entity.
