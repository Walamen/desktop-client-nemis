# Bulk import: guardian email — design

Date: 2026-10-15
Branch: `fix/bulk-import-guardian-email`
Scope: desktop renderer only (`apps/desktop/renderer/components/students/`)

## Problem

On the desktop School Admin **Bulk Import Students** page
(`/government/school-admin/students/createbulk`) there is no way to give a
guardian an email address:

- the downloaded template has no Guardian Email column;
- an uploaded file's Guardian Email column (e.g. a portal-web template) is ignored;
- the review grid and "Add Row" have no Guardian Email field;
- the create request sends guardians without `email`.

A guardian's email is what the server turns into a **parent login** when the
record syncs (`desktop-sync-applier.ts` → `createLinkedUserAccount` /
`resolveExistingAccount`). So every guardian imported in bulk on desktop ends up
with no parent account.

## Root cause

`bulk-import-logic.ts` dropped the column on purpose, with the comment "no such
column on this device's guardian schema". That premise is false: the local
`guardians` table has had `email TEXT` since migration 004, and the whole local
path already carries it — `CreateAndEnrollGuardianRequest.email`,
`CreateAndEnrollStudentUseCase`, `Guardian.create`. The single Add Student
wizard already sends it. Only the bulk renderer lacks it.

## Decisions

1. **Optional, format-checked.** Same as the single Add Student wizard and
   portal-web's bulk import. A blank email is allowed; the guardian then simply
   gets no parent login. (Chosen by Alvin, 2026-10-15.)
2. **Column header `Guardian Email`**, the exact header portal-web uses, so a
   file from either app imports in the other. Parsing also accepts
   `guardianEmail`. It is appended right after `Student Email` — portal-web's
   own order — so the existing columns keep their positions (old filled-in
   desktop files and positional test fixtures are unaffected; a file without
   the column parses with a blank guardian email).
2a. **Accept portal-web's Grade Level header.** portal-web writes
   `Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)` with a single `…` (U+2026);
   desktop only reads its own `...` spelling, so every row of a portal-web
   file currently fails "Grade level: Required". Add the `…` spelling as a
   parse alias. (The reverse direction, portal-web reading desktop's header,
   is a portal-web change and out of scope.)
3. **New students only.** For a row with a NEMIS ID (a claim), the server
   ignores every guardian column — the child keeps the guardians from their
   previous school (`students.service.ts`, claim branch). The email is kept on
   the row (grid, retry file) but is **not** added to `BulkClaimRow`; the
   template help text says it applies to new students only.
4. **Student email ≠ guardian email, checked before import.** The create use
   case rejects a student email equal to a guardian's with a `WorkflowException`,
   which IPC maps to the generic "Something went wrong" text (known gap, see
   subjects-multi-create notes). So `validateRow` catches it first, for rows
   with a blank NEMIS ID only (claims ignore both emails), comparing trimmed
   and case-insensitive. The error sits on `studentEmail`:
   `Can't be the same as the guardian's email`.
5. **Results screen says who gets a parent login.** Each "Created on this
   device" entry adds one line:
   - email given: `Parent login for <email> is set up after this record syncs.`
   - blank: `No guardian email — the guardian won't get a parent login.`

## Changes

### `bulk-import/bulk-import-logic.ts`
- `BulkRow.guardianEmail: string`.
- `HEADERS`: append `'Guardian Email'` after `'Student Email'`.
- `downloadTemplate` example row: `'jane.doe@example.com'` in that position.
- `parseWorkbookToRows`: `guardianEmail: pick(r, 'Guardian Email', 'guardianEmail')`;
  grade also reads `'Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)'` (decision 2a).
- `validateRow`: invalid format → `errors.guardianEmail = 'Invalid email'`;
  rule 4 above.
- `buildRetryWorkbook`: write `row.guardianEmail` in the matching column.
- Replace the stale comment above `HEADERS`.

### `bulk-import/run-bulk-import.ts`
- `toCreateRequest`: guardian gets `email: row.guardianEmail.trim() || undefined`.

### `BulkImportPage.tsx`
- `emptyRow`: `guardianEmail: ''`.
- Grid: `Guardian Email` column after `Student Email` (same order as the template), `type="email"`,
  placeholder `guardian@email.com`, error from `row.errors.guardianEmail`.
- Step 1 help text: one sentence — guardian email gives the guardian a parent
  login, used for new students only (blank NEMIS ID).
- Results: line from decision 5.

## Out of scope
- Server changes (none needed).
- `BulkClaimRow` / claim path (decision 3).
- Fixing the app-wide `WorkflowException` → generic-error mapping.
- Live "this email already has an account" lookup that portal-web does
  (`checkGuardianEmail`) — needs an online endpoint; not part of this fix.

## Tests
- logic: `Guardian Email` sits right after `Student Email`; a portal-web
  header set (with `…` grade header and `NEMIS ID`) parses with no errors;
  a file without the column parses with a blank guardian email; parse reads `Guardian Email`
  and `guardianEmail`; blank accepted; bad format rejected; same-as-student
  rejected for blank NEMIS ID (case-insensitive) and allowed for a claim row;
  retry file carries the email in the `Guardian Email` column.
- run: local create request's guardian carries the trimmed email; blank → no
  `email` key value (`undefined`).
- page: Add Row shows a Guardian Email field and its value reaches the create
  request; results show the parent-login line for both cases.
