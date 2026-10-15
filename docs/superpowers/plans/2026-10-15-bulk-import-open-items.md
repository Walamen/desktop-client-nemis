# Bulk Import Open Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three items left open by the guardian-email work: an honest results note, a cross-row duplicate-student-email check (desktop), and portal-web reading desktop files' NEMIS ID and Grade Level columns.

**Architecture:** Task 1 is desktop renderer only (`bulk-import-logic.ts` `validateRows` + `BulkImportPage.tsx` copy). Task 2 is portal-web only: a new pure module `src/lib/student-import-cells.ts` replaces the inline grade and NEMIS ID lookups in the two portal-web parse sites. The tasks are in different repos and share no code.

**Tech Stack:** TypeScript strict, Vitest (+ Testing Library on desktop), SheetJS `xlsx`.

**Spec:** `docs/superpowers/specs/2026-10-15-bulk-import-open-items-design.md` (in desktop-client-nemis)

## Global Constraints

- Results note copy, exact: `Parent login for <email> is set up after this record syncs, unless that email already belongs to a student's login.` Blank-email copy unchanged: `No guardian email — the guardian won't get a parent login.`
- Duplicate-student-email message, exact: `Already used as a student's email in row N` (N = 1-based position of the FIRST row using that email). The first row stays valid. Blank-NEMIS rows only, on both sides. Trimmed + lower-cased. Runs after the existing rules; any existing `errors.studentEmail` wins.
- portal-web grade aliases, in order: `Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)` (U+2026), `Grade Level * (KG/K1/K2/GRADE_1...GRADE_12)`, `Grade Level`, `gradeLevel`.
- portal-web NEMIS ID aliases, in order: `NEMIS ID`, `NEMIS ID (leave blank for new students)`, `nemisId`. A non-negative integer number cell → `String(v).padStart(12, "0")`.
- Both helpers: first non-blank value among aliases, trimmed, `''` when none. Callers keep their own `.toUpperCase()` for grade.
- Desktop repo: `C:\Users\Alvin Dogba Jr\Desktop\Walamen\desktop-client-nemis`, branch `fix/bulk-import-open-items`. Nemis repo: `C:\Users\Alvin Dogba Jr\Desktop\Walamen\Nemis`, branch `fix/portal-bulk-import-desktop-headers`.
- Never commit `apps/portal-web/tsconfig.tsbuildinfo` (tracked, rewritten by every typecheck) — `git checkout -- apps/portal-web/tsconfig.tsbuildinfo` if it changes.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A desktop retry file (its NEMIS ID column header is `NEMIS ID (leave blank for new students)`) uploaded on portal-web must keep every NEMIS ID — no silent new-student creation. (Task 2 tests)
2. A NEMIS ID typed into Excel that starts with 0 arrives as a number and must come back as the 12-digit string. (Task 2 test)
3. Three new students with one shared student email: rows 2 and 3 both point at row 1, row 1 imports. (Task 1 test)
4. Deleting the first of two rows that share a student email must clear the other row's error (row numbers re-computed). (Task 1 page test)
5. A claim row sharing a student email with a new student must not block either. (Task 1 test)

---

### Task 1: Desktop — honest parent-login note and duplicate student email check

**Files:**
- Modify: `apps/desktop/renderer/components/students/bulk-import/bulk-import-logic.ts` (`validateRows`, ~78-91)
- Modify: `apps/desktop/renderer/components/students/BulkImportPage.tsx` (`parentLoginNote`, ~61-66)
- Test: `apps/desktop/renderer/components/students/bulk-import/bulk-import-logic.test.ts`
- Test: `apps/desktop/renderer/components/students/BulkImportPage.test.tsx`

**Interfaces:** `validateRows(rows: BulkRow[]): BulkRow[]` keeps its signature (pure, new row objects, order/ids kept).

- [ ] **Step 0: Branch** — in desktop-client-nemis: `git switch -c fix/bulk-import-open-items` (from `main`).

- [ ] **Step 1: Write the failing logic tests** — append to `bulk-import-logic.test.ts` (it already imports `XLSX`, `HEADERS`, `parseWorkbookToRows`, `validateRows`, `generateNemisId`, and defines `mk` and `toBytes`):

