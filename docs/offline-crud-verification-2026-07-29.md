# Student CRUD Offline Verification — Automated Pass (2026-07-29)

This is an **automated-only** verification pass for Task 10 of
`docs/superpowers/plans/2026-07-29-sync-engine-hardening.md`
("Student CRUD offline verification pass"). The plan's original Task 10 called
for manually clicking through the running Electron app, logging in as an
`INSTITUTION_ADMIN`, and physically toggling a network adapter. That manual
pass was explicitly **not** run for this record — the user chose an
automated-only substitute. Section (c) below lists exactly what remains
unverified as a result, and how to run it later.

## (a) Automated test / typecheck / lint / build results

### `desktop-client-nemis` (branch `feature/offline-sync`, commit `e7c3beb`)

| Check | Command | Result |
|---|---|---|
| Unit/integration/component tests | `npx vitest run` (repo root) | **738/738 tests passed, 174/174 test files passed, 0 failed** |
| Main-process typecheck | `cd apps/desktop && npx tsc --noEmit` | **0 errors** |
| Renderer typecheck | `cd apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json` | **0 errors** |
| Lint | `npx eslint .` (repo root, per root `package.json`'s `lint` script) | **0 errors, 0 warnings** |
| Build verification | `cd apps/desktop && npx next build renderer` | **Compiled successfully, typecheck+lint pass inside the build, all 95 pages generated, 0 errors** |

Note: the SDD ledger (`.superpowers/sdd/2026-07-29-sync-engine-hardening/progress.md`)
recorded a pre-existing, unrelated failure in
`apps/desktop/electron/database/migrations/010-create-sync-outbox.test.ts`
(1/2, `operationType` mismatch) present before Task 1 started. That failure
is **not present** in this run — the full suite is 100% green, so whatever
caused it is apparently no longer reproducing (not re-investigated further
here, since it's not a regression to chase, it's the opposite: a
previously-known issue that has resolved).

**Build-verification level reached:** typecheck (main + renderer, both via
`tsc --noEmit`) plus `next build renderer` (production Next.js build of the
renderer bundle). A full Electron Forge `make` (packaging into a
distributable installer/zip) was **not** run — `next build renderer` is the
heaviest step of `apps/desktop`'s own `package`/`make` scripts before the
Electron Forge packaging step itself, which mainly re-bundles the
already-typechecked Electron main/preload code and native modules; running
it end-to-end was judged unnecessary network/time cost for this pass per the
task's own guidance to use judgment on build depth.

### `Nemis` (backend repo, branch `Feature/offline-sync`, commit `e77e4318`, `apps/Server`)

| Check | Command | Result |
|---|---|---|
| Full Server test suite | `npx jest` (`apps/Server`, `test` script = `jest`) | **64/65 tests passed, 1 failed** (6/7 suites passed, 1 suite failed) |

The one failure is in `src/fees/finance-summary.service.spec.ts`
(`FinanceSummaryService › getMonthlyCollectionTrend › buckets non-reversed
payments into six zero-filled monthly totals`). See analysis below — this
is judged **out of scope to fix** for this task.

## (b) Static code-trace: offline-first contract for student CRUD

This is a **static code-trace, not a live-tested confirmation** — it
substitutes for the manual "kill network, perform each op, confirm it lands
in `sync_queue`" step (Task 10 Step 3 in the plan).

Traced write path for every student-CRUD IPC channel in
`apps/desktop/electron/ipc/handlers/school-admin/students.ts`:

- `STUDENT_CREATE` → `CreateStudentUseCase` (`packages/application/src/use-cases/students/create-student.ts`)
- `STUDENT_UPDATE` → `UpdateStudentUseCase` (`.../update-student.ts`)
- `STUDENT_SET_ACTIVE` → `SetStudentActiveUseCase` (`.../set-student-active.ts`, used for both Archive and Restore)
- `STUDENT_CREATE_GUARDIAN` → `LinkGuardianToStudentUseCase` (`.../link-guardian-to-student.ts`)
- `STUDENT_ENROLL` → `EnrollStudentUseCase` (`packages/application/src/use-cases/academics/enroll-student.ts`)
- `STUDENT_MOVE_CLASS` → `MoveEnrollmentClassUseCase` (`.../move-enrollment-class.ts`)

Findings:

1. **No network calls in any write use case.** Grepped all six files (plus
   the SQLite repository layer) for `fetch(`, `axios`, `http(s).request`,
   `XMLHttpRequest` — zero matches outside test files. Every use case's
   write path is exactly `this.deps.unitOfWork.run(() => repo.save(...))`,
   a synchronous call.
2. **The repository layer is local-only.** `SqliteStudentRepository.save()`
   (`apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts`)
   issues plain `better-sqlite3` `INSERT ... ON CONFLICT DO UPDATE`
   statements against the local SQLite connection. `RepositoryContext`
   (`apps/desktop/electron/data/repositories/base/RepositoryContext.ts`)
   only exposes a `better-sqlite3` `Database` handle and a
   `TransactionManager` — no network dependency anywhere in that seam.
3. **The outbox-trigger pattern is confirmed live**, exactly as the plan
   assumed pre-existed Task 1. Migration
   `apps/desktop/electron/database/migrations/010-create-sync-outbox.ts`
   installs `AFTER INSERT/UPDATE/DELETE` SQLite triggers
   (`installOutboxTriggers`) on `MUTABLE_TABLES`, which includes `students`,
   `student_guardians`, and `enrollments`. Each trigger inserts a `pending`
   row into `sync_queue` with `entityType` set to the table name — this
   happens at the SQLite engine level, inside the same local write
   transaction, with **no application code and no network involvement**.
   This means every write path traced above automatically produces a
   matching `sync_queue` row as a side effect of the local `INSERT`/`UPDATE`
   statement succeeding, regardless of connectivity.

Conclusion: by static inspection, student CRUD (create, edit, archive/
restore, guardian link, enroll, move-class) satisfies steps 1-3 of
`CLAUDE.md`'s "Offline-First Contract" (write to SQLite → queue record
created automatically via trigger → return success — no network wait). This
was **not exercised live** with the network disabled; see (c).

