# Offline Fee Payment Reversal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a school admin reverse a wrongly recorded fee payment from the desktop app while offline, and have that correction reach the server as a genuine audited reversal once connectivity returns.

**Architecture:** A new local `fee_payment_reversals` table records the reversal and applies its effect to the payment and obligation optimistically, with the sync outbox suppressed (the server redoes this work authoritatively). A dedicated `FeeReversalSyncService` then pushes each pending reversal to the server's existing `POST /finance/school-admin/fee-payments/:id/reverse` endpoint, gated so a payment's create always reaches the server before its reversal. No server-side changes.

**Tech Stack:** Electron main process (TypeScript strict), better-sqlite3 (SQLCipher), Next.js 15 renderer (React 19), vitest, Tailwind 3.4.

**Spec:** `docs/superpowers/specs/2026-09-20-offline-fee-payment-reversal-design.md`

## Global Constraints

- **Never edit or reorder a shipped migration.** `MigrationService` rejects drift at startup. Migrations are append-only — the new one is version **23**.
- **`fee_payment_reversals` must NOT be added to `MUTABLE_TABLES`** and must get **no outbox triggers**. It pushes through its own path. The migration carries a comment saying so.
- **TypeScript strict with `noUncheckedIndexedAccess`.** Indexing an array or `Map.get()` yields `T | undefined`; narrow before use.
- **Never subtract to recompute a balance.** Always re-aggregate with `SUM(amount) WHERE isReversed = 0`, mirroring the server at `Nemis/apps/Server/src/fees/obligations.service.ts:486-493`.
- **Every `captureEnabled = 0` must be restored in a `finally`.** Leaving it at 0 silently disables sync capture for the whole app.
- **Run desktop tests with:** `npx vitest run <path>` from the repo root (`desktop-client-nemis/`).
- **Typecheck with:** `cd apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json` for renderer, `npx tsc --noEmit` for main.
- **Do not run `prettier --write` on desktop files.** The existing desktop finance/electron files do not conform to prettier; match surrounding hand-written style instead.

---

### Task 1: Migration 023 — `fee_payment_reversals` table

**Files:**
- Create: `apps/desktop/electron/database/migrations/023-create-fee-payment-reversals.ts`
- Create: `apps/desktop/electron/database/migrations/023-create-fee-payment-reversals.test.ts`
- Modify: `apps/desktop/electron/database/migrations/registry.ts`
- Modify: `apps/desktop/electron/database/schema/tableNames.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: table `fee_payment_reversals` with columns `id, paymentId, institutionId, reason, notes, reversedBy, reversedAt, createdAt, updatedAt, syncedAt`; unique index `idx_fee_payment_reversals_payment` on `(paymentId)`; index `idx_fee_payment_reversals_pending` on `(syncedAt)`; exported const `createFeePaymentReversals: Migration`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/database/migrations/023-create-fee-payment-reversals.test.ts`:

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

function migrated() {
  const db = new Database(':memory:');
  for (const migration of migrations) migration.up(db);
  return db;
}