```ts
describe('validateRows duplicate student emails', () => {
  const dup = (n: number) => `Already used as a student's email in row ${n}`;

  it('flags every later row with the first row number; the first row stays valid', () => {
    const out = validateRows([
      mk({ studentEmail: 'kid@x.com' }), mk(), mk({ studentEmail: 'kid@x.com' }), mk({ studentEmail: 'kid@x.com' }),
    ]);
    expect(out[0]?.errors).toEqual({});
    expect(out[1]?.errors).toEqual({});
    expect(out[2]?.errors.studentEmail).toBe(dup(1));
    expect(out[3]?.errors.studentEmail).toBe(dup(1));
  });

  it('compares trimmed and case-insensitively', () => {
    const out = validateRows([mk({ studentEmail: ' Kid@X.com' }), mk({ studentEmail: 'kid@x.com ' })]);
    expect(out[1]?.errors.studentEmail).toBe(dup(1));
  });

  it('ignores claim rows on either side', () => {
    const claimFirst = validateRows([
      mk({ nemisId: generateNemisId(), studentEmail: 'kid@x.com' }), mk({ studentEmail: 'kid@x.com' }),
    ]);
    expect(claimFirst.map((r) => r.errors)).toEqual([{}, {}]);
    const claimSecond = validateRows([
      mk({ studentEmail: 'kid@x.com' }), mk({ nemisId: generateNemisId(), studentEmail: 'kid@x.com' }),
    ]);
    expect(claimSecond.map((r) => r.errors)).toEqual([{}, {}]);
  });

  it('earlier rules keep precedence', () => {
    expect(validateRows([mk({ studentEmail: 'a@bXc' }), mk({ studentEmail: 'a@bXc' })])[1]?.errors.studentEmail)
      .toBe('Invalid email');
    const out = validateRows([
      mk({ studentEmail: 'fam@x.com' }), mk({ guardianEmail: 'fam@x.com' }), mk({ studentEmail: 'fam@x.com' }),
    ]);
    expect(out[2]?.errors.studentEmail).toBe("Already used as a guardian's email in row 2");
  });

  it('parseWorkbookToRows applies it', () => {
    const line = (first: string) => [
      first, 'Kollie', '2014-03-02', 'FEMALE', '2026-09-01', 'GRADE_5', '',
      'Musu', 'Kollie', 'Mother', '+231770000000', 'kid@example.com',
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, line('Ama'), line('Bola')]), 'Students');
    const rows = parseWorkbookToRows(toBytes(wb));
    expect(rows[0]?.errors).toEqual({});
    expect(rows[1]?.errors.studentEmail).toBe(dup(1));
  });
});
```

- [ ] **Step 2: Update and add the page tests** — in `BulkImportPage.test.tsx`:

2a. Replace the `parentLoginNote` test constant with:

```ts
const parentLoginNote = (email: string) =>
  `Parent login for ${email} is set up after this record syncs, unless that email already belongs to a student's login.`;
```

2b. Append inside `describe('BulkImportPage', …)`:

```ts
  it('flags a student email already used by an earlier row until that row is removed', async () => {
    stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama'), sheetRow('Bola')]);

    const studentInputs = Array.from(
      document.querySelectorAll('input[placeholder="student@email.com"]'),
    ) as HTMLInputElement[];
    await user.clear(studentInputs[1]!);
    await user.type(studentInputs[1]!, 'ama@example.com');

    expect(screen.getByText("Already used as a student's email in row 1")).toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 1 Student');

    await user.click(screen.getAllByTitle('Remove row')[0]!);
    expect(screen.queryByText("Already used as a student's email in row 1")).not.toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 1 Student');
  });
```

- [ ] **Step 3: Run to verify RED**

Run (repo root): `npx vitest run apps/desktop/renderer/components/students/bulk-import apps/desktop/renderer/components/students/BulkImportPage.test.tsx`
Expected: the new duplicate tests, the new page test, and the existing "reads Guardian Email from the file…" test (new copy) FAIL; everything else passes.

- [ ] **Step 4: Implement `validateRows`** — replace the whole function with:

```ts
export function validateRows(rows: BulkRow[]): BulkRow[] {
  // A new student's guardian email becomes a parent login on sync, so another
  // new student's login can't use the same address — and two new students
  // can't share one login email either. Claims ignore both emails.
  const guardianEmails = rows.map((r) => (r.nemisId.trim() ? '' : r.guardianEmail.trim().toLowerCase()));
  const studentEmails = rows.map((r) => (r.nemisId.trim() ? '' : r.studentEmail.trim().toLowerCase()));
  return rows.map((row, i) => {
    const errors = validateRow(row);
    const studentEmail = studentEmails[i] ?? '';
    if (studentEmail && !errors.studentEmail) {
      const other = guardianEmails.findIndex((g, j) => j !== i && g === studentEmail);
      if (other !== -1) errors.studentEmail = `Already used as a guardian's email in row ${other + 1}`;
    }
    if (studentEmail && !errors.studentEmail) {
      const first = studentEmails.indexOf(studentEmail);
      if (first < i) errors.studentEmail = `Already used as a student's email in row ${first + 1}`;
    }
    return { ...row, errors };
  });
}
```

- [ ] **Step 5: Implement the copy** — in `BulkImportPage.tsx` `parentLoginNote`, the email branch becomes:

```ts
    ? `Parent login for ${email} is set up after this record syncs, unless that email already belongs to a student's login.`
