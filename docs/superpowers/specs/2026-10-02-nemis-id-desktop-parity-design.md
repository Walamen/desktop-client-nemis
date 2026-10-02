# NEMIS ID Desktop Parity (School Admin) — Design

**Date:** 2026-10-02
**Repos:** `desktop-client-nemis` (most of the work) and `Nemis` (`apps/server`
only: the desktop sync applier and the provisioning snapshot).
**Builds on:** the Nemis-repo specs for the NEMIS ID programme —
`2026-09-20-nemis-id-foundation-design.md` (A),
`2026-09-22-grade-completion-stamp-design.md` (B, B.1, B.2),
`2026-09-27-student-registry-design.md` (C1),
`2026-09-27-lookup-first-enrollment-design.md` (C2),
`2026-09-28-transfer-lapse-client-design.md` (C3),
`2026-09-30-nemis-id-student-login-design.md` (student login).

---

## 1. Why this exists

The NEMIS ID programme was built in `portal-web` and the server. The desktop
client received only Phase A (the `nemisId` column, its display, and the
server-reassigned-ID correction in `DesktopSyncWorker`). Everything after it is
missing, and two desktop paths actively undermine what portal-web enforces:

1. **Transfer approval bypasses the transfer service.** The generic "Approve"
   button (`SchoolAdminModulePages.tsx:168`) writes `status: APPROVED` locally;
   the outbox ships it; `desktop-sync-applier.ts` `studentTransfer()` upserts the
   row directly. No student moves, no receiving enrolment is written, no row lock
   is taken, `initiatedBy`/`lapsesAt` are ignored, and either party — including
   the requester — can approve. The result is a transfer shown as APPROVED for a
   child who never moved: the exact defect C3 fixed in portal-web.
2. **Offline add mints duplicate national identities.** The desktop create
   wizard always creates. A transferring child added on desktop gets a second
   permanent ID, and the applier accepts any valid, unused client-minted ID.

Missing outright: lookup-first enrolment (C2), required class/term on creation
(B.1/B.2), the C3 transfers inbox, the End-of-Year Outcomes screen (B), the bulk
`nemisId` column (C2), and any mention of the NEMIS-ID student login.

## 2. Decisions (made during brainstorming — do not re-litigate)

| # | Decision |
|---|---|
| D1 | **Offline add is new-to-NEMIS only.** Offline, the wizard's Find step offers only the "this child has no NEMIS ID" assertion; the student is created locally and queued, with `assertedNoNemisId` recorded. Transferring children wait for a connection. |
| D2 | **End-of-Year Outcomes work offline and are queued**, pushed by a dedicated sync service — not online-only. |
| D3 | **Architecture A — an online-only command lane beside the sync queue.** Registry lookup/claim/request and transfer review/cancel/create are synchronous online calls; everything else stays offline-first. |
| D4 | **Transfers become pull-only through sync.** Desktop never writes `student_transfers` through the outbox again. |
| D5 | **The pull is the single writer of local truth.** Online responses are never written into SQLite directly; a successful online command triggers `SYNC_RUN`. |
| D6 | **Bulk claims reuse the server's `POST /students/bulk`** (its separate `registry:bulk` budget), never the interactive `/claim`. |
| D7 | **No optimistic grade/enrolment mutation** when an outcome is saved locally; the server's write arrives through the pull. |

## 3. Non-goals

- Teacher, DEO, county and ministry desktop roles (DEO's transfers list stays a
  read-only view; it simply stops being writable).
- Any change to portal-web, or to the server's registry, transfer or
  grade-completion services. Server changes are confined to the sync applier and
  the provisioning snapshot.
- Fixing the parked server problems listed in §11.
- Showing or changing the shared default password (deliberate; see memory
  "Shared default password is deliberate").
- Merging duplicate identities. D1 prevents new ones; existing duplicates are out
  of scope.

## 4. Staging

One spec, six stages. Each stage is independently mergeable and leaves both apps
working. Stages must land in order; later stages depend on earlier ones.

