# NEMIS ID Desktop Parity — Stage 6 (Bulk Import + Login Note) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make desktop bulk import enrol every row into a class and term, claim rows that carry a NEMIS ID through the server's bulk endpoint instead of minting a second identity, and tell admins how a student signs in. On the server, stop the desktop sync applier from turning a student's login into a PARENT account.

**Architecture:** Rows without a NEMIS ID are created locally, offline-capable, each through the Stage 3 `createAndEnrollStudent` transaction. Rows with a NEMIS ID go online in one `STUDENT_BULK_CLAIM` command (`POST /students/bulk`, D6) through the Stage 2 online lane (`runOnline` + forced pull, D5). Rows the server did not create go into a downloadable retry file. Every row carries its original index through every step. A new read-only channel tells the student profile whether the student's create has synced, which decides the sign-in note.

**Tech Stack:** Electron main (better-sqlite3/SQLCipher), IPC contract in `packages/types`, Next.js renderer, SheetJS `xlsx`, Vitest; server NestJS + Prisma + Jest.

**Spec:** `docs/superpowers/specs/2026-10-02-nemis-id-desktop-parity-design.md` §10 (plus D1, D5, D6, §6 online lane, §7.3 one-transaction create).

> **Granularity note.** Tasks are specified at the requirement level: exact names, behaviours, copy, and the test cases each must have. The implementer writes the code against the real files, following the conventions named in each task. Every listed test case is mandatory. Write it first and see it fail.

## Global Constraints