```

- [ ] **Step 6: GREEN + gates**

Run: `npx vitest run apps/desktop/renderer/components/students/bulk-import apps/desktop/renderer/components/students/BulkImportPage.test.tsx` → all pass (57 existing + 6 new = 63).
Run: `pnpm -C apps/desktop typecheck` → exit 0.
Run: `npx eslint apps/desktop/renderer/components/students/BulkImportPage.tsx apps/desktop/renderer/components/students/BulkImportPage.test.tsx apps/desktop/renderer/components/students/bulk-import` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/components/students docs/superpowers
git commit -m "fix(bulk-import): flag duplicate student emails across rows; honest parent-login note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`docs/superpowers` carries this plan and its spec, already written.)

---

### Task 2: portal-web — read desktop files' NEMIS ID and Grade Level columns

**Files (Nemis repo):**
- Create: `apps/portal-web/src/lib/student-import-cells.ts`
- Create: `apps/portal-web/src/lib/student-import-cells.test.ts`
- Modify: `apps/portal-web/src/app/government/school-admin/students/create-bulk/page.tsx` (grade ~356-363, nemisId ~380)
- Modify: `apps/portal-web/src/components/school_admin/wizard-steps/StudentsStep.tsx` (grade ~232-236, nemisId ~259)

**Interfaces:**
- Produces: `readGradeLevelCell(r: Record<string, unknown>): string`, `readNemisIdCell(r: Record<string, unknown>): string`.

- [ ] **Step 0: Branch** — in `C:\Users\Alvin Dogba Jr\Desktop\Walamen\Nemis`: `git switch -c fix/portal-bulk-import-desktop-headers` (from `main`).

- [ ] **Step 1: Write the failing tests** — create `apps/portal-web/src/lib/student-import-cells.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readGradeLevelCell, readNemisIdCell } from "./student-import-cells";

describe("readGradeLevelCell", () => {
  it("reads portal-web's header, the desktop app's header, and the short forms", () => {
    expect(readGradeLevelCell({ "Grade Level * (KG/K1/K2/GRADE_1\u2026GRADE_12)": "GRADE_5" })).toBe("GRADE_5");
    expect(readGradeLevelCell({ "Grade Level * (KG/K1/K2/GRADE_1...GRADE_12)": "grade_5" })).toBe("grade_5");
    expect(readGradeLevelCell({ "Grade Level": "KG" })).toBe("KG");
    expect(readGradeLevelCell({ gradeLevel: "K1" })).toBe("K1");
  });

  it("takes the first non-blank value, trimmed, and '' when there is none", () => {
    expect(
      readGradeLevelCell({ "Grade Level * (KG/K1/K2/GRADE_1\u2026GRADE_12)": "  ", "Grade Level": " GRADE_2 " }),
    ).toBe("GRADE_2");
    expect(readGradeLevelCell({})).toBe("");
  });
});