| Stage | Name | Server change | Depends on |
|---|---|---|---|
| 1 | Transfer safety | applier refuses transfer writes | — |
| 2 | Online lane | — | — |
| 3 | Lookup-first wizard | applier audits desktop creates | 2 |
| 4 | Transfers inbox | snapshot enriches transfer rows | 1, 2 |
| 5 | End-of-Year Outcomes | snapshot adds stamps + departed students | 1, 2 (guidance channel) |
| 6 | Bulk import + login note | applier guardian guard | 2, 3 |

**Deploy coupling.** Stage 1's server change must deploy before (or with) the
desktop release that removes the Approve button — otherwise an old desktop keeps
approving through the bypass. Stages 4 and 5 add snapshot fields; the desktop
importer must tolerate their absence (older server) by treating them as null /
empty, so desktop and server can deploy in either order.

---

## 5. Stage 1 — Transfer safety

### 5.1 Server: the applier refuses transfer writes

`desktop-sync-applier.ts`:

- `studentTransfer()` returns `conflict("Transfers are managed online — use the
  Transfers screen while connected.")` for **every** operation type, for every
  role. The method body that upserts is deleted, not left unreachable.
- `student_transfers` is removed from every role's writable-collection set
  (currently including `DEO` at line 91 and the institution-admin set at line 67).
- The conflict lands on the desktop's existing Sync Conflicts page. Any approval
  already queued on a deployed desktop is therefore surfaced, not half-applied.
  Nothing is lost: those approvals never moved a child.

The snapshot already ships whole transfer rows (`jsonRow`), so `initiatedBy`,
`lapsesAt`, `classId` and `termId` reach the desktop as soon as it stores them.

### 5.2 Desktop: local schema (migration 025)

- `student_transfers` gains `initiatedBy TEXT`, `lapsesAt TEXT`, `classId TEXT`,
  `termId TEXT` (all nullable; `initiatedBy` defaults to `'ORIGIN_SCHOOL'` for
  pre-existing rows, matching the server default).
- `ProvisioningImporter`'s `studentTransfers` column spec adds the four columns.
- The outbox trigger on `student_transfers` is dropped, following the
  trigger-regeneration pattern of migration 018. `SchoolAdminModuleService`
  treats the collection as read-only for every role (rejects
  create/update/delete with `ForbiddenError`).

### 5.3 Desktop: departures

Every inter-school move (approval, claim, completed lapse) leaves an `APPROVED`
transfer row whose `fromInstitutionId` is the school the child left, and that row
is already pulled. After each pull is applied:

> For each pulled transfer row with `status = 'APPROVED'` and
> `fromInstitutionId = <this workspace's institution>`, set the local student's
> `institutionId` to the row's `toInstitutionId` — **unless the same pull also
> contained that student's own row**, in which case the student row is the
> current truth (covers a child who left and returned within one sync window).

This write bypasses the outbox (it mirrors server state; it must never be pushed).
Enrolments, grades and attendance of the departed child are kept only until the
next full (24-hour, `merge: false`) resync, which deletes them: the snapshot
scopes those collections by the student's current institution
(`desktop-provisioning.service.ts:268-283`), and both server move paths update
`student.institutionId` before marking the origin enrolment TRANSFERRED, so the
origin never pulls it. Stage 5's snapshot widening is what makes the history
durable. *(Amended after Stage 1 final review.)*

**Planning must verify** that every school-admin list, count and dashboard query
filters students by the workspace institution, so a departed child disappears
from them. Any query that does not is a defect to fix in this stage.
*(Planning found they do not — `SqliteStudentRepository` counts/lists and the
generic `students` collection read the whole table. Stage 1 adds a
`workspaceStudentScope` SQL fragment; see the Stage 1 plan, Task 4.)*

### 5.4 UI

The generic Approve button and the `student_transfers` special case in
`SchoolAdminModulePages.tsx` are removed. Until Stage 4 lands, the transfers page
is a read-only list with the note "Review transfers on the web portal."

### 5.5 Tests

- Applier spec: create, update and delete of `student_transfers` are refused for
  institution admin and DEO; the conflict message is exact.
- Migration 025: columns added, trigger gone, existing rows default
  `initiatedBy`.
- Importer: the four new columns round-trip; absent columns import as null.
- Departure rule: moves a departed student; does **not** move one whose own row
  arrived in the same pull; never enqueues an outbox item.

---

## 6. Stage 2 — The online lane

### 6.1 Gateway (main process)

