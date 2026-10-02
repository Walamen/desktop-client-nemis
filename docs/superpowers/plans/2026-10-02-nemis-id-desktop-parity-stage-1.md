# NEMIS ID Desktop Parity — Stage 1 (Transfer Safety) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop desktops from changing transfer status through sync, store the C3 transfer columns locally, and make a child who has left the school disappear from that school's desktop lists and counts.

**Architecture:** The server's desktop sync applier refuses every `student_transfers` operation. The desktop drops the outbox triggers on `student_transfers`, makes the collection read-only, and removes the Approve button. After each pull, an `APPROVED` transfer out of this school re-points the local student's `institutionId` to the receiving school. Student reads are scoped to the workspace's school via a SQL fragment that reads `provisioning_metadata`.

**Tech Stack:** NestJS + Prisma + Jest (`Nemis/apps/server`); Electron + better-sqlite3 + Vitest + React Testing Library (`desktop-client-nemis`).

**Spec:** `desktop-client-nemis/docs/superpowers/specs/2026-10-02-nemis-id-desktop-parity-design.md` — §4 (staging, deploy coupling) and §5 (Stage 1). Read both before starting.

## Global Constraints

- Two repos, one branch name: create `nemis-id-desktop-parity` in `Nemis` (from `main`); `desktop-client-nemis` is already on `nemis-id-desktop-parity`.
- Refusal message, verbatim: `Transfers are managed online — use the Transfers screen while connected.` (em dash, U+2014).
- Transfers page notice, verbatim: `Review transfers on the web portal.`
- A NEMIS ID is national and stored as 12 bare digits; never format it for comparison.
- Desktop tests need the Node build of better-sqlite3: run `pnpm rebuild:node` (repo root) before testing and `pnpm rebuild:electron` after, or the app will not launch.
- Desktop test command (from `desktop-client-nemis` root): `pnpm vitest run <path>`. Server test command (from `Nemis/apps/server`): `npx jest <path>`.
- `noUncheckedIndexedAccess` is on in the desktop repo: indexed reads are `T | undefined`.
- Every desktop write that mirrors server state must run with `sync_runtime.captureEnabled = 0` so it is never queued for push.
- Known unrelated failures — do not chase: `desktop-provisioning.service.spec.ts` (Nemis) and `renderer/app/page.test.tsx` (desktop).

## Review Focus

1. **A child who left and came back inside one sync window** must stay at this school — the pulled student row wins over the transfer row (Task 3 test "returned in the same pull").
2. **A child who left this school twice** (to B, back, then to C) must end up at C, the latest move, not at whichever transfer row happens to sort first (Task 3 test "latest move wins").
3. **A pending or rejected transfer** must never move a child (Task 3 test "only APPROVED moves").
4. **District/county/ministry desktops** (no workspace institution) must keep counting and listing every student, and must not run the departure rule (Task 3 test "no institution", Task 4 test "unscoped workspace").
5. **A full re-provision** (non-merge import) carrying an approved outbound transfer for a student absent from the snapshot must complete without error (Task 3 test "full import").

---

### Task 1: Server — the sync applier refuses every transfer write

**Files:**
- Modify: `Nemis/apps/server/src/desktop-provisioning/desktop-sync-applier.ts` (top of `apply()` ~line 39; role sets lines 49–93; switch case lines 146–147; `studentTransfer()` lines 1192–1242; `existingInScope` case lines 2244–2253)
- Test: `Nemis/apps/server/src/desktop-provisioning/desktop-sync-applier.spec.ts` (replace the test at lines 687–728)

**Interfaces:**
- Produces: exported `const TRANSFERS_ARE_ONLINE_ONLY: string` from `desktop-sync-applier.ts`.

- [ ] **Step 1: Branch**

```bash
cd "C:/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis" && git switch -c nemis-id-desktop-parity
```

- [ ] **Step 2: Replace the DEO-create test with refusal tests**

Delete the test `"lets a DEO create an in-scope transfer but keeps that permission from county users"` (spec lines 687–728) and put this in its place:

```ts
  describe("student transfers are online-only", () => {
    const deoContext = {
      userId: "deo-1",
      role: "DEO",
      scopeType: "DISTRICT",
      institutionIds: new Set(["school-1", "school-2"]),
    };
    const transferRecord = {
      studentId: "student-1",
      fromInstitutionId: "school-1",
      toInstitutionId: "school-2",
      reason: "Family relocation",
      status: "APPROVED",
    };

    it.each([
      ["create", adminContext],
      ["update", adminContext],
      ["delete", adminContext],
      ["create", deoContext],
      ["update", deoContext],
    ] as const)("refuses a %s from a desktop without touching the database", async (type, context) => {
      // An empty client: any Prisma call at all would throw "undefined is not a function".
      const result = await new DesktopSyncApplier({} as PrismaService, context).apply(
        operation("student_transfers", type, {
          base: { updatedAt: "2026-01-01T00:00:00.000Z" },
          record: transferRecord,
        }),
      );
      expect(result).toEqual({
        status: "conflict",
        reason: TRANSFERS_ARE_ONLINE_ONLY,
        remotePayload: null,
      });
    });

    it("uses the exact user-facing message", () => {
      expect(TRANSFERS_ARE_ONLINE_ONLY).toBe(
        "Transfers are managed online — use the Transfers screen while connected.",
      );
    });
  });
```

