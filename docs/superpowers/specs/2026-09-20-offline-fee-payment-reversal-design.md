# NEMIS Desktop — Offline Fee Payment Reversal Design

**Date:** 2026-09-20
**Status:** Approved
**Scope:** Desktop-only. Adds an audited, offline-capable payment reversal to the school-admin finance module. No server changes, no portal-web changes, no new backend endpoints.

## Goal

Let a school admin correct a wrongly recorded fee payment from the desktop app while offline, and have that correction reach the server as a genuine audited reversal once connectivity returns.

Today the desktop can record payments but can never correct them. Three independent guards block it:

| Guard | Location | Message |
| --- | --- | --- |
| Update an existing payment | `SchoolAdminModuleService.ts:375` | `Payments are append-only. Use a payment reversal.` |
| Delete a payment | `SchoolAdminModuleService.ts:492-507` | `This record type cannot be deleted offline.` |
| Push a non-create payment op | `desktop-sync-applier.ts:1723` (server) | `Payments are append-only; use the audited reversal workflow.` |

The consequence is a window — from the moment a bad payment is recorded until it syncs — in which nobody can fix it: the desktop refuses to touch it, and the portal cannot see it yet. On a school with poor connectivity that can be days.

## Non-Goals

- **No server changes.** The reversal endpoint, its audit log and its re-aggregation already exist and are correct. We call them.
- **No reversal-of-a-reversal.** Matching the server, a payment may be reversed exactly once.
- **No display of reversal reasons for remotely-reversed payments.** The server snapshot does not send `FeePaymentReversal` rows to desktop, so a web-side reversal arrives as a bare `isReversed` flag. Portal's own history panel does not show reasons either, so there is no parity loss. Surfacing reasons everywhere requires a server snapshot change and is separate work.
- **No changes to the generic outbox machinery** (retry schedules, dead-lettering, conflict UI) beyond writing one `sync_conflicts` row in the unrecoverable case.

## Decisions Made

| Decision | Choice | Rationale |
| --- | --- | --- |
| Push mechanism | **Dedicated REST path** to `POST /finance/school-admin/fee-payments/:id/reverse` | The server's sync-applier explicitly rejects non-create ops on `fee_payments`, so the generic outbox is closed by design. The endpoint already performs the audited reversal. Precedent: `AssignmentSyncService`. |
| Auth | Existing user session via `BackendProvisioningGateway.authorized()` | `createAssignment` already calls the ordinary role-guarded `/teacher/assignments` route this way, so desktop can reach `/finance/school-admin/*` as the logged-in `INSTITUTION_ADMIN`. |
| Local balance update | **Optimistic**, applied immediately in the same transaction | The cashier needs the corrected balance at once to re-record. The server re-aggregates authoritatively and the next pull overwrites our values. |
| Balance arithmetic | **Re-aggregate** from non-reversed payments, never subtract | Mirrors `obligations.service.ts:486-493`. Self-correcting if any earlier drift exists. |
| Outbox capture during reversal | **Suppressed** (`captureEnabled = 0`) | The payment flip and obligation update would both be rejected by the applier; the server redoes them itself. Precedent: the existing payment-create branch at `SchoolAdminModuleService.ts:470-483`. |
| Unsynced payment | **Send both, in order** — create first, then reversal | Keeps a complete server-side audit trail: the mistake and its correction both appear, exactly as if they had happened online. |
| Reversal scope | **Any payment the desktop can see**, including web-originated ones | Matches the portal. A cashier fixes what is wrong in front of them regardless of where it was entered. |
| Reverse-once enforcement | Local `UNIQUE` index on `paymentId` | Mirrors the server's 409 locally so the UI can refuse before any write. |
| Outbox trigger on the new table | **None** | It pushes via its own path. Precedent: migration 019, which dropped dead assignment outbox triggers for the same reason. |

## Data Model

New migration `023-create-fee-payment-reversals`.

```sql
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
```

`syncedAt IS NULL` is the dirty flag the push path selects on — the same convention `AssignmentSyncService` uses for assignments.