`BackendProvisioningGateway` gains typed methods:

| Method | Endpoint |
|---|---|
| `lookupStudent({ nemisId, dateOfBirth })` | `POST /student-registry/lookup` |
| `claimStudent(dto)` | `POST /student-registry/claim` |
| `requestRelease(dto)` | `POST /student-registry/request` |
| `createTransfer(dto)` | `POST /student-transfers` |
| `reviewTransfer(id, dto)` | `PATCH /student-transfers/:id/review` |
| `cancelTransfer(id)` | `DELETE /student-transfers/:id` |
| `getCohortGuidance(academicYearId, gradeLevel)` | `GET /enrollments/grade-completions` (Stage 5) |
| `bulkClaimStudents(dto)` | `POST /students/bulk` (Stage 6) |

Request/response shapes mirror the server DTOs and `Nemis/packages/types/src/nemis.ts`,
copied into `@nemis-desktop/types` (the desktop cannot import across repos). Each
copied type carries a comment naming its source file. **`claimPath` is never
sent.**

`authorized()` changes:

- A thrown `fetch` (network failure, DNS, `AbortSignal` timeout) becomes
  `OfflineError` (new, in `@nemis-desktop/shared`).
- A 4xx response other than 401/403 has its JSON body read; the server's
  `message` (string, or the first entry if an array) is attached as
  `RemoteRejectedError(status, message)`. 429 becomes `RateLimitedError(message)`.
- The existing `status` property on thrown errors is preserved — the fee-reversal
  service branches on it.

### 6.2 IPC

- New channels `REGISTRY_LOOKUP`, `REGISTRY_CLAIM`, `REGISTRY_REQUEST`,
  `TRANSFER_CREATE`, `TRANSFER_REVIEW`, `TRANSFER_CANCEL`,
  `GRADE_COMPLETION_GUIDANCE`, `STUDENT_BULK_CLAIM`, each with an assert-validator
  in `validateIpc.ts`. NEMIS IDs are normalised to 12 bare digits and
  Luhn-checked in the validator. All are `SCHOOL_ADMIN`-only in
  `authorizeChannel`.
- `toIpcError` gains three codes:

| Code | Source | Message |
|---|---|---|
| `OFFLINE` | `OfflineError` | fixed: "You're offline. Connect to the internet to do this." |
| `RATE_LIMITED` | `RateLimitedError` | the server's message |
| `REMOTE_REJECTED` | `RemoteRejectedError` | the server's message |

  These are the **only** codes whose message is not fixed. The exception is
  justified because the text is authored by our own server, not internal code.
  Passed-through messages are capped at 500 characters and stripped of control
  characters. The `CODE_MESSAGES` map keeps a fixed fallback for each, used when
  the server sent no message.
- **The uniform miss is data, not an error.** A lookup miss returns
  `{ found: false }` through the normal success path; the renderer cannot
  distinguish the two kinds of miss.

### 6.3 Refresh after success

Each mutating handler (`CLAIM`, `REQUEST`, `TRANSFER_*`, `STUDENT_BULK_CLAIM`)
awaits `DesktopSyncWorker.pullNow()` after the server call succeeds and before
returning. *(Amended during Stage 2 planning: `SYNC_RUN` → `syncActive()` only
pulls when queued work exists or 5 minutes have passed, and returns immediately
while a cycle runs, so after a claim it would usually pull nothing. `pullNow()`
forces the pull and waits for an in-flight cycle.)* If the sync itself fails, the command still reports success (the
server change happened) with a flag `refreshed: false`, and the UI says "Saved —
will appear here after the next sync." Failure of the server call never triggers
a sync.

### 6.4 Renderer

