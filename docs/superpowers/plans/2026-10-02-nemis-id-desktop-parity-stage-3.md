# NEMIS ID Desktop Parity — Stage 3 (Lookup-First Wizard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop's always-create "Add Student" wizard with portal-web's lookup-first flow — find a child nationally, then claim, request release, or create — where every created student is enrolled in a class and term in one transaction, and an offline device can only add first-time students.

**Architecture:** A new `createAndEnrollStudent` application use case writes guardians, student (with `assertedNoNemisId`) and enrolment in one SQLite transaction; a new sync-queue sequence column guarantees the outbox pushes them in write order. A new `student:create-and-enroll` channel carries it to the renderer. The wizard UI moves into `components/students/add-student/` (pure branch logic, a shared class/term picker with loading guards, Find/Claim/Request/Create steps) and uses Stage 2's `registryBridge`. The server's desktop-sync applier audits each newly created desktop student with the assertion.

**Tech Stack:** Electron + better-sqlite3 + Vitest + React Testing Library (desktop); NestJS + Prisma + Jest (`Nemis/apps/server`, one task).

**Spec:** `docs/superpowers/specs/2026-10-02-nemis-id-desktop-parity-design.md` — §2 (D1), §7 (Stage 3). Stage 2 plan for the online lane it builds on: `docs/superpowers/plans/2026-10-02-nemis-id-desktop-parity-stage-2.md`.

## Global Constraints

- Desktop branch: `nemis-id-desktop-parity-stage-3` (already created from `main` @ `5c9454a`; its first commit is this plan). Server branch (Task 3 only): create `nemis-id-desktop-parity-stage-3` in `Nemis` from `main` (@ `f24d37f5`). Never commit to `main`.
- Wizard step titles, verbatim: `Find Student`, `Student Information`, `Guardian Information`, `Grade & Class`, `Review`.
- Find-step checkbox, verbatim: `This child has no NEMIS ID (first-time enrollee)`.
- Lookup miss copy, verbatim: `No matching student.` — never distinguish wrong ID from wrong birth date.
- Offline Find-step copy, verbatim: `Searching for a transferring student needs a connection. You can still enrol a first-time student.`
- Request waiting state says "the student's current school" — never names it.
- `claimPath` is never sent; the server computes it.
- A `GRADUATED` stamp (or any null `nextGradeLevel`) is never pre-filled and always requires an override reason.
- Every explanatory empty-state renders only when the query's status is `empty` — never while `idle`/`loading`, never on `error`.
- Never promise "the next sync": when a command returns `refreshed: false`, say the change "will appear once this device syncs".
- The user's Electron app is usually running and locks `node_modules/better-sqlite3/build/Release/better_sqlite3.node`. Never kill it. For SQLite tests: rename the locked file aside, `pnpm rebuild:node`, test, then delete the node build and restore the original (2281472 bytes, Jun 18 09:16).
- Desktop: `pnpm vitest run <path>` (repo root), `pnpm typecheck`, `pnpm lint` (6 pre-existing errors in `packages/domain/.../nemis-id.ts` and `scripts/bump-desktop-version.mjs`). Server: from `Nemis/apps/server`, `npx jest <path>`, `npx tsc --noEmit`.
- Known unrelated failures: desktop `renderer/app/page.test.tsx`, `teacher/timetable/timetable.test.tsx`, flaky `010-create-sync-outbox.test.ts`; server `desktop-provisioning.service.spec.ts`.
- `noUncheckedIndexedAccess` is on. Source files are CRLF — keep line endings.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Scope rulings (deviations from spec §7, decided while planning)

