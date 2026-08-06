# Teacher Sync Conflict Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two confirmed root-cause bugs that corrupt Teacher-role offline sync — attendance re-edits mint a fresh id every time instead of reusing the existing row's id, and locally-created assignments never reconcile their local id with the server-assigned id — both of which produce duplicate/orphaned server rows and spurious sync conflicts instead of clean bidirectional sync.

**Architecture:** No new subsystems. Both fixes tighten existing id-handling inside code that already runs on every sync cycle (`DesktopSyncWorker.syncActive()`'s push step): (1) `RecordAttendanceUseCase` looks up any existing row for the same `(studentId, subjectId, date)` natural key and reuses its id instead of always minting one, and `SqliteAttendanceRepository.save()`'s natural-key cleanup excludes the id being written so a same-id edit no longer fires a delete+recreate pair through the sync outbox; (2) `AssignmentSyncService.pushAssignment()` rewrites a newly-created assignment's local primary key to the server-assigned id at the moment of its first successful push (before any submissions can exist to reference it), so the generic snapshot importer's plain upsert-by-id naturally merges future pulls instead of duplicating the row.

**Tech Stack:** TypeScript, better-sqlite3, Vitest. Repo: `desktop-client-nemis` (Electron main-process + `packages/application`).

## Global Constraints

- Every step that touches an existing test file must keep all of that file's other tests passing — do not weaken an assertion to make a change fit.
- No changes to the `Nemis` server repo, database schema/migrations, or IPC contracts are needed for either fix — both are confined to `desktop-client-nemis`.
- Match existing code style exactly (no semicolon/quote-style changes, no unrelated reformatting).

---

### Task 1: `findExistingId` on the attendance repository (interface + in-memory)

**Files:**
- Modify: `packages/application/src/interfaces/attendance/attendance-repository.ts`
- Modify: `packages/application/src/testing/attendance/in-memory-attendance-repository.ts`
- Test: `packages/application/src/testing/attendance/in-memory-attendance-repository.test.ts` (new file)

**Interfaces:**
- Produces: `IAttendanceRepository.findExistingId(studentId: string, subjectId: string | undefined, date: string): string | undefined` — returns the id of the current row for that natural key, or `undefined` if none exists yet. Task 2 (the use case) and Task 3 (the SQLite implementation) both depend on this exact signature.

- [ ] **Step 1: Write the failing test**

Create `packages/application/src/testing/attendance/in-memory-attendance-repository.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { Attendance } from '@nemis-desktop/domain';
import { AttendanceStatus } from '@nemis-desktop/types';
import { InMemoryAttendanceRepository } from './in-memory-attendance-repository';

function record(id: string, overrides: Partial<{ subjectId: string; date: string }> = {}): Attendance {
  return Attendance.record({
    id,
    studentId: 'stu-1',
    classId: 'cls-1',
    subjectId: overrides.subjectId,
    date: overrides.date ?? '2026-08-06',
    status: AttendanceStatus.PRESENT,
    occurredAt: '2026-08-06T08:00:00.000Z',
  });
}

describe('InMemoryAttendanceRepository.findExistingId', () => {
  it('returns undefined when no row exists for the natural key', () => {
    const repo = new InMemoryAttendanceRepository();
    expect(repo.findExistingId('stu-1', 'subj-1', '2026-08-06')).toBeUndefined();
  });

  it('returns the id of the existing row for (studentId, subjectId, date)', () => {
    const repo = new InMemoryAttendanceRepository();
    repo.save(record('att-1', { subjectId: 'subj-1' }));
    expect(repo.findExistingId('stu-1', 'subj-1', '2026-08-06')).toBe('att-1');
  });

  it('treats subjectId undefined as its own natural key, distinct from a real subjectId', () => {
    const repo = new InMemoryAttendanceRepository();
    repo.save(record('att-1', { subjectId: 'subj-1' }));
    expect(repo.findExistingId('stu-1', undefined, '2026-08-06')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npx vitest run packages/application/src/testing/attendance/in-memory-attendance-repository.test.ts`
Expected: FAIL with `repo.findExistingId is not a function`

- [ ] **Step 3: Add `findExistingId` to the interface and the in-memory implementation**

In `packages/application/src/interfaces/attendance/attendance-repository.ts`, add the method to the interface:

```typescript
import type { Attendance } from '@nemis-desktop/domain';

export interface IAttendanceRepository {
  save(attendance: Attendance): void;
  /** Omitting subjectId returns every subject's records for the class/date
   * (used by the school-admin day-level report); passing it scopes to one
   * subject (used by the teacher's per-subject marking screen). */
  findByClassAndDate(classId: string, date: string, subjectId?: string): Attendance[];
  /** The id of the current row for this (studentId, subjectId, date) natural
   * key, or undefined if none exists yet. Lets a caller reuse the existing
   * id on an edit instead of minting a new one for what is really an update
   * — see RecordAttendanceUseCase. */
  findExistingId(studentId: string, subjectId: string | undefined, date: string): string | undefined;
  /** Present-vs-total attendance rows recorded on an ISO date. */
  countByDate(date: string): { present: number; total: number };
}
```

In `packages/application/src/testing/attendance/in-memory-attendance-repository.ts`, add the method:

```typescript
  findExistingId(studentId: string, subjectId: string | undefined, date: string): string | undefined {
    for (const existing of this.store.values()) {
      if (existing.studentId === studentId && existing.subjectId === subjectId && existing.date === date) {
        return existing.id;
      }
    }
    return undefined;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run (from repo root): `npx vitest run packages/application/src/testing/attendance/in-memory-attendance-repository.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/interfaces/attendance/attendance-repository.ts packages/application/src/testing/attendance/in-memory-attendance-repository.ts packages/application/src/testing/attendance/in-memory-attendance-repository.test.ts
git commit -m "feat(attendance): add findExistingId to IAttendanceRepository"
```

---

### Task 2: `RecordAttendanceUseCase` reuses the existing row's id on edit

**Files:**
- Modify: `packages/application/src/use-cases/attendance/record-attendance.ts`
- Test: `packages/application/src/use-cases/attendance/record-attendance.test.ts`

**Interfaces:**
- Consumes: `IAttendanceRepository.findExistingId(studentId, subjectId, date): string | undefined` from Task 1.
- Produces: no new public surface — `RecordAttendanceUseCase.execute()`'s behavior changes: the `id` on its output/persisted entity is now stable across repeated calls with the same `(studentId, subjectId, date)`, only changing (being freshly minted) the first time that key is recorded.

- [ ] **Step 1: Write the failing test**

Add to `packages/application/src/use-cases/attendance/record-attendance.test.ts`, inside the existing `describe('RecordAttendanceUseCase', ...)` block, after the `'upserts by (studentId, subjectId, date) instead of duplicating rows'` test:

```typescript
  it('reuses the existing row\'s id when editing an already-recorded entry, instead of minting a new one', async () => {
    const { useCase } = build();
    const first = await useCase.execute({ ...dto, subjectId: 'subj-1', status: AttendanceStatus.PRESENT });
    const second = await useCase.execute({ ...dto, subjectId: 'subj-1', status: AttendanceStatus.ABSENT });
    expect(second.data.id).toBe(first.data.id);
  });

  it('still mints a new id for a different (studentId, subjectId, date) key', async () => {
    const { useCase } = build();
    const first = await useCase.execute({ ...dto, subjectId: 'subj-1' });
    const second = await useCase.execute({ ...dto, subjectId: 'subj-2' });
    expect(second.data.id).not.toBe(first.data.id);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npx vitest run packages/application/src/use-cases/attendance/record-attendance.test.ts`
Expected: FAIL on `'reuses the existing row\'s id when editing an already-recorded entry...'` — `second.data.id` is a freshly-minted id (`att-2`), not equal to `first.data.id` (`att-1`).

- [ ] **Step 3: Implement the minimal fix**

In `packages/application/src/use-cases/attendance/record-attendance.ts`, replace the `id: this.deps.ids.next()` line inside `Attendance.record({...})`:

```typescript
      const occurredAt = this.deps.clock.now();
      const existingId = this.deps.attendance.findExistingId(
        command.studentId,
        command.subjectId,
        command.date,
      );
      const attendance = Attendance.record({
        id: existingId ?? this.deps.ids.next(),
        studentId: command.studentId,
        classId: command.classId,
        subjectId: command.subjectId,
        date: command.date,
        status: command.status,
        recordedBy: command.recordedBy,
        remarks: command.remarks,
        updateReason: command.updateReason,
        occurredAt,
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run (from repo root): `npx vitest run packages/application/src/use-cases/attendance/record-attendance.test.ts`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/attendance/record-attendance.ts packages/application/src/use-cases/attendance/record-attendance.test.ts
git commit -m "fix(attendance): reuse existing row id on edit instead of minting a new one"
```

---

### Task 3: `SqliteAttendanceRepository` — implement `findExistingId` and stop self-deleting on same-id edits

**Files:**
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.ts`
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.test.ts`

**Interfaces:**
- Consumes: nothing new — implements the `IAttendanceRepository.findExistingId` signature from Task 1.
- Produces: `SqliteAttendanceRepository` now satisfies `IAttendanceRepository` fully (it did not implement `findExistingId` before this task; without this task the app fails to type-check once Task 1 lands, since this is the production implementation used everywhere outside tests).

**Why this matters beyond the interface:** today `save()` always runs `DELETE ... WHERE studentId=? AND subjectId IS ? AND date=?` before inserting, with no exclusion for the id being written. Combined with the old bug (Task 2 fixes it upstream, but this repository is also the last line of defense), that DELETE fires the table's outbox trigger and enqueues a spurious `delete` sync operation for the *old* row even when the edit reuses the same id, immediately followed by a `create`/`update` for that id — a delete+create pair the server can process out of order (they're enqueued within the same millisecond, so tie-breaking by the queue row's random id is not guaranteed to preserve delete-before-create), which either false-positives a sync conflict or, worse, briefly deletes the server's row before recreating it. Excluding the id being written from the DELETE means a same-id edit fires only the plain `update` trigger.

- [ ] **Step 1: Write the failing tests**

Add to `apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.test.ts`, inside the existing `describe('SqliteAttendanceRepository', ...)` block, after the `'save upserts by (studentId, subjectId, date) rather than duplicating rows'` test:

```typescript
  it('findExistingId returns undefined when no row exists for the natural key', () => {
    expect(repo.findExistingId('stu-1', 'subj-1', '2026-07-20')).toBeUndefined();
  });

  it('findExistingId returns the id of the current row for (studentId, subjectId, date)', () => {
    repo.save(
      Attendance.record({
        id: 'att-1', studentId: 'stu-1', classId: 'c-1', subjectId: 'subj-1',
        date: '2026-07-20', status: AttendanceStatus.PRESENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    expect(repo.findExistingId('stu-1', 'subj-1', '2026-07-20')).toBe('att-1');
  });

  it('save() edits in place under the same id without deleting the row first', () => {
    repo.save(
      Attendance.record({
        id: 'att-1', studentId: 'stu-1', classId: 'c-1', subjectId: 'subj-1',
        date: '2026-07-20', status: AttendanceStatus.PRESENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    repo.save(
      Attendance.record({
        id: 'att-1', studentId: 'stu-1', classId: 'c-1', subjectId: 'subj-1',
        date: '2026-07-20', status: AttendanceStatus.ABSENT, occurredAt: '2026-07-20T09:00:00.000Z',
      }),
    );
    const rows = repo.findByClassAndDate('c-1', '2026-07-20', 'subj-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('att-1');
    expect(rows[0]?.status).toBe(AttendanceStatus.ABSENT);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npx vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.test.ts`
Expected: FAIL — `repo.findExistingId is not a function` (and a TypeScript error that `SqliteAttendanceRepository` does not fully implement `IAttendanceRepository`).

- [ ] **Step 3: Implement `findExistingId` and the self-excluding delete**

In `apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.ts`, change the `DELETE` in `save()` to exclude the id being written, and add `findExistingId`:

```typescript
  save(attendance: Attendance): void {
    guarded('SqliteAttendanceRepository.save', () => {
      // One current record per (student, subject, date) — mirrors the web
      // backend's studentId_subjectId_date unique constraint (classId is not
      // part of the key: a student sits in one class, so it never varies for
      // a given studentId). The `id != ?` exclusion means a same-id edit (the
      // common case — RecordAttendanceUseCase reuses the existing id) deletes
      // nothing and the INSERT below falls through to its ON CONFLICT branch,
      // firing only an update outbox trigger. This DELETE now only fires for
      // a genuine stray duplicate under a different id (e.g. one written
      // before this natural-key-reuse fix existed), self-healing it away.
      // SQLite's `IS ?` (rather than `= ?`) correctly matches NULL when
      // subjectId is unset (general, subject-less marking).
      this.#statements
        .get(
          `DELETE FROM ${TableNames.attendance}
           WHERE studentId = ? AND subjectId IS ? AND date = ? AND id != ?`,
        )
        .run(attendance.studentId, attendance.subjectId ?? null, attendance.date, attendance.id);
      this.#statements
        .get(
          `INSERT INTO ${TableNames.attendance}
           (id, studentId, classId, subjectId, date, status, recordedBy, remarks, updateReason, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             date = excluded.date,
             recordedBy = excluded.recordedBy,
             remarks = excluded.remarks,
             updateReason = excluded.updateReason,
             version = excluded.version,
             updatedAt = excluded.updatedAt,
             lastModifiedBy = excluded.lastModifiedBy`,
        )
        .run(
          attendance.id,
          attendance.studentId,
          attendance.classId,
          attendance.subjectId ?? null,
          attendance.date,
          attendance.status,
          attendance.recordedBy ?? null,
          attendance.remarks ?? null,
          attendance.updateReason ?? null,
          attendance.version,
          attendance.updatedAt,
          attendance.lastModifiedBy ?? null,
        );
    });
  }

  findExistingId(studentId: string, subjectId: string | undefined, date: string): string | undefined {
    return guarded('SqliteAttendanceRepository.findExistingId', () => {
      const row = this.#statements
        .get(
          `SELECT id FROM ${TableNames.attendance} WHERE studentId = ? AND subjectId IS ? AND date = ?`,
        )
        .get(studentId, subjectId ?? null, date) as { id: string } | undefined;
      return row?.id;
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run (from repo root): `npx vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.test.ts`
Expected: PASS (all tests in the file, including the three new ones)

- [ ] **Step 5: Run the full test suite**

Run (from repo root): `pnpm test`
Expected: PASS in full (this confirms the interface change didn't break any other `IAttendanceRepository` consumer, and that `record-attendance.test.ts` from Task 2 still passes end-to-end with the real SQLite implementation's semantics matched by the in-memory one).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.test.ts
git commit -m "fix(attendance): implement findExistingId, stop self-deleting on same-id edits"
```

---

### Task 4: `AssignmentSyncService` canonicalizes the local id to the server id on first push

**Files:**
- Modify: `apps/desktop/electron/sync/AssignmentSyncService.ts`
- Modify: `apps/desktop/electron/sync/AssignmentSyncService.test.ts`

**Interfaces:**
- Consumes: `BackendProvisioningGateway.createAssignment(...)`/`updateAssignment(...)` (unchanged signatures — both already return `{ id, attachmentUrl?, attachmentName? }`).
- Produces: no new public surface. After this task, an assignment's SQLite primary key (`assignments.id`) equals the server's id from the moment its first push succeeds, matching how every other synced entity in this app already works (client-generated id accepted verbatim by the server) — this is what lets `ProvisioningImporter`'s existing generic upsert-by-id pull merge handle assignments correctly with no importer changes.

**Why this fixes the bug:** `ProvisioningImporter` (`apps/desktop/electron/provisioning/ProvisioningImporter.ts`) merges every pulled snapshot collection, including `assignments`, by a plain `INSERT ... ON CONFLICT(id) DO UPDATE` keyed on the server's `id` — it has no concept of `remoteId`. Today, a locally-created assignment keeps its original local id forever and only records the server's id in the separate `remoteId` column (migration 020). So the next snapshot pull after a successful push re-downloads that same assignment under the server's id and inserts it as a *second* row, permanently duplicating it and orphaning any `assignment_submissions` pulled against the canonical (server) id, since those look up their assignment by `assignmentId = assignments.id` (see the existing `JOIN assignments a ON a.id = s.assignmentId` in `pushPending()`). Rewriting `id` to the server's id at the moment of first push, before this device can have created any local submissions for it (submissions only ever come from the server / are pulled down, never created offline), closes that gap with no cascade needed.

- [ ] **Step 1: Write the failing test**

In `apps/desktop/electron/sync/AssignmentSyncService.test.ts`, replace the existing `'creates a never-synced assignment remotely and stores the returned remoteId'` test (it currently queries `WHERE id='a1'`, which stops matching once this task lands) with:

```typescript
  it('creates a never-synced assignment remotely and canonicalizes its local id to the server id', async () => {
    insertAssignment();
    const gateway = buildGateway();
    await new AssignmentSyncService(gateway).pushPending(test.context.connection);

    expect(gateway.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'cls-1', title: 'Chapter 5', status: 'DRAFT' }),
      undefined,
    );
    const byOldId = test.context.connection.prepare(`SELECT * FROM assignments WHERE id='a1'`).get();
    expect(byOldId).toBeUndefined();
    const row = test.context.connection.prepare(`SELECT id, remoteId, syncedAt FROM assignments WHERE id='remote-a1'`).get() as {
      id: string; remoteId: string; syncedAt: string;
    };
    expect(row.id).toBe('remote-a1');
    expect(row.remoteId).toBe('remote-a1');
    expect(row.syncedAt).toBeTruthy();
  });

  it('a second pull-merge for the same assignment after its first push updates the canonical row instead of duplicating it', async () => {
    insertAssignment();
    const gateway = buildGateway();
    await new AssignmentSyncService(gateway).pushPending(test.context.connection);

    // Simulates ProvisioningImporter's merge upsert for a pulled snapshot
    // row describing this same assignment under the server's id.
    test.context.connection.prepare(`
      INSERT INTO assignments (id,classId,subjectId,teacherId,title,type,status,dueDate,createdAt,updatedAt,remoteId,syncedAt)
      VALUES ('remote-a1','cls-1',NULL,'staff-1','Chapter 5','HOMEWORK','PUBLISHED','2026-08-10',?,?,NULL,NULL)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status
    `).run('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');

    const count = test.context.connection.prepare(`SELECT COUNT(*) count FROM assignments`).get() as { count: number };
    expect(count.count).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npx vitest run apps/desktop/electron/sync/AssignmentSyncService.test.ts`
Expected: FAIL on the first replaced test — `byOldId` is still defined (the row is still under `id='a1'`) and the `WHERE id='remote-a1'` lookup returns `undefined`.

- [ ] **Step 3: Implement the id canonicalization**

In `apps/desktop/electron/sync/AssignmentSyncService.ts`, replace `pushAssignment`:

```typescript
  private async pushAssignment(db: SqliteDatabase, row: AssignmentRow): Promise<void> {
    const filePath = AttachmentStorage.localPath(row.attachmentUrl);
    const fields: Record<string, string> = {
      title: row.title,
      type: row.type,
      status: row.status,
      dueDate: row.dueDate,
    };
    if (row.subjectId) fields.subjectId = row.subjectId;
    if (row.instructions) fields.instructions = row.instructions;
    if (row.totalMarks != null) fields.totalMarks = String(row.totalMarks);

    // UpdateAssignmentDto has no classId field on the backend (it never
    // changes after creation) — only include it on the first, create push.
    const isFirstPush = row.remoteId === null;
    const result = isFirstPush
      ? await this.gateway.createAssignment({ ...fields, classId: row.classId }, filePath)
      : await this.gateway.updateAssignment(row.remoteId!, fields, filePath);

    const now = new Date().toISOString();
    if (isFirstPush) {
      // The backend mints its own id for a new assignment — it never accepts
      // a client-supplied one (see migration 020's doc comment). Canonicalize
      // this row's local primary key to that server id now, before this
      // device can have created any local assignment_submissions rows for it
      // (submissions only ever arrive from the server / a pull, never
      // created offline). Without this, the next snapshot pull would insert
      // a *second* row for this assignment under the server id — see this
      // file's class-level doc comment and ProvisioningImporter's plain
      // upsert-by-id merge.
      db.prepare(
        `UPDATE assignments
         SET id = ?, remoteId = ?, attachmentUrl = COALESCE(?, attachmentUrl), attachmentName = COALESCE(?, attachmentName), syncedAt = ?
         WHERE id = ?`,
      ).run(result.id, result.id, result.attachmentUrl ?? null, result.attachmentName ?? null, now, row.id);
    } else {
      db.prepare(
        `UPDATE assignments
         SET attachmentUrl = COALESCE(?, attachmentUrl), attachmentName = COALESCE(?, attachmentName), syncedAt = ?
         WHERE id = ?`,
      ).run(result.attachmentUrl ?? null, result.attachmentName ?? null, now, row.id);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run (from repo root): `npx vitest run apps/desktop/electron/sync/AssignmentSyncService.test.ts`
Expected: PASS (all tests in the file — the 5 pre-existing ones plus the new duplication-regression test)

- [ ] **Step 5: Run the full test suite**

Run (from repo root): `pnpm test`
Expected: PASS in full.

**Correction found during Task 4's review (kept here for the record):** the sentence above, as originally written, claimed the renderer never caches an assignment id across a background sync cycle. That turned out to be wrong — the renderer captures the id into a page's URL query param and holds it for that page's whole lifetime, not just for one call. Task 5 below fixes the resulting gap.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/sync/AssignmentSyncService.ts apps/desktop/electron/sync/AssignmentSyncService.test.ts
git commit -m "fix(assignments): canonicalize local id to server id on first push, preventing duplicate rows on pull"
```

---

### Task 5: Recover the assignment renderer pages from a stale id after Task 4's rewrite

**Files:**
- Modify: `apps/desktop/renderer/components/assignment/AssignmentDetailPage.tsx`
- Modify: `apps/desktop/renderer/components/assignment/AssignmentForm.tsx`
- Modify: `apps/desktop/renderer/components/assignment/SubmissionsTable.tsx`

**Interfaces:** none — this task only changes what these three components render on their own existing error states. No new types, no application/presentation-layer exception or error-kind changes (that fuller approach was considered and deliberately rejected as disproportionate to the narrow race window it closes — see the plan's Task 4 review history).

**Background:** Task 4 made `AssignmentSyncService` rewrite a locally-created assignment's SQLite primary key from a local id to the server's id at the moment of its first successful push. Task 4's own review found a real, if narrow, side effect: these three renderer components capture an assignment's id once (from a URL query param or a prop) and hold it for the component's whole lifetime. If that background rewrite happens while a teacher is actively viewing/editing that exact assignment, any subsequent IPC call using the held id fails, because the row no longer exists under that id.

Today, a load failure on `AssignmentDetailPage.tsx` and `AssignmentForm.tsx` (edit mode) already renders a plain "Assignment not found" message with no further action — the teacher isn't technically stuck (both pages already have a working "Back to Assignments" link elsewhere on the page, or one click away), but it reads as a dead end. `SubmissionsTable.tsx` is worse: it has no error branch at all today, so a load failure leaves it showing a loading skeleton forever.

This task doesn't try to silently recover the correct new id and keep the teacher on the same page — that would need a reliable "not found" signal distinguishable from other failures, which doesn't exist yet in this codebase's error-code plumbing from the SQLite layer through to the renderer (`GetAssignmentUseCase` throws a generic `WorkflowException`, which `toPresentationError` maps to the same `operation-failed` kind as every other business-rule rejection — see `packages/presentation/src/errors/to-presentation-error.ts`). Building that distinction was scoped as a separate, larger option and declined. Instead: on any load failure, each of these three components auto-redirects to the assignment list after a brief, visible moment. Navigating to the list re-fetches fresh data, so re-opening the same assignment from there resolves correctly under its new id. This fully closes the "stranded" concern with a small, low-risk, self-contained change — no cross-package plumbing.

**Note on test coverage:** none of these three files have any existing test file (`apps/desktop/renderer/components/assignment/` has no `*.test.tsx` today — confirmed by search before writing this task). Inventing a full renderer test harness from scratch for previously-untested files is a disproportionate lift for this fix and was not requested — this task is implementation-only, verified by `pnpm typecheck` and the existing full test suite (to confirm nothing else references these render branches), not new automated tests. This is a pre-existing gap, not one this task introduces or is expected to backfill.

- [ ] **Step 1: `AssignmentDetailPage.tsx` — auto-redirect on load failure**

In `apps/desktop/renderer/components/assignment/AssignmentDetailPage.tsx`, add a redirect effect right after the existing load effect:

```typescript
  useEffect(() => {
    if (teacherId && assignmentId) void assignmentsVm.loadAssignment(assignmentId, teacherId);
  }, [teacherId, assignmentId, assignmentsVm]);

  useEffect(() => {
    if (detail.status !== 'error' && detail.status !== 'empty') return;
    const timer = setTimeout(() => router.push('/government/teacher/assignment'), 1500);
    return () => clearTimeout(timer);
  }, [detail.status, router]);
```

Then update the existing not-found message so it reflects that a redirect is coming (same `if` branch, just the `Alert` text changes):

```typescript
      <Alert variant="error">Assignment not found or failed to load. Returning to your assignments…</Alert>
```

- [ ] **Step 2: `AssignmentForm.tsx` (edit mode) — same treatment**

In `apps/desktop/renderer/components/assignment/AssignmentForm.tsx`, add a redirect effect right after the existing edit-mode load effect:

```typescript
  useEffect(() => {
    if (mode === 'edit' && assignmentId && teacherId) {
      void assignmentsVm.loadAssignment(assignmentId, teacherId);
    }
  }, [mode, assignmentId, teacherId, assignmentsVm]);

  useEffect(() => {
    if (mode !== 'edit' || detail.status !== 'error') return;
    const timer = setTimeout(() => router.push('/government/teacher/assignment'), 1500);
    return () => clearTimeout(timer);
  }, [mode, detail.status, router]);
```

Then update the existing error-state render:

```typescript
  if (mode === 'edit' && detail.status === 'error') {
    return <Alert variant="error">Assignment not found or failed to load. Returning to your assignments…</Alert>;
  }
```

- [ ] **Step 3: `SubmissionsTable.tsx` — add the missing error branch, with the same redirect**

In `apps/desktop/renderer/components/assignment/SubmissionsTable.tsx`, add `useRouter` and `Alert` to the imports:

```typescript
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Badge, EmptyState, Skeleton, Spinner } from '@nemis-desktop/ui';
```

Add the router and a redirect effect inside the component, right after the existing load effect:

```typescript
export function SubmissionsTable({ assignmentId, totalMarks }: { assignmentId: string; totalMarks?: number }) {
  const router = useRouter();
  const currentUser = useCurrentUserViewModel();
  const assignmentsVm = useAssignmentsViewModel();
  const user = useViewModel(currentUser.store, (s) => s.user);
  const submissions = useViewModel(assignmentsVm.store, (s) => s.submissions);
  const teacherId = user.status === 'success' ? user.data.id : undefined;

  useEffect(() => {
    if (teacherId) void assignmentsVm.loadSubmissions(assignmentId, teacherId);
  }, [teacherId, assignmentId, assignmentsVm]);

  useEffect(() => {
    if (submissions.status !== 'error') return;
    const timer = setTimeout(() => router.push('/government/teacher/assignment'), 1500);
    return () => clearTimeout(timer);
  }, [submissions.status, router]);
```

Then, right before the existing `if (!hasData) return <Skeleton className="h-56 w-full" />;` line, add the new error branch:

```typescript
  if (submissions.status === 'error') {
    return <Alert variant="error">Could not load submissions. Returning to your assignments…</Alert>;
  }
  if (!hasData) return <Skeleton className="h-56 w-full" />;
```

- [ ] **Step 4: Typecheck and run the full test suite**

Run (from repo root): `pnpm typecheck`
Expected: PASS — confirms the new imports (`useRouter` in `SubmissionsTable.tsx`, `Alert`) resolve correctly and no type error was introduced.

Run (from repo root): `pnpm test`
Expected: PASS in full, matching Task 4's baseline (`apps/desktop/renderer/app/government/teacher/timetable/timetable.test.tsx` pre-existing failure, `apps/desktop/electron/database/migrations/010-create-sync-outbox.test.ts` pre-existing full-suite-only flake — both already investigated and parked in the ledger, neither related to this task's files).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/assignment/AssignmentDetailPage.tsx apps/desktop/renderer/components/assignment/AssignmentForm.tsx apps/desktop/renderer/components/assignment/SubmissionsTable.tsx
git commit -m "fix(assignments): auto-redirect to the list on a stale-id load failure instead of a dead end"
```

---

## After this plan lands

Both fixes address root causes confirmed by reading the code (attendance's id churn, assignments' id/remoteId split), not the "grades never pull down from the web app" symptom — that part of the report could not be confirmed against a real bug: `grades` are written through the same generic collection path Institution Admin entities already use successfully (`sharedBridge.saveSchoolAdminRecord`), included in the server's Teacher-scoped snapshot (`restrictTeacherSnapshot` in `desktop-provisioning.service.ts`), and merged by the same generic `ProvisioningImporter` upsert-by-id path — architecturally identical to entities that are confirmed working. Re-test grades pull specifically after this plan ships: enter/edit a grade on the web app for a class+subject this teacher is assigned via `ClassSubjectTeacher`, wait for the desktop's next sync cycle (or restart the app, which always attempts an immediate pull), and check whether it now appears. Also check the desktop app's Sync status/conflicts screen (Settings → Sync, or wherever `listConflicts()`/`getStatus()` are surfaced in this build) before and after — the attendance bug fixed in Tasks 1–3 was very likely populating that screen with spurious conflicts, and clearing that noise may make a real remaining grades issue (if any) much easier to see and report precisely.