Update the import on line 1:

```ts
import {
  DesktopSyncApplier,
  EmailAlreadyRegisteredError,
  TRANSFERS_ARE_ONLINE_ONLY,
} from "./desktop-sync-applier";
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd "C:/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/server" && npx jest src/desktop-provisioning/desktop-sync-applier.spec.ts -t "online-only"`
Expected: FAIL — `TRANSFERS_ARE_ONLINE_ONLY` is not exported (TS error / undefined).

- [ ] **Step 4: Implement the refusal**

Below the `SyncApplyDecision` interface, add:

```ts
/** Desktops may no longer write transfers through sync. A transfer decides
 * which school holds a child, so it must go through the student-transfers and
 * student-registry services (student row lock, receiving enrolment, lapse rule,
 * who-may-review). The row upsert this replaced marked a transfer APPROVED
 * without ever moving the student. Desktops call those endpoints directly while
 * online; see the desktop repo's 2026-10-02 NEMIS ID parity spec, §5.1. */
export const TRANSFERS_ARE_ONLINE_ONLY =
  "Transfers are managed online — use the Transfers screen while connected.";
```

At the very top of `apply()`, before the `attendance` branch:

```ts
    if (operation.entityType === "student_transfers") {
      return conflict(TRANSFERS_ARE_ONLINE_ONLY);
    }
```

Then remove the now-dead code:
- `"student_transfers",` from the `INSTITUTION_ADMIN` set.
- The DEO set becomes `new Set(["reports", "alerts"])`.
- The `case "student_transfers": return await this.studentTransfer(operation);` switch arm.
- The whole `private async studentTransfer(...)` method.
- The `case "student_transfers": { ... }` block in `existingInScope` (its `default: return null` covers unknown types, and `apply()` no longer reaches it for transfers).

- [ ] **Step 5: Run the applier spec**

Run: `npx jest src/desktop-provisioning/desktop-sync-applier.spec.ts`
Expected: PASS (all tests, including the six new ones).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (an unused-import error for anything only `studentTransfer()` used means delete that import too).

- [ ] **Step 7: Commit**

```bash
git add src/desktop-provisioning/desktop-sync-applier.ts src/desktop-provisioning/desktop-sync-applier.spec.ts
git commit -m "fix(desktop-sync): refuse transfer writes from desktops

A synced transfer row was upserted directly, so a desktop 'approval'
marked a transfer APPROVED without moving the student, enrolling them,
or honouring initiatedBy/lapsesAt. Transfers now go online-only through
the transfer and registry services.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Desktop — migration 025 stores the C3 transfer columns and stops queuing transfers

**Files:**
- Create: `apps/desktop/electron/database/migrations/025-make-student-transfers-pull-only.ts`
- Create: `apps/desktop/electron/database/migrations/025-make-student-transfers-pull-only.test.ts`
- Modify: `apps/desktop/electron/database/migrations/registry.ts` (import + append to the list after `replaceAdmissionNumberWithNemisId`)
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts:85` (`studentTransfers` spec)
- Test: `apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`

**Interfaces:**
- Produces: local `student_transfers` columns `initiatedBy TEXT NOT NULL DEFAULT 'ORIGIN_SCHOOL'`, `lapsesAt TEXT`, `classId TEXT`, `termId TEXT`; export `makeStudentTransfersPullOnly: Migration` (version 25).

- [ ] **Step 1: Write the failing migration test**

`025-make-student-transfers-pull-only.test.ts`:

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

function migrated() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(db);
  return db;
}

function insertTransfer(db: Database.Database, id: string) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO student_transfers
       (id, studentId, fromInstitutionId, toInstitutionId, requestedBy, reason, status, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(id, 'student-1', 'school-1', 'school-2', 'user-1', 'Relocation', 'PENDING', now, now);
}