- `renderer/services/nemis-bridge/school-admin/registry-bridge.ts` and
  `transfer-bridge.ts`; ViewModels in `@nemis-desktop/presentation` following the
  `executeCommand` pattern. The ESLint renderer boundary guard is unchanged.
  *(Amended during Stage 2 planning: the ViewModels are built in Stages 3 and 4
  with the screens that dictate their shape; `GRADE_COMPLETION_GUIDANCE` /
  `getCohortGuidance` and `STUDENT_BULK_CLAIM` / `bulkClaimStudents` are built in
  Stages 5 and 6, reusing Stage 2's error and refresh machinery.)*
- Online state comes from the renderer's existing connectivity store
  (`useConnectivityStore()` in `renderer/lib/presentation/hooks/shared.ts`, which
  already tracks `lastSyncAt`); reloads after a sync use the existing
  `useRevalidateOnSync` hook. No new hook or push channel is added. Online state
  disables online-only controls proactively — a convenience; the `OFFLINE` error
  is the real guard. *(Amended during Stage 1 planning: an earlier draft proposed
  a new `useSyncStatus()` hook before these were found.)*

### 6.5 Tests

- Gateway: offline mapping, 4xx body parsing (string and array `message`), 429,
  `status` preserved.
- `toIpcError`: the three codes, the 500-char cap, control-character stripping,
  fallback when no message.
- Validators: NEMIS ID normalisation and checksum rejection.
- Handlers: `SYNC_RUN` called after success, not after failure; `refreshed:false`
  when the sync fails.

---

## 7. Stage 3 — Lookup-first wizard

`StudentFormPage.tsx` create mode becomes five steps, matching portal-web:
**Find Student / Student Information / Guardian Information / Grade & Class /
Review.** Edit mode is unchanged. The separate `students/enroll` page stays (it
re-enrols existing students into a new term).

### 7.1 Step 1 — Find Student

- Inputs: NEMIS ID, date of birth. Checkbox: **"This child has no NEMIS ID
  (first-time enrollee)."**
- **Online:** Search calls `REGISTRY_LOOKUP`. A miss shows only "No matching
  student." Ticking the checkbox skips the lookup into the create branch.
- **Offline (D1):** the search inputs are disabled with: "Searching for a
  transferring student needs a connection. You can still enrol a first-time
  student." Only the checkbox path proceeds.

### 7.2 Branches

| Lookup result | Branch |
|---|---|
| `found`, `claimPath: IMMEDIATE` | **Claim** |
| `found`, `claimPath: REQUIRES_APPROVAL` | **Request** |
| miss, or the assertion | **Create** |

- **Claim:** shows name, gender and `lastCompletion`; pre-fills grade from
  `lastCompletion.nextGradeLevel`; class and term required, class list filtered
  by current academic year **and** the chosen grade. A grade differing from the
  stamp requires a reason. A `GRADUATED` stamp has a null `nextGradeLevel`: the
  grade is not pre-filled and a reason is always required — the empty field is
  never presented as a suggestion. Submits `REGISTRY_CLAIM`; on success navigates
  to the claimed student's profile (present locally after the Stage 2 refresh; if
  `refreshed:false`, to the students list with the "after next sync" note).
- **Request:** class, term, reason → `REGISTRY_REQUEST`; then a waiting state
  naming the lapse date and saying "the student's current school" (not naming it).
- **Create:** the existing information and guardian steps; Grade & Class now
  **requires class and term**, filtered by current year and chosen grade.

### 7.3 One transaction for create

A new application use case `createAndEnrollStudent` writes the student, its
guardians/links and its enrolment in **one local SQLite transaction**. The outbox
triggers therefore enqueue them in dependency order, and a crash cannot leave a
student without an enrolment. The existing `createStudent` +
per-guardian loop in `StudentFormPage.submitCreate` is replaced by it.

### 7.4 Loading guards

Every explanatory empty-state ("No classes for this grade — create one first",
"No terms…") renders only when `!isLoading && !error`. This defect occurred twice
in B.2; it is a review checklist item for this stage.

### 7.5 The assertion travels with the student

- Migration 026: `students.assertedNoNemisId INTEGER NOT NULL DEFAULT 0`, included
  in the outbox payload (trigger regeneration).
- Server applier `student()`: when the upsert **creates** a student (no prior
  remote row), write `AuditAction.CREATE`, `entityType: "Student"`,
  `entityId: <student id>`, metadata `{ assertedNoNemisId, source:
  "desktop-sync" }`, after the upsert commits. No audit for updates or for an
  already-existing student. No server schema change.

### 7.6 Tests

- Wizard: branch selection for each lookup result; offline disables search and
  leaves the assertion path; GRADUATED requires a reason with no pre-fill; class
  list filtered by year and grade; empty-states hidden while loading/errored.
