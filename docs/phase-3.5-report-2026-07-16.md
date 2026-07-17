# Phase 3.5 Report — Pre-Sync Hardening

**Branch:** `phase-3.5-pre-sync-hardening` (off `main`, base `32f9a4a`)
**Head:** `f38091b`
**Date:** 2026-07-16
**Spec:** `docs/superpowers/specs/2026-07-16-phase-3.5-pre-sync-hardening-design.md`
**Plan:** `docs/superpowers/plans/2026-07-16-phase-3.5-pre-sync-hardening.md`

Phase 3.5 closes every architectural debt item the Phase 3 final review
flagged as blocking Phase 4 (Synchronization): a renderer settings allowlist,
atomic sync-batch claiming, chunked IN-updates, a closed IPC error-mapping
contract, SQLCipher database encryption, an IPC-boundary audit, an
error-wrapping audit, and this final report. No synchronization features, API
communication, authentication, UI features, or business entities were
in scope — every change extends the existing architecture.

## 1. Files changed

`git diff --stat 32f9a4a...HEAD` (13 commits, `32f9a4a..f38091b`):

```
 apps/desktop/electron/data/queries/chunk.test.ts                          |   32 +
 apps/desktop/electron/data/queries/chunk.ts                               |   20 +
 apps/desktop/electron/data/repositories/base/BaseRepository.test.ts       |   20 +
 apps/desktop/electron/data/repositories/base/BaseRepository.ts            |   43 +-
 apps/desktop/electron/data/repositories/interfaces/ISyncQueueRepository.ts    |   16 +-
 apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.test.ts |   41 +
 apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts   |   35 +-
 apps/desktop/electron/data/services/SyncQueueService.ts                   |    5 +
 apps/desktop/electron/database/Database.encryption.test.ts                |  109 ++
 apps/desktop/electron/database/Database.ts                                |   70 +-
 apps/desktop/electron/database/DatabaseManager.test.ts                    |   23 +
 apps/desktop/electron/database/DatabaseManager.ts                         |   29 +-
 apps/desktop/electron/database/backup/BackupService.test.ts               |  117 ++
 apps/desktop/electron/database/backup/BackupService.ts                    |   78 +-
 apps/desktop/electron/database/services/DatabaseHealthService.test.ts     |   14 +
 apps/desktop/electron/database/services/DatabaseHealthService.ts         |   47 +-
 apps/desktop/electron/ipc/errorMapping.test.ts                            |   60 +
 apps/desktop/electron/ipc/errorMapping.ts                                 |   64 +
 apps/desktop/electron/ipc/handlers/settings.ts                            |   12 +-
 apps/desktop/electron/ipc/registrar.ts                                    |    4 +-
 apps/desktop/electron/main/main.ts                                        |    3 +
 apps/desktop/electron/security/databaseKey.ts                             |   47 +
 apps/desktop/electron/security/settingsAllowlist.test.ts                  |   33 +
 apps/desktop/electron/security/settingsAllowlist.ts                       |   14 +
 apps/desktop/package.json                                                 |    2 +-
 docs/conventions.md                                                       |   20 +
 docs/data-access.md                                                       |   21 +-
 docs/database.md                                                          |   31 +-
 docs/superpowers/plans/2026-07-16-phase-3.5-pre-sync-hardening.md         | 1465 ++++++
 docs/superpowers/specs/2026-07-16-phase-3.5-pre-sync-hardening-design.md  |  236 ++
 packages/shared/src/errors.test.ts                                        |   29 +-
 packages/shared/src/errors.ts                                             |   20 +-
 packages/types/src/ipc.ts                                                 |   23 +-
 pnpm-lock.yaml                                                            |   10 +-
 pnpm-workspace.yaml                                                       |    1 +
 35 files changed, 2718 insertions(+), 76 deletions(-)
```

`git log --oneline 32f9a4a..HEAD`:

```
f38091b fix(db): key-aware backups and validation for the encrypted database; claim-path polish
ae46327 docs: encryption, claiming, chunking, and error-mapping documentation
06b36e3 docs: IPC endpoint checklist; record IPC boundary audit
390db95 fix(db): wrap remaining raw driver call sites found by error-wrapping audit
6de5842 feat(security): safeStorage-wrapped database encryption key wired into startup
eb863bf feat(db): SQLCipher encryption in Database.open with in-place plaintext migration
a382a1c feat(db): swap to better-sqlite3-multiple-ciphers via pnpm alias (SQLCipher-capable drop-in)
637ee4b feat(security): renderer settings allowlist gating settings:get
c76a4b4 feat(ipc): closed IpcErrorCode contract and single-source repository-error mapping
5789123 feat(data): atomic claimBatch for race-safe sync batch claiming
fe110ac feat(data): chunked IN-updates via BaseRepository.updateByIds
98f31fb docs: Phase 3.5 pre-sync hardening implementation plan
8f74d07 docs: Phase 3.5 pre-sync hardening design spec
```

