# Guardian Account Linking — Design

**Date:** 2026-08-16
**Status:** Approach approved; mechanism in §2 revised after verifying
`DesktopSyncApplier`'s actual instantiation pattern — pending final review
before handoff to the implementation plan.
**Repos affected:** `desktop-client-nemis` (primary), `Nemis` (backend sync applier)

## Problem

When a School Admin creates a student on the **web** portal, `POST /students`
(`Nemis/apps/Server/src/students/students.service.ts`) collects the
guardian's email and either links the student to that guardian's *existing*
user account (if the email is already registered) or creates a new parent
account and links it. This flow is entirely missing on the **desktop**
client:

1. The desktop `Guardian` domain entity has no `email` field at all — it is
   structurally impossible for a guardian's email to reach the backend
   today, even though the SQLite `guardians` table already has an `email`
   column (migration 004) and the read-only `GuardiansDirectoryPage`
   already renders it if present.
2. Even where the backend's generic desktop-sync path
   (`Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.ts`,
   `guardian()` handler) *does* attempt to create a linked account for a new
   guardian, it has no equivalent of the web's "email already registered →
   reuse existing account" branch. Today it catches
   `EmailAlreadyRegisteredError` and silently accepts an orphaned Guardian
   row with no `userId`, which is invisible to that parent's account —
   admissions for a second child never show up for a parent who already has
   an account from an earlier child.

## Goals

- A guardian's email (and the already-columned `address`, `occupation`,
  `isEmergencyContact`) is captured in the desktop wizard and reaches the
  backend via the existing sync outbox — no SQLite schema or
  outbox-trigger changes needed on the desktop side, since outbox triggers
  already snapshot every column via `PRAGMA table_info`. (The backend does
  need one small Postgres migration — see Design §2.)
- When that email already belongs to an account (with or without a
  guardian profile), the new student is linked to the **existing** guardian
  record — never a second, disconnected one — matching web's behavior.
- Resolution happens uniformly at sync-push time, regardless of whether the
  device was online or offline when the guardian was created (no live
  "does this email exist" check in the desktop UI — see Non-goals).
- Local SQLite stays consistent with Postgres after a redirect, so a later
  snapshot pull does not create a duplicate guardian/link pair.

## Non-goals

- No live "this guardian already has an account" preview banner in the
  desktop wizard (would be an online-only affordance bolted onto an
  offline-first flow; explicitly decided against — see design discussion).
- No new "pick an existing local guardian" UI (the `linkGuardian` command
  already exists in `students-view-model.ts` but is unused by any renderer
  page today; out of scope here, unaffected by this change).
- No changes to the SIS/parent-portal app's queries.
- No changes to how *brand-new* guardians (no matching account) get linked
  — that path already works correctly today on both web and desktop-sync.

## Design

### 1. Desktop: capture the guardian's email

- `packages/domain/src/students/entities/guardian.ts`: `Guardian` gains
  optional `email`, `address`, `occupation`, and `isEmergencyContact`
  (default `false`), on both `create()` and `reconstitute()`, following the
  same optional-field pattern already used by `Student`.
- `packages/application/src/dto/students/student-dto.ts`:
  `CreateGuardianDto` gains the same four fields.
- `packages/application/src/use-cases/students/create-guardian.ts`: passes
  the new fields into `Guardian.create()`.
- `apps/desktop/electron/data/repositories/sqlite/business/SqliteGuardianRepository.ts`:
  `Row`, `map()`, `findById`, `save` (its `INSERT ... ON CONFLICT` column
  list), and `findByStudentId` all gain the four columns. The columns
  already exist in SQLite (migration 004); this is purely wiring.
- `apps/desktop/renderer/components/students/StudentFormPage.tsx`:
  `GuardianDraft` gains `email` (string); `GuardianStep` gets one more
  `<Input type="email">` alongside the existing name/phone fields;
  `submitCreate()`'s `createGuardian(...)` call passes it through. (Address
  and occupation stay unexposed in the *creation* wizard — the web
  creation flow doesn't collect them either; they exist on the entity
  purely because the SQLite/view layer already expects them, and could be
  added to an edit surface later if ever needed. Only `email` is required
  for this fix.)