- `createAndEnrollStudent`: single transaction (forced failure rolls back all);
  queue order student → guardian → enrolment.
- Migration 026; applier audit written on create only.

---

## 8. Stage 4 — Transfers inbox

*Note:* until Stage 4 ships, the server's refusal text ("use the Transfers screen
while connected") and the desktop notice ("Review transfers on the web portal.")
disagree; Stage 4 must make the desktop screen the place the server message
points to. *(Amended after Stage 1 final review.)*

### 8.1 Server: snapshot enrichment

The snapshot's `studentTransfers` gains four fields per row, built field by field
(never by spreading a related row): `studentName` (first + last),
`studentNemisId`, `fromInstitutionName`, `toInstitutionName`. A school is party
to every row it receives, and C1 already established that a request discloses
the origin school, so nothing new is disclosed.

### 8.2 Desktop: storage and lapse rule

- Migration 027 adds the four columns; the importer tolerates their absence.
- `isLapsed(row, now)` in `@nemis-desktop/shared`, mirroring
  `Nemis/apps/server/src/student-transfers/student-transfers.service.ts` exactly:

  ```
  status === 'PENDING'
  && initiatedBy === 'RECEIVING_SCHOOL'
  && lapsesAt !== null
  && Date.parse(lapsesAt) < now
  ```

  with a comment pointing at the server function. The server remains the
  authority; a desktop with a wrong clock gets the server's refusal through
  `REMOTE_REJECTED`.
- One `TransferStatusChip` checks lapsed **before** status.

### 8.3 Tabs and actions

`splitByWhoAsked` and `countPendingDecisions` are ported from
`Nemis/apps/portal-web/src/lib/transfers.ts` into one desktop module
(`renderer/lib/transfers.ts`), used by both the page and the sidebar badge.
Tabs: **Requests to us** / **Our requests** / **History**. The inbox reads local
rows, so it is viewable offline; every action is online-only via Stage 2.

| Row | We are | Actions |
|---|---|---|
| Origin-initiated push, pending | receiving | **Approve** (class + term pickers, grade-filtered, current year) / **Reject** (no pickers) |
| Receiving-initiated pull, pending, not lapsed | origin | **Release** / **Reject** |
| Our request, pending, not lapsed | initiator | **Cancel** |
| Our pull, lapsed | receiving | **Complete** (claim with class + term) / **Withdraw** (cancel) |
| — | origin, child at our school | **New transfer** (outgoing push, `TRANSFER_CREATE`) |

Pickers read local classes filtered to the current academic year and the
transfer's grade (the server's `classes findAll` is unscoped; see §11).

### 8.4 Sidebar

A "Student Transfers" entry with a pending-decision badge computed from local
rows via `countPendingDecisions`. It re-reads local rows through
`useRevalidateOnSync` (a new `lastSyncAt`), and immediately after any transfer
command. Both reads are local SQLite queries, never server calls, so portal-web's
persistent-layout cache-staleness trap does not apply.

### 8.5 Tests

- `isLapsed`: boundaries (equal to now is not lapsed), wrong initiator, null
  `lapsesAt`, non-PENDING.
- Who-asked split and pending count (ported test cases from portal-web's
  semantics).
- Action matrix: each row type shows exactly its actions.
- Server snapshot spec: exactly the four extra fields, nothing else from the
  student or institution.

---

## 9. Stage 5 — End-of-Year Outcomes (offline, queued)

### 9.1 Server: snapshot additions

- `gradeCompletions`: rows with `institutionId` = the workspace institution.
- **Departed cohort students:** the students query is widened to also include
  students with an enrolment in one of this institution's classes during the
  current academic year or the most recently ended one, regardless of their
  current `institutionId`. Those not currently at this institution are sent with
  a **minimal projection**: `id, firstName, middleName, lastName, nemisId, gender,
  gradeLevel, institutionId, isActive, updatedAt` — no contact fields, address,
  photo or guardians. Enrolments, grades and attendance are scoped by the student's *current*
  institution (`desktop-provisioning.service.ts:268-283`), not by class, so
  Stage 5 must ALSO widen those queries for departed cohort students:
  enrolments in this institution's classes for the current/most-recently-ended
  year, plus their grades and attendance for those classes. *(Amended after Stage 1 final review.)*
