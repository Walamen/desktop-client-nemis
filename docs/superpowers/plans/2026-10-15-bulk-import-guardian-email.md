# Bulk Import Guardian Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the desktop Bulk Import Students page carry an optional guardian email from the template / grid into the local create request, so the guardian gets a parent login when the record syncs.

**Architecture:** Pure renderer change. The row model, template, parser, validation and retry file live in `bulk-import-logic.ts`; the create request is built in `run-bulk-import.ts`; the grid and results screen are in `BulkImportPage.tsx`. Every layer below the renderer (types, use case, domain, SQLite, server sync) already supports `guardians[].email`.

**Tech Stack:** React 19 / Next.js renderer, TypeScript strict (`noUncheckedIndexedAccess`), SheetJS `xlsx`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-15-bulk-import-guardian-email-design.md`

## Global Constraints

- Guardian email is **optional**; only its format is checked (`'Invalid email'`, same regex `EMAIL_RE` as student email).
- Template / parse header is exactly `Guardian Email` (portal-web's); parse also accepts `guardianEmail`. It is appended right after `Student Email`.
- Parse also accepts portal-web's grade header `Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)` (single `…`, U+2026).
- Same-email rule applies only to rows with a blank NEMIS ID; compare trimmed + lower-cased; error on `studentEmail`, text exactly `Can't be the same as the guardian's email`; a format error on `studentEmail` takes precedence.
- `BulkClaimRow` and the claim path are NOT changed.
- Results copy, exact: `Parent login for <email> is set up after this record syncs.` / `No guardian email — the guardian won't get a parent login.`
- No password or credential text anywhere on the page (existing `expectNoSecrets` guard).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. An old filled-in desktop file (12 columns, no Guardian Email) must still import exactly as before — blank guardian email, no new error. (Task 1 test "a file without the column…")
2. A portal-web file (its header set, `…` grade header, `NEMIS ID` header) must parse with no errors. (Task 1 test "a portal-web file…")
3. Padded / mixed-case emails: `' Jane@School.com'` vs `'jane@school.com '` must count as equal; a padded guardian email must be sent trimmed. (Task 1 tests)
4. A claim row with student email == guardian email must NOT be blocked (server ignores both for claims). (Task 1 test)
5. The retry file must keep the guardian email so a re-import doesn't silently lose it. (Task 1 test)

---

### Task 1: Guardian email in the row model, template, parser, validation, retry file and create request

**Files:**
- Modify: `apps/desktop/renderer/components/students/bulk-import/bulk-import-logic.ts`
- Modify: `apps/desktop/renderer/components/students/bulk-import/run-bulk-import.ts:65-73`
- Test: `apps/desktop/renderer/components/students/bulk-import/bulk-import-logic.test.ts`
- Test: `apps/desktop/renderer/components/students/bulk-import/run-bulk-import.test.ts`

**Interfaces:**
- Produces: `BulkRow.guardianEmail: string` (raw cell text, `''` when blank); `validateRow` may set `errors.guardianEmail = 'Invalid email'` and `errors.studentEmail = "Can't be the same as the guardian's email"`; `HEADERS[12] === 'Guardian Email'` (13 headers).
- Task 2 relies on `BulkRow.guardianEmail` and `errors.guardianEmail`.

- [ ] **Step 1: Add `guardianEmail: ''` to both test `mk()` helpers**

In `bulk-import-logic.test.ts` and `run-bulk-import.test.ts`, the `mk` helper's row literal becomes:

```ts
    guardianRelationship: 'Mother', guardianPhone: '+231770000000', studentEmail: '', guardianEmail: '', errors: {}, ...over,
```

- [ ] **Step 2: Write the failing logic tests**

Append to `bulk-import-logic.test.ts`:

```ts
describe('guardian email', () => {
  const parseSheet = (header: string[], ...lines: string[][]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...lines]), 'Students');
    return parseWorkbookToRows(toBytes(wb));
  };
  const base = [
    'Ama', 'Kollie', '2014-03-02', 'FEMALE', '2026-09-01', 'GRADE_5', '',
    'Musu', 'Kollie', 'Mother', '+231770000000', 'ama@example.com',
  ];

  it('the template has a Guardian Email column right after Student Email', () => {
    expect(HEADERS[11]).toBe('Student Email');
    expect(HEADERS[12]).toBe('Guardian Email');
    expect(HEADERS).toHaveLength(13);
  });

  it('reads the Guardian Email column, trimmed', () => {
    const [row] = parseSheet(HEADERS, [...base, '  musu@example.com ']);
    expect(row?.guardianEmail).toBe('musu@example.com');
    expect(row?.errors).toEqual({});
  });

  it('reads a camelCase guardianEmail header', () => {
    const [row] = parseSheet(['First Name', 'guardianEmail'], ['Ama', 'musu@example.com']);
    expect(row?.guardianEmail).toBe('musu@example.com');
  });

  it('a file without the column parses with a blank guardian email and no new error', () => {
    const [row] = parseSheet(HEADERS.slice(0, 12), base);
    expect(row?.guardianEmail).toBe('');
    expect(row?.errors).toEqual({});
  });

  it('a portal-web file (its headers, … grade header, NEMIS ID) parses with no errors', () => {
    const portalHeaders = [
      'First Name *', 'Last Name *', 'Date of Birth * (YYYY-MM-DD)', 'Gender * (MALE/FEMALE)',
      'Admission Date * (YYYY-MM-DD)', 'Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)',
      'Guardian First Name *', 'Guardian Last Name *', 'Guardian Relationship *', 'Guardian Phone *',
      'Student Email', 'Guardian Email', 'NEMIS ID',
    ];
    const [row] = parseSheet(portalHeaders, [
      'Ama', 'Kollie', '2014-03-02', 'FEMALE', '2026-09-01', 'GRADE_5',
      'Musu', 'Kollie', 'Mother', '+231770000000', 'ama@example.com', 'musu@example.com', '',
    ]);
    expect(row).toMatchObject({
      gradeLevel: 'GRADE_5', guardianEmail: 'musu@example.com', studentEmail: 'ama@example.com', nemisId: '',
    });
    expect(row?.errors).toEqual({});
  });

  it('accepts blank and a valid address, rejects a bad one', () => {
    expect(mk().errors.guardianEmail).toBeUndefined();
    expect(mk({ guardianEmail: 'musu@school.com' }).errors.guardianEmail).toBeUndefined();
    expect(mk({ guardianEmail: 'musu@bXc' }).errors.guardianEmail).toBe('Invalid email');
  });

  it('rejects a new student whose email equals the guardian email, ignoring case and spaces', () => {
    const row = mk({ studentEmail: ' Jane@School.com', guardianEmail: 'jane@school.com ' });
    expect(row.errors.studentEmail).toBe("Can't be the same as the guardian's email");
    expect(row.errors.guardianEmail).toBeUndefined();
  });

  it('keeps the format error when the student email is invalid as well as equal', () => {
    expect(mk({ studentEmail: 'a@bXc', guardianEmail: 'a@bXc' }).errors.studentEmail).toBe('Invalid email');
  });

  it('does not block a claim row with the same two emails, and never sends the guardian email in a claim', () => {
    const row = mk({ nemisId: generateNemisId(), studentEmail: 'jane@school.com', guardianEmail: 'jane@school.com' });
    expect(row.errors).toEqual({});
    const [out] = toBulkClaimRows([{ originalIndex: 0, row }]);
    expect(out).not.toHaveProperty('guardianEmail');
  });

  it('the retry file keeps the guardian email in its own column', () => {
    const wb = buildRetryWorkbook([mk({ guardianEmail: 'musu@example.com' })], [{ originalIndex: 0, reason: 'x' }]);
    const header = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Students']!, { header: 1 })[0];
    expect(header?.slice(-2)).toEqual(['Guardian Email', 'Reason']);
    expect(parseWorkbookToRows(toBytes(wb))[0]?.guardianEmail).toBe('musu@example.com');
  });
});
```

- [ ] **Step 3: Write the failing run test**

Append inside the `describe('runBulkImport', …)` block of `run-bulk-import.test.ts`:

```ts
  it('sends the guardian email trimmed, and no email when it is blank', async () => {
    const createAndEnroll = okCreate();
    await runBulkImport({
      rows: [mk({ guardianEmail: '  musu@example.com ' }), mk()], gradeLevel: GradeLevel.GRADE_5,
      institutionId: 'inst-1', target, online: true, createAndEnroll, bulkClaim: claimOk(),
    });
    const calls = vi.mocked(createAndEnroll).mock.calls.map((c) => c[0] as CreateAndEnrollStudentRequest);
    expect(calls[0]?.guardians[0]?.email).toBe('musu@example.com');
    expect(calls[1]?.guardians[0]?.email).toBeUndefined();
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run (from `desktop-client-nemis/`): `npx vitest run apps/desktop/renderer/components/students/bulk-import`
Expected: the new `guardian email` tests and the new run test FAIL (e.g. `HEADERS[12]` undefined, `guardianEmail` undefined, `email` undefined); all previously existing tests still PASS.

- [ ] **Step 5: Implement in `bulk-import-logic.ts`**

5a. `BulkRow` — add after `studentEmail: string;`:

```ts
  /** Optional; the server makes it the guardian's parent login when the
   * record syncs. Used for new students only — a claim keeps the child's
   * existing guardians. */
  guardianEmail: string;