Plus one post-review fix-wave commit, `f38091b`, produced after the final
review (see §3 and `.superpowers/sdd/final-review-fixes-report.md`).

(The working tree also shows ~57 CRLF-only line-ending diffs against files
untouched by this phase's real work — pre-existing `autocrlf` noise with no
`.gitattributes` in the repo, confirmed content-identical via
`git diff --ignore-cr-at-eol`; not part of this branch's changes.)

## 2. Architectural decisions

**Allowlist as the settings authorization point.** `electron/security/settingsAllowlist.ts`
defines `RENDERER_READABLE_SETTINGS` (a `ReadonlySet<string>`, currently
`'theme'`, `'language'`) and `assertRendererReadableSetting(key)`, which throws
`ForbiddenError` for anything not listed. The `settings:get` handler's
validation pipeline is: shape check → allowlist check → `AppSettingsService.get`.
Permission logic lives in exactly one module — a setting is never
renderer-readable merely because it exists in the database; it must be
explicitly listed. Extending readability is a one-line addition.

**`claimBatch` atomicity argument.** `SqliteSyncQueueRepository.claimBatch`
runs one IMMEDIATE transaction: select oldest pending ids (`ORDER BY
createdAt, id`, `LIMIT`), mark exactly those ids `in_flight` via
`BaseRepository.updateByIds`, re-select the now-`in_flight` rows to return.
The recorded race-safety argument (docs/data-access.md, `ISyncQueueRepository.ts`
doc comment): (a) today there is exactly one connection in one synchronous
process — better-sqlite3 runs the whole transaction callback without
yielding, so interleaving is structurally impossible; (b) for any future
second worker/connection, IMMEDIATE acquires SQLite's write lock _before_ the
select, so a competing claimer cannot read-then-mark between this
transaction's find and mark — it blocks until commit and then observes the
rows already `in_flight`. `nextBatch` remains a read-only preview, explicitly
documented as never safe to pair with `markInFlight` for claiming (the two
calls aren't atomic together); `claimBatch` is the only sync-worker claim API.

**Chunking ownership in `BaseRepository`.** `data/queries/chunk.ts` exports
`DEFAULT_PARAMETER_CHUNK_SIZE = 900` (safely under SQLite's legacy 999-bound
parameter ceiling) and `chunkArray`. `BaseRepository.updateByIds(ids, changes,
chunkSize?)` chunks the id list and executes every chunk inside one IMMEDIATE
transaction — a failing chunk rolls back all chunks together. Both
`SqliteSyncQueueRepository.#setStatus` and `claimBatch` use it; no repository
encodes the parameter limit itself.

**The closed `IpcErrorCode` contract and the three-layer error boundary.**
`packages/types/src/ipc.ts` defines a closed union: `VALIDATION_FAILED |
DUPLICATE | NOT_FOUND | CONFLICT | UNAUTHORIZED | FORBIDDEN |
DATABASE_UNAVAILABLE | MIGRATION_REQUIRED | IPC_ERROR | UNEXPECTED_ERROR`.
`electron/ipc/errorMapping.ts`'s `toIpcError` is the single mapper, called
from the registrar's catch for every endpoint: `RepositoryError` codes map by
taxonomy (`REPO_VALIDATION`→`VALIDATION_FAILED` with `issues`,
`REPO_DUPLICATE`→`DUPLICATE`, `REPO_NOT_FOUND`→`NOT_FOUND`,
`REPO_TRANSACTION`→`CONFLICT`, `REPO_QUERY`/`REPO_UNKNOWN`→`UNEXPECTED_ERROR`);
`DatabaseError` codes map similarly (`DB_CONNECTION`→`DATABASE_UNAVAILABLE`,
`DB_MIGRATION`→`MIGRATION_REQUIRED`, rest→`UNEXPECTED_ERROR`);
`ApplicationError` subclasses (`ForbiddenError`, `IPCError`,
`ConfigurationError`) narrow into the union; anything unrecognized masks to
`UNEXPECTED_ERROR`. This states explicitly, at every layer, the invariant
"no raw driver error escapes": `DatabaseError` (platform) →
`RepositoryError` (data-access boundary) → `IpcErrorPayload` (IPC boundary).
`UNAUTHORIZED` is defined and reserved, with no producer until Phase 4
authentication lands.

**SQLCipher.** Adopted via pnpm alias — `apps/desktop/package.json`:
`"better-sqlite3": "npm:better-sqlite3-multiple-ciphers@^12.11.1"` (added to
`pnpm-workspace.yaml`'s `onlyBuiltDependencies`) — so imports, `@types/better-sqlite3`,
rebuild scripts, and forge packaging hooks are unchanged; only the resolved
package underneath differs. `Database.open` gains an optional `encryptionKey`
(64-char hex): a pre-existing plaintext file (`SQLite format 3\0` header) is
migrated in place via `hexrekey` (temporary `journal_mode=DELETE`, audit-logged
as `database.encrypted`); otherwise `cipher='sqlcipher'` + `hexkey` are applied
before any other pragma or read, verified with a read (wrong/missing key →
`IntegrityError`). The key itself is a random 256-bit value generated on first
run, wrapped with Electron `safeStorage` (Windows DPAPI, per-OS-user) and
stored at `<userData>/nemis-db-key.bin` (`electron/security/databaseKey.ts`);
`safeStorage` unavailable or a corrupt blob fails startup hard via the
existing fatal-startup dialog — **there is no plaintext fallback, by design**.
Readonly-open with an encryption key against a still-plaintext file is
explicitly refused (`Database.ts`: "Cannot encrypt a plaintext database
opened read-only") rather than silently skipping migration.

**Empirical finding (fix wave, not predicted by the spec): `db.backup()` throws
on an encrypted source.** better-sqlite3's online-backup API opens an
_unkeyed_ connection to the destination internally, which cannot pair with a
keyed source — it throws `Error: backup is not supported with incompatible
source and target databases` rather than silently emitting plaintext. This
was discovered by a throwaway probe script
(`.superpowers/sdd/backup-primitive-probe.mjs`, not committed) run fresh during
the fix wave. `BackupService.createBackup` therefore branches: keyless/plaintext
sources use `db.backup(filePath)` (unchanged, still the safe online-backup
path); keyed/encrypted sources use `db.exec("VACUUM INTO '<escaped path>'")`
on the live keyed connection, which inherits the connection's cipher/key state
and produces a genuinely encrypted, key-openable destination — verified by
asserting the destination's 16-byte header is not `SQLite format 3\0`, that
opening it without the key and calling `quick_check` throws, and by a full
create→restore→reopen round-trip test.

## 3. Confirmation checklist

The final whole-branch architecture review confirmed all ten brief points.
Evidence pointer per item:

| #   | Item                                              | Evidence                                                                                                                                                                                                                |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Repository boundaries intact                      | `data/repositories/sqlite/*` are the only modules calling `DatabaseManager.connection`; enforced by folder convention, unchanged from Phase 3                                                                           |
| 2   | Services stay thin                                | `SyncQueueService.claim(limit)` (`electron/data/services/SyncQueueService.ts`) is a one-line async facade over `claimBatch`                                                                                             |
| 3   | IPC handlers stay thin                            | `electron/ipc/handlers/settings.ts` — shape validator → allowlist check → service call, no logic inline                                                                                                                 |
| 4   | Validation centralized                            | `security/validateIpc.ts` (shape) + `security/settingsAllowlist.ts` (authorization); `data/validators/` (persistence) — no ad hoc checks elsewhere                                                                      |
| 5   | Transactions correct                              | `claimBatch`/`updateByIds` both run inside one IMMEDIATE transaction each; `BaseRepository.test.ts` and `SqliteSyncQueueRepository.test.ts` cover atomicity across chunks and rollback-on-failure                       |
| 6   | Error handling consistent across all three layers | `errorMapping.ts` + `errorMapping.test.ts` (table-driven, every taxonomy code); `docs/data-access.md` states the three-layer invariant explicitly                                                                       |
| 7   | Claiming is race-safe                             | `ISyncQueueRepository.ts` doc comment records the IMMEDIATE-before-select argument; `SqliteSyncQueueRepository.test.ts` asserts creation-order claim, exclusion of already-claimed items, and rollback-restores-pending |
| 8   | Renderer cannot access privileged data            | `settingsAllowlist.ts` + `settingsAllowlist.test.ts` (allowed key passes, disallowed key rejected with `FORBIDDEN`, never the value)                                                                                    |
| 9   | SQLCipher finalized                               | `Database.ts` (cipher pragmas, rekey migration), `Database.encryption.test.ts` (6 tests), packaged smoke test (encrypted header verified across a restart cycle)                                                        |
| 10  | No remaining Phase-4-blocking debt                | Final review's own verdict — see §4/§5; nothing on the debt list blocks starting sync-worker design                                                                                                                     |

Full gate: **230/230 tests** (all packages) after the fix wave, typecheck/lint/format
clean, `pnpm make` succeeds, packaged smoke test PASS with an encrypted
database file across a full restart cycle. The final reviewer independently
re-ran the sweep and the suite after the fix wave and confirmed the same
result live.

## 4. Remaining risks (carried debt)

- **`claimBatch`'s re-select uses `inList` unchunked.** With more than 999
  claimed ids in one call it would hit SQLite's parameter ceiling and fail
  loudly (a safe fail-fast, not silent corruption) rather than chunk
  automatically. Accepted for now because sync-worker batch sizes are small;
  **bind the sync worker's batch size below 999** so this is never exercised
  in practice.
- **`BackupService` is unwired to production.** It is built, tested, and
  constructor-injectable, but nothing in `DatabaseManager` or `main.ts` calls
  it yet. Its constructor and `restoreBackup` now take an optional
  `encryptionKey` (per the fix wave) — **whoever wires it up must pass the
  database's key**, or backups of an encrypted database will silently fall
  back to the (now-guarded, but still keyless) plaintext path.
- **`DataLayer` must be recreated after any `shutdown()` → `initialize()`
  cycle.** `BaseRepository`/`StatementCache` bind prepared statements to the
  connection captured at construction; a stale `DataLayer` after a restore
  flow would hold statements on a closed connection. Documented in
  `docs/data-access.md`; no restore flow exists yet to violate it, but Phase 4
  work that adds one must recreate the layer.
- **`findPage`'s COUNT query cost** is unaddressed (carried from Phase 3) —
  fine at current data volumes, worth revisiting once table sizes grow.
- **Key-loss = local-data-loss, by design.** Losing the OS user profile or the
  key file makes the local database unrecoverable; this is an accepted
  trade-off because PostgreSQL remains authoritative and the local database
  re-syncs. Not a bug, but must stay visible in any operational runbook.
- **Packaged migration branch (plaintext→encrypted `hexrekey`) is unit-covered
  only** — the packaged smoke test's database already started as ciphertext
  in every run, so the live migration path itself has never been exercised
  outside `Database.encryption.test.ts`.
- **`docs/conventions.md` carries two overlapping IPC endpoint recipes** (an
  older 5-step version and the new Phase 3.5 7-step checklist) — harmless
  duplication, not reconciled this phase.
- **`VACUUM INTO` copies the whole database in one shot** inside the calling
  transaction context — heavier than the incremental online-backup API used
  on the plaintext path. Fine while there is no scheduling/retention/UI (this
  phase is infra-only); worth revisiting if backup latency becomes a concern
  at real data volumes.

## 5. Recommended improvements (Phase-4-first)

- The sync worker must claim work **exclusively** through
  `SyncQueueService.claim` → `complete`/`fail` — never `nextBatch` +
  `markInFlight` directly.
- Decide the **in_flight crash-recovery policy** early in sync-worker design:
  either a startup sweep that resets stale `in_flight` rows back to `pending`,
  or a claim-lease (timeout-based reclaim). Nothing in Phase 3.5 handles a
  worker that crashes mid-claim.
- **Wire `UNAUTHORIZED`** into the error-mapping contract when authentication
  lands — the code is reserved but has no producer today.
- **Add new IPC channels via the 7-step checklist** in `docs/conventions.md`
  (contract entry → `IpcChannels` constant → shape validator → authorization
  where applicable → thin handler → `toIpcError` mapping → preload method).
- **Recreate `DataLayer` on any `shutdown()` → `initialize()` cycle** —
  relevant the moment a restore flow (or any other lifecycle-cycling feature)
  is wired up.
- Wire the database's encryption key into `BackupService` as soon as it gets
  a real caller, so encrypted backups don't silently regress to keyless mode.

## 6. Phase 4 readiness

**GO.** The final whole-branch architecture review returned "Ready to merge:
Yes — unconditionally" after its one Important finding (key-aware backup
validation vs. an encrypted database) and two Minor findings were fixed in a
single wave (`f38091b`) and independently re-verified live (230/230 tests,
typecheck/lint/format clean, `pnpm make` + packaged smoke PASS). All ten
confirmation points hold. No item in §4 blocks starting Phase 4
(Synchronization) design or implementation; the items listed there are
carried debt to track, not gates to clear first.