## (c) NOT verified — requires a human clicking through the live app

The following require launching the Electron app, logging in as an
`INSTITUTION_ADMIN`, and (for some) physically disabling the network
adapter. None of this was performed in this automated pass. Reference
Task 10 Steps 2-5 in
`docs/superpowers/plans/2026-07-29-sync-engine-hardening.md` for the exact
checklist if/when a human runs it:

- **Online baseline (Task 10 Step 2):** create-student 4-step wizard end to
  end (incl. at least one guardian), inline edit drawer + persistence after
  refresh, filter/pagination correctness, enroll-into-class from
  `/students/enroll` reflecting on the profile page, archive then restore
  round-trip.
- **Offline exercise (Task 10 Step 3):** the same Create/Edit/Enroll flows
  with the network adapter physically disabled — confirming the UI returns
  success immediately with no hang/spinner, and manually inspecting
  `sync_queue` (`SELECT entityType, operationType, status FROM sync_queue
  ORDER BY createdAt DESC LIMIT 5;`) for a matching `pending` row per write.
- **Reconnect + flush (Task 10 Step 4):** confirming the `StatusBar` flips to
  "Online" within ~20s in real time, that a sync attempt fires immediately
  on reconnect (not waiting for the 30s interval), that the Step 3
  `sync_queue` rows transition to `completed` (or surface on
  `/government/school-admin/sync-conflicts` if legitimately rejected), and
  that the student list reflects backend-authoritative data after refresh.
- **Dead-letter path end to end (Task 10 Step 5):** a real backend outage
  (or simulated via `sync_queue.retryCount`/`nextAttemptAt` manipulation)
  driving an item through 5 failed attempts to confirm it surfaces on
  `/government/school-admin/sync-conflicts` with source `dead_letter` and a
  working "Retry now" button.

None of the above was simulated, mocked, or otherwise claimed as tested in
this document — they remain open until a human runs them.

## Out-of-scope finding (not fixed): `finance-summary.service.spec.ts`

Running the full `Nemis/apps/Server` suite (requested by this task's brief
so any Task 8 fee-payment regression would surface) turned up one failure
that is **unrelated to this plan and not fixed here**:

`src/fees/finance-summary.service.spec.ts` →
`FinanceSummaryService.getMonthlyCollectionTrend` expects the most recent
of 6 monthly buckets to hold the mocked payment total, but gets 0 (the
payment lands one bucket early instead).

Root cause (by inspection, not by writing a fix): in
`src/fees/finance-summary.service.ts`, `getMonthlyCollectionTrend()` calls
`start.setMonth(start.getMonth() - (monthsBack - 1))` **before**
`start.setDate(1)`. When the current day-of-month doesn't exist in the
target month (e.g. running on the 29th-31st and subtracting months lands on
February, especially in a non-leap year), JS `Date.setMonth` rolls over
into the following month, shifting the entire 6-month bucket window by one
month relative to "now". This is a date-arithmetic ordering bug
(`setDate(1)` needs to run *before* `setMonth`, not after) that is
date-dependent — it doesn't fail every day, only when the window's start
date lands on a truncated day-of-month.

This is judged out of scope for this task because:

- It lives in `finance-summary.service.ts`, which Task 8's commits
  (`d4427c8d..e77e4318` in `Nemis`) never touched — Task 8 only modified
  `desktop-provisioning.service.ts`/spec and the Prisma schema/migration for
  the `feePayment`/`studentGuardian` delta-filter fix.
- It is unrelated to the desktop offline-sync engine entirely — it powers a
  web-portal finance dashboard trend chart, not any code path this plan
  touched.
- Per this task's own instructions, only genuine *new regressions* introduced
  by this plan are in scope to fix; this is a pre-existing, unrelated,
  latent bug that happens to be date-triggered.

Recommend tracking and fixing it separately (swap the `setMonth`/`setDate`
call order), outside the sync-engine-hardening plan.