- No outbox or migration changes: `installOutboxTriggers` derives its
  column list from `PRAGMA table_info` at trigger-creation time, and these
  columns already exist in that table, so `email` etc. are already being
  captured into `sync_queue.payload` on every insert/update — they've just
  always been `NULL` because nothing wrote them.

### 2. Backend: check-then-link, not create-then-catch

**Constraint that shapes this section:** `DesktopSyncApplier` is
constructed fresh *inside* the per-operation loop in
`desktop-provisioning.service.ts` (`processPush`, roughly lines 812-828),
each instance wrapped in its own `$transaction`, one operation at a time.
Nothing survives in memory between processing the guardian-create
operation and processing its own student-link-create operation, even
though both are typically in the same push request — so the redirect has
to be persisted durably by the first, not held in memory for the second.

**Schema change (Nemis, one migration):** `Guardian` gains a nullable
self-referencing column:

```prisma
model Guardian {
  // ...existing fields...
  mergedIntoGuardianId String?
  mergedIntoGuardian   Guardian?  @relation("GuardianMerge", fields: [mergedIntoGuardianId], references: [id])
  mergedGuardians       Guardian[] @relation("GuardianMerge")
}
```

No uniqueness constraint on `mergedIntoGuardianId` — many locally-created
duplicate rows (one per sibling admission, across any number of devices)
can legitimately point at the same canonical guardian.