- Stage 1's departure rule plus the foreign `institutionId` keep them out of
  every list; they appear only in cohorts.
- **`verifyDatabase` exemption must be re-keyed.** Stage 1 exempts a student from
  the students.institutionId -> institutions check only when an APPROVED transfer
  has `toInstitutionId = student.institutionId`. A departed cohort student who has
  since moved again (1->2->3) arrives with school 3, which no transfer visible to
  school 1 explains, so the check would throw on every import and stop sync.
  Stage 5 must re-key the exemption on "this student has an APPROVED transfer whose
  `fromInstitutionId` is the workspace institution" (or an equivalent covering
  multi-hop moves), with a test. *(Amended after Stage 1 final review.)*

### 9.2 Desktop: storage (migration 028)

`grade_completions` mirrors the server columns (`id, studentId, institutionId,
academicYearId, gradeLevel, outcome, nextGradeLevel, averageAtDecision, notes,
decidedBy, amendedBy, amendedAt, createdAt, updatedAt`) plus local
`syncState TEXT NOT NULL` (`synced` | `pending` | `rejected`) and `syncError TEXT`.
Unique on `(studentId, academicYearId)`. **No outbox trigger.** The importer
upserts pulled rows as `synced` and **never overwrites a local row whose
`syncState` is `pending` or `rejected`** (the admin's unsent decision wins; on
push the server's upsert applies it).

### 9.3 Local cohort query

A repository method mirroring `EnrollmentsService.getCohortForCompletion` line for
line, with a comment naming it:

1. Students with an enrolment in `academicYearId` in a class of this institution
   at `gradeLevel` (deduplicated — one enrolment row per term).
2. ∪ students holding a local stamp at that year and grade for this institution.
3. − students stamped that year at a **different** grade.
4. `unenrolledCount` = active students of this institution at `gradeLevel` not
   in (cohort ∪ step-3 set).
5. No `isActive` filter on the cohort — leavers stay in.

### 9.4 The screen

`renderer/app/government/school-admin/students/promote/page.tsx`, sidebar label
**"End-of-Year Outcomes"**.

- Pickers: academic year (local years) and grade.
- Per row: outcome (Promoted / Retained / Graduated), next grade (defaults to the
  following grade; empty and disabled for Graduated), notes, sync badge.
  Next-grade options are limited to grades this institution offers where local
  grade-level data exists.
- `unenrolledCount` banner when non-zero.
- **Guidance averages online only:** fetched through `GRADE_COMPLETION_GUIDANCE`
  and matched by student id; offline the column shows "—" with "Averages are
  shown when online." The server snapshots `averageAtDecision` itself, so the
  push does not depend on it.
- Save writes changed rows as `pending`. Per D7 it does **not** touch local
  `Student.gradeLevel` or enrolment status; the screen states "Grade changes
  apply after sync."
- Rejected rows show the batch's error with server student ids mapped to local
  names; editing and saving a rejected row resets it to `pending`.

### 9.5 Push — `GradeCompletionSyncService`

Runs inside `DesktopSyncWorker`'s cycle, beside `FeeReversalSyncService`:

- Groups `pending` rows by `(academicYearId, gradeLevel)`; one
  `POST /enrollments/grade-completions` per group with only those decisions.
- **Ordering gate:** a group waits while any `sync_queue` item for `students` or
  `enrollments` is not `completed` (the server validates enrolment).
- **4xx** → every row in the group becomes `rejected` with the server message
  (the server write is all-or-nothing per POST).
- **Network error / 5xx** → the group stays `pending` for the next cycle.
- **Success** → rows become `synced`; the cycle's pull then brings the server's
  `gradeLevel` and enrolment-status changes.
- Re-sending is safe: the server skips unchanged decisions.

### 9.6 Tests

- Cohort parity: promoted-then-amended student stays in the cohort; leaver
  included; student stamped at another grade excluded; per-term duplicate
  enrolments deduplicated; `unenrolledCount` excludes both sets.
- Importer: pending/rejected rows not overwritten; absent `gradeCompletions` key
  tolerated.
- Push: grouping, ordering gate, 4xx → rejected for the whole group, 5xx/offline
  → pending, success → synced.
- Server snapshot spec: departed students carry only the minimal projection;
  stamps scoped to the institution.

---

## 10. Stage 6 — Bulk import and the login note

### 10.1 Bulk import

- **Batch class and term required** (B.1), class list filtered by current year.
  A row whose `gradeLevel` differs from the class's grade fails with that reason.
- **Rows without a NEMIS ID** are created locally (offline-capable), each through
  `createAndEnrollStudent` in its own transaction.
- **Optional `nemisId` column** added to the template. Each value is normalised
  and Luhn-checked locally first; a bad value fails the row.
  - **Online:** every valid NEMIS-ID row goes in **one** `STUDENT_BULK_CLAIM`
    (`POST /students/bulk` with the batch `classId`/`academicYearId`/`termId`),
    spending the server's `registry:bulk` budget (D6). Failed rows show the
    server's uniform message. The import never raises release requests.
  - **`registryUnavailable` in the response:** its message is shown verbatim, and
    every row the server did not create goes into a downloadable **retry file**.
  - **Offline:** NEMIS-ID rows go straight into the retry file with "Needs a
    connection — import these rows again when online. Keep the NEMIS IDs."
- The retry file is built from **original row indexes** carried through every
  step, never from positions in a filtered array, so it cannot shift by one.
- Claimed rows reach SQLite through the post-command refresh.

### 10.2 Student login note

- Student profile: "Signs in to the student portal with NEMIS ID
  `4829-1573-6045`" once the student's create has synced (no non-`completed`
  `sync_queue` item for that student); before that, "Student login becomes
  available after this record syncs." No password is shown.