```

5b. `validateRow` — replace the line
`  if (row.studentEmail.trim() && !EMAIL_RE.test(row.studentEmail.trim())) errors.studentEmail = 'Invalid email';`
with:

```ts
  if (row.studentEmail.trim() && !EMAIL_RE.test(row.studentEmail.trim())) errors.studentEmail = 'Invalid email';

  const guardianEmail = row.guardianEmail.trim();
  if (guardianEmail && !EMAIL_RE.test(guardianEmail)) errors.guardianEmail = 'Invalid email';

  // The create use case refuses a student email equal to a guardian's (that
  // address becomes the parent login), and IPC would show it only as a
  // generic error. Claims ignore both emails, so only new students are checked.
  if (
    !row.nemisId.trim() &&
    !errors.studentEmail &&
    guardianEmail &&
    row.studentEmail.trim().toLowerCase() === guardianEmail.toLowerCase()
  ) {
    errors.studentEmail = "Can't be the same as the guardian's email";
  }
```

5c. Replace the comment block above `HEADERS` (the four lines starting `// ─── Excel template + parsing`) with:

```ts
// ─── Excel template + parsing (SheetJS `xlsx`) — mirrors the web portal's
// bulk-import wizard, including its `Guardian Email` header and its spelling
// of the Grade Level header, so a file from either app imports here. The
// results step shows each student's sign-in line (NEMIS ID or a sync note),
// never a password. ──
```

5d. `HEADERS` last line becomes:

```ts
  'Guardian First Name *', 'Guardian Last Name *', 'Guardian Relationship *', 'Guardian Phone *', 'Student Email',
  'Guardian Email',
```

5e. `downloadTemplate` example row last line becomes:

```ts
    'GRADE_5', '', 'Jane', 'Doe', 'Mother', '+231770123456', 'john.doe@example.com', 'jane.doe@example.com',
```

5f. In `parseWorkbookToRows`, add a constant above `export function parseWorkbookToRows`:

```ts
/** portal-web's template spells the range with a single `…` (U+2026). */
const PORTAL_GRADE_HEADER = 'Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)';
```

and change the grade and student-email lines of the row literal to:

```ts
        gradeLevel: pick(r, 'Grade Level * (KG/K1/K2/GRADE_1...GRADE_12)', PORTAL_GRADE_HEADER, 'Grade Level', 'gradeLevel').toUpperCase(),
```

```ts
        studentEmail: pick(r, 'Student Email', 'studentEmail'),
        guardianEmail: pick(r, 'Guardian Email', 'guardianEmail'),
```

5g. `buildRetryWorkbook` — the row array's last line becomes:

```ts
      row.guardianPhone, row.studentEmail, row.guardianEmail, reason,
```

- [ ] **Step 6: Implement in `run-bulk-import.ts`**

In `toCreateRequest`, the guardian object becomes:

```ts
      {
        firstName: row.guardianFirstName.trim(),
        lastName: row.guardianLastName.trim(),
        relationship: row.guardianRelationship.trim(),
        phoneNumber: row.guardianPhone.trim(),
        email: row.guardianEmail.trim() || undefined,
        isPrimary: true,
      },
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run apps/desktop/renderer/components/students/bulk-import`
Expected: all PASS.