**`guardian()` handler**, for a **create** operation with a non-empty
`email`, looks up
`prisma.user.findUnique({ where: { email }, include: { guardianProfile: true } })`
*before* touching the `guardians` table (case-insensitive, matching the
web service's normalization):

- **No matching user** → unchanged from today: upsert the row at
  `operation.entityId`, then `createLinkedUserAccount` (`PARENT` role) and
  set `userId` on that same row. Returns `accepted()` with a `credential`,
  as today.
- **Matching user with a `guardianProfile`** → upsert the row at
  `operation.entityId` as a *thin marker*: the normal fields (name,
  phone, etc. — kept for audit/history, not shown anywhere), but
  `userId: null` and `mergedIntoGuardianId: user.guardianProfile.id`.
  Return `{ ...accepted(), redirectedTo: user.guardianProfile.id }`.
- **Matching user without a `guardianProfile`** (e.g. a staff account
  that later becomes a parent) → upsert the row at `operation.entityId`
  as today, and link it to that user's `id` via `createLinkedUserAccount`'s
  existing "reuse user, create profile" path (mirrors
  `students.service.ts`'s third branch). No redirect — this row *is* the
  canonical one now.
- A **race** (two devices register the same brand-new email concurrently)
  can still make `createLinkedUserAccount` throw
  `EmailAlreadyRegisteredError` even after the pre-check passed. On that
  catch, re-look-up by email and take the "matching user with a profile"
  branch above (mark this row as merged) instead of today's silent-orphan
  `accepted()`.
- **Update/delete** operations need no special-casing: a merged row is
  still a real row, so the existing upsert/delete logic (and the existing
  `mutationDecision` conflict check ahead of it) applies unchanged. The
  local device may still send edits to a row it doesn't yet know was
  merged — those just update the marker's own cosmetic fields, which is
  harmless since nothing reads a merged row for anything but the
  `mergedIntoGuardianId` redirect.

**`studentGuardian()` handler** resolves the guardian id through this
column before its existing "does this guardian exist" lookup:
`const target = await prisma.guardian.findUnique({ where: { id: guardianId }, select: { mergedIntoGuardianId: true } }); const resolvedGuardianId = target?.mergedIntoGuardianId ?? guardianId;`
— then uses `resolvedGuardianId` for the actual FK. This works regardless
of whether the link-create lands in the same push batch as its guardian's
create, an earlier one, or a much later one (e.g. the device redirects
this guardian for a third sibling admitted months later) — it only
depends on the (already-committed, durable) row, not on batch timing.

### 3. Protocol: `redirectedTo`

`packages/types/src/sync.ts` (desktop-client-nemis) and its mirrored DTO on
the Nemis server side both gain one optional field on the operation result:

```ts
export interface DesktopSyncOperationResult {
  operationId: string;
  entityType: string;
  entityId: string;
  status: 'accepted' | 'conflict';
  reason?: string;
  remotePayload?: Readonly<Record<string, unknown>> | null;
  /** Set when the server reused an existing record instead of creating one
   *  at `entityId` — the canonical id the local device should adopt. */
  redirectedTo?: string;
}
```

Generic on purpose (not guardian-specific in name or typing) so a future
entity with the same "reuse-by-natural-key" requirement doesn't need a
second bespoke mechanism — but no other entity is touched by this change.

### 4. Desktop: local canonicalization

`apps/desktop/electron/sync/DesktopSyncWorker.ts`, inside the existing
`runImmediate` transaction in `syncActive()` that currently handles
`conflict` results and marks queue items completed, add handling for any
result with `redirectedTo` set (currently only possible for
`entityType === 'guardians'`):

```sql
UPDATE guardians SET id = :canonical WHERE id = :local;
UPDATE student_guardians SET guardianId = :canonical WHERE guardianId = :local;
UPDATE sync_queue
   SET payload = json_set(payload, '$.record.guardianId', :canonical)
 WHERE entityType = 'student_guardians'
   AND status IN ('pending','in_flight')
   AND json_extract(payload, '$.record.guardianId') = :local;
```

The first two mirror `AssignmentSyncService.pushAssignment`'s existing
canonicalize-local-pk-to-server-id pattern (cascading to
`assignment_submissions.assignmentId`). Here the redirected-from row *does*
still exist in Postgres (as a merged marker, per §2), so the failure mode
is milder than the assignments case (no missing-row duplicate on pull) —
but without this rewrite, the local device would keep a stale local
guardian row diverging from the canonical one (wrong name-edit target,
wrong display in `GuardiansDirectoryPage` if that marker round-trips
through a future snapshot), so it's still worth doing for consistency. The
third statement covers the case where the guardian-create and its
link-create did *not* land in the same push batch (e.g. a partial-failure
retry split them, or a much later sibling reuses this device's still-local
copy of the same guardian id) — the queued link operation's payload was
snapshotted at insert time with the old local id baked into its JSON text,
and rewriting the live `student_guardians` row (statement 2) does not
retroactively change that stored JSON blob.

`guardians.id` has no `FOREIGN KEY` other than `student_guardians`
referencing it (checked against migration 004's schema), so no further
cascade targets exist today.

## Error handling

- If the redirect lookup itself fails (network/db error mid-batch), the
  operation fails like any other today — existing retry/backoff/dead-letter
  machinery in `DesktopSyncWorker` applies unchanged.
- A malformed/missing `redirectedTo` value (defensive: not a valid
  known-format id) is treated as no redirect — the local row keeps its
  original id and this is logged, not thrown, consistent with the
  project's "one malformed field must not abort the whole push batch"
  precedent from the attendance `updatedAt` fix.

## Testing

- `Guardian.create`/`reconstitute` unit tests cover the four new fields.
- `CreateGuardianUseCase` test asserts `email` flows from DTO through to
  the saved entity.
- `SqliteGuardianRepository` round-trip test: save with all new fields,
  `findById`/`findByStudentId` return them.
- `StudentFormPage.tsx` test: guardian email input renders and is included
  in the `createGuardian` call.
- `desktop-sync-applier.spec.ts` (Nemis repo) gains cases: new email
  creates an account (regression, must stay green); email matching an
  existing user *with* a profile creates a merged marker row
  (`mergedIntoGuardianId` set, `userId` null) and returns `redirectedTo`;
  email matching a user *without* a profile still creates a normal,
  unmerged row and links it; a student-link operation whose `guardianId`
  points at an already-merged row resolves to the canonical id (tested
  both in the same push batch as the guardian's own create, and as a
  separate, later call against an applier instance with no shared state,
  to prove the resolution is genuinely stateless/durable); an update
  against an already-merged row is accepted as a no-op; the
  `EmailAlreadyRegisteredError` race path also produces a merged marker
  instead of a bare orphaned row.
- `DesktopSyncWorker` test: a push result carrying `redirectedTo` rewrites
  `guardians.id`, cascades `student_guardians.guardianId`, and patches a
  still-pending queued link operation's payload.

## Open questions for implementation

None outstanding — both design-affecting decisions (no live preview UI;
auto-resolve silently rather than surfacing a manual conflict, both online
and offline) were made during brainstorming and are reflected above.