describe("readNemisIdCell", () => {
  it("reads portal-web's header, the desktop app's header, and nemisId", () => {
    expect(readNemisIdCell({ "NEMIS ID": "482915736045" })).toBe("482915736045");
    expect(readNemisIdCell({ "NEMIS ID (leave blank for new students)": "482915736045" })).toBe("482915736045");
    expect(readNemisIdCell({ nemisId: "482915736045" })).toBe("482915736045");
  });

  it("takes the first non-blank value, trimmed, and '' when there is none", () => {
    expect(readNemisIdCell({ "NEMIS ID": "", "NEMIS ID (leave blank for new students)": " 4829-1573-6045 " }))
      .toBe("4829-1573-6045");
    expect(readNemisIdCell({ "NEMIS ID": "" })).toBe("");
    expect(readNemisIdCell({})).toBe("");
  });

  it("pads a whole-number cell back to 12 digits", () => {
    expect(readNemisIdCell({ "NEMIS ID": 12345678901 })).toBe("012345678901");
    expect(readNemisIdCell({ "NEMIS ID (leave blank for new students)": 482915736045 })).toBe("482915736045");
  });

  it("leaves a non-integer number as its string", () => {
    expect(readNemisIdCell({ "NEMIS ID": 12.5 })).toBe("12.5");
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run (in `apps/portal-web`): `npx vitest run src/lib/student-import-cells.test.ts`
Expected: FAIL — cannot resolve `./student-import-cells`.

- [ ] **Step 3: Create `apps/portal-web/src/lib/student-import-cells.ts`**

```ts
// Cells both student bulk-import screens (create-bulk page and the onboarding
// wizard) read under more than one header. The desktop app's template spells
// two headers differently from portal-web's, and a file from either app must
// import here — a dropped NEMIS ID would turn a claim into a duplicate student.

const GRADE_LEVEL_HEADERS = [
  "Grade Level * (KG/K1/K2/GRADE_1\u2026GRADE_12)",
  "Grade Level * (KG/K1/K2/GRADE_1...GRADE_12)", // desktop template
  "Grade Level",
  "gradeLevel",
];

const NEMIS_ID_HEADERS = [
  "NEMIS ID",
  "NEMIS ID (leave blank for new students)", // desktop template
  "nemisId",
];

function firstFilled(r: Record<string, unknown>, headers: string[]): unknown {
  for (const header of headers) {
    const value = r[header];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

/** Trimmed; callers upper-case it. */
export function readGradeLevelCell(r: Record<string, unknown>): string {
  return String(firstFilled(r, GRADE_LEVEL_HEADERS)).trim();
}

/** Excel stores a typed ID as a number and drops its leading zeros (about 1
 * in 10 IDs starts with 0), so a whole-number cell is padded back to 12. */
export function readNemisIdCell(r: Record<string, unknown>): string {
  const value = firstFilled(r, NEMIS_ID_HEADERS);
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value).padStart(12, "0");
  }
  return String(value).trim();
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run src/lib/student-import-cells.test.ts` → all pass.

- [ ] **Step 5: Use it in the create-bulk page** — `src/app/government/school-admin/students/create-bulk/page.tsx`:

Add the import next to the file's other `@/lib` / local imports:

```ts
import { readGradeLevelCell, readNemisIdCell } from "@/lib/student-import-cells";
```

Replace

```ts
                gradeLevel: String(
                  r["Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)"] ??
                    r["Grade Level"] ??
                    r["gradeLevel"] ??
                    "",
                )
                  .trim()
                  .toUpperCase(),
```

with

```ts
                gradeLevel: readGradeLevelCell(r).toUpperCase(),
```

and replace `                nemisId: String(r["NEMIS ID"] ?? r["nemisId"] ?? ""),` with

```ts
                nemisId: readNemisIdCell(r),
```

- [ ] **Step 6: Use it in the wizard** — `src/components/school_admin/wizard-steps/StudentsStep.tsx`:

Add the same import. Replace

```ts
            gradeLevel: str(
              r["Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)"] ??
                r["Grade Level"] ??
                r["gradeLevel"],
            ).toUpperCase(),
```

with

```ts
            gradeLevel: readGradeLevelCell(r).toUpperCase(),
```

and replace `            nemisId: String(r["NEMIS ID"] ?? r["nemisId"] ?? ""),` with

```ts
            nemisId: readNemisIdCell(r),
```

(`raw` there is typed `Record<string, string>[]`, which is assignable to the helpers' `Record<string, unknown>` parameter.)

- [ ] **Step 7: Gates**

Run (in `apps/portal-web`): `npx vitest run` → all pass (existing suites + the new file).
Run: `pnpm typecheck` → exit 0; then `git -C ../.. checkout -- apps/portal-web/tsconfig.tsbuildinfo` if it changed.
Run: `npx eslint src/lib/student-import-cells.ts src/lib/student-import-cells.test.ts src/app/government/school-admin/students/create-bulk/page.tsx src/components/school_admin/wizard-steps/StudentsStep.tsx` → 0 errors.

- [ ] **Step 8: Commit** (from the Nemis repo root)

```bash
git add apps/portal-web/src/lib/student-import-cells.ts apps/portal-web/src/lib/student-import-cells.test.ts apps/portal-web/src/app/government/school-admin/students/create-bulk/page.tsx apps/portal-web/src/components/school_admin/wizard-steps/StudentsStep.tsx
git commit -m "fix(portal-web): read the desktop template's NEMIS ID and Grade Level columns in bulk import

A desktop file's NEMIS ID column was ignored, so every claim row was
created as a new student with a second national ID.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