(`BulkImportPage.tsx`'s `emptyRow` will not typecheck until Task 2 — that is expected; do not run the full typecheck yet.)

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/renderer/components/students/bulk-import
git commit -m "fix(bulk-import): carry guardian email from the template into the create request

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Guardian Email in the review grid, help text and results

**Files:**
- Modify: `apps/desktop/renderer/components/students/BulkImportPage.tsx` (`emptyRow` ~37-52, Step 1 text ~231-234, grid header ~326, grid cell ~399-403, created results ~462-471)
- Test: `apps/desktop/renderer/components/students/BulkImportPage.test.tsx`

**Interfaces:**
- Consumes (Task 1): `BulkRow.guardianEmail: string`, `row.errors.guardianEmail?: string`, `HEADERS` with `Guardian Email` at index 12, `validateRow` same-email error on `studentEmail`.

- [ ] **Step 1: Write the failing page tests**

Add these constants next to `SYNC_NOTE` in `BulkImportPage.test.tsx`:

```ts
const NO_PARENT_LOGIN = "No guardian email — the guardian won't get a parent login.";
const parentLoginNote = (email: string) => `Parent login for ${email} is set up after this record syncs.`;
const guardianEmailInputs = () =>
  Array.from(document.querySelectorAll('input[placeholder="guardian@email.com"]')) as HTMLInputElement[];
```

Append inside `describe('BulkImportPage', …)`:

```ts
  it('reads Guardian Email from the file, lets it be edited, and sends it with the guardian', async () => {
    const { createAndEnroll } = stubNemis();
    const { user } = await renderPage();
    await upload(user, [[...sheetRow('Ama'), 'musu@example.com']]);

    expect(screen.getByRole('columnheader', { name: 'Guardian Email' })).toBeInTheDocument();
    expect(guardianEmailInputs().map((i) => i.value)).toEqual(['musu@example.com']);
    await user.clear(guardianEmailInputs()[0]!);
    await user.type(guardianEmailInputs()[0]!, 'musu.k@example.com');
    await pickBatch(user);
    await runImport(user);

    const request = createAndEnroll.mock.calls[0]?.[0] as { guardians: { email?: string }[] };
    expect(request.guardians[0]?.email).toBe('musu.k@example.com');
    expect(within(entryFor('Row 1')).getByText(parentLoginNote('musu.k@example.com'))).toBeInTheDocument();
    expectNoSecrets();
  });

  it('a blank guardian email imports and says the guardian gets no parent login', async () => {
    const { createAndEnroll } = stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await pickBatch(user);
    await runImport(user);

    const request = createAndEnroll.mock.calls[0]?.[0] as { guardians: { email?: string }[] };
    expect(request.guardians[0]?.email).toBeUndefined();
    expect(within(entryFor('Row 1')).getByText(NO_PARENT_LOGIN)).toBeInTheDocument();
  });

  it('Add Row adds a row with an empty Guardian Email field', async () => {
    stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await user.click(screen.getAllByRole('button', { name: /Add Row/ })[0]!);
    expect(guardianEmailInputs().map((i) => i.value)).toEqual(['', '']);
  });

  it('a bad guardian email, or one equal to the student email, blocks the row in the grid', async () => {
    stubNemis();
    const { user } = await renderPage();
    await upload(user, [[...sheetRow('Ama'), 'musu@bXc'], [...sheetRow('Bola'), 'bola@example.com']]);

    expect(screen.getByText('Invalid email')).toBeInTheDocument();
    expect(screen.getByText("Can't be the same as the guardian's email")).toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 0 Students');
  });

  it('Step 1 explains guardian email is for new students only', async () => {
    stubNemis();
    await renderPage();
    expect(screen.getByText(/Guardian Email gives the guardian a parent login/)).toHaveTextContent(
      /new students only/,
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/desktop/renderer/components/students/BulkImportPage.test.tsx`
Expected: the five new tests FAIL (no `Guardian Email` column header / inputs / copy); the existing eight still PASS.

- [ ] **Step 3: Implement in `BulkImportPage.tsx`**

3a. `emptyRow` — after `studentEmail: '',` add `guardianEmail: '',`.

3b. Add below `const rowLabel = …`:

```ts
/** Whether the guardian of a created row gets a parent login on sync. */
function parentLoginNote(row: BulkRow | undefined): string {
  const email = row?.guardianEmail.trim();
  return email
    ? `Parent login for ${email} is set up after this record syncs.`
    : "No guardian email — the guardian won't get a parent login.";
}
```

3c. Step 1 paragraph becomes:

```tsx
              <p className="mb-4 text-sm text-gray-600">
                Only required fields are marked with <strong>*</strong>. Grade level accepts KG, K1, K2, or GRADE_1
                through GRADE_12. Leave the NEMIS ID blank for a student who has never had one. Guardian Email gives
                the guardian a parent login once the record syncs — for new students only; a student claimed by NEMIS
                ID keeps the guardians from their previous school.
              </p>
```

3d. Grid header — after the `Student Email` `<th>` add:

```tsx
                    <th className="min-w-[160px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Guardian Email</th>
```

3e. Grid cell — after the student-email `<td>…</td>` add:

```tsx
                        <td className="px-3 py-2 align-top">
                          <Input type="email" value={row.guardianEmail} placeholder="guardian@email.com"
                            onChange={(e) => updateRow(row.id, { guardianEmail: e.target.value })}
                            error={row.errors.guardianEmail} />
                        </td>
```

3f. Created results — after the `<p …>Student login becomes available after this record syncs.</p>` line add:

```tsx
                        <p className="mt-0.5 text-xs text-gray-600">{parentLoginNote(result.rows[c.originalIndex])}</p>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run apps/desktop/renderer/components/students/bulk-import apps/desktop/renderer/components/students/BulkImportPage.test.tsx`
Expected: all PASS (31 existing + 16 new = 47).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm -C apps/desktop typecheck`
Expected: exit 0.
Run: `npx eslint apps/desktop/renderer/components/students/BulkImportPage.tsx apps/desktop/renderer/components/students/BulkImportPage.test.tsx apps/desktop/renderer/components/students/bulk-import`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/students/BulkImportPage.tsx apps/desktop/renderer/components/students/BulkImportPage.test.tsx
git commit -m "feat(bulk-import): Guardian Email column in the review grid and parent-login note in results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
