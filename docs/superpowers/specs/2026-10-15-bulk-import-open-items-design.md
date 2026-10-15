# Bulk import: the three open items — design

Date: 2026-10-15
Follows: `2026-10-15-bulk-import-guardian-email-design.md` (merged at 2b890cb)
Repos: desktop-client-nemis (items 1, 2) and Nemis / portal-web (item 3)

## 1. Results note no longer overpromises (desktop)

If the guardian's email already belongs to a **student's** login on the server,
the sync applier links no parent account (`resolveExistingAccount`,
`studentProfile` branch). The desktop can't know this offline, so the note
names the exception instead of promising unconditionally.

`BulkImportPage.tsx` `parentLoginNote`, email given — new copy, exact:

`Parent login for <email> is set up after this record syncs, unless that email already belongs to a student's login.`

The blank-email copy is unchanged.

## 2. Same student email on two rows (desktop)

Two new students (blank NEMIS ID) with the same student email: the first one to
sync takes the address as its login; the second's login creation conflicts, so
its record, links and enrolment go into sync conflict. Detectable offline from
the batch.

`validateRows` (bulk-import-logic.ts) gains one more batch rule, after the
existing ones:
- only rows with a blank NEMIS ID, a non-empty student email, and no
  `errors.studentEmail` yet (format, same-row and guardian-cross-row rules win);
- compare trimmed + lower-cased;
- every row after the **first** row using that student email gets
  `errors.studentEmail = "Already used as a student's email in row N"`, N = the
  1-based position of that first row. The first row stays valid, so it can
  still import.
- claim rows are ignored on both sides (the claim path ignores student email).

Not in scope: an email already used by a student stored on this device or on the
server (needs a lookup).

## 3. portal-web reads desktop files (portal-web)

A desktop template or retry file uploaded on portal-web (create-bulk page and the
onboarding wizard's StudentsStep) currently:
- **drops every NEMIS ID** — portal-web reads only `NEMIS ID` / `nemisId`; the
  desktop header is `NEMIS ID (leave blank for new students)`. Each claim row
  silently becomes a brand-new student with a second national ID. Data-integrity
  bug, highest priority of the three.
- fails every row's grade — portal-web reads only its own
  `Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)` (U+2026); desktop writes `...`.

Fix: a small pure module `apps/portal-web/src/lib/student-import-cells.ts`, used
by both parse sites instead of their inline lookups:

```ts
export function readGradeLevelCell(r: Record<string, unknown>): string
export function readNemisIdCell(r: Record<string, unknown>): string
```

- Both take the first non-blank value among their header aliases, trimmed;
  `''` when none.
- Grade aliases, in order: `Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)`,
  `Grade Level * (KG/K1/K2/GRADE_1...GRADE_12)`, `Grade Level`, `gradeLevel`.
  Callers keep their own `.toUpperCase()`.
- NEMIS ID aliases, in order: `NEMIS ID`, `NEMIS ID (leave blank for new students)`,
  `nemisId`. A numeric cell that is a non-negative integer is left-padded to 12
  digits (Excel drops leading zeros; ~10% of IDs start with 0) — the same rule
  as desktop's `parseNemisIdCell`. Otherwise such a row would fail its claim
  with the misleading "No claimable student matched".

Out of scope: portal-web's example-row filter (it skips every student named
John) — flagged to Alvin separately.

## Tests
- desktop logic: duplicate student email → later rows flagged with first row's
  number, first row valid; trimmed/case-insensitive; claim rows ignored; earlier
  rules keep precedence; three rows with one email → rows 2 and 3 both point at
  row 1; parse applies it.
- desktop page: results note copy for the email case; a grid test where two rows
  share a student email and deleting the first clears the second's error.
- portal-web unit tests for both helpers: each alias, first-non-blank order,
  blank → `''`, trimming, numeric NEMIS ID padding (incl. leading-zero ID), a
  non-integer number left as its string.