The table is **not** added to `MUTABLE_TABLES` and gets no outbox triggers. The migration must carry a comment saying so and why, or a later developer will "fix" the omission.

## Local Write Path

New IPC command `schoolAdmin:reverseFeePayment` → `SchoolAdminModuleService.reverseFeePayment(request)`.

```
request: { paymentId: string; reason: string; notes?: string }
```

Executed in a single SQLite transaction with `captureEnabled = 0`, restored in a `finally`:

1. Load the payment. Reject with `IPCError` if missing.
2. Assert `payment.institutionId === scopeId`, else `ForbiddenError` — same scope check the create path performs.
3. Reject if `payment.isReversed` is already set, or a `fee_payment_reversals` row already exists for it: `'This payment has already been reversed.'`
4. Reject a blank/whitespace `reason` — the server's DTO requires it, so failing early avoids a guaranteed-to-fail push.
5. `INSERT` the reversal row: fresh uuid, `reversedBy = userId`, `reversedAt = now`, `syncedAt = NULL`.
6. `UPDATE fee_payments SET isReversed = 1 WHERE id = ?`.
7. Re-aggregate: `SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE obligationId = ? AND isReversed = 0`.
8. `UPDATE fee_obligations SET totalPaid = ?, status = ?, updatedAt = ?`.

### Status computation

Step 8 must use the server's three-way rule, not the create path's two-way one:

```
WAIVED                       → stays WAIVED
totalPaid >= requiredAmount  → PAID_IN_FULL
totalPaid > 0                → PARTIALLY_PAID
otherwise                    → OUTSTANDING
```

The existing create branch (`SchoolAdminModuleService.ts:478`) only ever yields `PAID_IN_FULL` or `PARTIALLY_PAID`, which is sound when totals only grow. Reusing it here would leave a student whose only payment was just reversed showing "Partial" against a zero balance. Extract the rule as a shared helper so both paths agree.

## Push Path

### Gateway

```ts
async reverseFeePayment(
  paymentId: string,
  payload: { reason: string; notes?: string },
): Promise<void>
```

`POST` to `/finance/school-admin/fee-payments/{paymentId}/reverse` via `this.authorized(...)`, JSON body, no response validation needed beyond a 2xx.

### FeeReversalSyncService

Modelled on `AssignmentSyncService`: a `pushPending(db)` method invoked by `DesktopSyncWorker` **after** the generic queue has drained in the same cycle, so a payment created moments earlier has already had its chance to go up.

Selects `WHERE syncedAt IS NULL`, and for each row applies the **ordering gate**:

> Skip this reversal if `sync_queue` still holds a row with `entityType = 'fee_payments'` AND `entityId = <paymentId>` AND `status <> 'completed'`.

`sync_queue.status` is one of `pending | in_flight | completed | failed` (migration 001). Gating on "anything but `completed`" covers the `failed` case too: if the create keeps failing, the reversal correctly waits rather than racing ahead to a 404. Should that create ultimately be rejected outright, the 404 branch below is the backstop.

A skipped reversal stays dirty and is retried next cycle, by which time the create has normally landed. This is what guarantees the server sees the payment before its reversal.

### Outcome handling

| Outcome | Action |
| --- | --- |
| 2xx | Set `syncedAt`. Done. |
| 409 *already reversed* | Set `syncedAt`. Both sides agree the payment is reversed; only the reason/`reversedBy` differ, and the server's win on the next pull is acceptable. Log at info. |
| 404 *payment not found* | The create was rejected server-side, so the reversal can never land. Write a `sync_conflicts` row (`entityType = 'fee_payment_reversals'`, `operationType = 'create'`, reason from the response) and set `syncedAt` so it stops retrying. |
| Any other error | Leave `syncedAt` NULL, log, retry next cycle. No backoff — matching the bespoke assignment path. |

## Pull and Reconciliation

No changes required. Both halves already work:

- The reversed payment comes back down because the server's snapshot query matches on the reversal's own timestamp — `desktop-provisioning.service.ts:404-415` ORs `createdAt > since` with `reversal.reversedAt > since`, precisely because `FeePayment` has no `updatedAt` column.
- The obligation's authoritative `totalPaid`/`status` come down on its own `updatedAt`.