- Server repo dir on disk is `Nemis/apps/Server` (capital S). Server work goes on branch `nemis-id-desktop-parity-stage-6` in the Nemis repo, created from `main`.
- Desktop work goes on branch `nemis-id-desktop-parity-stage-6` (already created from `main` @ 1b78c19).
- **D5:** an online response is never written into SQLite. Claimed rows reach SQLite only through the post-command refresh (`runOnline`'s `pullNow`).
- **D6:** NEMIS-ID rows use `POST /students/bulk` only, never the interactive `/student-registry/claim`. The import never raises release requests.
- **Never show a password.** The server's bulk response carries `studentCredential` / `parentCredential` with the default password. The gateway validator drops them, so they never cross IPC.
- Rows without a NEMIS ID are created with `assertedNoNemisId: false`. As on portal-web's bulk import, a spreadsheet row with no ID asserts nothing.
- Copy, verbatim:
  - Offline retry reason: `Needs a connection — import these rows again when online. Keep the NEMIS IDs.`
  - Profile, synced: `Signs in to the student portal with NEMIS ID <formatted id>`
  - Profile, not synced: `Student login becomes available after this record syncs.`
  - Grade mismatch: `Grade level "<row grade>" does not match the selected class grade "<class grade>"` (the server's own wording).
  - `registryUnavailableMessage` is shown verbatim.
- Error display uses `parseIpcError` from `renderer/lib/errors/parseIpcError.ts`, never raw `[CODE]` strings.
- The user's Electron app is running and locks `node_modules/better-sqlite3/build/Release/better_sqlite3.node`. Native tests run through the binary-swap wrapper. Never kill the app.
- Lint baseline is exactly 6 pre-existing errors.

## Review Focus

1. **Retry-file shift.** The admin deletes or edits rows on the review step, then imports. Retry rows must be the exact original rows, not neighbours. Pinned by the Task 3 tests: alignment with interleaved invalid, local and claim rows, and after `registryUnavailable` stops mid-file.
2. **Credentials leaking into the renderer.** The server response includes the default password. Pinned by the Task 2 gateway test: the returned value has no `studentCredential` or `parentCredential` anywhere.
3. **Whole-call failure after a partial server commit** (timeout or 5xx). Every NEMIS-ID row goes into the retry file. Re-import is safe, because already-claimed rows fail with the uniform message and nothing mints. Pinned by the Task 5 test: a thrown error puts all claim rows in the retry file with the parsed message.
4. **Batch-level rejection.** The server answers 404/409 when the class or term is not in the current year. Show the server's message once, and the local creates already done stay done. Pinned by Task 5.
5. **A guardian email that is also a student's login.** Covered by the Task 1 applier tests, including the race re-resolve path.

---

### Task 1: Server — guardian guard in the desktop sync applier

**Files:** Nemis repo, `apps/Server/src/desktop-provisioning/desktop-sync-applier.ts` (+ `desktop-sync-applier.spec.ts`).

**Behaviour (spec §10.3):**
- `resolveExistingAccount` also selects `studentProfile: { select: { id: true } }` on the user lookup.
- When the user has a `studentProfile`, the guardian row stays as upserted, with no `userId`, no `mergedIntoGuardianId`, and no `ensureParentMembership` call. A warning is logged, worded like `students.service.ts:235`: the guardian email belongs to the login of student `<id>`, and guardian `<id>` was left without a parent account. The method returns `accepted()`, which stops the caller from falling through to `createLinkedUserAccount`.
- The guard applies on both paths that call `resolveExistingAccount`: the pre-check and the `EmailAlreadyRegisteredError` re-resolve.
- Add a Nest `Logger` to the applier (`new Logger(DesktopSyncApplier.name)`) if it has none.

**Mandatory test cases:**
- A new guardian whose email belongs to a user with a `studentProfile`: `userOrganization.create` is not called, `guardian.update` is not called with `userId` or `mergedIntoGuardianId`, `createLinkedUserAccount` is not reached, the decision is accepted, and no credential is returned.
- The same on the race path: `createLinkedUserAccount` throws `EmailAlreadyRegisteredError`, and the re-resolve finds a student user.
- The existing guardian-profile and plain-user tests still pass. Their mocks may need `studentProfile: null`.

**Commit (Nemis):** `fix(desktop-sync): never give a student's login PARENT through a guardian email`.

---

### Task 2: Desktop — `STUDENT_BULK_CLAIM` online command

**Files:** `packages/types/src/registry.ts` (types), `packages/types/src/ipc.ts` (channel + contract), `packages/types/src/api.ts` (`RegistryApi`), `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts` (+ test), `apps/desktop/electron/security/validateIpc.ts` (+ test if validators are tested there), `apps/desktop/electron/ipc/handlers/school-admin/registry.ts` (+ test), `apps/desktop/electron/ipc/authorizeChannel.ts` (+ test), `apps/desktop/electron/preload/school-admin/registry-api.ts`, `apps/desktop/renderer/services/nemis-bridge/school-admin/registry-bridge.ts` (+ `online-bridges.test.ts`).

**Produces (exact names — Task 5 uses them):**
```ts
export interface BulkClaimRow {
  /** Canonical 12 digits. */
  nemisId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;      // YYYY-MM-DD
  gender: Gender;
  gradeLevel: GradeLevel;
  admissionDate?: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianRelationship?: string;
  studentEmail?: string;
}
export interface BulkClaimRequest {
  classId: string;
  academicYearId: string;
  termId: string;
  students: BulkClaimRow[];  // 1..500
}
export interface BulkClaimResult {
  /** `index` is the position in `request.students`. */
  created: { index: number; nemisId: string }[];
  failed: { index: number; error: string }[];
  /** Present only when the server stopped early. Shown verbatim. */
  registryUnavailableMessage: string | null;
}
```
- Channel `IpcChannels.STUDENT_BULK_CLAIM = 'registry:bulk-claim'`. Contract: `(request: BulkClaimRequest) => OnlineCommandResult<BulkClaimResult>`. It is added to `SCHOOL_ADMIN_CHANNELS`.
- `gateway.bulkClaimStudents(request: BulkClaimRequest): Promise<BulkClaimResult>` sends `POST /students/bulk` with `ONLINE_COMMAND`. The body is the request as-is.
- `registryApi.bulkClaim(request)` and `registryBridge.bulkClaimStudents(request)`.
- The handler runs `runOnline(() => gateway.bulkClaimStudents(canonicalRows(request)), refresh)`, normalising each row's `nemisId` like `canonical()` does. Extend the `RegistryGateway` Pick.

**Validator (`assertBulkClaimArgs`):** strict known keys at both levels. Ids are strings within `ID_MAX_LENGTH`. Rows are 1–500, each `nemisId` normalises (`normalizeNemisId` non-null), and gender and gradeLevel are enum members. Dates match `YYYY-MM-DD`. Strings are length-capped like the existing validators. Optional fields go through `assertOptional*`.

**Response mapping (`toBulkClaimResult`):**
- Reads `data.results.created[]` → `{ index, nemisId }` only, and `data.results.failed[]` → `{ index, error }` only.
- `registryUnavailableMessage` is `data.registryUnavailableMessage` when `data.registryUnavailable === true`, else null.
- Malformed entries (non-integer index, missing strings) throw the same validation error the other validators throw.
- **Never copy any other field.**

**Mandatory test cases:**
- Gateway: posts to `/students/bulk` with the body; maps created and failed. A response containing `studentCredential` and `parentCredential` yields a result whose JSON has no `defaultPassword`, `studentCredential` or `parentCredential`. `registryUnavailable: true` maps the message, its absence maps null. A 409 with a message surfaces as `RemoteRejectedError(409, message)`, and a network failure as `OfflineError`.
- Validator: rejects an unknown key, a bad NEMIS ID, 0 rows, 501 rows, and a bad gender.
- Handler: canonicalises a separated NEMIS ID, and returns `{ data, refreshed }` through `runOnline`.
- Authorisation: the channel is school-admin only.
- Bridge: calls `api().registry.bulkClaim`.

**Commit:** `feat(registry): bulk claim online command over POST /students/bulk`.

---

### Task 3: Desktop — pure bulk-import logic

**Files:** create `apps/desktop/renderer/components/students/bulk-import/bulk-import-logic.ts` (+ `bulk-import-logic.test.ts`). Move the row type, `validateRow`, the template headers, `parseDateCell`, `pick` and `parseWorkbookToRows` out of `BulkImportPage.tsx` into this module unchanged, except for the additions below. The page imports them.

**Additions and changes:**
- `BulkRow` gains `nemisId: string` (raw cell text).
- Template: a new optional column `NEMIS ID (leave blank for new students)`, placed after `Grade Level *`. The parser reads it (with aliases `NEMIS ID`, `nemisId`), and a numeric cell becomes its digit string. The example row leaves it blank.
- `validateRow`: a non-blank `nemisId` that `normalizeNemisId` rejects gives `errors.nemisId = 'Invalid NEMIS ID (12 digits, check digit)'`. Blank is fine.
- `interface IndexedRow { originalIndex: number; row: BulkRow }`, where `originalIndex` is the position in the review list at submission.
- `partitionRows(rows: BulkRow[], classGrade: GradeLevel): { local: IndexedRow[]; claim: IndexedRow[]; failed: { originalIndex: number; error: string }[] }`:
  - Rows with validation errors are skipped (not imported, not failed), as today.
  - A valid row whose grade differs from `classGrade` goes to `failed`, with the grade-mismatch copy from Global Constraints.
  - A valid row with a blank `nemisId` goes to `local`.
  - Otherwise it goes to `claim`.
- `toBulkClaimRows(claim: IndexedRow[]): BulkClaimRow[]` keeps the same order (canonical `nemisId`). The server's `index` therefore equals the position in `claim`.
- `mapClaimOutcome(claim: IndexedRow[], result: BulkClaimResult): { claimed: { originalIndex: number; nemisId: string }[]; retry: { originalIndex: number; reason: string }[] }`:
  - `created[i].index` → `claim[index].originalIndex`.
  - Every claim row not in `created` goes to `retry`, with its `failed` error, or with the registry message when the server never attempted it.
  - An index out of range is ignored (never crashes).
- `allToRetry(claim: IndexedRow[], reason: string)` for the offline and whole-call-failure paths.
- `buildRetryWorkbook(rows: BulkRow[], retry: { originalIndex: number; reason: string }[]): XLSX.WorkBook`:
  - Sheet `Students` with the template headers plus a final `Reason` column, one line per retry entry, in `originalIndex` order, taken from `rows[originalIndex]` with the NEMIS ID kept.
  - The parser ignores the `Reason` column, so the file re-imports as-is.
  - `downloadRetryFile(...)` writes it as `student-import-retry.xlsx`.

**Mandatory test cases:**
- Partition: one row each of invalid, mismatched grade, local, and claim lands correctly, with `originalIndex` preserved.
- A Luhn-bad ID is a row error. A separated valid ID (`4829-1573-6045` style, using a real valid ID built with `generateNemisId`) is accepted and canonicalised by `toBulkClaimRows`.
- `mapClaimOutcome` alignment, with rows interleaved as `[local, claim A, invalid, claim B, local, claim C]`. B created and A failed: A and C go to retry with the right reasons, B is claimed, and every `originalIndex` points at the right source row.
- `registryUnavailable` after the first claim row: the remaining claim rows go to retry with the registry message.
- Retry workbook round-trip: build it, parse it back with `parseWorkbookToRows`, and you get exactly the retry rows (names and NEMIS IDs) in order.
- The template header row includes the NEMIS ID column, and a numeric NEMIS ID cell parses to its digit string.

**Commit:** `feat(renderer): bulk import partitioning, claim mapping and retry file`.

---

### Task 4: Desktop — create-sync status and the profile login note

**Files:** `packages/types/src/ipc.ts` (+ `api.ts`), a small main-side query (put it beside the student IPC handlers, or in a tiny data service following `GradeCompletionService`'s `workspaces` pattern; the implementer chooses and states why), `apps/desktop/electron/security/validateIpc.ts`, `apps/desktop/electron/ipc/authorizeChannel.ts`, preload `student-api.ts`, `renderer/services/nemis-bridge/school-admin/student-bridge.ts`, `apps/desktop/renderer/components/students/StudentProfilePage.tsx` (+ test).

**Produces:**
- Channel `IpcChannels.STUDENT_CREATE_SYNCED = 'student:create-synced'`: `(studentId: string) => { synced: boolean }`, school-admin only, validated as one id string.
- `synced` is false iff `sync_queue` has a row with `entityType = 'students'`, `entityId = studentId`, `operationType = 'create'` and `status <> 'completed'`. Verify the real entity-type string and status values in `SqliteSyncQueueRepository` and the outbox triggers before writing the query.
- **Ruling:** only the create counts. A pending edit does not hide an existing login.
- A pulled student has no queue rows, so it is synced.
- `studentBridge.isCreateSynced(studentId): Promise<boolean>`.

**Profile:**
- Below the NEMIS ID line, show `Signs in to the student portal with NEMIS ID <formatNemisId(nemisId)>` when synced and the student has a `nemisId`. Otherwise show `Student login becomes available after this record syncs.`
- Re-check on `useRevalidateOnSync`. A failed check shows nothing (it does not throw). No password, ever.

**Mandatory test cases:**
- Query (native, real migrated DB): a pending create gives false, a completed create gives true, a pending update only gives true, and no rows gives true.
- Profile: synced copy with the formatted ID, unsynced copy, and a failing check renders neither and does not crash.

**Commit:** `feat(students): sign-in note once the student's create has synced`.

---

### Task 5: Desktop — the bulk import page

**Files:** `apps/desktop/renderer/components/students/BulkImportPage.tsx` (+ create `BulkImportPage.test.tsx`).

**Consumes:** Task 3's logic. Task 2's `registryBridge.bulkClaimStudents`. `listVm.createAndEnrollStudent` (Stage 3). `ClassTermPicker` + `isClassTermComplete` from `add-student/`. The connectivity store's `isOnline`. `parseIpcError`.

**Behaviour:**
- **Batch placement, before review:** a batch `Grade` select (the grades listed by the existing page) feeds `ClassTermPicker`. Import is disabled until `isClassTermComplete`.
- Review shows the NEMIS ID column (editable, with its error) and the existing row editing.
- **Submit, in this order:**
  1. `partitionRows(rows, batchGrade)`.
  2. Each `local` row runs in sequence through `listVm.createAndEnrollStudent`, with:
     - the batch `academicYearId`, `classId` and `termId`;
     - `enrollmentDate`: the row's admission date;
     - `assertedNoNemisId: false`;
     - one guardian `{ firstName, lastName, relationship, phoneNumber, isPrimary: true }`;
     - `email`: the student email.

     A `{ ok: false }` result or a throw fails that row with the parsed message, or `Could not create student record.`
  3. If there are claim rows and the device is offline: `allToRetry(claim, <offline copy>)`. No network call.
  4. If there are claim rows and the device is online: one `bulkClaimStudents({ classId, academicYearId, termId, students: toBulkClaimRows(claim) })`, then `mapClaimOutcome`. When `registryUnavailableMessage` is set, show it verbatim above the results. When the call throws, use `allToRetry(claim, parseIpcError(e)?.message ?? 'The import could not reach the server. Import these rows again.')`. A batch-level 404/409 lands here too, and it does not undo the local creates.
  5. When `refreshed` is false, show `Saved — claimed students will appear once this device syncs.`
- **Results step:**
  - Counts: Submitted, Created on this device, Claimed, Failed, To retry.
  - Created rows show the formatted NEMIS ID and `Student login becomes available after this record syncs.`
  - Claimed rows show `Signs in to the student portal with NEMIS ID <formatted>`.
  - Failed rows show `Row <originalIndex + 1>` with the error.
  - When there are retry entries, a `Download retry file` button calls `downloadRetryFile(rows, retry)`, and the list shows each retry row's number and reason.
  - Remove the "no login credentials" copy and the top description's credential sentence.
- **`Retry Failed Rows`:** keeps only the rows in `failed` (local failures and grade mismatches) by `originalIndex`, not by `validRows` position. This fixes today's index-into-`validRows` bug.

**Mandatory test cases** (real presentation layer with `window.nemis` stubs, as in `AddStudentWizard.test.tsx`; stub `XLSX.writeFile` or the download helper):
- Import is disabled until grade, class and term are chosen.
- A mixed batch online: local rows call `createAndEnroll` with the batch class/term, `assertedNoNemisId: false` and one primary guardian. Exactly one `bulkClaim` call carries only the NEMIS-ID rows, in order. The results show created, claimed and failed rows against the right row numbers.
- A grade-mismatch row fails with the server-worded message and is never sent.
- Offline: no `bulkClaim` call. NEMIS-ID rows are listed to retry with the offline copy, and local rows are still created.
- `registryUnavailableMessage` is shown verbatim, and the unattempted rows are offered in the retry file (the download helper is called with them).
- `bulkClaim` throws `[REMOTE_REJECTED] Bulk import must target your institution's current academic year.`: the message is shown without the code, all claim rows go to retry, and local creates are kept.
- The results never contain the text `password` or `credential`.
- `refreshed: false` shows the sync note.

**Commit:** `feat(renderer): bulk import enrols every row and claims NEMIS IDs online`.

---

### Task 6: Stage gate

- **Desktop:** run vitest in two groups through the binary-swap wrapper (`apps/desktop/electron`, then `apps/desktop/renderer packages`). The full run exceeds the 30-minute background limit. Then `pnpm typecheck && pnpm lint`. Only the known failures are allowed: `renderer/app/page.test.tsx`, occasionally `teacher/timetable/timetable.test.tsx`. Lint must show exactly the 6 pre-existing errors. Verify afterwards that the Electron binary is restored (2281472 bytes, Jun 18).
- **Server** (`Nemis/apps/Server`): `npx tsc --noEmit && npx jest`. Only the known `desktop-provisioning.service.spec` "includes every district…" failure is allowed.
- **Deploy coupling:**
  - Task 1 is independent of the desktop.
  - `POST /students/bulk` with `nemisId` exists on any server that has C2. Against an older server, the claim call is answered per row or rejected, and those rows go to the retry file. Nothing mints.
  - Record both branch heads for the merge decision.