describe('023-create-fee-payment-reversals', () => {
  it('creates the reversals table with every column the push path needs', () => {
    const db = migrated();
    const columns = (db.prepare(`PRAGMA table_info("fee_payment_reversals")`).all() as { name: string }[])
      .map((column) => column.name)
      .sort();
    expect(columns).toEqual(
      [
        'createdAt', 'id', 'institutionId', 'notes', 'paymentId',
        'reason', 'reversedAt', 'reversedBy', 'syncedAt', 'updatedAt',
      ].sort(),
    );
    db.close();
  });

  it('allows only one reversal per payment', () => {
    const db = migrated();
    const insert = db.prepare(
      `INSERT INTO fee_payment_reversals
         (id,paymentId,institutionId,reason,notes,reversedBy,reversedAt,createdAt,updatedAt,syncedAt)
       VALUES (?,?,?,?,NULL,?,?,?,?,NULL)`,
    );
    const now = new Date().toISOString();
    insert.run('r1', 'pay-1', 'school-1', 'wrong amount', 'admin-1', now, now, now);
    expect(() =>
      insert.run('r2', 'pay-1', 'school-1', 'again', 'admin-1', now, now, now),
    ).toThrow(/UNIQUE/i);
    db.close();
  });

  it('has no outbox triggers — this table pushes through its own path', () => {
    const db = migrated();
    const triggers = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='fee_payment_reversals'`)
      .all() as { name: string }[];
    expect(triggers).toEqual([]);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/electron/database/migrations/023-create-fee-payment-reversals.test.ts`
Expected: FAIL — `no such table: fee_payment_reversals`.

- [ ] **Step 3: Write the migration**

Create `apps/desktop/electron/database/migrations/023-create-fee-payment-reversals.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Local record of an offline fee-payment reversal.
 *
 * Deliberately NOT in MUTABLE_TABLES and deliberately without outbox
 * triggers. The server's sync applier rejects every non-create operation on
 * fee_payments ("Payments are append-only; use the audited reversal
 * workflow"), so a generic-outbox push of a reversal could never be applied.
 * Reversals push through their own REST path instead — see
 * BackendProvisioningGateway.reverseFeePayment and FeeReversalSyncService,
 * the same arrangement migration 019/020 established for assignments.
 *
 *   syncedAt — NULL until the reversal has been accepted by the backend.
 *              This is the dirty flag FeeReversalSyncService selects on.
 *
 * The UNIQUE index on paymentId mirrors the server's 409 ("Payment has
 * already been reversed") locally, so the UI can refuse a double reversal
 * without a round trip. */
export const createFeePaymentReversals: Migration = {
  version: 23,
  name: 'create-fee-payment-reversals',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE fee_payment_reversals (
        id            TEXT PRIMARY KEY,
        paymentId     TEXT NOT NULL REFERENCES fee_payments (id),
        institutionId TEXT NOT NULL,
        reason        TEXT NOT NULL,
        notes         TEXT,
        reversedBy    TEXT NOT NULL,
        reversedAt    TEXT NOT NULL,
        createdAt     TEXT NOT NULL,
        updatedAt     TEXT NOT NULL,
        syncedAt      TEXT
      );
      CREATE UNIQUE INDEX idx_fee_payment_reversals_payment
        ON fee_payment_reversals (paymentId);
      CREATE INDEX idx_fee_payment_reversals_pending
        ON fee_payment_reversals (syncedAt);
    `);
  },
};
```

- [ ] **Step 4: Register the migration**

In `apps/desktop/electron/database/migrations/registry.ts`, add the import after the `addTermSequence` import:

```ts
import { createFeePaymentReversals } from './023-create-fee-payment-reversals';
```

and append to the end of the `migrations` array, after `addTermSequence`:

```ts
  createFeePaymentReversals,
```

- [ ] **Step 5: Add the table name**

In `apps/desktop/electron/database/schema/tableNames.ts`, add `'fee_payment_reversals'` to the exported table-name list, keeping the file's existing ordering convention (place it immediately after `'fee_payments'`).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run apps/desktop/electron/database/migrations/023-create-fee-payment-reversals.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Verify no other migration test regressed**

Run: `npx vitest run apps/desktop/electron/database`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/electron/database
git commit -m "feat(desktop): add fee_payment_reversals table (migration 023)"
```

---

### Task 2: Shared obligation-status helper

**Files:**
- Modify: `apps/desktop/electron/data/services/SchoolAdminModuleService.ts` (add helper; use it at the existing payment-create branch, currently line 478)
- Modify: `apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: exported `computeObligationStatus(totalPaid: number, requiredAmount: number, currentStatus?: string): string` returning one of `'WAIVED' | 'PAID_IN_FULL' | 'PARTIALLY_PAID' | 'OUTSTANDING'`. Task 3 depends on this exact name and signature.

**Why this task exists:** the create branch computes `totalPaid >= required ? 'PAID_IN_FULL' : 'PARTIALLY_PAID'`. That can never produce `OUTSTANDING`, which is fine when totals only grow. Reversal makes totals shrink, so reusing it would leave a student whose only payment was reversed showing "Partial" against a zero balance. Extracting the server's three-way rule now keeps both paths in agreement.

- [ ] **Step 1: Write the failing test**

Append to the existing `describe('SchoolAdminModuleService', ...)` block in `apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts` — note it is imported from the module under test, so add `computeObligationStatus` to the existing import at the top of that file:

```ts
  it('computes obligation status with the same three-way rule as the server', () => {
    expect(computeObligationStatus(0, 5000)).toBe('OUTSTANDING');
    expect(computeObligationStatus(2000, 5000)).toBe('PARTIALLY_PAID');
    expect(computeObligationStatus(5000, 5000)).toBe('PAID_IN_FULL');
    expect(computeObligationStatus(6000, 5000)).toBe('PAID_IN_FULL');
  });

  it('never moves a waived obligation off WAIVED', () => {
    expect(computeObligationStatus(0, 5000, 'WAIVED')).toBe('WAIVED');
    expect(computeObligationStatus(5000, 5000, 'WAIVED')).toBe('WAIVED');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts -t "three-way rule"`
Expected: FAIL — `computeObligationStatus is not a function` / import error.

- [ ] **Step 3: Write the helper**

In `apps/desktop/electron/data/services/SchoolAdminModuleService.ts`, add near the top-level helpers (above the class):

```ts
/** The obligation status rule, mirroring the server's computeStatus in
 * Nemis/apps/Server/src/fees/obligations.service.ts. Shared by the payment
 * create path and the reversal path so a shrinking total can reach
 * OUTSTANDING — a two-way `>= ? PAID_IN_FULL : PARTIALLY_PAID` rule is only
 * correct while totals grow. A waived obligation stays waived regardless of
 * what has been paid against it. */
export function computeObligationStatus(
  totalPaid: number,
  requiredAmount: number,
  currentStatus?: string,
): string {
  if (currentStatus === 'WAIVED') return 'WAIVED';
  if (totalPaid >= requiredAmount) return 'PAID_IN_FULL';
  return totalPaid > 0 ? 'PARTIALLY_PAID' : 'OUTSTANDING';
}
```

- [ ] **Step 4: Use it in the existing create branch**

In the `fee_payments` branch of `save()` (the `UPDATE fee_obligations` call, currently around line 470-480), the status argument currently reads:

```ts
            totalPaid >= obligation.requiredAmount ? 'PAID_IN_FULL' : 'PARTIALLY_PAID',
```

Replace it with:

```ts
            computeObligationStatus(totalPaid, obligation.requiredAmount),
```

This is behaviour-preserving for creates: a create always leaves `totalPaid > 0`, so the three-way rule returns exactly what the two-way one did.

- [ ] **Step 5: Run the full service suite to verify nothing regressed**

Run: `npx vitest run apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts`
Expected: PASS — the two new tests plus every pre-existing one.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/data/services/SchoolAdminModuleService.ts apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts
git commit -m "refactor(desktop): extract shared obligation status rule"
```

---

### Task 3: `SchoolAdminModuleService.reverseFeePayment`

**Files:**
- Modify: `apps/desktop/electron/data/services/SchoolAdminModuleService.ts`
- Modify: `apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts`

**Interfaces:**
- Consumes: `computeObligationStatus(totalPaid, requiredAmount, currentStatus?)` from Task 2; table `fee_payment_reversals` from Task 1.
- Produces: `reverseFeePayment(request: { paymentId: string; reason: string; notes?: string }): { id: string }` — returns the new reversal row's id. Task 4 wires IPC to this exact signature.

- [ ] **Step 1: Write the failing tests**

Add to `apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts`. This helper seeds an obligation plus payments; place it inside the `describe` block next to `setup()`:

```ts
  function seedPaidObligation(
    service: SchoolAdminModuleService,
    amounts: readonly number[],
    requiredAmount = 5000,
  ) {
    const obligation = service.save({
      collection: 'fee_obligations',
      record: {
        studentId: 'student-1', feeRuleId: 'rule-1',
        academicYearId: 'year-1', termId: 'term-1',
        requiredAmount, totalPaid: 0, status: 'OUTSTANDING',
        dueDate: null, notes: null,
      },
    });
    const payments = amounts.map((amount, index) =>
      service.save({
        collection: 'fee_payments',
        record: {
          obligationId: String(obligation.id), studentId: 'student-1',
          amount, method: 'CASH', reference: null, notes: null,
          receiptNumber: `RCT-${index}`, recordedBy: '', isReversed: false,
          paidAt: new Date().toISOString(),
        },
      }),
    );
    return { obligationId: String(obligation.id), payments };
  }

  function obligationRow(workspaces: WorkspaceManager, id: string) {
    return workspaces.active.database.connection
      .prepare(`SELECT totalPaid,status FROM fee_obligations WHERE id=?`)
      .get(id) as { totalPaid: number; status: string };
  }

  it('re-aggregates the balance from the remaining non-reversed payments', () => {
    const { workspaces, service } = setup();
    const { obligationId, payments } = seedPaidObligation(service, [2000, 1000]);
    service.reverseFeePayment({ paymentId: String(payments[0]!.id), reason: 'wrong amount' });
    expect(obligationRow(workspaces, obligationId)).toEqual({
      totalPaid: 1000,
      status: 'PARTIALLY_PAID',
    });
  });

  it('returns the obligation to OUTSTANDING when its only payment is reversed', () => {
    const { workspaces, service } = setup();
    const { obligationId, payments } = seedPaidObligation(service, [5000]);
    service.reverseFeePayment({ paymentId: String(payments[0]!.id), reason: 'wrong student' });
    expect(obligationRow(workspaces, obligationId)).toEqual({
      totalPaid: 0,
      status: 'OUTSTANDING',
    });
  });

  it('marks the payment reversed and records the reason and actor', () => {
    const { workspaces, service } = setup();
    const { payments } = seedPaidObligation(service, [5000]);
    const paymentId = String(payments[0]!.id);
    service.reverseFeePayment({ paymentId, reason: 'duplicate entry', notes: 'receipt void' });
    const db = workspaces.active.database.connection;
    const payment = db.prepare(`SELECT isReversed FROM fee_payments WHERE id=?`).get(paymentId) as
      { isReversed: number };
    expect(payment.isReversed).toBe(1);
    const reversal = db
      .prepare(`SELECT reason,notes,reversedBy,syncedAt FROM fee_payment_reversals WHERE paymentId=?`)
      .get(paymentId) as { reason: string; notes: string | null; reversedBy: string; syncedAt: string | null };
    expect(reversal).toEqual({
      reason: 'duplicate entry',
      notes: 'receipt void',
      reversedBy: 'admin-1',
      syncedAt: null,
    });
  });

  it('refuses to reverse the same payment twice', () => {
    const { service } = setup();
    const { payments } = seedPaidObligation(service, [5000]);
    const paymentId = String(payments[0]!.id);
    service.reverseFeePayment({ paymentId, reason: 'first' });
    expect(() => service.reverseFeePayment({ paymentId, reason: 'second' })).toThrow(
      /already been reversed/i,
    );
  });

  it('refuses a blank reason, which the server would reject anyway', () => {
    const { service } = setup();
    const { payments } = seedPaidObligation(service, [5000]);
    expect(() =>
      service.reverseFeePayment({ paymentId: String(payments[0]!.id), reason: '   ' }),
    ).toThrow(/reason is required/i);
  });

  it('refuses a payment outside the active institution', () => {
    const { workspaces, service } = setup();
    const { payments } = seedPaidObligation(service, [5000]);
    const paymentId = String(payments[0]!.id);
    workspaces.active.database.connection
      .prepare(`UPDATE fee_payments SET institutionId='school-2' WHERE id=?`)
      .run(paymentId);
    expect(() => service.reverseFeePayment({ paymentId, reason: 'nope' })).toThrow(
      /outside this institution/i,
    );
  });

  it('writes no sync_queue rows — reversals push through their own path', () => {
    const { workspaces, service } = setup();
    const { payments } = seedPaidObligation(service, [5000]);
    const db = workspaces.active.database.connection;
    db.prepare(`DELETE FROM sync_queue`).run();
    service.reverseFeePayment({ paymentId: String(payments[0]!.id), reason: 'wrong amount' });
    const queued = db.prepare(`SELECT COUNT(*) count FROM sync_queue`).get() as { count: number };
    expect(queued.count).toBe(0);
  });

  it('restores sync capture even when the reversal fails', () => {
    const { workspaces, service } = setup();
    expect(() => service.reverseFeePayment({ paymentId: 'missing', reason: 'x' })).toThrow();
    const runtime = workspaces.active.database.connection
      .prepare(`SELECT captureEnabled FROM sync_runtime WHERE id='singleton'`)
      .get() as { captureEnabled: number };
    expect(runtime.captureEnabled).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts -t "re-aggregates"`
Expected: FAIL — `service.reverseFeePayment is not a function`.

- [ ] **Step 3: Implement the method**

Add to the `SchoolAdminModuleService` class, after `delete()`:

```ts
  /** Reverses a recorded payment offline. Mirrors the server's
   * ObligationsService.reversePayment: the payment is flagged rather than
   * edited, the obligation's total is RE-AGGREGATED from the remaining
   * non-reversed payments (never subtracted), and the reason is retained for
   * the audited push.
   *
   * Sync capture is suppressed throughout. Both writes below would be
   * rejected by the server's sync applier ("Payments are append-only"), and
   * the server recomputes the obligation itself when the reversal is pushed —
   * so the generic outbox must not carry either of them. The reversal reaches
   * the backend through FeeReversalSyncService instead. */
  reverseFeePayment(request: { paymentId: string; reason: string; notes?: string }): { id: string } {
    const { db, scopeId, userId } = this.context('fee_payments');
    const reason = request.reason.trim();
    if (!reason) throw new IPCError('A reason is required to reverse a payment.');

    const payment = db
      .prepare(`SELECT id,obligationId,institutionId,isReversed FROM fee_payments WHERE id=?`)
      .get(request.paymentId) as
      | { id: string; obligationId: string; institutionId: string; isReversed: number }
      | undefined;
    if (!payment) throw new IPCError('Payment not found.');
    if (payment.institutionId !== scopeId) {
      throw new ForbiddenError('This payment is outside this institution.');
    }
    if (payment.isReversed) throw new IPCError('This payment has already been reversed.');
    const existing = db
      .prepare(`SELECT id FROM fee_payment_reversals WHERE paymentId=?`)
      .get(request.paymentId) as { id: string } | undefined;
    if (existing) throw new IPCError('This payment has already been reversed.');

    const obligation = db
      .prepare(`SELECT requiredAmount,status FROM fee_obligations WHERE id=?`)
      .get(payment.obligationId) as { requiredAmount: number; status: string } | undefined;
    if (!obligation) throw new IPCError('The payment obligation no longer exists.');

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`UPDATE sync_runtime SET captureEnabled=0 WHERE id='singleton'`).run();
    try {
      db.transaction(() => {
        db.prepare(
          `INSERT INTO fee_payment_reversals
             (id,paymentId,institutionId,reason,notes,reversedBy,reversedAt,createdAt,updatedAt,syncedAt)
           VALUES (?,?,?,?,?,?,?,?,?,NULL)`,
        ).run(id, payment.id, scopeId, reason, request.notes ?? null, userId, now, now, now);
        db.prepare(`UPDATE fee_payments SET isReversed=1 WHERE id=?`).run(payment.id);
        const remaining = db
          .prepare(
            `SELECT COALESCE(SUM(amount),0) total FROM fee_payments
             WHERE obligationId=? AND isReversed=0`,
          )
          .get(payment.obligationId) as { total: number };
        db.prepare(`UPDATE fee_obligations SET totalPaid=?,status=?,updatedAt=? WHERE id=?`).run(
          remaining.total,
          computeObligationStatus(remaining.total, obligation.requiredAmount, obligation.status),
          now,
          payment.obligationId,
        );
      })();
    } finally {
      db.prepare(`UPDATE sync_runtime SET captureEnabled=1 WHERE id='singleton'`).run();
    }
    return { id };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts`
Expected: PASS — all 8 new tests plus every pre-existing one.

- [ ] **Step 5: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/data/services
git commit -m "feat(desktop): reverse a fee payment locally with re-aggregated balance"
```

---

### Task 4: IPC plumbing

**Files:**
- Modify: `packages/types/src/ipc.ts` (channel constant, near line 325)
- Modify: `packages/types/src/school-admin.ts` (request type)
- Modify: `packages/types/src/api.ts:213-217` (`SchoolAdminApi`)
- Modify: `apps/desktop/electron/security/validateIpc.ts`
- Modify: `apps/desktop/electron/ipc/handlers/shared/schoolAdmin.ts`
- Modify: `apps/desktop/electron/preload/shared/school-admin-records-api.ts`
- Modify: `apps/desktop/renderer/services/nemis-bridge/shared/collections-bridge.ts`

**Interfaces:**
- Consumes: `service.reverseFeePayment({ paymentId, reason, notes? })` from Task 3.
- Produces: `sharedBridge.reverseFeePayment(request: SchoolAdminReversePaymentRequest): Promise<{ id: string }>` for the renderer (Task 7), where `SchoolAdminReversePaymentRequest = { paymentId: string; reason: string; notes?: string }`.

- [ ] **Step 1: Add the channel constant**

In `packages/types/src/ipc.ts`, immediately after `SCHOOL_ADMIN_DELETE: 'school-admin:delete',`:

```ts
  SCHOOL_ADMIN_REVERSE_PAYMENT: 'school-admin:reverse-payment',
```

- [ ] **Step 2: Add the request type**

In `packages/types/src/school-admin.ts`, after `SchoolAdminDeleteRequest`:

```ts
export interface SchoolAdminReversePaymentRequest {
  paymentId: string;
  reason: string;
  notes?: string;
}
```

- [ ] **Step 3: Extend the API interface**

In `packages/types/src/api.ts`, add to `SchoolAdminApi` (importing `SchoolAdminReversePaymentRequest` alongside the existing school-admin request types):

```ts
  reversePayment(request: SchoolAdminReversePaymentRequest): Promise<{ id: string }>;
```

- [ ] **Step 4: Add the argument validator**

In `apps/desktop/electron/security/validateIpc.ts`, beside `assertSchoolAdminDeleteArgs`:

```ts
const REASON_MAX_LENGTH = 500;

export function assertSchoolAdminReversePaymentArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const request = args[0];
  if (!isPlainObject(request)) throw new IPCError('Expected a payment reversal request.');
  assertKnownKeys(request, ['paymentId', 'reason', 'notes']);
  assertString(request.paymentId, 'paymentId', ID_MAX_LENGTH);
  assertString(request.reason, 'reason', REASON_MAX_LENGTH);
  if (request.notes !== undefined) assertString(request.notes, 'notes', REASON_MAX_LENGTH);
}
```

If `REASON_MAX_LENGTH` (or an equivalent free-text constant) already exists in this file, reuse it rather than declaring a second one.

- [ ] **Step 5: Register the handler**

In `apps/desktop/electron/ipc/handlers/shared/schoolAdmin.ts`, add the import `assertSchoolAdminReversePaymentArgs` to the existing `@app/security/validateIpc` import, then add after the delete registration:

```ts
  handle(IpcChannels.SCHOOL_ADMIN_REVERSE_PAYMENT, assertSchoolAdminReversePaymentArgs, (request) =>
    service.reverseFeePayment(request),
  );
```

- [ ] **Step 6: Expose it in preload**

In `apps/desktop/electron/preload/shared/school-admin-records-api.ts`, add to the exported object:

```ts
  reversePayment: (request) => invoke(IpcChannels.SCHOOL_ADMIN_REVERSE_PAYMENT, request),
```

- [ ] **Step 7: Expose it on the renderer bridge**

In `apps/desktop/renderer/services/nemis-bridge/shared/collections-bridge.ts`, import `SchoolAdminReversePaymentRequest` with the other types and add:

```ts
  reverseFeePayment: (request: SchoolAdminReversePaymentRequest) =>
    api().schoolAdmin.reversePayment(request),
```

- [ ] **Step 8: Verify the channel is allow-listed**

Run: `grep -rn "SCHOOL_ADMIN_DELETE" apps/desktop/electron/ipc/authorizeChannel.ts apps/desktop/electron/preload/`
If `SCHOOL_ADMIN_DELETE` appears in a channel allow-list or role map, add `SCHOOL_ADMIN_REVERSE_PAYMENT` in the same place with the same roles. If it appears nowhere, no action is needed.

- [ ] **Step 9: Typecheck both sides**

Run: `cd apps/desktop && npx tsc --noEmit && npx tsc --noEmit -p renderer/tsconfig.json`
Expected: exit 0 for both.

- [ ] **Step 10: Run the IPC suites**

Run: `npx vitest run apps/desktop/electron/ipc apps/desktop/electron/security`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/types apps/desktop/electron/security apps/desktop/electron/ipc apps/desktop/electron/preload apps/desktop/renderer/services
git commit -m "feat(desktop): expose reverseFeePayment over IPC"
```

---

### Task 5: Gateway method

**Files:**
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts`

**Interfaces:**
- Consumes: the private `authorized(path, init, validate)` helper already in this file.
- Produces: `reverseFeePayment(paymentId: string, payload: { reason: string; notes?: string }): Promise<void>` — Task 6 calls this exact signature.

- [ ] **Step 1: Add the method**

In `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts`, add after `gradeSubmission`:

```ts
  /** Audited payment reversal. Hits the same endpoint portal-web uses, so
   * the server creates the FeePaymentReversal row, re-aggregates the
   * obligation and writes the audit-log entry. The generic /desktop/sync/push
   * route cannot carry this: its applier rejects every non-create operation
   * on fee_payments. */
  async reverseFeePayment(
    paymentId: string,
    payload: { reason: string; notes?: string },
  ): Promise<void> {
    await this.authorized(
      `/finance/school-admin/fee-payments/${encodeURIComponent(paymentId)}/reverse`,
      { method: 'POST', body: JSON.stringify(payload) },
      () => undefined,
    );
  }
```

- [ ] **Step 2: Confirm JSON bodies get a content-type**

Read the `authorized` helper's `headers` construction. `gradeSubmission` already sends a JSON string body through it, so a JSON content-type must already be applied for non-FormData bodies. Confirm this by reading the code; if `gradeSubmission` relies on something this method does not replicate, mirror it exactly.

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron/provisioning/BackendProvisioningGateway.ts
git commit -m "feat(desktop): add reverseFeePayment gateway call"
```

---

### Task 6: `FeeReversalSyncService` and worker wiring

**Files:**
- Create: `apps/desktop/electron/sync/FeeReversalSyncService.ts`
- Create: `apps/desktop/electron/sync/FeeReversalSyncService.test.ts`
- Modify: `apps/desktop/electron/sync/DesktopSyncWorker.ts`

**Interfaces:**
- Consumes: `gateway.reverseFeePayment(paymentId, { reason, notes })` from Task 5; table `fee_payment_reversals` from Task 1.
- Produces: `class FeeReversalSyncService { constructor(gateway: Pick<BackendProvisioningGateway, 'reverseFeePayment'>); pushPending(db: SqliteDatabase): Promise<void> }`.

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/electron/sync/FeeReversalSyncService.test.ts`:

```ts
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '@app/database/migrations/registry';
import { FeeReversalSyncService } from './FeeReversalSyncService';

function db(): SqliteDatabase {
  const connection = new Database(':memory:');
  for (const migration of migrations) migration.up(connection);
  return connection;
}

function seedReversal(connection: SqliteDatabase, paymentId = 'pay-1') {
  const now = new Date().toISOString();
  connection
    .prepare(
      `INSERT INTO fee_payment_reversals
         (id,paymentId,institutionId,reason,notes,reversedBy,reversedAt,createdAt,updatedAt,syncedAt)
       VALUES (?,?,?,?,?,?,?,?,?,NULL)`,
    )
    .run(`rev-${paymentId}`, paymentId, 'school-1', 'wrong amount', null, 'admin-1', now, now, now);
}

function queuePaymentCreate(connection: SqliteDatabase, paymentId: string, status: string) {
  const now = new Date().toISOString();
  connection
    .prepare(
      `INSERT INTO sync_queue
         (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt)
       VALUES (?,?,?,'create','{}',0,?,?,?)`,
    )
    .run(`q-${paymentId}`, 'fee_payments', paymentId, status, now, now);
}

function syncedAt(connection: SqliteDatabase, paymentId = 'pay-1') {
  return (
    connection
      .prepare(`SELECT syncedAt FROM fee_payment_reversals WHERE paymentId=?`)
      .get(paymentId) as { syncedAt: string | null }
  ).syncedAt;
}

describe('FeeReversalSyncService', () => {
  let connection: SqliteDatabase;
  beforeEach(() => {
    connection = db();
  });

  it('pushes a pending reversal and marks it synced', async () => {
    seedReversal(connection);
    const reverseFeePayment = vi.fn().mockResolvedValue(undefined);
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(reverseFeePayment).toHaveBeenCalledWith('pay-1', { reason: 'wrong amount', notes: undefined });
    expect(syncedAt(connection)).not.toBeNull();
  });

  it('waits while the payment\'s own create is still queued', async () => {
    seedReversal(connection);
    queuePaymentCreate(connection, 'pay-1', 'pending');
    const reverseFeePayment = vi.fn().mockResolvedValue(undefined);
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(reverseFeePayment).not.toHaveBeenCalled();
    expect(syncedAt(connection)).toBeNull();
  });

  it('pushes once that create has completed', async () => {
    seedReversal(connection);
    queuePaymentCreate(connection, 'pay-1', 'completed');
    const reverseFeePayment = vi.fn().mockResolvedValue(undefined);
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(reverseFeePayment).toHaveBeenCalledTimes(1);
    expect(syncedAt(connection)).not.toBeNull();
  });

  it('treats an already-reversed conflict as converged', async () => {
    seedReversal(connection);
    const reverseFeePayment = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Payment has already been reversed'), { status: 409 }));
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(syncedAt(connection)).not.toBeNull();
  });

  it('records a conflict and stops retrying when the payment is unknown to the server', async () => {
    seedReversal(connection);
    const reverseFeePayment = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Payment not found'), { status: 404 }));
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(syncedAt(connection)).not.toBeNull();
    const conflicts = connection
      .prepare(`SELECT entityType,entityId,status FROM sync_conflicts`)
      .all() as { entityType: string; entityId: string; status: string }[];
    expect(conflicts).toEqual([
      { entityType: 'fee_payment_reversals', entityId: 'pay-1', status: 'unresolved' },
    ]);
  });

  it('leaves the row dirty on a network error', async () => {
    seedReversal(connection);
    const reverseFeePayment = vi.fn().mockRejectedValue(new Error('offline'));
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(syncedAt(connection)).toBeNull();
  });

  it('does not let one failure stop the next reversal', async () => {
    seedReversal(connection, 'pay-1');
    seedReversal(connection, 'pay-2');
    const reverseFeePayment = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    await new FeeReversalSyncService({ reverseFeePayment }).pushPending(connection);
    expect(reverseFeePayment).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/desktop/electron/sync/FeeReversalSyncService.test.ts`
Expected: FAIL — cannot resolve `./FeeReversalSyncService`.

- [ ] **Step 3: Check how the gateway surfaces HTTP status**

Read `authorized`'s error path in `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts` and find how a non-2xx response is thrown — whether the thrown error carries a numeric `status`/`statusCode` property or only a message. Write `statusOf` in Step 4 to read whatever that path actually sets; if only a message is available, match on the message text instead and adjust the test's mock rejections to match. Do not guess.

- [ ] **Step 4: Implement the service**

Create `apps/desktop/electron/sync/FeeReversalSyncService.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import { logger } from '@app/services/logger';

interface ReversalRow {
  id: string;
  paymentId: string;
  reason: string;
  notes: string | null;
}

/** Pushes locally-recorded payment reversals to the backend's audited
 * reversal endpoint, deliberately outside the generic sync_queue: that
 * queue's server-side applier rejects every non-create operation on
 * fee_payments, so a reversal can only travel through this REST path. Same
 * arrangement as AssignmentSyncService — no backoff schedule and no
 * dead-lettering; a row that fails simply stays dirty for the next cycle. */
export class FeeReversalSyncService {
  constructor(
    private readonly gateway: Pick<BackendProvisioningGateway, 'reverseFeePayment'>,
  ) {}

  async pushPending(db: SqliteDatabase): Promise<void> {
    const rows = db
      .prepare(
        `SELECT id, paymentId, reason, notes FROM fee_payment_reversals WHERE syncedAt IS NULL`,
      )
      .all() as ReversalRow[];

    for (const row of rows) {
      // Ordering gate: the server can only reverse a payment it already has.
      // Anything other than 'completed' means this payment's create is still
      // in flight, still queued, or has failed and may yet retry — in every
      // one of those cases the reversal must wait rather than race ahead.
      const pendingCreate = db
        .prepare(
          `SELECT 1 FROM sync_queue
           WHERE entityType='fee_payments' AND entityId=? AND status<>'completed' LIMIT 1`,
        )
        .get(row.paymentId);
      if (pendingCreate) continue;

      try {
        await this.gateway.reverseFeePayment(row.paymentId, {
          reason: row.reason,
          notes: row.notes ?? undefined,
        });
        this.#markSynced(db, row.id);
      } catch (error) {
        const status = statusOf(error);
        if (status === 409) {
          // The payment was already reversed elsewhere. Both sides agree on
          // the outcome; only the reason differs, and the server's copy wins
          // on the next pull. Nothing left to push.
          logger.info(
            `FeeReversalSyncService: payment ${row.paymentId} was already reversed remotely.`,
          );
          this.#markSynced(db, row.id);
        } else if (status === 404) {
          // The create was rejected outright, so this reversal can never
          // land. Surface it for a human instead of retrying forever.
          this.#recordConflict(db, row, error);
          this.#markSynced(db, row.id);
        } else {
          logger.error(
            `FeeReversalSyncService: failed to push reversal for payment ${row.paymentId}`,
            error,
          );
        }
      }
    }
  }

  #markSynced(db: SqliteDatabase, id: string): void {
    db.prepare(`UPDATE fee_payment_reversals SET syncedAt=? WHERE id=?`).run(
      new Date().toISOString(),
      id,
    );
  }

  #recordConflict(db: SqliteDatabase, row: ReversalRow, error: unknown): void {
    db.prepare(
      `INSERT INTO sync_conflicts
         (id,operationId,entityType,entityId,operationType,localPayload,remotePayload,reason,status,createdAt,resolvedAt)
       VALUES (?,NULL,'fee_payment_reversals',?,'create',?,NULL,?,'unresolved',?,NULL)`,
    ).run(
      randomUUID(),
      row.paymentId,
      JSON.stringify({ reason: row.reason, notes: row.notes }),
      error instanceof Error
        ? error.message
        : 'The server does not have the payment this reversal belongs to.',
      new Date().toISOString(),
    );
  }
}

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/desktop/electron/sync/FeeReversalSyncService.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Wire it into the sync worker**

In `apps/desktop/electron/sync/DesktopSyncWorker.ts`:

Add the import beside the `AssignmentSyncService` import:

```ts
import { FeeReversalSyncService } from './FeeReversalSyncService';
```

Add the field beside `assignmentSync`:

```ts
  private readonly feeReversalSync: FeeReversalSyncService;
```

Initialise it beside `this.assignmentSync = new AssignmentSyncService(gateway);`:

```ts
    this.feeReversalSync = new FeeReversalSyncService(gateway);
```

Then insert the push **after** the `if (claimed.length > 0) { ... }` block closes and **before** the `const stillPending = ...` query — not next to the assignment push, which runs before the queue drains:

```ts
      // Runs after the generic queue push so a payment created in this same
      // cycle is already marked 'completed', letting its reversal through the
      // ordering gate immediately instead of waiting a full cycle. A failure
      // here must never abort the pull below.
      try {
        await this.feeReversalSync.pushPending(workspace.database.connection);
      } catch (error) {
        logger.error('FeeReversalSyncService.pushPending failed', error);
      }
```

- [ ] **Step 7: Run the sync suite**

Run: `npx vitest run apps/desktop/electron/sync`
Expected: PASS, including the pre-existing `DesktopSyncWorker.test.ts`.

- [ ] **Step 8: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/electron/sync
git commit -m "feat(desktop): push offline payment reversals to the audited endpoint"
```

---

### Task 7: Reverse control in the payment history panel

**Files:**
- Modify: `apps/desktop/renderer/components/finance/shared.tsx`
- Modify: `apps/desktop/renderer/components/finance/PaymentHistoryPanel.tsx`

**Interfaces:**
- Consumes: `sharedBridge.reverseFeePayment({ paymentId, reason, notes? })` from Task 4.
- Produces: no exports other tasks depend on. This is the last task.

- [ ] **Step 1: Add the data helpers**

In `apps/desktop/renderer/components/finance/shared.tsx`, add after `recordPayment`:

```tsx
/** Reverses a payment locally and queues it for the audited server-side
 * reversal. The obligation's balance is recomputed by the main process in the
 * same transaction, so callers only need to reload. */
export async function reverseFeePayment(params: {
  paymentId: string;
  reason: string;
  notes?: string;
}): Promise<{ id: string }> {
  return sharedBridge.reverseFeePayment(params);
}

```

**Deviation from the spec, decided here:** the spec's "pending sync" marker is **dropped** and deferred. Reading it would mean exposing `fee_payment_reversals` through the generic collection API, and that API's `save` is a single shared write path — publishing the table there would also hand every caller a way to write reversal rows directly, bypassing `reverseFeePayment` and its balance re-aggregation. A read-only collection flag does not exist today. The marker is worth having, but it needs either that flag or a dedicated typed read endpoint, and neither belongs in this plan. Do not add `fee_payment_reversals` to `SCHOOL_ADMIN_COLLECTIONS`.

- [ ] **Step 2: Add reversal state to the panel**

In `apps/desktop/renderer/components/finance/PaymentHistoryPanel.tsx`, import the new helper and `RotateCcw`:

```tsx
import { RotateCcw, X } from 'lucide-react';
import { formatCurrency, listPaymentsForObligation, reverseFeePayment } from './shared';
```

Add state inside the component, beside the existing `payments` state:

```tsx
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
```

and a handler, after the existing effects:

```tsx
  const reload = () => {
    if (!obligationId) return;
    void listPaymentsForObligation(obligationId).then(setPayments);
  };

  const handleReverse = async (paymentId: string) => {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await reverseFeePayment({ paymentId, reason: reason.trim() });
      setReversingId(null);
      setReason('');
      reload();
      onReversed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reverse this payment.');
    } finally {
      setSubmitting(false);
    }
  };
```

Add `onReversed: () => void;` to the component's props type, and pass it from `RecordPaymentPage.tsx` as `onReversed={reloadObligations}` so the table's balances refresh behind the panel.

- [ ] **Step 3: Render the control**

Replace the payment row's right-hand cell — currently the block that renders only the "Reversed" pill — with:

```tsx
                      {payment.isReversed ? (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400">
                          Reversed
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setReversingId(reversingId === String(payment.id) ? null : String(payment.id));
                            setReason('');
                            setError('');
                          }}
                          aria-label="Reverse this payment"
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
```

and add, directly after the `flex items-start justify-between` div that closes the row's top line:

```tsx
                    {reversingId === String(payment.id) && (
                      <div className="mt-2 space-y-2">
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason for reversal"
                          autoFocus
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-red-400"
                        />
                        {error && <p className="text-xs text-error">{error}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setReversingId(null); setReason(''); setError(''); }}
                            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReverse(String(payment.id))}
                            disabled={submitting || !reason.trim()}
                            className="flex-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600 disabled:opacity-50"
                          >
                            {submitting ? 'Reversing…' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    )}
```

- [ ] **Step 4: Typecheck the renderer**

Run: `cd apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Lint**

Run: `npx eslint apps/desktop/renderer/components/finance`
Expected: exit 0, no output.

- [ ] **Step 6: Run the full desktop suite for regressions**

Run: `npx vitest run apps/desktop/electron/data apps/desktop/electron/sync apps/desktop/electron/database apps/desktop/renderer/components`
Expected: PASS. Note the repo has ~52 pre-existing failing test files unrelated to finance (login page and others) — compare against a stash of your changes if anything looks suspicious, and do not claim these as regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/components/finance
git commit -m "feat(desktop): reverse a payment from the history panel"
```

---

## Manual Verification

Automated tests cover the write path, the push path and the schema, but not the round trip. Before calling this done, run the app (`pnpm dev`) and confirm:

1. Record a payment, open the history panel, reverse it with a reason. The balance and status in the table behind the panel update immediately.
2. The reversed payment shows struck-through with the "Reversed" pill and no reverse button.
3. Reversing the only payment returns the student to **Outstanding**, not Partial.
4. With the network off, reverse a payment; reconnect and confirm on portal-web that the payment shows as reversed, with your reason on the `FeePaymentReversal` record.
5. Reverse a payment on portal-web, wait for the desktop's next pull (≤5 min), and confirm the desktop shows it reversed with corrected balances.