`ProvisioningImporter` then overwrites our optimistic values. Because step 7 mirrors the server's arithmetic exactly, the two should already agree; if they ever disagree, the server wins, which is correct.

## UI

In `PaymentHistoryPanel.tsx` (desktop), mirroring portal's `StudentPaymentHistoryPanel`:

- Each non-reversed payment gets a `RotateCcw` button.
- Clicking it reveals a mandatory reason input with Cancel / Confirm, Confirm disabled while the reason is blank.
- On confirm, call the new IPC command, then refresh the panel and the underlying table so the corrected balance and status appear at once.
- Reversed payments render struck-through with the existing "Reversed" pill and no button.
- Failures render inline in the panel, not as a toast — consistent with how `PaymentRow` reports its errors.

**Addition beyond portal parity:** a reversal whose `syncedAt` is still NULL shows a small muted "pending sync" marker. Portal has no equivalent, but this is the offline app, and silently hiding un-pushed state is what made the original gap confusing. Flagged here so it is a conscious divergence.

## Testing

Vitest, matching existing suites in `apps/desktop/electron/data/services/` and `apps/desktop/electron/sync/`.

`SchoolAdminModuleService.reverseFeePayment`:
- re-aggregates `totalPaid` from remaining non-reversed payments
- transitions status `PAID_IN_FULL → PARTIALLY_PAID` when one of several payments is reversed
- transitions status to **`OUTSTANDING`** when the only payment is reversed (the regression the shared helper exists to prevent)
- leaves a `WAIVED` obligation `WAIVED`
- rejects a second reversal of the same payment
- rejects a payment outside the caller's institution
- rejects a blank reason
- **writes no `sync_queue` rows** — asserts the `captureEnabled` suppression actually held
- restores `captureEnabled = 1` even when the transaction throws

`FeeReversalSyncService.pushPending`:
- skips a reversal whose payment still has a pending `sync_queue` row, leaving it dirty
- pushes once that row is gone, and marks `syncedAt`
- treats 409 as converged and marks `syncedAt`
- writes a `sync_conflicts` row on 404 and stops retrying
- leaves the row dirty on a network error

Migration `023`: table and indexes created; unique index rejects a duplicate `paymentId`; no outbox triggers exist for the table.

## Files Touched

**New**
- `apps/desktop/electron/database/migrations/023-create-fee-payment-reversals.ts` (+ test)
- `apps/desktop/electron/sync/FeeReversalSyncService.ts` (+ test)

**Modified**
- `apps/desktop/electron/database/migrations/registry.ts` — register 023
- `apps/desktop/electron/database/schema/tableNames.ts` — add the table
- `apps/desktop/electron/data/services/SchoolAdminModuleService.ts` — `reverseFeePayment`, shared status helper
- `apps/desktop/electron/ipc/` — register `schoolAdmin:reverseFeePayment`
- `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts` — `reverseFeePayment`
- `apps/desktop/electron/sync/DesktopSyncWorker.ts` — invoke the new service after the queue drain
- `apps/desktop/electron/preload/school-admin/` + `packages/types` — IPC channel and request/response types
- `apps/desktop/renderer/services/nemis-bridge/` — bridge method
- `apps/desktop/renderer/components/finance/shared.tsx` — `reverseFeePayment` helper, `listReversals`
- `apps/desktop/renderer/components/finance/PaymentHistoryPanel.tsx` — reverse control

## Risks

| Risk | Mitigation |
| --- | --- |
| Reversal pushed before its payment exists server-side | The ordering gate; 404 handling as a backstop |
| Optimistic local totals diverge from the server | Arithmetic mirrors the server exactly; the pull overwrites ours, server wins |
| A developer later adds the table to `MUTABLE_TABLES` | Explicit comment in the migration explaining the omission |
| Two devices reverse the same payment | Server returns 409; both converge on "reversed"; reason is whichever landed first |
| `captureEnabled` left at 0 after a throw, silently disabling all sync capture | `finally` restore, plus a dedicated test |