- Bulk import's results step replaces the "no credentials on this device" copy
  with the same sign-in line.

### 10.3 Server: guardian guard in the applier

The applier's `guardian()` path gains the check `students.service.ts` applies at
lines 227 and 993: if the guardian's email belongs to a user who has a
`studentProfile`, the guardian is created with **no** user account and no PARENT
organisation link (the student account must never gain PARENT — its primary role
would flip and its NEMIS ID login would fail), and a warning is logged. This closes the follow-up recorded with the student-login work.

### 10.4 Tests

- Row partitioning; grade-mismatch failure; Luhn failure handled locally.
- Retry-file alignment, including after a mid-import `registryUnavailable`.
- Offline path: no network call, NEMIS-ID rows all in the retry file.
- Profile note states.
- Applier: a guardian whose email belongs to a student is not linked as PARENT.

---

## 11. Known limits carried over (not fixed here)

- A receiving-initiated transfer whose stored term expires across an academic
  year boundary cannot be approved (server decision pending). The desktop shows
  the server's message.
- `classes.service.ts` `findAll` returns every year's classes; the desktop
  pickers filter locally.
- The immediate-claim path stays dormant until schools record outcomes; on
  desktop, as on the web, every early lookup routes to the request branch.
- `studentId` remains present on transfer rows (C1 open follow-up).

## 12. Risks

- **Two sources of truth for lapse.** Mitigated by mirroring `isLapsed` exactly
  and letting the server refuse.
- **Snapshot widening (Stage 5) enlarges provisioning payloads** by the number of
  students who left during two years — small, but the planning stage should
  measure it on the local dataset.
- **Desktop clock skew** affects only display of lapse; every action is decided
  server-side.
- **Old desktops after Stage 1's server deploy** receive conflicts for any
  queued transfer write; this is intended and surfaces on Sync Conflicts.
- `better-sqlite3` is built for Electron: the test gate needs
  `pnpm rebuild:node` then `pnpm rebuild:electron` afterwards.

## 13. Success criteria

1. No desktop path can change a transfer's status without the server's transfer
   service.
2. Online, a desktop admin can find, claim, or request a transferring child, and
   the child appears locally with an enrolment.
3. Offline, a desktop admin can enrol only first-time students, and each such
   create is audited server-side with `assertedNoNemisId`.
4. Every student created on desktop has an enrolment.
5. The desktop transfers inbox matches C3: tabs by who asked, lapse visible and
   actionable, approvals that enrol the child.
6. Outcomes recorded offline reach the server, and a rejection is visible with
   the offending students named.
7. A roster carrying NEMIS IDs claims instead of minting, and an outage never
   causes a second mint on re-import.