- **New Task 1 — sync-queue sequence.** The outbox orders pushes by `createdAt` (millisecond) then a **random** id (`lower(hex(randomblob(16)))`). Writes in one transaction share a millisecond, so `createAndEnrollStudent`'s enrolment could be pushed before its student and conflict on the server. Spec §7.6 requires queue order student/guardian → link → enrolment, which needs a monotonic `seq`. This is also the root cause of the "flaky" `010-create-sync-outbox` test.
- **Migration numbers shift.** Spec says 026 = `assertedNoNemisId`; the queue sequence takes 026 and the assertion 027. Stage 4's transfer-enrichment migration becomes 028 and Stage 5's 029 (spec amended).
- **Queue order is guardian → student → link → enrolment**, not "student → guardian → enrolment" as §7.3 words it: a guardian row has no dependency on the student, the link needs both, the enrolment needs the student. Server applier already accepts guardian-before-link (today's `createGuardian` does exactly that).
- **The applier audit is written inside the per-operation Prisma transaction** (`this.prisma.auditLog.create`), not "after commit": the applier already runs in that transaction, so an aborted operation leaves no audit row — the property the spec's "after commit" wording was protecting. `SyncApplyContext` gains `userEmail` (AuditLog requires it).
- **`requestRelease` returns `lapsesAt`.** Spec §7.2's waiting state names the lapse date; Stage 2's `requestRelease` kept only the id. `RegistryReleaseResult { id; lapsesAt }` replaces `RemoteRecordRef` for that one call (display only — never written locally, per D5).
- **A lookup miss offers "Continue as a new student"** (create branch with `assertedNoNemisId: false`); only the checkbox sets the assertion. This matches portal-web: the assertion records who claimed a child was new, a miss does not.
- **Folded in: Stage 2 follow-up** — the sanitiser's raw invisible bidi/C1 characters become `\u` escapes (Task 8).

## Review Focus

1. **The admin's device goes offline between lookup and claim** — the claim must surface "You're offline…" and keep the form filled, not lose the entered class/term or crash (Task 7 test "offline claim keeps the form").
2. **The current academic year has no classes for the chosen grade** — the picker must show "No classes for this grade — create one first" only after classes have loaded as empty, never while loading or after an error (Task 6 tests "empty-state only when empty").
3. **The device has no current academic year** — the picker must say so and block Next, not render empty selects that submit `academicYearId: ''` (Task 6 test "no current year").
4. **A rate-limited lookup** (403 "Too many lookups…" → `RATE_LIMITED`) — the Find step shows the server's message and stays on Find, never treating it as a miss (Task 7 test "rate limited is not a miss").
5. **A class/term/year combination that the use case rejects** (e.g. class not in the current year, inactive class, grade mismatch) — `createAndEnrollStudent` must write nothing at all, not a student without an enrolment (Task 4 e2e test "rolls back everything").

---

### Task 1: Sync queue sequence — push in write order

**Files:**
- Create: `apps/desktop/electron/database/migrations/026-add-sync-queue-sequence.ts`
- Create: `apps/desktop/electron/database/migrations/026-add-sync-queue-sequence.test.ts`
- Modify: `apps/desktop/electron/database/migrations/010-create-sync-outbox.ts` (`installOutboxTriggers`)
- Modify: `apps/desktop/electron/database/migrations/registry.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts` (`nextBatch`, `claimBatch` ordering; `SYNC_QUEUE_COLUMNS` if the orderBy helper whitelists columns)

**Interfaces:**
- Produces: `sync_queue.seq INTEGER` (monotonic per insert, indexed); `installOutboxTriggers` stamps `seq` whenever the column exists; the queue claims in `seq` order.

- [ ] **Step 1: Write the failing migration test**

`026-add-sync-queue-sequence.test.ts`:

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

function migrated() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(db);
  db.prepare(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`).run();
  return db;
}

function insertStudent(db: Database.Database, id: string) {
  db.prepare(
    `INSERT INTO students (id, institutionId, firstName, lastName, nemisId, dateOfBirth, gender, isActive, version, updatedAt)
     VALUES (?,?,?,?,?,?,?,1,1,?)`,
  ).run(id, 'school-1', 'Musu', 'Kollie', null, '2012-04-01', 'FEMALE', '2026-01-01T00:00:00.000Z');
}

describe('026-add-sync-queue-sequence', () => {
  it('stamps a strictly increasing seq in write order, even inside one transaction', () => {
    const db = migrated();
    db.transaction(() => {
      for (let i = 0; i < 25; i++) insertStudent(db, `s${i}`);
    })();
    const rows = db.prepare(`SELECT entityId, seq FROM sync_queue ORDER BY seq`).all() as { entityId: string; seq: number }[];
    expect(rows.map((r) => r.entityId)).toEqual(Array.from({ length: 25 }, (_, i) => `s${i}`));
    expect(new Set(rows.map((r) => r.seq)).size).toBe(25);
    db.close();
  });

  it('stamps seq for every table that has outbox triggers', () => {
    const db = migrated();
    const tables = (db.prepare(
      `SELECT DISTINCT tbl_name AS t FROM sqlite_master WHERE type='trigger' AND name LIKE 'outbox_%'`,
    ).all() as { t: string }[]).map((r) => r.t);
    expect(tables.length).toBeGreaterThan(10);
    for (const table of tables) {
      const sql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='trigger' AND name = ?`)
        .get(`outbox_${table}_insert`) as { sql: string } | undefined)?.sql ?? '';
      expect(sql, table).toContain('seq');
    }
    db.close();
  });

  it('backfills existing rows in their original (createdAt, rowid) order', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    const before = migrations.filter((m) => m.version < 26);
    for (const m of before) m.up(db);
    db.prepare(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`).run();
    insertStudent(db, 'a');
    insertStudent(db, 'b');
    for (const m of migrations.filter((m) => m.version >= 26)) m.up(db);
    const rows = db.prepare(`SELECT entityId FROM sync_queue ORDER BY seq`).all() as { entityId: string }[];
    expect(rows.map((r) => r.entityId)).toEqual(['a', 'b']);
    db.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/database/migrations/026-add-sync-queue-sequence.test.ts`
Expected: FAIL — `no such column: seq`.

- [ ] **Step 3: Teach `installOutboxTriggers` to stamp `seq`**

In `010-create-sync-outbox.ts`, inside `installOutboxTriggers`, compute once before the table loop:

```ts
  // Migration 026 adds sync_queue.seq. Migrations that ran before it call this
  // installer too, so the column is used only when it exists — every trigger
  // is regenerated by 026 itself.
  const hasSeq = (db.prepare(`PRAGMA table_info("sync_queue")`).all() as { name: string }[])
    .some((column) => column.name === 'seq');
  const seqColumn = hasSeq ? ', seq' : '';
  const seqValue = hasSeq ? `, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_queue)` : '';
```

and change the trigger's INSERT to include them:

```sql
            INSERT INTO sync_queue
              (id, entityType, entityId, operationType, payload, retryCount, status, createdAt, updatedAt${seqColumn})
            VALUES
              (lower(hex(randomblob(16))), '${table}', ${row}.id, '${operation}', ${payload},
               0, 'pending', strftime('%Y-%m-%dT%H:%M:%fZ','now'),
               strftime('%Y-%m-%dT%H:%M:%fZ','now')${seqValue});
```

(Keep the existing `CREATE TRIGGER` naming and `WHEN captureEnabled` guard unchanged.)

- [ ] **Step 4: Write migration 026**

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/**
 * The outbox ordered pushes by createdAt (millisecond) then a RANDOM id, so
 * rows written in one transaction — a student, its guardian link and its
 * enrolment — could be pushed in any order and the server would reject the
 * enrolment for a student it had not seen yet. `seq` is a monotonic insert
 * counter: MAX(seq)+1 inside the trigger is safe because SQLite serialises
 * writers. Existing rows are numbered in their (createdAt, rowid) order, which
 * is the best order information they carry. Every outbox trigger is
 * regenerated so all tables stamp it (NEMIS ID desktop parity, Stage 3 plan,
 * Task 1).
 */
export const addSyncQueueSequence: Migration = {
  version: 26,
  name: 'add-sync-queue-sequence',
  up(db: SqliteDatabase): void {
    db.exec(`ALTER TABLE sync_queue ADD COLUMN seq INTEGER;`);
    const rows = db.prepare(`SELECT rowid AS r FROM sync_queue ORDER BY createdAt, rowid`).all() as { r: number }[];
    const stamp = db.prepare(`UPDATE sync_queue SET seq = ? WHERE rowid = ?`);
    rows.forEach((row, index) => stamp.run(index + 1, row.r));
    db.exec(`CREATE INDEX idx_sync_queue_seq ON sync_queue (seq);`);

    const tables = (db.prepare(
      `SELECT DISTINCT tbl_name AS t FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'outbox\\_%' ESCAPE '\\'`,
    ).all() as { t: string }[]).map((row) => row.t);
    for (const table of tables) {
      db.exec(`
        DROP TRIGGER IF EXISTS outbox_${table}_insert;
        DROP TRIGGER IF EXISTS outbox_${table}_update;
        DROP TRIGGER IF EXISTS outbox_${table}_delete;
      `);
    }
    installOutboxTriggers(db, tables);
  },
};
```

Register it in `registry.ts` after `makeStudentTransfersPullOnly`. Before writing, confirm `student_transfers` has no outbox triggers left (migration 025 dropped them) so it is not resurrected — the `sqlite_master` query only finds tables that still have triggers.

- [ ] **Step 5: Claim in `seq` order**

In `SqliteSyncQueueRepository.ts`, change both `orderBy` arrays (in `nextBatch` and the re-read in `claimBatch`) to:

```ts
        orderBy: [
          // Write order (migration 026). createdAt/id only break the tie for
          // a row that somehow has no seq — none should after the backfill.
          { column: 'seq', direction: 'asc' },
          { column: 'createdAt', direction: 'asc' },
          { column: 'id', direction: 'asc' },
        ],
```

Update the "same createdAt,id ordering" comment. If the repository's `selectWhere`/`orderBy` validates columns against `SYNC_QUEUE_COLUMNS`, add `'seq'` there (and to the row mapper only if a type requires it — `SyncQueueItem` need not expose it).

- [ ] **Step 6: Run migrations, queue and sync suites**

Run: `pnpm vitest run apps/desktop/electron/database apps/desktop/electron/data/repositories apps/desktop/electron/sync`
Expected: PASS. Run `010-create-sync-outbox.test.ts` 5 times — if it orders by `createdAt,id` in its own query it may still flake; if so, change that test's query to `ORDER BY seq` and note it (it is the same root cause).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/database/migrations apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts
git commit -m "fix(sync): push outbox rows in write order via a sequence column

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `assertedNoNemisId` on the local student

**Files:**
- Create: `apps/desktop/electron/database/migrations/027-add-student-asserted-no-nemis-id.ts` (+ `.test.ts`)
- Modify: `apps/desktop/electron/database/migrations/registry.ts`
- Modify: `packages/domain/src/students/entities/student.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts` (`COLUMNS`, `StudentRow`, `toStudent`, `save`)
- Modify: `packages/application/src/testing/students/in-memory-student-repository.ts` (only if it copies fields explicitly)
- Test: `packages/domain/src/students/students.test.ts`, `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`

**Interfaces:**
- Produces: `CreateStudentInput.assertedNoNemisId?: boolean`, `ReconstituteStudentInput.assertedNoNemisId?: boolean`, getter `Student.assertedNoNemisId: boolean` (default `false`); column `students.assertedNoNemisId INTEGER NOT NULL DEFAULT 0`, included in the outbox payload.

- [ ] **Step 1: Failing tests**

Domain (`students.test.ts`):

```ts
  it('records the "no NEMIS ID" assertion, defaulting to false', () => {
    const base = {
      id: 's-1', institutionId: 'inst-1', firstName: 'Ada', lastName: 'Toe', nemisId: '482915736045',
      dateOfBirth: '2015-01-01', gender: Gender.FEMALE, occurredAt: '2026-10-02T00:00:00.000Z',
    };
    expect(Student.create(base).assertedNoNemisId).toBe(false);
    expect(Student.create({ ...base, assertedNoNemisId: true }).assertedNoNemisId).toBe(true);
  });
```

Migration (`027-add-student-asserted-no-nemis-id.test.ts`, same `migrated()` helper as 026's test):

```ts
  it('adds assertedNoNemisId defaulting to 0 and carries it in the outbox payload', () => {
    const db = migrated();
    db.prepare(
      `INSERT INTO students (id, institutionId, firstName, lastName, nemisId, dateOfBirth, gender, isActive, version, updatedAt, assertedNoNemisId)
       VALUES ('s1','school-1','Musu','Kollie','482915736045','2012-04-01','FEMALE',1,1,'2026-01-01T00:00:00.000Z',1)`,
    ).run();
    const payload = JSON.parse((db.prepare(`SELECT payload FROM sync_queue WHERE entityId='s1'`).get() as { payload: string }).payload);
    expect(payload.record.assertedNoNemisId).toBe(1);
    db.prepare(
      `INSERT INTO students (id, institutionId, firstName, lastName, nemisId, dateOfBirth, gender, isActive, version, updatedAt)
       VALUES ('s2','school-1','Joe','Wleh',NULL,'2012-04-01','MALE',1,1,'2026-01-01T00:00:00.000Z')`,
    ).run();
    expect(db.prepare(`SELECT assertedNoNemisId FROM students WHERE id='s2'`).get()).toEqual({ assertedNoNemisId: 0 });
    db.close();
  });
```

Repository round-trip (`SqliteStudentRepository.test.ts`):

```ts
  it('round-trips assertedNoNemisId', () => {
    const student = Student.create({
      id: 's-a', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', nemisId: '482915736045',
      dateOfBirth: '2015-01-01', gender: Gender.FEMALE, occurredAt: '2026-07-20T00:00:00.000Z', assertedNoNemisId: true,
    });
    repo.save(student);
    expect(repo.findById('s-a')?.assertedNoNemisId).toBe(true);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run packages/domain/src/students apps/desktop/electron/database/migrations/027-add-student-asserted-no-nemis-id.test.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Domain**

In `student.ts`: add `assertedNoNemisId: boolean;` to `StudentState`; `assertedNoNemisId?: boolean;` to `CreateStudentInput` and `ReconstituteStudentInput`; set `assertedNoNemisId: input.assertedNoNemisId ?? false` in both `create` and `reconstitute`; add:

```ts
  /** The admin asserted this child had no NEMIS ID when enrolling them, so
   * no registry lookup was made. Kept for traceability: if a duplicate
   * national identity is found later, the record says who asserted it. */
  get assertedNoNemisId(): boolean {
    return this.#state.assertedNoNemisId;
  }
```

- [ ] **Step 4: Migration 027**

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/** Carries the "this child has no NEMIS ID" assertion to the server, which
 * audits it on the student's CREATE (NEMIS ID desktop parity spec §7.5).
 * The students outbox triggers bake their column list in at install time, so
 * they are regenerated — same pattern as migration 024. */
export const addStudentAssertedNoNemisId: Migration = {
  version: 27,
  name: 'add-student-asserted-no-nemis-id',
  up(db: SqliteDatabase): void {
    db.exec(`
      DROP TRIGGER IF EXISTS outbox_students_insert;
      DROP TRIGGER IF EXISTS outbox_students_update;
      DROP TRIGGER IF EXISTS outbox_students_delete;
      ALTER TABLE students ADD COLUMN assertedNoNemisId INTEGER NOT NULL DEFAULT 0;
    `);
    installOutboxTriggers(db, ['students']);
  },
};
```

Register after `addSyncQueueSequence`.

- [ ] **Step 5: Repository**

In `SqliteStudentRepository.ts`: add `assertedNoNemisId` to the `COLUMNS` string and `assertedNoNemisId: number;` to `StudentRow`; in `toStudent` pass `assertedNoNemisId: row.assertedNoNemisId === 1`; in `save` add the column to the INSERT column list and VALUES (`student.assertedNoNemisId ? 1 : 0`) and to the `ON CONFLICT … DO UPDATE SET` list. Update the in-memory repository only if it rebuilds students field by field.

The importer (`ProvisioningImporter` students spec) does **not** list the column: pulled rows keep the local default 0, and an upsert of an existing row never touches it.

- [ ] **Step 6: Run, typecheck, commit**

Run: `pnpm vitest run packages/domain packages/application apps/desktop/electron/database apps/desktop/electron/data apps/desktop/electron/provisioning && pnpm typecheck`
Expected: PASS.

```bash
git add packages/domain/src/students apps/desktop/electron/database/migrations apps/desktop/electron/data/repositories/sqlite/business packages/application/src/testing/students
git commit -m "feat(students): record the no-NEMIS-ID assertion on the local student

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server — audit each new desktop-synced student

**Repo:** `C:/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis`.

**Files:**
- Modify: `apps/server/src/desktop-provisioning/desktop-sync-applier.ts` (`SyncApplyContext`; `student()` after the upsert when `remote === null`)
- Modify: `apps/server/src/desktop-provisioning/desktop-provisioning.service.ts` (~line 825: pass `userEmail`)
- Test: `apps/server/src/desktop-provisioning/desktop-sync-applier.spec.ts`

**Interfaces:**
- Produces: `SyncApplyContext.userEmail?: string`; one `AuditLog` row per newly created desktop student: `{ action: CREATE, entityType: "Student", entityId: <student id>, metadata: { assertedNoNemisId: boolean, source: "desktop-sync" } }`.

- [ ] **Step 1: Branch**

```bash
cd "C:/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis" && git switch -c nemis-id-desktop-parity-stage-3
```

- [ ] **Step 2: Failing tests**

In `desktop-sync-applier.spec.ts`, in the student-create area (follow how existing student-create tests build a `student` mock with `findUnique`/`upsert` and stub `createStudentLogin`'s dependencies — copy the closest existing "creates a student" test's setup), add:

```ts
  describe("student create audit", () => {
    it("audits a newly created desktop student with the no-NEMIS-ID assertion", async () => {
      const auditLog = { create: jest.fn().mockResolvedValue({}) };
      const { prisma } = newStudentPrisma({ auditLog }); // helper from the closest existing create test
      await new DesktopSyncApplier(prisma, { ...adminContextWithPassword, userEmail: "admin@school.lr" }).apply(
        operation("students", "create", { record: { ...studentRecord(), assertedNoNemisId: 1 } }),
      );
      expect(auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: "admin-1",
          userEmail: "admin@school.lr",
          action: "CREATE",
          entityType: "Student",
          entityId: "entity-1",
          metadata: { assertedNoNemisId: true, source: "desktop-sync" },
        },
      });
    });

    it("records assertedNoNemisId false when the field is absent (older desktop)", async () => {
      const auditLog = { create: jest.fn().mockResolvedValue({}) };
      const { prisma } = newStudentPrisma({ auditLog });
      await new DesktopSyncApplier(prisma, adminContextWithPassword).apply(
        operation("students", "create", { record: studentRecord() }),
      );
      expect(auditLog.create.mock.calls[0][0].data).toMatchObject({
        userEmail: "",
        metadata: { assertedNoNemisId: false, source: "desktop-sync" },
      });
    });

    it("does not audit an update of an existing student", async () => {
      const auditLog = { create: jest.fn() };
      // existing remote row: reuse the setup of the existing "update" student test
      const { prisma } = existingStudentPrisma({ auditLog });
      await new DesktopSyncApplier(prisma, adminContextWithPassword).apply(
        operation("students", "update", { base: { updatedAt: "2026-01-01T00:00:00.000Z" }, record: studentRecord() }),
      );
      expect(auditLog.create).not.toHaveBeenCalled();
    });
  });
```

`newStudentPrisma` / `existingStudentPrisma` are small local helpers you write at the bottom of the spec by extracting the mock setup the nearest existing create/update student tests use (`student.findUnique`, `student.upsert`, and whatever `createStudentLogin` touches — `user`, `userOrganization`, etc.). If extraction would touch existing tests, inline the setup in the new tests instead.

- [ ] **Step 3: Run to verify they fail**

Run: `cd apps/server && npx jest src/desktop-provisioning/desktop-sync-applier.spec.ts -t "student create audit"`
Expected: FAIL — `auditLog.create` not called.

- [ ] **Step 4: Implement**

`SyncApplyContext`: add

```ts
  /** For audit rows the applier writes itself (AuditLog.userEmail is
   * required). Absent in older test contexts; "" mirrors how UserContext maps
   * an email-less user. */
  userEmail?: string;
```

In `student()`, directly after the `upsert`, inside the existing `if (remote === null) {` block and **before** `createStudentLogin` (so the audit is written regardless of the login outcome but still inside this operation's transaction):

```ts
      // NEMIS ID desktop parity §7.5: every student a desktop creates is
      // audited, carrying the admin's "no NEMIS ID" assertion when they made
      // one, so a duplicate national identity found later is traceable. The
      // applier runs inside the per-operation transaction, so a rolled-back
      // operation leaves no audit row behind.
      await this.prisma.auditLog.create({
        data: {
          userId: this.context.userId,
          userEmail: this.context.userEmail ?? "",
          action: AuditAction.CREATE,
          entityType: "Student",
          entityId: operation.entityId,
          metadata: {
            assertedNoNemisId: bool(record.assertedNoNemisId, false),
            source: "desktop-sync",
          },
        },
      });
```

Import `AuditAction` from `@prisma/client` (check how other server files import it). `bool` is the applier's existing helper (used for `isActive`); confirm it treats `1`/`true` as true and absent as the default.

In `desktop-provisioning.service.ts` where the applier is constructed, add `userEmail: user.email ?? ""` to the context literal.

- [ ] **Step 5: Run, typecheck, commit**

Run: `npx jest src/desktop-provisioning && npx tsc --noEmit`
Expected: PASS except the known `desktop-provisioning.service.spec.ts` failure.

```bash
git add apps/server/src/desktop-provisioning
git commit -m "feat(desktop-sync): audit desktop-created students with the no-NEMIS-ID assertion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `createAndEnrollStudent` — one transaction

**Files:**
- Create: `packages/application/src/use-cases/academics/enrollment-target.ts`
- Modify: `packages/application/src/use-cases/academics/enroll-student.ts` (use the shared validator)
- Create: `packages/application/src/use-cases/students/create-and-enroll-student.ts`
- Create: `packages/application/src/use-cases/students/create-and-enroll-student.test.ts`
- Modify: `packages/application/src/dto/students/student-dto.ts` (new DTO)
- Modify: `packages/application/src/services/student-application-service.ts` (new method + dep)
- Modify: `packages/application/src/factories/create-application-layer.ts` (wire it)
- Modify: `packages/application/src/use-cases/students/create-student.ts` (extract the NEMIS-ID mint loop into a shared function)
- Test: `apps/desktop/electron/data/adapters/business-e2e.test.ts`

**Interfaces:**
- Consumes: Task 2's `Student.create({ …, assertedNoNemisId })`; Task 1's `seq`.
- Produces:

```ts
// student-dto.ts
export interface CreateAndEnrollGuardianDto {
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email?: string;
  isPrimary: boolean;
}
export interface CreateAndEnrollStudentDto {
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel: GradeLevel;
  phoneNumber?: string;
  email?: string;
  address?: string;
  academicYearId: string;
  termId: string;
  classId: string;
  enrollmentDate?: string;
  assertedNoNemisId: boolean;
  guardians: CreateAndEnrollGuardianDto[];
  actorId?: string;
}
```

  - `StudentApplicationService.createAndEnroll(dto: CreateAndEnrollStudentDto): Promise<ApplicationResponse<StudentOutput>>`
  - `assertEnrollmentTarget(deps, target: { classId; academicYearId; termId; gradeLevel?: GradeLevel }): void` in `enrollment-target.ts` — throws `WorkflowException` with the existing messages; additionally, when `gradeLevel` is given, `'The selected class is for a different grade.'`.
  - `mintUniqueNemisId(students: IStudentRepository): string` exported from `create-student.ts`.

- [ ] **Step 1: Failing unit tests**

`create-and-enroll-student.test.ts` — build with the in-memory repositories used by `enroll-student.test.ts` and `create-guardian.test.ts` (copy their setup for academic years/terms/classes; seed a current ACTIVE year `y1`, term `t1` in `y1`, active class `c1` in `y1` with `gradeLevel: GRADE_7`). Use a `RecordingUnitOfWork` that counts `run` calls and records whether repository writes happened inside one (if `PassthroughUnitOfWork` exposes `runCount`, use it):

```ts
const valid = {
  institutionId: 'inst-1', firstName: 'Ada', lastName: 'Toe', dateOfBirth: '2015-01-01',
  gender: Gender.FEMALE, gradeLevel: GradeLevel.GRADE_7,
  academicYearId: 'y1', termId: 't1', classId: 'c1', assertedNoNemisId: true,
  guardians: [{ firstName: 'Mary', lastName: 'Toe', relationship: 'Mother', phoneNumber: '0770000000', isPrimary: true }],
};

it('creates student, guardian link and enrolment in ONE unit of work', async () => {
  const { useCase, uow, students, guardians, enrollments } = build();
  const res = await useCase.execute(valid);
  expect(uow.runCount).toBe(1);
  const student = students.store.get(res.data.id)!;
  expect(student.assertedNoNemisId).toBe(true);
  expect(student.guardians).toHaveLength(1);
  expect(guardians.store.size).toBe(1);
  expect([...enrollments.store.values()]).toMatchObject([{ studentId: res.data.id, classId: 'c1', termId: 't1', academicYearId: 'y1' }]);
  expect(res.data.nemisId).toMatch(/^\d{12}$/);
});

it('rejects a class of a different grade before writing anything', async () => {
  const { useCase, uow, students } = build();
  await expect(useCase.execute({ ...valid, gradeLevel: GradeLevel.GRADE_8 })).rejects.toThrow('The selected class is for a different grade.');
  expect(uow.runCount).toBe(0);
  expect(students.store.size).toBe(0);
});

it('requires class, term, year and grade', async () => {
  const { useCase } = build();
  await expect(useCase.execute({ ...valid, classId: '' })).rejects.toThrow();
  await expect(useCase.execute({ ...valid, termId: '' })).rejects.toThrow();
});

it('skips guardian drafts with no name or phone', async () => {
  const { useCase, guardians } = build();
  await useCase.execute({ ...valid, guardians: [{ firstName: '', lastName: '', relationship: '', phoneNumber: '', isPrimary: false }] });
  expect(guardians.store.size).toBe(0);
});
```

(`invokeUseCase` may wrap thrown errors into an `ApplicationResponse` failure rather than rejecting — check `enroll-student.test.ts` for how a `WorkflowException` surfaces and assert the same way.)

E2E in `business-e2e.test.ts` (real SQLite, captureEnabled = 1 by default):

```ts
  it('createAndEnroll writes everything in one transaction and queues it in dependency order', async () => {
    seedInstitution();
    const app = createApplicationComposition(dataLayer, 'test-user', silent);
    const year = await app.academics.createAcademicYear({ code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31', makeCurrent: true });
    const term = await app.academics.createTerm({ academicYearId: year.data.id, name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-19', makeCurrent: true });
    const klass = await app.academics.createClass({ academicYearId: year.data.id, name: 'JSS1-A', gradeLevel: GradeLevel.GRADE_7, capacity: 40 });
    // If enrolment requires an ACTIVE year and createAcademicYear does not default to it,
    // call app.academics.setAcademicYearStatus({ academicYearId: year.data.id, status: 'ACTIVE' }) here.
    manager.connection.prepare(`DELETE FROM sync_queue`).run();

    const res = await app.students.createAndEnroll({
      institutionId: 'inst-1', firstName: 'Ada', lastName: 'Toe', dateOfBirth: '2015-01-01',
      gender: Gender.FEMALE, gradeLevel: GradeLevel.GRADE_7,
      academicYearId: year.data.id, termId: term.data.id, classId: klass.data.id,
      assertedNoNemisId: true,
      guardians: [{ firstName: 'Mary', lastName: 'Toe', relationship: 'Mother', phoneNumber: '0770000000', isPrimary: true }],
    });

    const queued = manager.connection
      .prepare(`SELECT entityType, entityId, operationType FROM sync_queue ORDER BY seq`)
      .all() as { entityType: string; entityId: string; operationType: string }[];
    const order = queued.map((row) => row.entityType);
    expect(order.indexOf('students')).toBeLessThan(order.indexOf('student_guardians'));
    expect(order.indexOf('guardians')).toBeLessThan(order.indexOf('student_guardians'));
    expect(order.indexOf('students')).toBeLessThan(order.indexOf('enrollments'));
    const studentPayload = JSON.parse((manager.connection
      .prepare(`SELECT payload FROM sync_queue WHERE entityType='students' AND entityId=? ORDER BY seq LIMIT 1`)
      .get(res.data.id) as { payload: string }).payload);
    expect(studentPayload.record.assertedNoNemisId).toBe(1);
  });

  it('rolls back everything when the enrolment write fails', async () => {
    seedInstitution();
    const app = createApplicationComposition(dataLayer, 'test-user', silent);
    const year = await app.academics.createAcademicYear({ code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31', makeCurrent: true });
    const term = await app.academics.createTerm({ academicYearId: year.data.id, name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-19', makeCurrent: true });
    const klass = await app.academics.createClass({ academicYearId: year.data.id, name: 'JSS1-A', gradeLevel: GradeLevel.GRADE_7, capacity: 40 });
    // Force the last write in the transaction to fail.
    manager.connection.exec(`CREATE TRIGGER fail_enrollment BEFORE INSERT ON enrollments BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
    const res = await app.students.createAndEnroll({
      institutionId: 'inst-1', firstName: 'Ada', lastName: 'Toe', dateOfBirth: '2015-01-01',
      gender: Gender.FEMALE, gradeLevel: GradeLevel.GRADE_7,
      academicYearId: year.data.id, termId: term.data.id, classId: klass.data.id,
      assertedNoNemisId: false,
      guardians: [{ firstName: 'Mary', lastName: 'Toe', relationship: 'Mother', phoneNumber: '0770000000', isPrimary: true }],
    }).catch((error: unknown) => error);
    expect(res).toBeDefined();
    for (const table of ['students', 'guardians', 'student_guardians', 'enrollments']) {
      expect((manager.connection.prepare(`SELECT count(*) c FROM ${table}`).get() as { c: number }).c, table).toBe(0);
    }
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run packages/application/src/use-cases/students/create-and-enroll-student.test.ts apps/desktop/electron/data/adapters/business-e2e.test.ts`
Expected: FAIL — module / method not found.

- [ ] **Step 3: Shared enrolment-target validator**

`enrollment-target.ts`:

```ts
import type { GradeLevel } from '@nemis-desktop/types';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
import { WorkflowException } from '../../exceptions';

export interface EnrollmentTargetDeps {
  classes: IClassRepository;
  academicYears?: IAcademicYearRepository;
  terms?: ITermRepository;
}

/** The class/term/year checks every enrolment path must make — shared by
 * EnrollStudentUseCase and CreateAndEnrollStudentUseCase so they cannot drift.
 * `gradeLevel`, when given, must equal the class's grade: the End-of-Year
 * Outcomes cohort derives a child's grade from their class, so a mismatch
 * would file them under the wrong grade nationally. */
export function assertEnrollmentTarget(
  deps: EnrollmentTargetDeps,
  target: { classId: string; academicYearId: string; termId: string; gradeLevel?: GradeLevel },
): void {
  if (!deps.classes.exists(target.classId)) {
    throw new WorkflowException(`Class ${target.classId} does not exist.`);
  }
  const year = deps.academicYears?.findById(target.academicYearId);
  if (deps.academicYears && (!year || !year.isCurrent || year.status !== 'ACTIVE')) {
    throw new WorkflowException('Enrollment requires the current active academic year.');
  }
  const term = deps.terms?.findById(target.termId);
  if (deps.terms && (!term || !year || term.academicYearId !== year.id)) {
    throw new WorkflowException('The selected term does not belong to the academic year.');
  }
  const clazz = deps.classes.findById(target.classId);
  if (!clazz || !clazz.isActive || (year && clazz.academicYearId !== year.id)) {
    throw new WorkflowException('The selected class is not active in the academic year.');
  }
  if (target.gradeLevel && clazz.gradeLevel !== target.gradeLevel) {
    throw new WorkflowException('The selected class is for a different grade.');
  }
}
```

In `EnrollStudentUseCase.execute`, replace the class-exists / year / term / class-active lines with `assertEnrollmentTarget(this.deps, command);` keeping the student-exists/active checks and the duplicate-period check exactly where they are. `enroll-student.test.ts` must still pass unchanged.

(Read `enroll-student.ts` first: keep the order of checks identical so its existing error-message tests still match. The `clazz.gradeLevel` field name must match the domain class entity — check it.)

- [ ] **Step 4: Shared mint**

In `create-student.ts`, move the mint loop into an exported function and use it:

```ts
/** Minted locally so a school with no connectivity can still enrol. The
 * server is the uniqueness authority and reassigns on the rare national
 * collision, returning the replacement in the sync receipt. */
export function mintUniqueNemisId(students: IStudentRepository): string {
  let nemisId = generateNemisId();
  for (let attempt = 0; students.existsByNemisId(nemisId); attempt++) {
    if (attempt >= 100) throw new WorkflowException('Could not mint a unique NEMIS ID.');
    nemisId = generateNemisId();
  }
  return nemisId;
}
```

- [ ] **Step 5: The use case**

`create-and-enroll-student.ts`:

```ts
import { Enrollment, Guardian, Student, StudentGuardian } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CreateAndEnrollStudentDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IGuardianRepository } from '../../interfaces/students/guardian-repository';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { requireFields } from '../../validators/validate';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { assertEnrollmentTarget } from '../academics/enrollment-target';
import { mintUniqueNemisId } from './create-student';
import type { StudentRegistered } from '../../events/students';

export interface CreateAndEnrollStudentDeps {
  students: IStudentRepository;
  guardians: IGuardianRepository;
  enrollments: IEnrollmentRepository;
  classes: IClassRepository;
  academicYears: IAcademicYearRepository;
  terms: ITermRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

/** Adds a student and enrols them in one SQLite transaction (NEMIS ID desktop
 * parity spec §7.3), so a crash can never leave a student with no enrolment —
 * a child with no enrolment can never be given an end-of-year outcome. Write
 * order is guardians → student (+ links) → enrolment; the outbox's seq column
 * pushes them in that order. */
export class CreateAndEnrollStudentUseCase implements CommandHandler<
  CreateAndEnrollStudentDto,
  ApplicationResponse<StudentOutput>
> {
  constructor(private readonly deps: CreateAndEnrollStudentDeps) {}

  execute(command: CreateAndEnrollStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('CreateAndEnrollStudent', this.deps.logger, async () => {
      requireFields(command, [
        'institutionId', 'firstName', 'lastName', 'dateOfBirth', 'gender',
        'gradeLevel', 'academicYearId', 'termId', 'classId',
      ]);
      assertEnrollmentTarget(this.deps, command);

      const occurredAt = this.deps.clock.now();
      const actor = command.actorId ?? 'local-admin';
      const nemisId = mintUniqueNemisId(this.deps.students);
      const student = Student.create({
        id: this.deps.ids.next(),
        institutionId: command.institutionId,
        firstName: command.firstName,
        middleName: command.middleName,
        lastName: command.lastName,
        nemisId,
        dateOfBirth: command.dateOfBirth,
        gender: command.gender,
        gradeLevel: command.gradeLevel,
        admissionDate: occurredAt.slice(0, 10),
        phoneNumber: command.phoneNumber,
        email: command.email,
        address: command.address,
        assertedNoNemisId: command.assertedNoNemisId,
        occurredAt,
      });

      const guardians = command.guardians
        .filter((g) => g.firstName.trim() && g.lastName.trim() && g.phoneNumber.trim())
        .map((g) => {
          const guardian = Guardian.create({
            id: this.deps.ids.next(),
            firstName: g.firstName,
            lastName: g.lastName,
            relationship: g.relationship,
            phoneNumber: g.phoneNumber,
            email: g.email?.trim() || undefined,
            occurredAt,
          });
          student.addGuardian(
            StudentGuardian.reconstitute({ id: this.deps.ids.next(), guardianId: guardian.id, isPrimary: g.isPrimary }),
            actor,
            occurredAt,
          );
          return guardian;
        });

      const enrollment = Enrollment.create({
        id: this.deps.ids.next(),
        studentId: student.id,
        classId: command.classId,
        academicYearId: command.academicYearId,
        termId: command.termId,
        occurredAt,
        enrollmentDate: command.enrollmentDate,
      });

      this.deps.unitOfWork.run(() => {
        for (const guardian of guardians) this.deps.guardians.save(guardian);
        this.deps.students.save(student);
        this.deps.enrollments.save(enrollment);
      });

      const event: StudentRegistered = {
        name: 'StudentRegistered',
        occurredAt,
        studentId: student.id,
        institutionId: student.institutionId,
        nemisId,
      };
      this.deps.events.publish(event);
      return ok(toStudentOutput(student));
    });
  }
}
```

(Check the import paths of `IGuardianRepository` and `Guardian`/`Enrollment`/`StudentGuardian` against `create-guardian.ts` and `enroll-student.ts`; `addGuardian`'s signature against `create-guardian.ts`.)

Service: add `createAndEnroll?: CommandHandler<CreateAndEnrollStudentDto, ApplicationResponse<StudentOutput>>` to `StudentApplicationServiceDeps` and

```ts
  createAndEnroll(dto: CreateAndEnrollStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    if (!this.deps.createAndEnroll) throw new Error('createAndEnroll use case not configured');
    return this.deps.createAndEnroll.execute(dto);
  }
```

Factory: wire `createAndEnroll: new CreateAndEnrollStudentUseCase({ students: ports.students, guardians: ports.guardians, enrollments: ports.enrollments, classes: ports.classes, academicYears: ports.academicYears, terms: ports.terms, unitOfWork, clock, ids, events, logger })`. Export the DTO types from the package index if DTOs are re-exported there.

- [ ] **Step 6: Run, typecheck, commit**

Run: `pnpm vitest run packages/application apps/desktop/electron/data/adapters && pnpm typecheck`
Expected: PASS. If typecheck fails in `renderer/lib/ipc/school-admin.ts` because `StudentApplicationService` gained a method that the renderer adapter does not implement, add only the line Task 5 Step 6 specifies for it (`createAndEnroll: (dto) => query(() => schoolAdminBridge.createAndEnrollStudent(dto))`) once that bridge method exists — if it does not exist yet, leave the typecheck failure, say so in the report, and Task 5 resolves it.

```bash
git add packages/application apps/desktop/electron/data/adapters/business-e2e.test.ts
git commit -m "feat(students): createAndEnroll writes student, guardians and enrolment in one transaction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: IPC + renderer plumbing — `student:create-and-enroll`, and `lapsesAt` on release requests

**Files:**
- Modify: `packages/types/src/students.ts` (request type), `packages/types/src/ipc.ts` (contract + constant), `packages/types/src/api.ts` (`StudentApi.createAndEnroll`), `packages/types/src/registry.ts` (`RegistryReleaseResult`)
- Modify: `apps/desktop/electron/security/validateIpc.ts` (`assertCreateAndEnrollStudentArgs`)
- Modify: `apps/desktop/electron/ipc/handlers/school-admin/students.ts`, `apps/desktop/electron/ipc/authorizeChannel.ts`
- Modify: `apps/desktop/electron/preload/school-admin/student-api.ts`, `apps/desktop/electron/preload/school-admin/registry-api.ts` (types only)
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts` (`requestRelease` result)
- Modify: `apps/desktop/renderer/services/nemis-bridge/school-admin/student-bridge.ts`, `registry-bridge.ts`
- Modify: `apps/desktop/renderer/lib/ipc/school-admin.ts` (`students.createAndEnroll`)
- Modify: `packages/presentation/src/view-models/students/students-view-model.ts`, `focused-student-view-models.ts`
- Test: `apps/desktop/electron/ipc/handlers/school-admin/students.test.ts`, `apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts`, `packages/presentation/src/view-models/students/students-view-model.test.ts`

**Interfaces:**
- Consumes: Task 4's `CreateAndEnrollStudentDto` / `app.students.createAndEnroll`.
- Produces:
  - `CreateAndEnrollStudentRequest` in `@nemis-desktop/types` — same fields as the DTO minus `actorId`.
  - Channel `IpcChannels.STUDENT_CREATE_AND_ENROLL = 'student:create-and-enroll'` → `{ args: [request: CreateAndEnrollStudentRequest]; result: StudentResult }`, INSTITUTION_ADMIN only.
  - `RegistryReleaseResult { id: string; lapsesAt: string | null }`; `'registry:request'` result becomes `OnlineCommandResult<RegistryReleaseResult>`; `RegistryApi.request` and `registryBridge.requestRelease` return it.
  - `StudentsListViewModel.createAndEnrollStudent(dto: CreateAndEnrollStudentDto): Promise<CommandOutcome<StudentDetailsView>>` (reloads the student list on success, like `createStudent`).

- [ ] **Step 1: Failing tests**

Handler (`students.test.ts`, same `capture` pattern as the existing test):

```ts
  it('validates create-and-enroll and forwards it to the application layer', async () => {
    const calls = new Map<string, Captured>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
      calls.set(channel, { validate, handler: handler as Captured['handler'] });
    }) as IpcHandle;
    const createAndEnroll = vi.fn(async () => ({ data: { id: 'student-1' } }));
    registerStudentHandlers(handle, { students: { createAndEnroll }, academics: {} } as unknown as ApplicationLayer);
    const channel = calls.get('student:create-and-enroll')!;
    const request = {
      institutionId: 'inst-1', firstName: 'Ada', lastName: 'Toe', dateOfBirth: '2015-01-01', gender: 'FEMALE',
      gradeLevel: 'GRADE_7', academicYearId: 'y1', termId: 't1', classId: 'c1', assertedNoNemisId: true,
      guardians: [{ firstName: 'Mary', lastName: 'Toe', relationship: 'Mother', phoneNumber: '0770000000', isPrimary: true }],
    };
    expect(() => channel.validate([request])).not.toThrow();
    expect(() => channel.validate([{ ...request, classId: '' }])).toThrow();
    expect(() => channel.validate([{ ...request, assertedNoNemisId: 'yes' }])).toThrow();
    expect(() => channel.validate([{ ...request, guardians: [{ ...request.guardians[0], extra: 1 }] }])).toThrow();
    expect(() => channel.validate([{ ...request, guardians: Array.from({ length: 11 }, () => request.guardians[0]) }])).toThrow();
    expect(await channel.handler(request)).toEqual({ id: 'student-1' });
    expect(createAndEnroll).toHaveBeenCalledWith(request);
  });
```

Gateway (`BackendProvisioningGateway.test.ts`, inside `describe('online commands')`):

```ts
    it('requestRelease returns the lapse date the server set', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => response({ id: 't-9', status: 'PENDING', lapsesAt: '2026-10-16T09:00:00.000Z' })));
      expect(await buildGateway().requestRelease({
        nemisId: '482915736045', dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7' as never, reason: 'Moving',
      })).toEqual({ id: 't-9', lapsesAt: '2026-10-16T09:00:00.000Z' });
    });
```

Update the existing `requestRelease` expectations in that file / `online-commands.test.ts` / `online-bridges.test.ts` to the new shape where they assert `{ id }` only.

ViewModel (`students-view-model.test.ts`, follow the file's construction of the VM with a fake `students` service):

```ts
  it('createAndEnrollStudent calls the service and reloads the list on success', async () => {
    // build VM as other tests in this file do, with students.createAndEnroll resolving ok(studentOutput)
    // and students.list counting calls
    const outcome = await vm.createAndEnrollStudent(dto);
    expect(outcome.ok).toBe(true);
    expect(createAndEnroll).toHaveBeenCalledWith(dto);
    expect(listCalls).toBeGreaterThan(listCallsBefore);
  });
```

(Write it with the concrete fakes that file already uses for `createStudent`'s test.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run apps/desktop/electron/ipc apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts packages/presentation/src/view-models/students`
Expected: FAIL.

- [ ] **Step 3: Types and contract**

`students.ts` (types package):

```ts
export interface CreateAndEnrollGuardianRequest {
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email?: string;
  isPrimary: boolean;
}

export interface CreateAndEnrollStudentRequest {
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel: GradeLevel;
  phoneNumber?: string;
  email?: string;
  address?: string;
  academicYearId: string;
  termId: string;
  classId: string;
  enrollmentDate?: string;
  assertedNoNemisId: boolean;
  guardians: CreateAndEnrollGuardianRequest[];
}
```

`ipc.ts`: `'student:create-and-enroll': { args: [request: CreateAndEnrollStudentRequest]; result: StudentResult };` and `STUDENT_CREATE_AND_ENROLL: 'student:create-and-enroll',`. Change `'registry:request'`'s result to `OnlineCommandResult<RegistryReleaseResult>`.

`registry.ts`:

```ts
/** A release request's id and the date it lapses (14 days, server-set) —
 * shown in the wizard's waiting state; never written locally (D5). */
export interface RegistryReleaseResult {
  id: string;
  lapsesAt: string | null;
}
```

`api.ts`: `StudentApi.createAndEnroll(request: CreateAndEnrollStudentRequest): Promise<StudentResult>;` and `RegistryApi.request` returns `Promise<OnlineCommandResult<RegistryReleaseResult>>`.

- [ ] **Step 4: Validator, handler, authorisation**

`validateIpc.ts`:

```ts
const MAX_GUARDIANS = 10;

export function assertCreateAndEnrollStudentArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, [
    'institutionId', 'firstName', 'middleName', 'lastName', 'dateOfBirth', 'gender', 'gradeLevel',
    'phoneNumber', 'email', 'address', 'academicYearId', 'termId', 'classId', 'enrollmentDate',
    'assertedNoNemisId', 'guardians',
  ]);
  for (const k of ['institutionId', 'firstName', 'lastName'] as const) assertString(r[k], k, NAME_MAX_LENGTH);
  for (const k of ['academicYearId', 'termId', 'classId'] as const) assertString(r[k], k, ID_MAX_LENGTH);
  assertIsoDate(r.dateOfBirth, 'dateOfBirth');
  assertOptionalIsoDate(r.enrollmentDate, 'enrollmentDate');
  assertEnumMember(r.gender, 'gender', Object.values(Gender));
  assertEnumMember(r.gradeLevel, 'gradeLevel', Object.values(GradeLevel));
  for (const k of ['middleName', 'phoneNumber', 'email', 'address'] as const)
    assertOptionalString(r[k], k, k === 'address' ? 2000 : NAME_MAX_LENGTH);
  assertBoolean(r.assertedNoNemisId, 'assertedNoNemisId');
  if (!Array.isArray(r.guardians) || r.guardians.length > MAX_GUARDIANS) {
    throw new IPCError(`Expected "guardians" to be an array of at most ${MAX_GUARDIANS}.`);
  }
  for (const g of r.guardians) {
    if (!isPlainObject(g)) throw new IPCError('Expected each guardian to be an object.');
    assertKnownKeys(g, ['firstName', 'lastName', 'relationship', 'phoneNumber', 'email', 'isPrimary']);
    for (const k of ['firstName', 'lastName', 'relationship', 'phoneNumber'] as const) {
      if (typeof g[k] !== 'string' || (g[k] as string).length > NAME_MAX_LENGTH) {
        throw new IPCError(`Expected guardian "${k}" to be a string.`);
      }
    }
    assertOptionalString(g.email, 'email', NAME_MAX_LENGTH);
    assertBoolean(g.isPrimary, 'isPrimary');
  }
}
```

(Guardian name/phone may be empty strings — blank drafts are skipped by the use case, matching today's wizard.)

`students.ts` handler:

```ts
  handle(
    IpcChannels.STUDENT_CREATE_AND_ENROLL,
    assertCreateAndEnrollStudentArgs,
    async (r) => (await app.students.createAndEnroll(r)).data,
  );
```

`authorizeChannel.ts`: add `IpcChannels.STUDENT_CREATE_AND_ENROLL` to `SCHOOL_ADMIN_CHANNELS` (mutations).

- [ ] **Step 5: Gateway `requestRelease`**

```ts
  async requestRelease(request: RegistryReleaseRequest): Promise<RegistryReleaseResult> {
    return this.authorized(
      '/student-registry/request',
      { method: 'POST', body: JSON.stringify(request) },
      (value) => {
        const lapsesAt = asRecord(value).lapsesAt;
        return { id: requireId(value), lapsesAt: typeof lapsesAt === 'string' ? lapsesAt : null };
      },
      ONLINE_COMMAND,
    );
  }
```

(Keep whatever opt-in constant the method already passes — read the current method first.) `RegistryGateway` in `handlers/school-admin/registry.ts` is a `Pick` of the gateway, so its type follows.

- [ ] **Step 6: Preload, bridges, renderer adapter, ViewModel**

`student-api.ts`: `createAndEnroll: (request) => invoke(IpcChannels.STUDENT_CREATE_AND_ENROLL, request),`.
`student-bridge.ts`: `createAndEnrollStudent: (request: CreateAndEnrollStudentRequest): Promise<StudentResult> => api().student.createAndEnroll(request),`.
`registry-bridge.ts`: `requestRelease` returns `Promise<OnlineCommandResult<RegistryReleaseResult>>`.
`renderer/lib/ipc/school-admin.ts` students group: `createAndEnroll: (dto) => query(() => schoolAdminBridge.createAndEnrollStudent(dto)),` (the `schoolAdminBridge` spread picks it up from `student-bridge.ts`; the DTO's optional `actorId` is not part of the request — strip it if the types disagree: `({ actorId: _actorId, ...request }) => …`).

`students-view-model.ts`: add a command like `createCommand` (read how `createCommand` is built — mirror it with `this.deps.students.createAndEnroll`) and

```ts
  async createAndEnrollStudent(dto: CreateAndEnrollStudentDto): Promise<CommandOutcome<StudentDetailsView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.createAndEnrollCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) await this.loadStudents();
    return outcome;
  }
```

`focused-student-view-models.ts` (`StudentsListViewModel`): `createAndEnrollStudent = (dto: CreateAndEnrollStudentDto) => this.core.createAndEnrollStudent(dto);`

- [ ] **Step 7: Run, typecheck, lint, commit**

Run: `pnpm vitest run apps/desktop/electron/ipc apps/desktop/electron/security apps/desktop/electron/provisioning packages/presentation apps/desktop/renderer/services && pnpm typecheck && pnpm lint`
Expected: PASS; lint = 6 pre-existing.

```bash
git add packages/types packages/presentation apps/desktop/electron apps/desktop/renderer/services apps/desktop/renderer/lib
git commit -m "feat(ipc): create-and-enroll channel and release-request lapse date

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Wizard building blocks — branch logic and the class/term picker

**Files:**
- Create: `apps/desktop/renderer/components/students/add-student/wizard-logic.ts` (+ `.test.ts`)
- Create: `apps/desktop/renderer/components/students/add-student/ClassTermPicker.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: `RegistryLookupResult`, `RegistryHit` (types); `useAcademicFoundationViewModel()` (`store.academicYears|terms|classes`, `loadAcademicYears()`, `loadTerms(yearId)`, `setClassFilters({ academicYearId, gradeLevel })`, `loadClasses()`).
- Produces:

```ts
// wizard-logic.ts
export type WizardBranch = 'find' | 'claim' | 'request' | 'create';
export function branchForLookup(result: RegistryLookupResult): 'claim' | 'request' | 'miss';
export function claimGradeDefault(hit: RegistryHit): GradeLevel | '';
export function claimNeedsReason(hit: RegistryHit, chosen: GradeLevel | ''): boolean;
export function describeCompletion(hit: RegistryHit): string | null;

// ClassTermPicker.tsx
export interface ClassTermValue { academicYearId: string; classId: string; termId: string }
export function ClassTermPicker(props: {
  gradeLevel: GradeLevel | '';
  value: ClassTermValue;
  onChange: (value: ClassTermValue) => void;
}): JSX.Element;
export function isClassTermComplete(value: ClassTermValue): boolean;
```

- [ ] **Step 1: Failing logic tests**

`wizard-logic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GradeLevel, type RegistryHit } from '@nemis-desktop/types';
import { branchForLookup, claimGradeDefault, claimNeedsReason, describeCompletion } from './wizard-logic';

const hit = (over: Partial<RegistryHit> = {}): RegistryHit => ({
  found: true, nemisId: '482915736045', firstName: 'Musu', lastName: 'Kollie', gender: 'FEMALE' as never,
  lastCompletion: { gradeLevel: GradeLevel.GRADE_6, outcome: 'PROMOTED', nextGradeLevel: GradeLevel.GRADE_7, academicYearName: '2025/2026' },
  claimPath: 'IMMEDIATE', ...over,
});

describe('wizard logic', () => {
  it('routes lookup results to branches', () => {
    expect(branchForLookup({ found: false })).toBe('miss');
    expect(branchForLookup(hit())).toBe('claim');
    expect(branchForLookup(hit({ claimPath: 'REQUIRES_APPROVAL' }))).toBe('request');
  });

  it('pre-fills the stamped next grade, but never a null one', () => {
    expect(claimGradeDefault(hit())).toBe(GradeLevel.GRADE_7);
    expect(claimGradeDefault(hit({ lastCompletion: { gradeLevel: GradeLevel.GRADE_12, outcome: 'GRADUATED', nextGradeLevel: null, academicYearName: '2025/2026' } }))).toBe('');
    expect(claimGradeDefault(hit({ lastCompletion: null }))).toBe('');
  });

  it('requires a reason when the grade differs from the stamp, and always after GRADUATED', () => {
    expect(claimNeedsReason(hit(), GradeLevel.GRADE_7)).toBe(false);
    expect(claimNeedsReason(hit(), GradeLevel.GRADE_8)).toBe(true);
    const graduated = hit({ lastCompletion: { gradeLevel: GradeLevel.GRADE_12, outcome: 'GRADUATED', nextGradeLevel: null, academicYearName: '2025/2026' } });
    expect(claimNeedsReason(graduated, GradeLevel.GRADE_12)).toBe(true);
    expect(claimNeedsReason(graduated, '')).toBe(true);
  });

  it('describes the last completion for the admin', () => {
    expect(describeCompletion(hit())).toBe('Grade 6 — Promoted to Grade 7 (2025/2026)');
    expect(describeCompletion(hit({ lastCompletion: null }))).toBeNull();
  });
});
```

- [ ] **Step 2: Implement the logic**

`wizard-logic.ts`:

```ts
import type { GradeLevel, RegistryHit, RegistryLookupResult } from '@nemis-desktop/types';
import { human } from '../shared';

export type WizardBranch = 'find' | 'claim' | 'request' | 'create';

/** A miss is one outcome — the screen must not tell a wrong ID from a wrong
 * birth date. The server computes claimPath; the client only reads it. */
export function branchForLookup(result: RegistryLookupResult): 'claim' | 'request' | 'miss' {
  if (!result.found) return 'miss';
  return result.claimPath === 'IMMEDIATE' ? 'claim' : 'request';
}

/** The stamp's next grade, or '' when there is none (GRADUATED, or no stamp):
 * an empty field must never be presented as a suggestion. */
export function claimGradeDefault(hit: RegistryHit): GradeLevel | '' {
  return hit.lastCompletion?.nextGradeLevel ?? '';
}

/** The server requires an override reason whenever the claimed grade differs
 * from the stamp's next grade — always, when that is null. */
export function claimNeedsReason(hit: RegistryHit, chosen: GradeLevel | ''): boolean {
  const next = hit.lastCompletion?.nextGradeLevel ?? null;
  return next === null || chosen !== next;
}

const OUTCOME: Record<'PROMOTED' | 'RETAINED' | 'GRADUATED', string> = {
  PROMOTED: 'Promoted', RETAINED: 'Retained', GRADUATED: 'Graduated',
};

export function describeCompletion(hit: RegistryHit): string | null {
  const c = hit.lastCompletion;
  if (!c) return null;
  const next = c.nextGradeLevel ? ` to ${human(c.nextGradeLevel)}` : '';
  return `${human(c.gradeLevel)} — ${OUTCOME[c.outcome]}${next} (${c.academicYearName})`;
}
```

(`human('GRADE_6')` yields `Grade 6` — check `shared.tsx`; adjust the test string if it yields `GRADE 6`.)

- [ ] **Step 3: Failing picker tests**

`ClassTermPicker.test.tsx` — render the picker inside a `PresentationProvider` with a stubbed `window.nemis` (follow `StudentFormPage.test.tsx`'s setup: `createRendererPresentation()`, `layer.bootstrap.run()`). The foundation VM reaches: `window.nemis.academicYear.list()` → `AcademicYearListItemResult[]`, `window.nemis.term.list(academicYearId)` → `TermResult[]`, `window.nemis.classes.list(request)` → `{ items: ClassResult[]; total: number }`. Keep the existing `school.getSummary`, `academicYear.getCurrent`, `term.getCurrent` stubs the bootstrap needs. Connectivity is set with `layer.stores.connectivity.setOnline(false)` (check the exact path on the layer object).

```tsx
it('lists only the current year classes of the chosen grade, then terms', async () => {
  // academicYear.list → [{ id:'y1', code:'2025/2026', isCurrent:true, status:'ACTIVE', ... }]
  // classes.list → assert it is called with academicYearId 'y1' and gradeLevel 'GRADE_7'; return [{ id:'c1', name:'JSS1-A', gradeLevel:'GRADE_7', isActive:true, ... }]
  // term.list('y1') → [{ id:'t1', name:'Term 1', ... }]
  // expect option 'JSS1-A' and 'Term 1' to appear; selecting them calls onChange with { academicYearId:'y1', classId:'c1', termId:'t1' }
});

it('empty-state only when empty: no hint while loading, a hint once classes load empty', async () => {
  // classes.list never resolves first → expect no "No classes for this grade" text
  // then a second render where classes.list resolves [] → expect "No classes for this grade — create one first"
});

it('shows a retry, not the empty hint, when loading classes fails', async () => {
  // classes.list rejects → expect "Couldn't load classes" and a "Try again" button; no empty hint
});

it('no current year: says so and reports incomplete', async () => {
  // academicYear.list → [{ id:'y0', isCurrent:false, ... }]
  // expect "There is no current academic year" text; onChange never receives a non-empty academicYearId
});
```

Write each test fully with the stubs above (they are the same shape as the stubs `StudentFormPage.test.tsx` builds); assert texts verbatim from the component below.

- [ ] **Step 4: Implement the picker**

`ClassTermPicker.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import type { GradeLevel } from '@nemis-desktop/types';
import { Button, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { human } from '../shared';

export interface ClassTermValue {
  academicYearId: string;
  classId: string;
  termId: string;
}

export function isClassTermComplete(value: ClassTermValue): boolean {
  return Boolean(value.academicYearId && value.classId && value.termId);
}

/** Class + term for the CURRENT academic year, with classes filtered to the
 * chosen grade so a grade/class mismatch cannot be picked. Explanatory hints
 * render only once a list has loaded empty — never while loading, never after
 * an error (the defect that bit portal-web's B.2 twice: an "add one first"
 * hint after a transient failure makes the admin create duplicates). */
export function ClassTermPicker({
  gradeLevel,
  value,
  onChange,
}: {
  gradeLevel: GradeLevel | '';
  value: ClassTermValue;
  onChange: (value: ClassTermValue) => void;
}) {
  const foundation = useAcademicFoundationViewModel();
  const years = useViewModel(foundation.store, (s) => s.academicYears);
  const terms = useViewModel(foundation.store, (s) => s.terms);
  const classes = useViewModel(foundation.store, (s) => s.classes);

  useEffect(() => {
    void foundation.loadAcademicYears();
  }, [foundation]);

  const current =
    years.status === 'success' || years.status === 'refreshing'
      ? years.data.find((y) => y.isCurrent)
      : undefined;
  const yearId = current?.id ?? '';

  useEffect(() => {
    if (!yearId) return;
    void foundation.loadTerms(yearId);
  }, [foundation, yearId]);

  useEffect(() => {
    if (!yearId || !gradeLevel) return;
    foundation.setClassFilters({ academicYearId: yearId, gradeLevel });
    void foundation.loadClasses();
  }, [foundation, yearId, gradeLevel]);

  // Keep the reported year in step, and drop a class that no longer fits.
  useEffect(() => {
    if (value.academicYearId !== yearId) onChange({ academicYearId: yearId, classId: '', termId: value.termId });
  }, [yearId, value, onChange]);

  const noCurrentYear =
    (years.status === 'success' || years.status === 'refreshing') && !current;
  if (years.status === 'empty' || noCurrentYear) {
    return (
      <p className="text-sm text-amber-700">
        There is no current academic year on this device. Set one under Academic Years before enrolling.
      </p>
    );
  }
  if (years.status === 'error') {
    return (
      <div className="text-sm text-red-700">
        Couldn&apos;t load the academic year.{' '}
        <Button type="button" variant="secondary" onClick={() => void foundation.loadAcademicYears()}>
          Try again
        </Button>
      </div>
    );
  }

  const classOptions =
    classes.status === 'success' || classes.status === 'refreshing'
      ? classes.data
          .filter((c) => c.isActive && c.gradeLevel === gradeLevel && c.academicYearId === yearId)
          .map((c) => ({ value: c.id, label: c.name }))
      : [];
  const termOptions =
    terms.status === 'success' || terms.status === 'refreshing'
      ? terms.data.map((t) => ({ value: t.id, label: t.name }))
      : [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Academic year: {current?.code ?? '…'}</p>
      {!gradeLevel ? (
        <p className="text-sm text-slate-500">Choose a grade to see its classes.</p>
      ) : classes.status === 'error' ? (
        <div className="text-sm text-red-700">
          Couldn&apos;t load classes.{' '}
          <Button type="button" variant="secondary" onClick={() => void foundation.loadClasses()}>
            Try again
          </Button>
        </div>
      ) : classes.status === 'empty' ||
        ((classes.status === 'success' || classes.status === 'refreshing') && classOptions.length === 0) ? (
        <p className="text-sm text-amber-700">
          No classes for {human(gradeLevel)} — create one first.
        </p>
      ) : (
        <Select
          label="Class"
          required
          placeholder={classes.status === 'success' || classes.status === 'refreshing' ? 'Select class' : 'Loading…'}
          options={classOptions}
          value={value.classId}
          onChange={(e) => onChange({ ...value, academicYearId: yearId, classId: e.target.value })}
        />
      )}
      {terms.status === 'error' ? (
        <div className="text-sm text-red-700">
          Couldn&apos;t load terms.{' '}
          <Button type="button" variant="secondary" onClick={() => void foundation.loadTerms(yearId)}>
            Try again
          </Button>
        </div>
      ) : terms.status === 'empty' ? (
        <p className="text-sm text-amber-700">No terms in this academic year — create one first.</p>
      ) : (
        <Select
          label="Term"
          required
          placeholder={terms.status === 'success' || terms.status === 'refreshing' ? 'Select term' : 'Loading…'}
          options={termOptions}
          value={value.termId}
          onChange={(e) => onChange({ ...value, academicYearId: yearId, termId: e.target.value })}
        />
      )}
    </div>
  );
}
```

Adjust the test's expected strings to: `No classes for Grade 7 — create one first.`, `Couldn't load classes.`, `There is no current academic year on this device. Set one under Academic Years before enrolling.` Check `AcademicYearRowView` has `isCurrent`/`code` (EnrollmentPage uses both) and `Select` accepts `placeholder`. The year-sync effect must not loop: it only calls `onChange` when `value.academicYearId !== yearId`.

- [ ] **Step 5: Run, commit**

Run: `pnpm vitest run apps/desktop/renderer/components/students/add-student && pnpm typecheck && pnpm lint`
Expected: PASS.

```bash
git add apps/desktop/renderer/components/students/add-student
git commit -m "feat(renderer): wizard branch logic and a guarded class/term picker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The lookup-first wizard

**Files:**
- Create: `apps/desktop/renderer/components/students/add-student/FindStudentStep.tsx`
- Create: `apps/desktop/renderer/components/students/add-student/ClaimStudentPanel.tsx`
- Create: `apps/desktop/renderer/components/students/add-student/RequestReleasePanel.tsx`
- Create: `apps/desktop/renderer/components/students/add-student/AddStudentWizard.tsx`
- Create: `apps/desktop/renderer/components/students/add-student/AddStudentWizard.test.tsx`
- Modify: `apps/desktop/renderer/components/students/StudentFormPage.tsx` (create mode renders `<AddStudentWizard />`; move `GuardianStep`/`ReviewStep`/`GuardianDraft` into `add-student/CreateStudentSteps.tsx` — create that file)
- Modify: `apps/desktop/renderer/components/students/StudentFormPage.test.tsx` (the create-wizard test now starts at Find Student)

**Interfaces:**
- Consumes: Task 6 (`branchForLookup`, `claimGradeDefault`, `claimNeedsReason`, `describeCompletion`, `ClassTermPicker`, `isClassTermComplete`); Task 5 (`StudentsListViewModel.createAndEnrollStudent`, `registryBridge.requestRelease` → `{ id, lapsesAt }`); Stage 2 (`registryBridge.lookupStudent`, `registryBridge.claimStudent`, `parseIpcError`); `useConnectivityStore()` (`isOnline`); `useSettingsViewModel()` (`profile` → institution id).
- Produces: `AddStudentWizard` (default create flow).

- [ ] **Step 1: Failing wizard tests**

`AddStudentWizard.test.tsx` — render inside `PresentationProvider` with `createRendererPresentation()` and a stubbed `window.nemis` (as in `StudentFormPage.test.tsx`; add `registry`, `student`, `academicYear`, `term`, `classes` stubs). Mock `next/navigation`'s `useRouter` to capture `push`. Control online state with `layer.stores.connectivity.setOnline(false)` (check the exact path on the layer object).

```tsx
it('offline: search is disabled with the D1 copy; the checkbox still proceeds to Student Information', async () => {
  // isOnline false → expect "Searching for a transferring student needs a connection. You can still enrol a first-time student."
  // NEMIS ID input disabled; tick "This child has no NEMIS ID (first-time enrollee)"; click Continue
  // → heading "Student Information" (level 2)
});

it('a miss shows only "No matching student." and offers to continue as a new student (no assertion)', async () => {
  // registry.lookup → { found:false }; type ID + DOB; Search → "No matching student."
  // click "Continue as a new student" → Student Information; later createAndEnroll called with assertedNoNemisId:false
});

it('rate limited is not a miss: shows the server message and stays on Find', async () => {
  // registry.lookup rejects new Error('[RATE_LIMITED] Too many lookups. Please try again later.')
  // → text "Too many lookups. Please try again later."; no "No matching student."; heading still "Find Student"
});

it('IMMEDIATE hit → claim panel; GRADUATED stamp leaves grade empty and requires a reason', async () => {
  // lookup → hit with lastCompletion GRADUATED/nextGradeLevel null
  // → shows name + "Grade 12 — Graduated (2025/2026)"; grade select value ''; "Reason for the grade" field present;
  // Claim button disabled until grade, reason, class and term are set
});

it('claim success with refresh navigates to the profile; without refresh shows the sync note', async () => {
  // registry.claim → { data:{ studentId:'s9' }, refreshed:true } → router.push('/government/school-admin/students/profile?id=s9')
  // second render: refreshed:false → text "Claimed. The student will appear once this device syncs."
});

it('offline claim keeps the form', async () => {
  // registry.claim rejects new Error("[OFFLINE] You're offline. Connect to the internet to do this.")
  // → that text shown; chosen class/term still selected
});

it('REQUIRES_APPROVAL → request panel; success shows the lapse date without naming the school', async () => {
  // lookup → hit claimPath REQUIRES_APPROVAL; fill class, term, reason; registry.request → { data:{ id:'t1', lapsesAt:'2026-10-16T09:00:00.000Z' }, refreshed:true }
  // → text contains "the student's current school" and "16 Oct 2026" (format with toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }))
});

it('create path requires class and term before Review, then calls createAndEnroll with the assertion', async () => {
  // checkbox path → Student Information (fill) → Guardian → Grade & Class: pick GRADE 7, Next blocked until class+term chosen
  // → Review → "Create student" → student.createAndEnroll called with { ..., gradeLevel:'GRADE_7', classId:'c1', termId:'t1', academicYearId:'y1', assertedNoNemisId:true, guardians:[...] }
});
```

Write each test fully (stubs + `userEvent` interactions + assertions); reuse `textboxNear` from `StudentFormPage.test.tsx` (copy it into this file).

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run apps/desktop/renderer/components/students/add-student/AddStudentWizard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the components**

`FindStudentStep.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { RegistryHit } from '@nemis-desktop/types';
import { Button, Input } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { registryBridge, parseIpcError } from '@/services/nemis-bridge/school-admin/registry-bridge';
import { branchForLookup } from './wizard-logic';

export type FindOutcome =
  | { kind: 'hit'; hit: RegistryHit; dateOfBirth: string }
  | { kind: 'new'; assertedNoNemisId: boolean; dateOfBirth: string };

/** Step 1. Online, a national lookup; offline (spec D1) only the first-time
 * enrollee assertion can proceed. A miss is reported uniformly. */
export function FindStudentStep({ onDone }: { onDone: (outcome: FindOutcome) => void }) {
  const connectivity = useConnectivityStore();
  const isOnline = useViewModel(connectivity.store, (s) => s.isOnline);
  const [nemisId, setNemisId] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [asserted, setAsserted] = useState(false);
  const [searching, setSearching] = useState(false);
  const [missed, setMissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    setMissed(false);
    setError(null);
    try {
      const result = await registryBridge.lookupStudent({ nemisId, dateOfBirth });
      if (branchForLookup(result) === 'miss' || !result.found) setMissed(true);
      else onDone({ kind: 'hit', hit: result, dateOfBirth });
    } catch (cause) {
      const parsed = parseIpcError(cause);
      setError(
        parsed && (parsed.code === 'RATE_LIMITED' || parsed.code === 'REMOTE_REJECTED' || parsed.code === 'OFFLINE')
          ? parsed.message
          : 'The lookup could not be completed. Please try again.',
      );
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Find Student</h2>
      {!isOnline && (
        <p className="text-sm text-amber-700">
          Searching for a transferring student needs a connection. You can still enrol a first-time student.
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <Input
          label="NEMIS ID"
          value={nemisId}
          disabled={!isOnline || asserted}
          onChange={(e) => setNemisId(e.target.value)}
        />
        <Input
          label="Date of birth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={asserted} onChange={(e) => setAsserted(e.target.checked)} />
        This child has no NEMIS ID (first-time enrollee)
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {missed && (
        <div className="text-sm text-slate-700 space-y-2">
          <p>No matching student.</p>
          <Button type="button" variant="secondary" onClick={() => onDone({ kind: 'new', assertedNoNemisId: false, dateOfBirth })}>
            Continue as a new student
          </Button>
        </div>
      )}
      <div className="flex justify-end">
        {asserted ? (
          <Button type="button" onClick={() => onDone({ kind: 'new', assertedNoNemisId: true, dateOfBirth })}>
            Continue
          </Button>
        ) : (
          <Button type="button" disabled={!isOnline || searching || !nemisId.trim() || !dateOfBirth} onClick={() => void search()}>
            {searching ? 'Searching…' : 'Search'}
          </Button>
        )}
      </div>
    </div>
  );
}
```

(The date of birth stays editable in every mode — the create path pre-fills Student Information with it. `useConnectivityStore()` returns `{ store, setOnline, … }`; `useRevalidateOnSync` reads `lastSyncAt` the same way.)

`ClaimStudentPanel.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GradeLevel, RegistryHit } from '@nemis-desktop/types';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { registryBridge, parseIpcError } from '@/services/nemis-bridge/school-admin/registry-bridge';
import { grades, human } from '../shared';
import { ClassTermPicker, isClassTermComplete, type ClassTermValue } from './ClassTermPicker';
import { claimGradeDefault, claimNeedsReason, describeCompletion } from './wizard-logic';

export function ClaimStudentPanel({ hit, dateOfBirth }: { hit: RegistryHit; dateOfBirth: string }) {
  const router = useRouter();
  const [grade, setGrade] = useState<GradeLevel | ''>(claimGradeDefault(hit));
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<ClassTermValue>({ academicYearId: '', classId: '', termId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const needsReason = claimNeedsReason(hit, grade);
  const completion = describeCompletion(hit);
  const ready = Boolean(grade) && isClassTermComplete(target) && (!needsReason || reason.trim().length > 0);

  const claim = async () => {
    if (!grade) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await registryBridge.claimStudent({
        nemisId: hit.nemisId,
        dateOfBirth,
        classId: target.classId,
        termId: target.termId,
        gradeLevel: grade,
        overrideReason: needsReason ? reason.trim() : undefined,
      });
      if (result.refreshed) router.push(`/government/school-admin/students/profile?id=${result.data.studentId}`);
      else setPendingSync(true);
    } catch (cause) {
      setError(parseIpcError(cause)?.message ?? 'The claim could not be completed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingSync) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
        <p className="text-sm text-green-800">Claimed. The student will appear once this device syncs.</p>
        <Button type="button" variant="secondary" onClick={() => router.push('/government/school-admin/students')}>
          Back to students list
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Claim student</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-gray-600">Name</dt><dd className="font-medium">{hit.firstName} {hit.lastName}</dd></div>
        <div><dt className="text-gray-600">Gender</dt><dd className="font-medium">{human(hit.gender)}</dd></div>
        <div className="col-span-2"><dt className="text-gray-600">Last completed</dt><dd className="font-medium">{completion ?? 'No outcome recorded'}</dd></div>
      </dl>
      <Select
        label="Grade"
        required
        placeholder="Select grade"
        options={grades.map((g) => ({ value: g, label: human(g) }))}
        value={grade}
        onChange={(e) => setGrade(e.target.value as GradeLevel)}
      />
      {needsReason && (
        <Input label="Reason for the grade" required value={reason} onChange={(e) => setReason(e.target.value)} />
      )}
      <ClassTermPicker gradeLevel={grade} value={target} onChange={setTarget} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <Button type="button" disabled={!ready || submitting} onClick={() => void claim()}>
          {submitting ? 'Claiming…' : 'Claim student'}
        </Button>
      </div>
    </div>
  );
}
```

`RequestReleasePanel.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { GradeLevel, RegistryHit } from '@nemis-desktop/types';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { registryBridge, parseIpcError } from '@/services/nemis-bridge/school-admin/registry-bridge';
import { grades, human } from '../shared';
import { ClassTermPicker, isClassTermComplete, type ClassTermValue } from './ClassTermPicker';
import { claimGradeDefault } from './wizard-logic';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function RequestReleasePanel({ hit, dateOfBirth }: { hit: RegistryHit; dateOfBirth: string }) {
  const [grade, setGrade] = useState<GradeLevel | ''>(claimGradeDefault(hit));
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<ClassTermValue>({ academicYearId: '', classId: '', termId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lapsesAt, setLapsesAt] = useState<string | null | undefined>(undefined);
  const ready = Boolean(grade) && isClassTermComplete(target) && reason.trim().length > 0;

  const send = async () => {
    if (!grade) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await registryBridge.requestRelease({
        nemisId: hit.nemisId, dateOfBirth, classId: target.classId, termId: target.termId, gradeLevel: grade, reason: reason.trim(),
      });
      setLapsesAt(result.data.lapsesAt);
    } catch (cause) {
      setError(parseIpcError(cause)?.message ?? 'The request could not be sent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (lapsesAt !== undefined) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">Release requested</h2>
        <p className="text-sm text-slate-700">
          We&apos;ve asked the student&apos;s current school to release {hit.firstName} {hit.lastName}.
          {lapsesAt
            ? ` If they don't respond, the request lapses on ${formatDate(lapsesAt)} and you can complete the transfer then.`
            : ' If they don\'t respond within 14 days, you can complete the transfer then.'}
        </p>
        <Link href="/government/school-admin/students/inter-school-transfer">
          <Button type="button" variant="secondary">View transfers</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Request release</h2>
      <p className="text-sm text-slate-600">
        {hit.firstName} {hit.lastName} is still enrolled at another school this year. Their current school must release them.
      </p>
      <Select
        label="Grade"
        required
        placeholder="Select grade"
        options={grades.map((g) => ({ value: g, label: human(g) }))}
        value={grade}
        onChange={(e) => setGrade(e.target.value as GradeLevel)}
      />
      <ClassTermPicker gradeLevel={grade} value={target} onChange={setTarget} />
      <Input label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <Button type="button" disabled={!ready || submitting} onClick={() => void send()}>
          {submitting ? 'Sending…' : 'Send request'}
        </Button>
      </div>
    </div>
  );
}
```

`CreateStudentSteps.tsx`: move `GuardianDraft`, `GuardianStep` and `ReviewStep` out of `StudentFormPage.tsx` unchanged (export them), and extend `ReviewStep` with `className?: string` and `termName?: string` rows shown under Grade.

`AddStudentWizard.tsx` — owns the five-step create flow plus the branch switch. Port the create-mode state and JSX from `StudentFormPage.tsx` (header bar, progress sidebar, step bodies, Back/Next/Cancel) with these changes:

```tsx
const STEPS = [
  { number: 1, title: 'Find Student', description: 'National lookup' },
  { number: 2, title: 'Student Information', description: 'Basic details' },
  { number: 3, title: 'Guardian Information', description: 'Parent/Guardian' },
  { number: 4, title: 'Grade & Class', description: 'Grade, class and term' },
  { number: 5, title: 'Review', description: 'Confirm details' },
] as const;
```

- State: `branch: WizardBranch` (starts `'find'`), `find: FindOutcome | null`, `assertedNoNemisId`, `target: ClassTermValue`, plus the existing student/guardian/grade fields.
- Step 1 renders `<FindStudentStep onDone={…} />`: on `kind:'hit'` set `branch` to `branchForLookup(hit)` (`'claim'` or `'request'`); on `kind:'new'` set `branch='create'`, `assertedNoNemisId`, pre-fill `dob` from `dateOfBirth`, and go to step 2.
- `branch==='claim'` → render `<ClaimStudentPanel hit dateOfBirth />` in the content column (sidebar shows step 1 done); `branch==='request'` → `<RequestReleasePanel … />`. Both have a "Back to search" secondary button that resets to `branch='find'`.
- Step 4 ("Grade & Class"): the existing grade buttons, then `<ClassTermPicker gradeLevel={grade} value={target} onChange={setTarget} />`. Remove the "Class assignment can be done later" copy. `validateStep4`: grade required and `isClassTermComplete(target)`, error text `Choose a grade, class and term.`
- Submit (`Create student` on step 5) calls `listVm.createAndEnrollStudent({ institutionId: profile.data.id, firstName, middleName: middleName || undefined, lastName, dateOfBirth: dob, gender, gradeLevel: grade, phoneNumber: phone || undefined, email: email || undefined, address: address || undefined, academicYearId: target.academicYearId, termId: target.termId, classId: target.classId, assertedNoNemisId, guardians: guardians.map(({ firstName, lastName, relationship, phoneNumber, email, isPrimary }) => ({ firstName, lastName, relationship, phoneNumber, email: email?.trim() || undefined, isPrimary })) })`, then shows the existing success panel (NEMIS ID card + links). The per-guardian `createGuardian` loop is gone.

`StudentFormPage.tsx`: in create mode `return <AddStudentWizard />;` keep edit mode exactly as is; delete the now-unused create-only state, `submitCreate`, `STEPS`, step validators and the moved components. Hook order: `StudentFormPage` must not call hooks conditionally — branch at the top: `export function StudentFormPage({ edit = false }) { return edit ? <EditStudentForm /> : <AddStudentWizard />; }` with the current edit JSX/hooks moved into a local `EditStudentForm` component in the same file.

- [ ] **Step 4: Update the existing page test**

In `StudentFormPage.test.tsx`, the create-wizard test now begins on `Find Student`: tick the checkbox, click `Continue`, then continue with the existing assertions (Student Information → Guardian → `Grade & Class` heading instead of `Grade Level`; Next stays blocked until grade **and** class/term are chosen — stub `academicYear.list`/`term.list`/`classes.list` accordingly, or assert only that Next is blocked after picking a grade with no class).

- [ ] **Step 5: Run, typecheck, lint, commit**

Run: `pnpm vitest run apps/desktop/renderer/components/students && pnpm typecheck && pnpm lint`
Expected: PASS; lint = 6 pre-existing.

```bash
git add apps/desktop/renderer/components/students
git commit -m "feat(renderer): lookup-first add-student wizard (find, claim, request, create)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Stage 2 follow-up — escape the sanitiser's invisible characters

**Files:**
- Modify: `apps/desktop/electron/ipc/errorMapping.ts` (sanitiser regex, ~line 66)
- Modify: `apps/desktop/electron/ipc/errorMapping.test.ts` (C1/bidi test strings, ~lines 42–43)

- [ ] **Step 1: Replace raw characters with escapes**

The regex must read, in source, exactly:

```ts
  // eslint-disable-next-line no-control-regex
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
```

In the test, write every C1/bidi character as a `\u` escape inside the string literal (e.g. `'a\u202eb'`), never as a raw character.

- [ ] **Step 2: Verify no raw bidi/C1 characters remain**

Run: `grep -nP '[\x{0080}-\x{009F}\x{202A}-\x{202E}\x{2066}-\x{2069}]' apps/desktop/electron/ipc/errorMapping.ts apps/desktop/electron/ipc/errorMapping.test.ts`
Expected: no output. Then `pnpm vitest run apps/desktop/electron/ipc/errorMapping.test.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/ipc/errorMapping.ts apps/desktop/electron/ipc/errorMapping.test.ts
git commit -m "chore(ipc): write sanitiser control characters as escapes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Stage gate

- [ ] **Step 1: Desktop** — with the binary set aside and the node build in place: `pnpm vitest run && pnpm typecheck && pnpm lint`. Expected: only the known failures (`010` should now pass consistently — note if it does); lint = 6 pre-existing. Restore the original Electron binary afterwards.
- [ ] **Step 2: Server** — from `Nemis/apps/server`: `npx tsc --noEmit && npx jest`. Expected: only the known `desktop-provisioning.service.spec.ts` failure.
- [ ] **Step 3: Deploy coupling** — Stage 3 desktop builds send `assertedNoNemisId` in student payloads; an older server ignores the unknown field (its applier maps fields explicitly), so the two can deploy in either order. Record both branch heads for the merge decision.