describe('025-make-student-transfers-pull-only', () => {
  it('adds the columns the C3 inbox needs', () => {
    const db = migrated();
    const columns = (db.prepare(`PRAGMA table_info("student_transfers")`).all() as { name: string }[])
      .map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining(['initiatedBy', 'lapsesAt', 'classId', 'termId']));
    db.close();
  });

  it('defaults initiatedBy to ORIGIN_SCHOOL, matching the server default', () => {
    const db = migrated();
    insertTransfer(db, 't1');
    expect(db.prepare(`SELECT initiatedBy, lapsesAt FROM student_transfers WHERE id='t1'`).get())
      .toEqual({ initiatedBy: 'ORIGIN_SCHOOL', lapsesAt: null });
    db.close();
  });

  it('never queues a transfer write for push', () => {
    const db = migrated();
    db.prepare(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`).run();
    insertTransfer(db, 't1');
    db.prepare(`UPDATE student_transfers SET status='APPROVED' WHERE id='t1'`).run();
    db.prepare(`DELETE FROM student_transfers WHERE id='t1'`).run();
    expect(
      db.prepare(`SELECT count(*) c FROM sync_queue WHERE entityType = 'student_transfers'`).get(),
    ).toEqual({ c: 0 });
    db.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm rebuild:node && pnpm vitest run apps/desktop/electron/database/migrations/025-make-student-transfers-pull-only.test.ts`
Expected: FAIL — columns missing; a `sync_queue` row is created by the existing triggers.

- [ ] **Step 3: Write the migration**

`025-make-student-transfers-pull-only.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/**
 * Transfers become pull-only (NEMIS ID desktop parity spec, §5.1–5.2). The
 * server's sync applier now refuses every desktop transfer write, because a
 * synced row write bypassed the transfer service entirely: an "approval" marked
 * the row APPROVED without moving the child. Desktops act on transfers through
 * online calls instead, so the generic outbox triggers installed by migration
 * 011 come down — same pattern as migration 019.
 *
 * The four columns are the ones the C3 inbox needs and the snapshot already
 * sends (it ships whole rows). initiatedBy defaults to ORIGIN_SCHOOL, the
 * server's own default, so every pre-existing row reads correctly; the next
 * pull overwrites it with the real value.
 */
export const makeStudentTransfersPullOnly: Migration = {
  version: 25,
  name: 'make-student-transfers-pull-only',
  up(db: SqliteDatabase): void {
    db.exec(`
      DROP TRIGGER IF EXISTS outbox_student_transfers_insert;
      DROP TRIGGER IF EXISTS outbox_student_transfers_update;
      DROP TRIGGER IF EXISTS outbox_student_transfers_delete;

      ALTER TABLE student_transfers ADD COLUMN initiatedBy TEXT NOT NULL DEFAULT 'ORIGIN_SCHOOL';
      ALTER TABLE student_transfers ADD COLUMN lapsesAt TEXT;
      ALTER TABLE student_transfers ADD COLUMN classId TEXT;
      ALTER TABLE student_transfers ADD COLUMN termId TEXT;
    `);
  },
};
```

Register it in `registry.ts`:

```ts
import { makeStudentTransfersPullOnly } from './025-make-student-transfers-pull-only';
```

and append `makeStudentTransfersPullOnly,` after `replaceAdmissionNumberWithNemisId,` in the exported list.

- [ ] **Step 4: Run the migration test**

Run: `pnpm vitest run apps/desktop/electron/database/migrations/025-make-student-transfers-pull-only.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing importer test**

Append inside `describe('ProvisioningImporter', ...)` in `ProvisioningImporter.test.ts`:

```ts
  it('round-trips the C3 transfer columns and imports an older server row without them as defaults', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(
      snapshotOf({
        ...BASE_DATA,
        studentTransfers: [
          transferRow('t1', {
            initiatedBy: 'RECEIVING_SCHOOL',
            lapsesAt: '2026-10-16T00:00:00.000Z',
            classId: 'class-9',
            termId: 'term-9',
          }),
          // A server that predates C3 sends none of the four keys.
          transferRow('t2'),
        ],
      }),
      CONTEXT,
    );
    expect(
      manager.connection
        .prepare(`SELECT id, initiatedBy, lapsesAt, classId, termId FROM student_transfers ORDER BY id`)
        .all(),
    ).toEqual([
      { id: 't1', initiatedBy: 'RECEIVING_SCHOOL', lapsesAt: '2026-10-16T00:00:00.000Z', classId: 'class-9', termId: 'term-9' },
      { id: 't2', initiatedBy: 'ORIGIN_SCHOOL', lapsesAt: null, classId: null, termId: null },
    ]);
  });
```

Add this helper beside `student()` at the bottom of the file:

```ts
function transferRow(id: string, overrides: Partial<ProvisioningRow> = {}): ProvisioningRow {
  return {
    id,
    studentId: 's1',
    fromInstitutionId: 'school-1',
    toInstitutionId: 'school-2',
    requestedBy: 'user-1',
    reason: 'Relocation',
    status: 'PENDING',
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    requestedDate: '2026-09-01T00:00:00.000Z',
    toGradeLevel: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}
```

Note `t2`: the generic upsert writes every spec column, so a missing key becomes `NULL` — which would violate `initiatedBy NOT NULL`. Step 7 handles it.

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/provisioning/ProvisioningImporter.test.ts -t "C3 transfer columns"`
Expected: FAIL — the four columns are not imported (values null for `t1`).

- [ ] **Step 7: Import the columns**

In `ProvisioningImporter.ts`, replace the `studentTransfers` spec (line 85) with:

```ts
  studentTransfers: spec('student_transfers', ['id','studentId','fromInstitutionId','toInstitutionId','requestedBy','reason','status','reviewedBy','reviewedAt','reviewNotes','requestedDate','toGradeLevel','initiatedBy','lapsesAt','classId','termId','createdAt','updatedAt']),
```

and in `sqliteValue`, give `initiatedBy` its server default when absent, so a pre-C3 server's rows still satisfy `NOT NULL`:

```ts
function sqliteValue(value: unknown, column: string): string | number | null {
  // A server that predates C3 sends no initiatedBy; ORIGIN_SCHOOL is its own
  // column default, and every pre-C3 transfer was origin-initiated.
  if (column === 'initiatedBy' && (value === null || value === undefined)) return 'ORIGIN_SCHOOL';
  if (value === null || value === undefined) return null;
```

(`initiatedBy` is a column name only on `student_transfers`; check with `grep -rn "initiatedBy" apps/desktop/electron/database/migrations` — it must appear only in migration 025.)

- [ ] **Step 8: Run the importer suite**

Run: `pnpm vitest run apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`
Expected: PASS (whole file).

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/electron/database/migrations/025-make-student-transfers-pull-only.ts apps/desktop/electron/database/migrations/025-make-student-transfers-pull-only.test.ts apps/desktop/electron/database/migrations/registry.ts apps/desktop/electron/provisioning/ProvisioningImporter.ts apps/desktop/electron/provisioning/ProvisioningImporter.test.ts
git commit -m "feat(transfers): make student_transfers pull-only and store C3 columns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Desktop — departures after each pull

**Files:**
- Create: `apps/desktop/electron/provisioning/applyDepartures.ts`
- Create: `apps/desktop/electron/provisioning/applyDepartures.test.ts`
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts` (call it inside `runImmediate`, right after the `markPulledAssignmentsSynced(...)` line)
- Test: `apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`

**Interfaces:**
- Consumes: Task 2's columns (only `status`, `fromInstitutionId`, `toInstitutionId`, `studentId`, `reviewedAt` are read).
- Produces: `applyDepartures(db: SqliteDatabase, institutionId: string | null | undefined, transfers: readonly ProvisioningRow[], students: readonly ProvisioningRow[]): void`.

- [ ] **Step 1: Write the failing unit tests**

`applyDepartures.test.ts`:

```ts
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProvisioningRow } from '@nemis-desktop/types';
import { migrations } from '@app/database/migrations/registry';
import { applyDepartures } from './applyDepartures';

let db: Database.Database;

function addStudent(id: string, institutionId = 'school-1') {
  db.prepare(
    `INSERT INTO students (id, institutionId, firstName, lastName, nemisId, dateOfBirth, gender, isActive, version, updatedAt)
     VALUES (?,?,?,?,?,?,?,1,1,?)`,
  ).run(id, institutionId, 'Musu', 'Kollie', null, '2012-04-01', 'FEMALE', '2026-01-01T00:00:00.000Z');
}

function institutionOf(id: string) {
  return (db.prepare(`SELECT institutionId FROM students WHERE id=?`).get(id) as { institutionId: string }).institutionId;
}

function transfer(overrides: Partial<ProvisioningRow>): ProvisioningRow {
  return {
    id: 't1', studentId: 's1', fromInstitutionId: 'school-1', toInstitutionId: 'school-2',
    status: 'APPROVED', reviewedAt: '2026-09-10T00:00:00.000Z', ...overrides,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(db);
  addStudent('s1');
});

describe('applyDepartures', () => {
  it('moves a student this school released', () => {
    applyDepartures(db, 'school-1', [transfer({})], []);
    expect(institutionOf('s1')).toBe('school-2');
  });

  it('only APPROVED moves a student', () => {
    applyDepartures(db, 'school-1', [
      transfer({ id: 't1', status: 'PENDING' }),
      transfer({ id: 't2', status: 'REJECTED' }),
      transfer({ id: 't3', status: 'CANCELLED' }),
    ], []);
    expect(institutionOf('s1')).toBe('school-1');
  });

  it('ignores a transfer INTO this school', () => {
    applyDepartures(db, 'school-1', [transfer({ fromInstitutionId: 'school-3', toInstitutionId: 'school-1' })], []);
    expect(institutionOf('s1')).toBe('school-1');
  });

  it('returned in the same pull: the pulled student row wins', () => {
    applyDepartures(db, 'school-1', [transfer({})], [{ id: 's1', institutionId: 'school-1' }]);
    expect(institutionOf('s1')).toBe('school-1');
  });

  it('latest move wins when a child left this school twice', () => {
    applyDepartures(db, 'school-1', [
      // Ids sort opposite to time, so array order cannot be what decides.
      transfer({ id: 'a', toInstitutionId: 'school-3', reviewedAt: '2026-09-20T00:00:00.000Z' }),
      transfer({ id: 'b', toInstitutionId: 'school-2', reviewedAt: '2026-03-01T00:00:00.000Z' }),
    ], []);
    expect(institutionOf('s1')).toBe('school-3');
  });

  it('no institution (district/county/ministry workspace): does nothing', () => {
    applyDepartures(db, null, [transfer({})], []);
    applyDepartures(db, undefined, [transfer({})], []);
    expect(institutionOf('s1')).toBe('school-1');
  });

  it('tolerates a transfer for a student this device never had', () => {
    expect(() => applyDepartures(db, 'school-1', [transfer({ studentId: 'ghost' })], [])).not.toThrow();
  });
});
```

(If `@app` does not resolve in a `provisioning/` test, use the relative import `'../database/migrations/registry'` — `ProvisioningImporter.test.ts` shows which form the folder uses.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/provisioning/applyDepartures.test.ts`
Expected: FAIL — module `./applyDepartures` not found.

- [ ] **Step 3: Implement**

`applyDepartures.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { ProvisioningRow } from '@nemis-desktop/types';

/**
 * A child who leaves this school is never re-sent by the snapshot, which only
 * ships students currently at it — so without this the local row would keep
 * claiming the child forever. Every move between schools (approval, registry
 * claim, completed lapse) leaves an APPROVED transfer whose fromInstitutionId is
 * the school the child left, and those rows ARE pulled. NEMIS ID desktop parity
 * spec §5.3.
 *
 * - The student's own row in the same pull is the current truth (a child who
 *   left and came back inside one sync window), so it wins.
 * - A child may have left this school more than once; the latest reviewedAt
 *   decides, never array order.
 * - The row is re-pointed, not deleted: enrolments, grades and attendance are
 *   history, and the End-of-Year Outcomes cohort needs them.
 * - Must run while sync capture is off (inside the import transaction): this
 *   mirrors server state and must never be pushed.
 * - A workspace with no institution (DEO/county/ministry) holds several schools
 *   legitimately; nothing to do.
 */
export function applyDepartures(
  db: SqliteDatabase,
  institutionId: string | null | undefined,
  transfers: readonly ProvisioningRow[],
  students: readonly ProvisioningRow[],
): void {
  if (!institutionId) return;
  const pulled = new Set(students.map((row) => String(row.id)));
  const latest = new Map<string, ProvisioningRow>();
  for (const row of transfers) {
    if (row.status !== 'APPROVED' || row.fromInstitutionId !== institutionId) continue;
    const studentId = String(row.studentId);
    if (pulled.has(studentId)) continue;
    const current = latest.get(studentId);
    if (!current || String(row.reviewedAt ?? '') > String(current.reviewedAt ?? '')) {
      latest.set(studentId, row);
    }
  }
  const move = db.prepare(
    `UPDATE students SET institutionId = ? WHERE id = ? AND institutionId = ?`,
  );
  for (const [studentId, row] of latest) {
    move.run(String(row.toInstitutionId), studentId, institutionId);
  }
}
```

- [ ] **Step 4: Run the unit tests**

Run: `pnpm vitest run apps/desktop/electron/provisioning/applyDepartures.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing importer integration tests**

Append inside `describe('ProvisioningImporter', ...)`:

```ts
  it('moves a departed student on a delta merge without queuing anything', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(snapshotOf({ ...BASE_DATA, students: [student('s1', 'Ada')] }), CONTEXT);
    importer.import(
      snapshotOf({ studentTransfers: [transferRow('t1', { status: 'APPROVED', reviewedAt: '2026-09-10T00:00:00.000Z' })] }),
      CONTEXT,
      { merge: true, preserveConflicts: true },
    );
    expect(manager.connection.prepare(`SELECT institutionId FROM students WHERE id='s1'`).get())
      .toEqual({ institutionId: 'school-2' });
    expect(manager.connection.prepare(`SELECT count(*) c FROM sync_queue`).get()).toEqual({ c: 0 });
  });

  it('full import: an approved outbound transfer for a student absent from the snapshot does not fail the import', () => {
    const importer = new ProvisioningImporter(manager);
    expect(() =>
      importer.import(
        snapshotOf({ ...BASE_DATA, studentTransfers: [transferRow('t1', { status: 'APPROVED' })] }),
        CONTEXT,
      ),
    ).not.toThrow();
    expect(countRows('students')).toBe(0);
  });
```

- [ ] **Step 6: Run to verify the first fails**

Run: `pnpm vitest run apps/desktop/electron/provisioning/ProvisioningImporter.test.ts -t "departed"`
Expected: FAIL — `institutionId` is still `school-1`.

- [ ] **Step 7: Wire it into the importer**

In `ProvisioningImporter.ts` add `import { applyDepartures } from './applyDepartures';` and, inside `runImmediate`, directly after `markPulledAssignmentsSynced(db, snapshot.data.assignments ?? []);`:

```ts
        applyDepartures(
          db,
          context.institutionId,
          snapshot.data.studentTransfers ?? [],
          snapshot.data.students ?? [],
        );
```

(Capture is already off at this point — `captureEnabled=0` is set before the upsert loop and restored after.)

- [ ] **Step 8: Run the importer suite**

Run: `pnpm vitest run apps/desktop/electron/provisioning`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/electron/provisioning/applyDepartures.ts apps/desktop/electron/provisioning/applyDepartures.test.ts apps/desktop/electron/provisioning/ProvisioningImporter.ts apps/desktop/electron/provisioning/ProvisioningImporter.test.ts
git commit -m "feat(sync): re-point a student who left this school after each pull

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Desktop — scope student reads to the workspace's school

The spec (§5.3) assumed every student read already filtered by school. It does not: `SqliteStudentRepository.countAll`, `countByGradeLevel`, `countByGender`, `countRecentAdmissions`, `findRecentlyUpdated`, `findPage`, and `SchoolAdminModuleService.list` for `students` read the whole table, because until now the table only ever held this school's students. Without this task a departed child keeps appearing in the dashboard and students list.

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/workspaceScope.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts:149-207`
- Modify: `apps/desktop/electron/data/services/SchoolAdminModuleService.ts:351-366` (`list`)
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`
- Test: `apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts`

**Interfaces:**
- Produces: `workspaceStudentScope(alias: string): string` — a SQL boolean expression, no parameters.

- [ ] **Step 1: Write the failing repository tests**

Append inside `describe('SqliteStudentRepository', ...)`:

```ts
  describe('workspace scope', () => {
    function provisionFor(institutionId: string | null) {
      const now = '2026-07-20T00:00:00.000Z';
      test.context.connection
        .prepare(
          `INSERT INTO provisioning_metadata (id, status, institutionId, startedAt, updatedAt)
           VALUES ('singleton', 'complete', ?, ?, ?)`,
        )
        .run(institutionId, now, now);
    }

    beforeEach(() => {
      repo.save(newStudentWith('s-here', '482915736045', { admissionDate: '2026-07-01' }));
      // A child who has left: Task 3 re-points their row to the receiving school.
      repo.save(newStudentWith('s-gone', '123456789015', { admissionDate: '2026-07-01', institutionId: 'inst-2' }));
    });

    it('counts and lists only students at the workspace school', () => {
      provisionFor('inst-1');
      expect(repo.countAll()).toBe(1);
      expect(repo.countByGender()).toEqual([{ gender: Gender.FEMALE, studentCount: 1 }]);
      expect(repo.countRecentAdmissions('2026-01-01')).toBe(1);
      expect(repo.findRecentlyUpdated(10).map((s) => s.id)).toEqual(['s-here']);
      const page = repo.findPage({ limit: 50, offset: 0 });
      expect(page.total).toBe(1);
      expect(page.items.map((s) => s.id)).toEqual(['s-here']);
    });

    it('unscoped workspace (no institution recorded) still sees every student', () => {
      provisionFor(null);
      expect(repo.countAll()).toBe(2);
      expect(repo.findPage({ limit: 50, offset: 0 }).total).toBe(2);
    });

    it('a departed student can still be opened by id (profile history)', () => {
      provisionFor('inst-1');
      expect(repo.findById('s-gone')?.id).toBe('s-gone');
    });
  });
```

(If `StudentPageFilter` requires more fields than `limit`/`offset`, copy the minimal call an existing `findPage` test in this file uses.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts -t "workspace scope"`
Expected: FAIL — counts are 2.

- [ ] **Step 3: Write the scope fragment**

`workspaceScope.ts`:

```ts
/**
 * SQL restricting a students query to the workspace's own school. The local
 * students table can hold children who have LEFT this school (re-pointed by
 * applyDepartures, kept for their history), so a read that means "our
 * students" must say so. Reads provisioning_metadata in the same database,
 * so no repository needs to be told the institution.
 *
 * District/county/ministry workspaces record no institution and legitimately
 * hold several schools — the expression is then true for every row. The same
 * holds before provisioning has written its metadata row (the subquery is
 * NULL), which is what existing repository tests rely on.
 *
 * National-uniqueness checks (nemisId) and findById must NOT use this.
 */
export function workspaceStudentScope(alias: string): string {
  const workspaceInstitution = `(SELECT institutionId FROM provisioning_metadata WHERE id = 'singleton')`;
  return `(${workspaceInstitution} IS NULL OR ${alias}.institutionId = ${workspaceInstitution})`;
}
```

- [ ] **Step 4: Apply it in the repository**

In `SqliteStudentRepository.ts` add `import { workspaceStudentScope } from './workspaceScope';` and change:

`findPage` — make the first line of the clause list:

```ts
      const clauses: string[] = [workspaceStudentScope('s')]; const params: unknown[] = [];
```

(The `where` builder already joins clauses with `AND`; it now always has at least one.)

The counts and recent list:

```ts
  countAll(): number {
    return guarded('SqliteStudentRepository.countAll', () => {
      const row = this.#statements
        .get(`SELECT COUNT(*) AS n FROM ${TableNames.students} s WHERE ${workspaceStudentScope('s')}`)
        .get() as { n: number };
      return row.n;
    });
  }
  countByGradeLevel(): { gradeLevel: GradeLevel; studentCount: number }[] {
    return guarded('SqliteStudentRepository.countByGradeLevel', () => this.#statements.get(`SELECT gradeLevel, COUNT(*) AS studentCount FROM ${TableNames.students} s WHERE isActive = 1 AND gradeLevel IS NOT NULL AND ${workspaceStudentScope('s')} GROUP BY gradeLevel`).all() as { gradeLevel: GradeLevel; studentCount: number }[]);
  }
  countByGender(): { gender: Gender; studentCount: number }[] {
    return guarded('SqliteStudentRepository.countByGender', () => this.#statements.get(`SELECT gender, COUNT(*) AS studentCount FROM ${TableNames.students} s WHERE isActive = 1 AND ${workspaceStudentScope('s')} GROUP BY gender`).all() as { gender: Gender; studentCount: number }[]);
  }
```

`countByInstitution` stays as it is — it groups by institution on purpose (multi-school roles).

```ts
  countRecentAdmissions(sinceDate: string): number {
    return guarded('SqliteStudentRepository.countRecentAdmissions', () => {
      const row = this.#statements.get(`SELECT COUNT(*) AS n FROM ${TableNames.students} s WHERE isActive = 1 AND admissionDate >= ? AND ${workspaceStudentScope('s')}`).get(sinceDate) as { n: number };
      return row.n;
    });
  }
  findRecentlyUpdated(limit: number): Student[] {
    return guarded('SqliteStudentRepository.findRecentlyUpdated', () => (this.#statements.get(`SELECT ${COLUMNS} FROM ${TableNames.students} s WHERE ${workspaceStudentScope('s')} ORDER BY updatedAt DESC LIMIT ?`).all(limit) as StudentRow[]).map(toStudent));
  }
```

- [ ] **Step 5: Run the repository suite**

Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`
Expected: PASS (whole file — existing tests write no metadata row, so they are unscoped).

- [ ] **Step 6: Write the failing module-service test**

Append inside `describe('SchoolAdminModuleService', ...)`:

```ts
  it('lists only students at the workspace school', () => {
    const { workspaces, service } = setup();
    const db = workspaces.active.database.connection;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO provisioning_metadata (id, status, institutionId, startedAt, updatedAt)
       VALUES ('singleton', 'complete', 'school-1', ?, ?)
       ON CONFLICT(id) DO UPDATE SET institutionId = excluded.institutionId`,
    ).run(now, now);
    const insert = db.prepare(
      `INSERT INTO students (id, institutionId, firstName, lastName, nemisId, dateOfBirth, gender, isActive, version, updatedAt)
       VALUES (?,?,?,?,?,?,?,1,1,?)`,
    );
    insert.run('s-here', 'school-1', 'Musu', 'Kollie', null, '2012-04-01', 'FEMALE', now);
    insert.run('s-gone', 'school-2', 'Joseph', 'Wleh', null, '2012-04-01', 'MALE', now);

    const result = service.list({ collection: 'students' });
    expect(result.total).toBe(1);
    expect(result.items.map((item) => item.id)).toEqual(['s-here']);
  });
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts -t "workspace school"`
Expected: FAIL — total 2.

- [ ] **Step 8: Scope the generic list**

In `SchoolAdminModuleService.ts` add `import { workspaceStudentScope } from '@app/data/repositories/sqlite/business/workspaceScope';` and in `list()` replace the two queries with:

```ts
    // `students` can hold children who have left this school (kept for their
    // history); "our students" must exclude them. Other collections unchanged.
    const where =
      request.collection === 'students' ? ` WHERE ${workspaceStudentScope('students')}` : '';
    const items = db
      .prepare(`SELECT * FROM ${request.collection}${where} ORDER BY rowid DESC LIMIT ? OFFSET ?`)
      .all(limit, offset) as SchoolAdminRecord[];
    const total = (
      db.prepare(`SELECT COUNT(*) total FROM ${request.collection}${where}`).get() as { total: number }
    ).total;
```

- [ ] **Step 9: Run both suites**

Run: `pnpm vitest run apps/desktop/electron/data`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/workspaceScope.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts apps/desktop/electron/data/services/SchoolAdminModuleService.ts apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts
git commit -m "fix(students): scope student reads to the workspace school

The local table can now hold students who have left this school, so the
dashboard counts, students list and generic students collection filter
by the provisioned institution (no-op for multi-school workspaces).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Desktop — transfers are read-only in the service and the UI

**Files:**
- Modify: `apps/desktop/electron/data/services/SchoolAdminModuleService.ts` (`ROLE_WRITE_COLLECTIONS` ~line 323; the `student_transfers` branch in `save()` ~line 454)
- Modify: `apps/desktop/renderer/components/school-admin/SchoolAdminModulePages.tsx` (props lines 30–38; `hasActions` line 76–77; the Approve block lines 168–180)
- Modify: `apps/desktop/renderer/app/government/school-admin/students/inter-school-transfer/page.tsx`
- Test: `apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts`
- Create: `apps/desktop/renderer/components/school-admin/SchoolAdminCollectionPage.test.tsx`

**Interfaces:**
- Produces: `SchoolAdminCollectionPage` gains an optional prop `notice?: string`, rendered under the description.

- [ ] **Step 1: Write the failing service tests**

Append inside `describe('SchoolAdminModuleService', ...)`:

```ts
  it.each([
    ['school admin', admin],
    [
      'DEO',
      {
        ...admin,
        id: 'deo-1',
        role: SystemRole.DEO,
        institutionId: undefined,
        scope: { type: DesktopScopeType.DISTRICT, scopeId: 'district-1', districtId: 'district-1' },
      },
    ],
  ] as const)('refuses every transfer write from a %s', (_label, user) => {
    const { workspaces, service } = setup(user);
    const now = new Date().toISOString();
    workspaces.active.database.connection
      .prepare(
        `INSERT INTO student_transfers
           (id, studentId, fromInstitutionId, toInstitutionId, requestedBy, reason, status, createdAt, updatedAt)
         VALUES ('t1','student-1','school-1','school-2','user-1','Relocation','PENDING',?,?)`,
      )
      .run(now, now);
    expect(() =>
      service.save({ collection: 'student_transfers', record: { id: 't1', status: 'APPROVED' } }),
    ).toThrow('This record type cannot be changed by the active role.');
    expect(() => service.delete({ collection: 'student_transfers', id: 't1' })).toThrow(
      'This record type cannot be changed by the active role.',
    );
    // Still readable — the inbox is a view.
    expect(service.list({ collection: 'student_transfers' }).total).toBe(1);
  });
```

(If `SchoolAdminDeleteRequest` names its id field differently, match the signature at `SchoolAdminModuleService.ts:508`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts -t "transfer write"`
Expected: FAIL — the save succeeds.

- [ ] **Step 3: Make the collection read-only**

In `SchoolAdminModuleService.ts`:

```ts
const ROLE_WRITE_COLLECTIONS: Readonly<Record<string, ReadonlySet<SchoolAdminCollection>>> = {
  // student_transfers is pull-only for every role: a transfer decides which
  // school holds a child, so it goes through the server's transfer and
  // registry services online (NEMIS ID desktop parity spec §5.1).
  INSTITUTION_ADMIN: new Set(
    (Object.keys(CONFIG) as SchoolAdminCollection[]).filter(
      (collection) => collection !== 'student_transfers',
    ),
  ),
  TEACHER: new Set(['grades', 'messages', 'user_notifications', 'assessment_templates', 'assessments']),
  COUNTY_ADMIN: new Set(['reports', 'alerts']),
  DEO: new Set(['reports', 'alerts']),
  MINISTRY_ADMIN: new Set(['reports', 'alerts']),
};
```

Delete the now-unreachable block in `save()`:

```ts
    if (request.collection === 'student_transfers' && record.status !== 'PENDING') {
      record.reviewedBy = userId;
      record.reviewedAt = record.reviewedAt ?? now;
    }
```

Keep the `student_transfers` entry in `CONFIG` and in the read sets — the list still uses them.

- [ ] **Step 4: Run the service suite**

Run: `pnpm vitest run apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing page test**

`SchoolAdminCollectionPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-revalidate-on-sync', () => ({
  // Load once on mount; sync-driven reloads are not under test here.
  useRevalidateOnSync: (load: () => void) => {
    useEffect(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));
vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn().mockResolvedValue({
      items: [
        {
          id: 't1', studentId: 'student-1', fromInstitutionId: 'school-2', toInstitutionId: 'school-1',
          status: 'PENDING', reason: 'Relocation', requestedDate: null, reviewedAt: null,
        },
      ],
      total: 1,
    }),
    saveSchoolAdminRecord: vi.fn(),
  },
}));
vi.mock('@/services/nemis-bridge/school-admin/student-bridge', () => ({ studentBridge: {} }));

import { SchoolAdminCollectionPage } from './SchoolAdminModulePages';
import { sharedBridge } from '@/services/nemis-bridge/shared';

describe('SchoolAdminCollectionPage — transfers', () => {
  it('shows a pending transfer with no Approve action, and the web-portal notice', async () => {
    render(
      <SchoolAdminCollectionPage
        title="Inter-school transfers"
        description="Incoming and outgoing student transfer requests involving this institution."
        notice="Review transfers on the web portal."
        sections={[{ collection: 'student_transfers', label: 'Transfers', columns: ['studentId', 'status'] }]}
      />,
    );
    expect(await screen.findByText('PENDING')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByText('Review transfers on the web portal.')).toBeInTheDocument();
    expect(sharedBridge.saveSchoolAdminRecord).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/components/school-admin/SchoolAdminCollectionPage.test.tsx`
Expected: FAIL — an Approve button is present and the notice is not rendered (TS also flags the unknown `notice` prop).

- [ ] **Step 7: Remove Approve and add the notice prop**

In `SchoolAdminModulePages.tsx`:

Props:

```tsx
export function SchoolAdminCollectionPage({
  title,
  description,
  notice,
  sections,
}: {
  title: string;
  description: string;
  /** A standing note under the description, e.g. where an action now lives. */
  notice?: string;
  sections: readonly Section[];
}) {
```

Under the description paragraph (`<p className="mt-1 text-sm text-slate-600">{description}</p>`):

```tsx
          {notice && <p className="mt-2 text-sm font-medium text-amber-700">{notice}</p>}
```

`hasActions` becomes:

```tsx
  const hasActions = active === 'user_notifications' || active === 'alerts';
```

Delete the whole `{active === 'student_transfers' && record.status === 'PENDING' && ( ... Approve ... )}` block.

In `students/inter-school-transfer/page.tsx`:

```tsx
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Inter-school transfers" description="Incoming and outgoing student transfer requests involving this institution." notice="Review transfers on the web portal." sections={[
    { collection: 'student_transfers', label: 'Transfers', columns: ['studentId', 'fromInstitutionId', 'toInstitutionId', 'status', 'reason', 'requestedDate', 'reviewedAt'] },
  ]} />;
}
```

(`deo/transfers/page.tsx` needs no change: it already had no Approve-specific code beyond the shared component.)

- [ ] **Step 8: Run the page test**

Run: `pnpm vitest run apps/desktop/renderer/components/school-admin/SchoolAdminCollectionPage.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/electron/data/services/SchoolAdminModuleService.ts apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts apps/desktop/renderer/components/school-admin/SchoolAdminModulePages.tsx apps/desktop/renderer/components/school-admin/SchoolAdminCollectionPage.test.tsx apps/desktop/renderer/app/government/school-admin/students/inter-school-transfer/page.tsx
git commit -m "fix(transfers): remove desktop Approve; transfers are read-only offline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Stage gate

**Files:** none new.

- [ ] **Step 1: Desktop full gate**

Run (from `desktop-client-nemis` root): `pnpm rebuild:node && pnpm vitest run && pnpm typecheck`
Expected: all pass except the known `renderer/app/page.test.tsx`. Record the pass count.

- [ ] **Step 2: Desktop lint (renderer boundary guard)**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 3: Restore the Electron build**

Run: `pnpm rebuild:electron`
Expected: completes; the app launches (`pnpm dev` or the repo's start script) and the transfers page shows the notice and no Approve button.

- [ ] **Step 4: Server gate**

Run (from `Nemis/apps/server`): `npx tsc --noEmit && npx jest`
Expected: all pass except the known `desktop-provisioning.service.spec.ts`.

- [ ] **Step 5: Record deploy coupling**

Do not merge either branch yet. Stage 1 ships as a pair: the server refusal (Task 1) must deploy before or with the desktop release that removes Approve (spec §4). Report both branch heads to the user for the merge decision.
