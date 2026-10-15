# Bulk Import Per-Row Class (desktop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The desktop Bulk Import Students page enrols every row in its own class (chosen in the grid, named in the file, or auto-picked), with the term chosen once — so one file can hold several grades.

**Architecture:** A pure `class-placement.ts` resolves each row's class against every active class of the current year, loaded by a new non-paginated `loadYearClasses` on the shared Academic Foundation ViewModel. The page derives placement from rows + classes on every render. Local creates use each row's class; NEMIS-ID rows still go to the server in one `bulkClaim` call, now with `classId` on each row (server contract from the Nemis plan, Task 1).

**Tech Stack:** Electron + Next.js renderer, vanilla-Zustand ViewModels (`@nemis-desktop/presentation`), SheetJS, Vitest + Testing Library.

**Spec:** `Nemis/docs/superpowers/specs/2026-10-15-bulk-import-per-row-class-design.md` (full design — read it first) and the pointer `docs/superpowers/specs/2026-10-15-bulk-import-per-row-class-design.md` in this repo.

**Branch:** `feat/bulk-import-per-row-class` (already created, pointer spec committed at `9311c07`).

## Global Constraints

- Template column header is exactly `Class`, placed right after the Grade Level column (`HEADERS[6]`). Example row leaves it blank. Files without the column still import.
- Class-name matching: trimmed, case-insensitive, among classes **of the row's grade**; ambiguity falls back to exact-case, then `Pick a class`.
- Error strings (grade labels via the page's existing `human()` formatter, e.g. `GRADE 3`):
  - `Class "<name>" is <GRADE X>, not <GRADE Y>`
  - `No <GRADE Y> class named "<typed>" — pick one`
  - `Pick a class`
  - `No <GRADE Y> class — create one under Teaching → Classes`
- No "create one" class error may appear while classes are loading or after they failed to load. Import stays disabled until classes have loaded.
- `ClassTermPicker` is **not** modified (the single-student wizard uses it).
- The shared foundation store's `classes`, `classFilters` and `classPagination` must not be changed by the bulk page.
- NEMIS-ID rows stay in **one** `bulkClaim` call (max 500; overflow to retry), unchanged offline/outage/retry behaviour.
- `BulkClaimRow.classId` required; `BulkClaimRequest.classId` removed; IPC validator matches.
- Release order: this build ships only after the Nemis server with per-row `classId` is deployed.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run tests from the repo root with `pnpm vitest run <paths>`. Known: some infrastructure suites fail under plain Node because `better-sqlite3` is built for Electron's ABI; if the full `pnpm test` shows only those, confirm they fail identically on `main` (`git stash`) and record it, don't fix it.

## Review Focus

1. **More than 25 classes in the current year** — every class appears in the row dropdowns and auto-picks work for all grades. The shared list pages at 25; `loadYearClasses` must page at 100 until `total`. (Task 1 test with 230 classes.)
2. **Classes still loading / failed when the file is uploaded** — `Loading…` / `Couldn't load classes — Try again`, no "create one" text, Import disabled; Try again recovers and auto-picks appear. (Task 4 tests.)
3. **Admin changes a row's grade after a pick** — the picked class is dropped and the row re-resolves for the new grade; a class of another grade is never sent. (Task 2 "kept class of another grade" test; Task 4 grade-change test.)
4. **"Retry Failed Rows" after an import** — retried rows keep their placement (class name written into the row), and the downloaded retry file has a `Class` column that re-imports into the same class. (Task 2 retry-file round-trip test.)
5. **A claim row whose grade has no class** — fails locally with the class message and is never sent to `bulkClaim`. (Task 4 mixed-batch test, row 5.)

---

### Task 1: ViewModel — every active class of a year, all pages

**Files:**
- Modify: `packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.ts`
- Modify: `packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.test.ts`

**Interfaces:**
- Produces: state slice `yearClasses: AsyncState<readonly ClassRowView[]>` on `AcademicFoundationState`; method `loadYearClasses(academicYearId: string): Promise<void>`. Task 4 reads `foundation.store` → `s.yearClasses` and calls `foundation.loadYearClasses(id)`.

- [ ] **Step 1: Write the failing tests**

Append to `academic-foundation-view-model.test.ts` (add `ListClassesDto` to the existing `@nemis-desktop/application` type import):

```ts
describe('AcademicFoundationViewModel.loadYearClasses', () => {
  const cls = (n: number) => ({
    id: `c${n}`, academicYearId: 'y1', name: `C${n}`, gradeLevel: 'GRADE_1', isActive: true, subjectCount: 0,
  });

  /** Pages through `total` classes like the real use case. */
  function pagedAcademics(total: number) {
    const all = Array.from({ length: total }, (_, i) => cls(i + 1));
    return {
      listClasses: vi.fn(async (dto: ListClassesDto) => {
        const offset = dto.offset ?? 0;
        const limit = dto.limit ?? 25;
        return { data: { items: all.slice(offset, offset + limit), total, limit, offset } };
      }),
    };
  }

  const makeVm = (academics: unknown) =>
    new AcademicFoundationViewModel({
      academics: academics as AcademicsApplicationService,
      notifications: new NotificationStore(),
    });

  it('pages through every class of the year, 100 at a time', async () => {
    const academics = pagedAcademics(230);
    const vm = makeVm(academics);
    await vm.loadYearClasses('y1');
    expect(academics.listClasses.mock.calls.map(([dto]) => dto)).toEqual([
      { academicYearId: 'y1', limit: 100, offset: 0 },
      { academicYearId: 'y1', limit: 100, offset: 100 },
      { academicYearId: 'y1', limit: 100, offset: 200 },
    ]);
    const state = vm.store.getState().yearClasses;
    expect(state.status).toBe('success');
    if (state.status === 'success') expect(state.data).toHaveLength(230);
  });

  it('leaves the paginated class list, its filters and pagination alone', async () => {
    const vm = makeVm(pagedAcademics(3));
    vm.setClassFilters({ gradeLevel: 'GRADE_7' as never });
    const before = vm.store.getState();
    await vm.loadYearClasses('y1');
    const after = vm.store.getState();
    expect(after.classes).toBe(before.classes);
    expect(after.classFilters).toBe(before.classFilters);
    expect(after.classPagination).toBe(before.classPagination);
  });

  it('is empty when the year has no classes', async () => {
    const vm = makeVm(pagedAcademics(0));
    await vm.loadYearClasses('y1');
    expect(vm.store.getState().yearClasses.status).toBe('empty');
  });

  it('is an error, not empty, when a page cannot be read', async () => {
    const vm = makeVm({ listClasses: vi.fn(async () => { throw new Error('[DB_ERROR] boom'); }) });
    await vm.loadYearClasses('y1');
    expect(vm.store.getState().yearClasses.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.test.ts`
Expected: FAIL — `vm.loadYearClasses is not a function`.

- [ ] **Step 3: Implement**

In `academic-foundation-view-model.ts`:

1. Add to `AcademicFoundationState` after `classes`:

```ts
  /** Every class of one academic year (all pages) — see loadYearClasses. */
  readonly yearClasses: AsyncState<readonly ClassRowView[]>;
```

2. In the store initialiser add `yearClasses: idleState(),` after `classes: idleState(),`.
3. Next to `SUBJECT_PAGE_MAX`, add:

```ts
/** ListClassesUseCase clamps `limit` to 100 and the IPC validator rejects more. */
const CLASS_PAGE_MAX = 100;
```

4. After `loadClasses()`, add:

```ts
  /** Every class of one academic year, all pages, for pickers that must offer
   * every class (bulk import) — unlike `classes`, which is one 25-row page.
   * Leaves `classes`, its filters and its pagination untouched. */
  async loadYearClasses(academicYearId: string): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().yearClasses, set: (yearClasses) => this.store.setState({ yearClasses }) },
      fetch: async () => {
        const items: ClassRowView[] = [];
        let offset = 0;
        for (;;) {
          const { data } = await this.deps.academics.listClasses({ academicYearId, limit: CLASS_PAGE_MAX, offset });
          items.push(...data.items);
          offset += data.items.length;
          if (data.items.length === 0 || offset >= data.total) return { data: items };
        }
      },
      map: identity,
      isEmpty: (rows) => rows.length === 0,
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/presentation/src/view-models/academic-foundation/academic-foundation-view-model.test.ts`
Expected: all pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @nemis-desktop/presentation typecheck`
Expected: 0 errors. (If the filter name differs, use the `name` from `packages/presentation/package.json`.)

- [ ] **Step 6: Commit**

```bash
git add packages/presentation/src/view-models/academic-foundation/
git commit -m "feat(presentation): load every class of an academic year, across pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Class placement rules + the `Class` template column

**Files:**
- Create: `apps/desktop/renderer/components/students/bulk-import/class-placement.ts`
- Create: `apps/desktop/renderer/components/students/bulk-import/class-placement.test.ts`
- Modify: `apps/desktop/renderer/components/students/bulk-import/bulk-import-logic.ts` (`BulkRow`, `HEADERS`, `downloadTemplate`, `parseWorkbookToRows`, `buildRetryWorkbook`)
- Modify: `apps/desktop/renderer/components/students/bulk-import/bulk-import-logic.test.ts`
- Modify: `apps/desktop/renderer/components/students/bulk-import/run-bulk-import.test.ts` (`mk` only)
- Modify: `apps/desktop/renderer/components/students/BulkImportPage.tsx` (`emptyRow` only)
- Modify: `apps/desktop/renderer/components/students/BulkImportPage.test.tsx` (`sheetRow` only)

**Interfaces:**
- Produces (Task 4 uses these exact names):

```ts
// class-placement.ts
export interface ClassOption { id: string; name: string; gradeLevel: string }
export interface ClassPlacement { classId: string; className: string; error: string | null }
export const CLASS_HEADER = 'Class';
export const CLASS_COLUMN_NOTE: string;
export function resolveRowClass(row: { gradeLevel: string; className: string; classId: string }, classes: readonly ClassOption[]): ClassPlacement;
export function placeRows<T extends { gradeLevel: string; className: string; classId: string; errors: Record<string, string> }>(rows: readonly T[], classes: readonly ClassOption[] | null): T[];
export function isImportable(row: { classId: string; errors: Record<string, string> }): boolean;
// bulk-import-logic.ts — BulkRow gains:
className: string; // the file's Class cell, or the resolved class name
classId: string;   // picked/resolved class id, '' when none
```

- [ ] **Step 1: Write the failing placement tests**

Create `class-placement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isImportable, placeRows, resolveRowClass, type ClassOption } from './class-placement';

const c = (id: string, name: string, gradeLevel: string): ClassOption => ({ id, name, gradeLevel });
const g3a = c('c3a', '3A', 'GRADE_3');
const g3b = c('c3b', '3B', 'GRADE_3');
const g1a = c('c1a', '1A', 'GRADE_1');
const row = (over: Partial<{ gradeLevel: string; className: string; classId: string }> = {}) => ({
  gradeLevel: 'GRADE_3', className: '', classId: '', ...over,
});

describe('resolveRowClass', () => {
  it('keeps a picked class of the row grade', () => {
    expect(resolveRowClass(row({ classId: 'c3b' }), [g3a, g3b])).toEqual({ classId: 'c3b', className: '3B', error: null });
  });

  it('drops a kept class of another grade and re-resolves (auto-pick)', () => {
    expect(resolveRowClass(row({ gradeLevel: 'GRADE_1', classId: 'c3a' }), [g3a, g1a]))
      .toEqual({ classId: 'c1a', className: '1A', error: null });
  });

  it("matches the file's class name trimmed and case-insensitively within the grade", () => {
    expect(resolveRowClass(row({ className: '  3b ' }), [g3a, g3b])).toEqual({ classId: 'c3b', className: '3B', error: null });
  });

  it('names the other grade when the class belongs to it', () => {
    expect(resolveRowClass(row({ className: '1a' }), [g3a, g1a]).error).toBe('Class "1A" is GRADE 1, not GRADE 3');
  });

  it('flags a name that matches no class', () => {
    expect(resolveRowClass(row({ className: '3Z' }), [g3a, g3b]))
      .toEqual({ classId: '', className: '3Z', error: 'No GRADE 3 class named "3Z" — pick one' });
  });

  it('auto-picks the only class of the grade when the cell is blank', () => {
    expect(resolveRowClass(row(), [g3a, g1a])).toEqual({ classId: 'c3a', className: '3A', error: null });
  });

  it('asks for a pick when the grade has several classes', () => {
    expect(resolveRowClass(row(), [g3a, g3b]).error).toBe('Pick a class');
  });

  it('says to create a class when the grade has none', () => {
    expect(resolveRowClass(row(), [g1a]).error).toBe('No GRADE 3 class — create one under Teaching → Classes');
  });

  it('prefers the exact spelling when a case-insensitive name matches two classes', () => {
    const lower = c('lower', '3a', 'GRADE_3');
    expect(resolveRowClass(row({ className: '3a' }), [g3a, lower]).classId).toBe('lower');
    expect(resolveRowClass(row({ className: '3A ' }), [g3a, lower]).classId).toBe('c3a');
    expect(resolveRowClass(row({ className: ' 3A' }), [g3a, c('x', '3A ', 'GRADE_3')]).error).toBe('Pick a class');
  });

  it('gives no class error when the grade itself is missing or unknown', () => {
    expect(resolveRowClass(row({ gradeLevel: '' }), [g3a])).toEqual({ classId: '', className: '', error: null });
    expect(resolveRowClass(row({ gradeLevel: 'GRADE_99' }), [g3a]).error).toBeNull();
  });

  it('accepts a lower-case grade', () => {
    expect(resolveRowClass(row({ gradeLevel: 'grade_3' }), [g3a]).classId).toBe('c3a');
  });
});

describe('placeRows', () => {
  const r = (over: Partial<{ gradeLevel: string; className: string; classId: string }>, errors: Record<string, string> = {}) =>
    ({ ...row(over), id: 'r', errors });

  it('adds the class and its error to each row', () => {
    const [ok, bad] = placeRows([r({}), r({ className: '3Z' })], [g3a]);
    expect(ok).toMatchObject({ classId: 'c3a', className: '3A', errors: {} });
    expect(bad?.errors).toEqual({ classId: 'No GRADE 3 class named "3Z" — pick one' });
  });

  it("keeps the row's other errors and drops a stale class error", () => {
    const [placed] = placeRows([r({}, { firstName: 'Required', classId: 'old' })], [g3a]);
    expect(placed?.errors).toEqual({ firstName: 'Required' });
  });

  it('returns rows untouched while classes are not loaded — no class errors at all', () => {
    const input = [r({})];
    const out = placeRows(input, null);
    expect(out).toEqual(input);
    expect(isImportable(out[0]!)).toBe(false);
  });
});

describe('isImportable', () => {
  it('needs no errors and a class', () => {
    expect(isImportable({ classId: 'c', errors: {} })).toBe(true);
    expect(isImportable({ classId: '', errors: {} })).toBe(false);
    expect(isImportable({ classId: 'c', errors: { firstName: 'Required' } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run apps/desktop/renderer/components/students/bulk-import/class-placement.test.ts`
Expected: FAIL — cannot resolve `./class-placement`.

- [ ] **Step 3: Implement `class-placement.ts`**

```ts
import { grades, human } from '../shared';

// Which class each bulk-imported student is enrolled in. Same rules as
// portal-web's src/lib/student-import-class.ts (Nemis repo); keep them in step.

/** A class a row can be enrolled in: active, current academic year. */
export interface ClassOption {
  id: string;
  name: string;
  gradeLevel: string;
}

export interface ClassPlacement {
  classId: string;
  className: string;
  error: string | null;
}

export const CLASS_HEADER = 'Class';
export const CLASS_COLUMN_NOTE =
  'Optional. The class name as shown on the Classes page. Leave blank to pick automatically when the grade has only one class.';

const PICK_A_CLASS = 'Pick a class';
const KNOWN_GRADES = new Set<string>(grades);
const fold = (s: string) => s.trim().toLowerCase();

/** Spec rules, in order: keep a picked class that fits the grade; else match
 * the file's class name within the grade; else auto-pick the grade's only
 * class. A missing or unknown grade gets no class error — the grade's own
 * error already blocks the row. */
export function resolveRowClass(
  row: { gradeLevel: string; className: string; classId: string },
  classes: readonly ClassOption[],
): ClassPlacement {
  const grade = row.gradeLevel.trim().toUpperCase();
  const typed = row.className.trim();
  if (!KNOWN_GRADES.has(grade)) return { classId: '', className: typed, error: null };

  const ofGrade = classes.filter((c) => c.gradeLevel === grade);
  const kept = ofGrade.find((c) => c.id === row.classId);
  if (kept) return { classId: kept.id, className: kept.name, error: null };

  if (typed) {
    const matches = ofGrade.filter((c) => fold(c.name) === fold(typed));
    const chosen = matches.length > 1 ? matches.filter((c) => c.name.trim() === typed) : matches;
    const only = chosen.length === 1 ? chosen[0] : undefined;
    if (only) return { classId: only.id, className: only.name, error: null };
    if (matches.length > 1) return { classId: '', className: typed, error: PICK_A_CLASS };
    const elsewhere = classes.find((c) => fold(c.name) === fold(typed));
    if (elsewhere) {
      return { classId: '', className: typed, error: `Class "${elsewhere.name}" is ${human(elsewhere.gradeLevel)}, not ${human(grade)}` };
    }
    return { classId: '', className: typed, error: `No ${human(grade)} class named "${typed}" — pick one` };
  }

  const single = ofGrade.length === 1 ? ofGrade[0] : undefined;
  if (single) return { classId: single.id, className: single.name, error: null };
  if (ofGrade.length > 1) return { classId: '', className: '', error: PICK_A_CLASS };
  return { classId: '', className: '', error: `No ${human(grade)} class — create one under Teaching → Classes` };
}

/** Rows with their class resolved and its error (if any) under
 * `errors.classId`. `classes === null` means the list is still loading or
 * failed: rows come back untouched, with no class error, and none is
 * importable — a "create one" message must never fire on a transient failure. */
export function placeRows<
  T extends { gradeLevel: string; className: string; classId: string; errors: Record<string, string> },
>(rows: readonly T[], classes: readonly ClassOption[] | null): T[] {
  if (classes === null) return [...rows];
  return rows.map((row) => {
    const placement = resolveRowClass(row, classes);
    const errors = { ...row.errors };
    delete errors.classId;
    if (placement.error) errors.classId = placement.error;
    return { ...row, classId: placement.classId, className: placement.className, errors };
  });
}

export function isImportable(row: { classId: string; errors: Record<string, string> }): boolean {
  return row.classId !== '' && Object.keys(row.errors).length === 0;
}
```

- [ ] **Step 4: Run the placement tests to verify they pass**

Run: `pnpm vitest run apps/desktop/renderer/components/students/bulk-import/class-placement.test.ts`
Expected: all pass.

- [ ] **Step 5: Write the failing template/parse/retry tests**

In `bulk-import-logic.test.ts`:

1. `mk()` defaults: add `className: '', classId: '',` after `gradeLevel: 'GRADE_5',`.
2. Every positional row array built against `HEADERS` gains a class cell `''` right after its grade value — the `line` helper in "parseWorkbookToRows template example" (~line 72), `base` in "guardian email" (~line 199), the `line` helpers at ~line 341 and ~line 404, and any other array literal passed with `HEADERS`/`header` (search for `'GRADE_5', ''`).
3. Replace the index assertions:
   - "template headers include the NEMIS ID column after Grade Level" → rename to `'template headers: Grade Level, then Class, then NEMIS ID'` with:
     ```ts
     expect(HEADERS[5]).toMatch(/^Grade Level/);
     expect(HEADERS[6]).toBe('Class');
     expect(HEADERS[7]).toBe('NEMIS ID (leave blank for new students)');
     ```
   - "the template has a Guardian Email column right after Student Email": `HEADERS[12]` → `'Student Email'`, `HEADERS[13]` → `'Guardian Email'`, length `14`.
   - "a file without the column parses with a blank guardian email…": `HEADERS.slice(0, 12)` → `HEADERS.slice(0, 13)`.
4. Add:

```ts
describe('Class column', () => {
  const parseSheet = (header: string[], ...lines: unknown[][]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...lines]), 'Students');
    return parseWorkbookToRows(toBytes(wb));
  };
  const line = (klass: unknown) => [
    'Ama', 'Kollie', '2014-03-02', 'FEMALE', '2026-09-01', 'GRADE_3', klass, '',
    'Musu', 'Kollie', 'Mother', '+231770000000', '', '',
  ];

  it('reads the Class cell trimmed, with no class id yet and no new error', () => {
    const [row] = parseSheet(HEADERS, line('  3A '));
    expect(row).toMatchObject({ className: '3A', classId: '', errors: {} });
  });

  it('reads a numeric class name as text', () => {
    expect(parseSheet(HEADERS, line(7))[0]?.className).toBe('7');
  });

  it('a file without the Class column parses with a blank class', () => {
    const header = HEADERS.filter((h) => h !== 'Class');
    const withoutClass = line('').filter((_, i) => i !== 6);
    expect(parseSheet(header, withoutClass)[0]).toMatchObject({ className: '', classId: '', errors: {} });
  });

  it('the retry file writes each row class name and re-imports it', () => {
    const rows = [mk({ gradeLevel: 'GRADE_3', className: '3B', classId: 'c3b' })];
    const wb = buildRetryWorkbook(rows, [{ originalIndex: 0, reason: 'x' }]);
    const header = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Students']!, { header: 1 })[0];
    expect(header?.[6]).toBe('Class');
    expect(parseWorkbookToRows(toBytes(wb))[0]?.className).toBe('3B');
  });
});
```

5. In `run-bulk-import.test.ts`, `mk()` defaults: add `className: '', classId: '',` after `gradeLevel: 'GRADE_5',`.
6. In `BulkImportPage.test.tsx`, `sheetRow`: insert `''` (the class cell) right after `grade` in the returned array:

```ts
    firstName, 'Kollie', '2014-03-02', 'FEMALE', admission, grade, '', nemisId,
```

- [ ] **Step 6: Run to verify the new tests fail**

Run: `pnpm vitest run apps/desktop/renderer/components/students/bulk-import/bulk-import-logic.test.ts`
Expected: FAIL — `HEADERS[6]` is the NEMIS ID header, and rows have no `className`.

- [ ] **Step 7: Implement in `bulk-import-logic.ts` and the page's `emptyRow`**

1. Import: `import { CLASS_COLUMN_NOTE, CLASS_HEADER } from './class-placement';`
2. `BulkRow`, after `gradeLevel: string;`:

```ts
  /** The file's Class cell; once placed, the resolved class's name. */
  className: string;
  /** The class picked in the grid or resolved by placeRows; '' when none. */
  classId: string;
```

3. `HEADERS`: insert `CLASS_HEADER,` right after the Grade Level header (before `NEMIS_ID_HEADER`).
4. `downloadTemplate`: in `example`, insert `''` after `'GRADE_5'`. After the gender/grade loop, append the note:

```ts
  refRows.push(['', ''], ['Class (optional)', CLASS_COLUMN_NOTE]);
```

   and change `refSheet['!cols']` to `[{ wch: 18 }, { wch: 60 }]`.
5. `parseWorkbookToRows` mapping, after `gradeLevel: …,`:

```ts
        className: pick(r, CLASS_HEADER, 'class'),
        classId: '',
```

6. `buildRetryWorkbook`: insert `row.className,` right after `row.gradeLevel,` in the line array.
7. In `BulkImportPage.tsx`, `emptyRow()`: add `className: '',` and `classId: '',` after `gradeLevel: '',`.

- [ ] **Step 8: Run all bulk-import tests to verify they pass**

Run: `pnpm vitest run apps/desktop/renderer/components/students`
Expected: all pass (the page tests still run the batch flow; only `sheetRow`'s column positions changed).

- [ ] **Step 9: Typecheck and lint**

Run: `pnpm --filter ./apps/desktop typecheck && pnpm lint`
Expected: 0 errors.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/renderer/components/students/
git commit -m "feat(bulk-import): resolve each row's class from a Class column or by auto-pick

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `TermPicker` — the current year's term, on its own

**Files:**
- Create: `apps/desktop/renderer/components/students/bulk-import/TermPicker.tsx`
- Create: `apps/desktop/renderer/components/students/bulk-import/TermPicker.test.tsx`

**Interfaces:**
- Produces: `export interface TermValue { academicYearId: string; termId: string }` and `export function TermPicker(props: { value: TermValue; onChange: (value: TermValue) => void }): JSX.Element`. Task 4 renders it and reads `value.academicYearId` to load that year's classes.

`ClassTermPicker` stays untouched (Global Constraints); this is its year + term half, with the same loading/empty/error rules.

- [ ] **Step 1: Write the failing tests**

Create `TermPicker.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { TermPicker, type TermValue } from './TermPicker';

const currentYear = {
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 1, classCount: 1,
};
const pastYear = { ...currentYear, id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED' };
const term1 = { id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true };
const oldTerm = { ...term1, id: 't0', academicYearId: 'y0', name: 'Old Term' };

function stubNemis({ years = async () => [currentYear] as unknown[], terms = async () => [term1] as unknown[] } = {}) {
  const termsList = vi.fn(terms);
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => ({ id: 'inst-1', code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isApproved: true })) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(years) },
    term: { getCurrent: vi.fn(async () => null), list: termsList },
    classes: { list: vi.fn(async () => ({ items: [], total: 0 })) },
  };
  return { termsList };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

function Harness({ onChange }: { onChange: (v: TermValue) => void }) {
  const [value, setValue] = useState<TermValue>({ academicYearId: '', termId: '' });
  return <TermPicker value={value} onChange={(next) => { onChange(next); setValue(next); }} />;
}

async function renderPicker() {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  const onChange = vi.fn();
  render(<PresentationProvider layer={layer}><Harness onChange={onChange} /></PresentationProvider>);
  return { onChange, user: userEvent.setup({ delay: null }) };
}

function termSelect(): HTMLSelectElement {
  const label = Array.from(document.querySelectorAll('label')).find((l) => /^term/i.test(l.textContent ?? ''));
  const select = label?.parentElement?.querySelector('select');
  if (!(select instanceof HTMLSelectElement)) throw new Error('no Term select');
  return select;
}

describe('TermPicker', () => {
  it("shows the current year and reports it with the chosen term", async () => {
    stubNemis();
    const { onChange, user } = await renderPicker();
    expect(await screen.findByText('Academic year: 2025/2026')).toBeInTheDocument();
    await waitFor(() => expect(termSelect().querySelector('option[value="t1"]')).not.toBeNull());
    await user.selectOptions(termSelect(), 't1');
    expect(onChange).toHaveBeenLastCalledWith({ academicYearId: 'y1', termId: 't1' });
  });

  it("lists only the current year's terms", async () => {
    stubNemis({ years: async () => [pastYear, currentYear], terms: async () => [term1, oldTerm] });
    await renderPicker();
    await waitFor(() => expect(termSelect().querySelector('option[value="t1"]')).not.toBeNull());
    expect(termSelect().querySelector('option[value="t0"]')).toBeNull();
  });

  it('says so when there is no current academic year', async () => {
    stubNemis({ years: async () => [pastYear] });
    await renderPicker();
    expect(await screen.findByText(/There is no current academic year on this device/)).toBeInTheDocument();
  });

  it('says to create a term when the year has none', async () => {
    stubNemis({ terms: async () => [] });
    await renderPicker();
    expect(await screen.findByText(/No terms in this academic year/)).toBeInTheDocument();
  });

  it('offers a retry when terms fail to load, without the "create one" hint', async () => {
    const { termsList } = stubNemis({ terms: async () => { throw new Error('[DB_ERROR] boom'); } });
    const { user } = await renderPicker();
    expect(await screen.findByText(/Couldn.t load terms/)).toBeInTheDocument();
    expect(screen.queryByText(/No terms in this academic year/)).not.toBeInTheDocument();
    termsList.mockResolvedValue([term1]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(termSelect().querySelector('option[value="t1"]')).not.toBeNull());
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run apps/desktop/renderer/components/students/bulk-import/TermPicker.test.tsx`
Expected: FAIL — cannot resolve `./TermPicker`.

- [ ] **Step 3: Implement `TermPicker.tsx`**

```tsx
'use client';
import { useEffect } from 'react';
import { Button, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';

export interface TermValue {
  academicYearId: string;
  termId: string;
}

/** The term of the CURRENT academic year — ClassTermPicker's year + term half,
 * for screens where each row picks its own class. Same hint rules: a hint
 * renders only once a list has loaded empty, never while loading or after an
 * error. */
export function TermPicker({ value, onChange }: { value: TermValue; onChange: (value: TermValue) => void }) {
  const foundation = useAcademicFoundationViewModel();
  const years = useViewModel(foundation.store, (s) => s.academicYears);
  const terms = useViewModel(foundation.store, (s) => s.terms);

  useEffect(() => {
    void foundation.loadAcademicYears();
  }, [foundation]);

  const current =
    years.status === 'success' || years.status === 'refreshing' ? years.data.find((y) => y.isCurrent) : undefined;
  const yearId = current?.id ?? '';

  useEffect(() => {
    if (!yearId) return;
    void foundation.loadTerms(yearId);
  }, [foundation, yearId]);

  // Keep the reported year in step; a term of another year no longer fits.
  useEffect(() => {
    if (value.academicYearId !== yearId) onChange({ academicYearId: yearId, termId: '' });
  }, [yearId, value, onChange]);

  const noCurrentYear = (years.status === 'success' || years.status === 'refreshing') && !current;
  if (years.status === 'empty' || noCurrentYear) {
    return (
      <p className="text-sm text-amber-700">
        There is no current academic year on this device. Set one under Academic Years before enrolling.
      </p>
    );
  }
  if (years.status === 'error') {
    return (
      <div className="text-sm text-red-700">
        Couldn&apos;t load the academic year.{' '}
        <Button type="button" variant="secondary" onClick={() => void foundation.loadAcademicYears()}>
          Try again
        </Button>
      </div>
    );
  }

  // Only this year's terms: the shared store may still hold another year's list.
  const termOptions =
    terms.status === 'success' || terms.status === 'refreshing'
      ? terms.data.filter((t) => t.academicYearId === yearId).map((t) => ({ value: t.id, label: t.name }))
      : [];
  const termsLoaded = terms.status === 'success' || (terms.status === 'refreshing' && termOptions.length > 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Academic year: {current?.code ?? '…'}</p>
      {terms.status === 'error' ? (
        <div className="text-sm text-red-700">
          Couldn&apos;t load terms.{' '}
          <Button type="button" variant="secondary" onClick={() => void foundation.loadTerms(yearId)}>
            Try again
          </Button>
        </div>
      ) : terms.status === 'empty' ? (
        <p className="text-sm text-amber-700">No terms in this academic year — create one under Academic Setup → Terms, then return.</p>
      ) : (
        <Select
          label="Term"
          required
          placeholder={termsLoaded ? 'Select term' : 'Loading…'}
          options={termOptions}
          value={value.termId}
          onChange={(e) => onChange({ academicYearId: yearId, termId: e.target.value })}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run apps/desktop/renderer/components/students/bulk-import/TermPicker.test.tsx`
Expected: 5 passed. If the "no terms" test shows the Select instead, check how the renderer's term adapter maps `[]` — `trackQuery` turns an empty array into `empty` via `isEmpty`.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter ./apps/desktop typecheck && pnpm lint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/students/bulk-import/TermPicker.tsx apps/desktop/renderer/components/students/bulk-import/TermPicker.test.tsx
git commit -m "feat(bulk-import): TermPicker for the current academic year's term

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Switch bulk import to a class per row

One behavioural change across the claim contract, the import runner and the page. They cannot land separately: removing the batch `classId` from the claim request breaks the page until the page supplies per-row classes.

**Files:**
- Modify: `packages/types/src/registry.ts` (`BulkClaimRow`, `BulkClaimRequest`)
- Modify: `apps/desktop/electron/security/validateIpc.ts` (`assertBulkClaimRow`, `assertBulkClaimArgs`, ~lines 963–996)
- Modify: `apps/desktop/electron/ipc/handlers/school-admin/online-commands.test.ts` (`describe('registry bulk claim handler')`, ~line 137)
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts` (~line 275 fixture)
- Modify: `apps/desktop/renderer/services/nemis-bridge/school-admin/online-bridges.test.ts` (~line 27 fixture)
- Modify: `apps/desktop/renderer/components/students/bulk-import/bulk-import-logic.ts` (`partitionRows`, `toBulkClaimRows`, remove `gradeMismatchMessage`)
- Modify: `apps/desktop/renderer/components/students/bulk-import/bulk-import-logic.test.ts`
- Modify: `apps/desktop/renderer/components/students/bulk-import/run-bulk-import.ts`
- Modify: `apps/desktop/renderer/components/students/bulk-import/run-bulk-import.test.ts`
- Modify: `apps/desktop/renderer/components/students/BulkImportPage.tsx`
- Modify: `apps/desktop/renderer/components/students/BulkImportPage.test.tsx`

**Interfaces:**
- Consumes: `loadYearClasses` / `yearClasses` (Task 1); `placeRows`, `isImportable`, `ClassOption` (Task 2); `TermPicker`, `TermValue` (Task 3); server contract (Nemis plan Task 1).
- Produces:

```ts
// registry.ts
export interface BulkClaimRow { /* …existing… */ classId: string }
export interface BulkClaimRequest { academicYearId: string; termId: string; students: BulkClaimRow[] }
// bulk-import-logic.ts
export function partitionRows(rows: BulkRow[]): { local: IndexedRow[]; claim: IndexedRow[]; failed: { originalIndex: number; error: string }[] };
// run-bulk-import.ts
export async function runBulkImport(input: {
  rows: BulkRow[]; institutionId: string; academicYearId: string; termId: string; online: boolean;
  createAndEnroll: CreateAndEnrollFn; bulkClaim: BulkClaimFn;
}): Promise<BulkImportOutcome>;
```

- [ ] **Step 1: Write the failing IPC tests**

In `online-commands.test.ts`, `describe('registry bulk claim handler')`:

1. Add `classId: 'c',` to `row`.
2. Change `request` to `{ academicYearId: 'y', termId: 't', students: [row] }`.
3. Add two cases to the `it.each` rejects table:

```ts
    ['a row without a classId', { ...request, students: [{ ...row, classId: undefined }] }],
    ['a batch-level classId', { ...request, classId: 'c' }],
```

In `BackendProvisioningGateway.test.ts` (~line 275) and `online-bridges.test.ts` (~line 27), remove `classId: 'c',` from the request objects and add `classId: 'c'` to any `BulkClaimRow` literal they use.

Run: `pnpm vitest run apps/desktop/electron/ipc/handlers/school-admin/online-commands.test.ts`
Expected: FAIL — the valid request is rejected (`classId` is an unknown row key; batch `classId` missing), and "a batch-level classId" is accepted.

- [ ] **Step 2: Implement the contract**

`packages/types/src/registry.ts`:

```ts
/** One bulk-import row that carries a NEMIS ID. Mirrors the server's
 * POST /students/bulk row DTO. */
export interface BulkClaimRow {
  /** Canonical 12 digits. */
  nemisId: string;
  /** The class this row is enrolled in. Needs a server with per-row classes. */
  classId: string;
  // …all existing fields unchanged…
}

export interface BulkClaimRequest {
  academicYearId: string;
  termId: string;
  /** 1..500; each row names its own class. */
  students: BulkClaimRow[];
}
```

`validateIpc.ts`:
- `assertBulkClaimRow`: add `'classId'` to the `assertKnownKeys` list, and `assertString(row.classId, 'classId', ID_MAX_LENGTH);` after `assertNemisId(row.nemisId);`.
- `assertBulkClaimArgs`: `assertKnownKeys(request, ['academicYearId', 'termId', 'students']);` and delete `assertString(request.classId, 'classId', ID_MAX_LENGTH);`.

Run: `pnpm vitest run apps/desktop/electron/ipc/handlers/school-admin/online-commands.test.ts apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts apps/desktop/renderer/services/nemis-bridge/school-admin/online-bridges.test.ts`
Expected: all pass.

- [ ] **Step 3: Write the failing runner and logic tests**

`run-bulk-import.test.ts`:

1. Delete `const target = …` and add `const term = { academicYearId: 'y1', termId: 't1' };`. `mk()` defaults: `classId: 'c5'` (instead of `''` from Task 2).
2. In every `runBulkImport({ … })` call, replace `gradeLevel: GradeLevel.GRADE_5, … target,` with `…term,` (remove the `gradeLevel` and `target` keys). Remove the now-unused `GradeLevel` import if nothing else uses it.
3. First test: rename to `'creates local rows in their own class, one primary guardian and assertedNoNemisId false'` and expect `classId: 'c5'` (with `academicYearId: 'y1', termId: 't1'`).
4. Replace the "grade-mismatch rows fail…" test with:

```ts
  it('each local row is enrolled in its own class', async () => {
    const createAndEnroll = okCreate();
    await runBulkImport({
      rows: [mk({ classId: 'c5' }), mk({ gradeLevel: 'GRADE_6', classId: 'c6' })],
      institutionId: 'inst-1', ...term, online: true, createAndEnroll, bulkClaim: claimOk(),
    });
    const classIds = vi.mocked(createAndEnroll).mock.calls.map((c) => (c[0] as CreateAndEnrollStudentRequest).classId);
    expect(classIds).toEqual(['c5', 'c6']);
  });

  it('sends every NEMIS-ID row in one claim call, each with its own class and no batch class', async () => {
    const bulkClaim = claimOk();
    await runBulkImport({
      rows: [mk({ nemisId: generateNemisId(), classId: 'c5' }), mk({ gradeLevel: 'GRADE_6', nemisId: generateNemisId(), classId: 'c6' })],
      institutionId: 'inst-1', ...term, online: true, createAndEnroll: okCreate(), bulkClaim,
    });
    expect(bulkClaim).toHaveBeenCalledTimes(1);
    const request = bulkClaim.mock.calls[0]![0];
    expect(request).toEqual(expect.objectContaining({ academicYearId: 'y1', termId: 't1' }));
    expect(request).not.toHaveProperty('classId');
    expect(request.students.map((s) => s.classId)).toEqual(['c5', 'c6']);
  });

  it('a row without a class is failed locally and never sent', async () => {
    const bulkClaim = claimOk();
    const createAndEnroll = okCreate();
    const out = await runBulkImport({
      rows: [mk({ classId: '' }), mk({ nemisId: generateNemisId(), classId: '' })],
      institutionId: 'inst-1', ...term, online: true, createAndEnroll, bulkClaim,
    });
    expect(createAndEnroll).not.toHaveBeenCalled();
    expect(bulkClaim).not.toHaveBeenCalled();
    expect(out.failed).toEqual([
      { originalIndex: 0, error: 'Fix before importing: classId: Pick a class' },
      { originalIndex: 1, error: 'Fix before importing: classId: Pick a class' },
    ]);
  });
```

`bulk-import-logic.test.ts`:
1. `mk()` default `classId: 'c5'`.
2. Every `partitionRows(rows, GradeLevel.GRADE_5)` → `partitionRows(rows)`; delete any grade-mismatch assertion in `describe('partitionRows')`; remove the `GradeLevel` import if unused.
3. In `describe('toBulkClaimRows')` add `expect(out.map((r) => r.classId)).toEqual(['c5', 'c5']);`.

Run: `pnpm vitest run apps/desktop/renderer/components/students/bulk-import`
Expected: FAIL (type errors on the new `runBulkImport` input; classId missing from claim rows).

- [ ] **Step 4: Implement the runner and logic**

`bulk-import-logic.ts`:
1. Delete `gradeMismatchMessage`.
2. Replace `partitionRows`:

```ts
/** A row only reaches the server with no errors and a class. */
export function partitionRows(
  rows: BulkRow[],
): { local: IndexedRow[]; claim: IndexedRow[]; failed: { originalIndex: number; error: string }[] } {
  const local: IndexedRow[] = [];
  const claim: IndexedRow[] = [];
  const failed: { originalIndex: number; error: string }[] = [];
  rows.forEach((row, originalIndex) => {
    const errors = row.classId ? row.errors : { ...row.errors, classId: row.errors.classId ?? 'Pick a class' };
    const errorEntries = Object.entries(errors);
    if (errorEntries.length > 0) {
      const detail = errorEntries.map(([field, message]) => `${field}: ${message}`).join('; ');
      failed.push({ originalIndex, error: `Fix before importing: ${detail}` });
      return;
    }
    if (!row.nemisId.trim()) local.push({ originalIndex, row });
    else claim.push({ originalIndex, row });
  });
  return { local, claim, failed };
}
```

3. `toBulkClaimRows`: add `classId: row.classId,` after `nemisId: …`.
4. Remove `GradeLevel` from the type import if now unused (it is still used by `toBulkClaimRows` — keep it if so).

`run-bulk-import.ts`:
1. `toCreateRequest({ row }, institutionId, term: { academicYearId: string; termId: string })` → body uses `academicYearId: term.academicYearId, classId: row.classId, termId: term.termId`.
2. `runBulkImport` input type: remove `gradeLevel` and `target`; add `academicYearId: string; termId: string;`.
3. `const { local, claim, failed: mismatched } = partitionRows(input.rows);` — rename `mismatched` to `invalid` everywhere in the function (including `submitted: local.length + claim.length + invalid.length`), and update the `BulkImportOutcome.submitted` doc comment to `Valid rows that entered the import (local + claim + rows failed before sending).`
4. `toCreateRequest(entry, input.institutionId, input)`.
5. The claim call:

```ts
      const result = await input.bulkClaim({
        academicYearId: input.academicYearId,
        termId: input.termId,
        students: toBulkClaimRows(send),
      });
```

6. Remove the `GradeLevel` type import if unused.

Run: `pnpm vitest run apps/desktop/renderer/components/students/bulk-import`
Expected: all pass. (The page does not compile yet — next step.)

- [ ] **Step 5: Write the failing page tests**

In `BulkImportPage.test.tsx`:

1. Fixtures: add after `jss1a`:

```ts
const jss2a = { id: 'c2', academicYearId: 'y1', name: 'JSS2-A', gradeLevel: 'GRADE_8', isActive: true, subjectCount: 0 };
const jss1b = { id: 'c3', academicYearId: 'y1', name: 'JSS1-B', gradeLevel: 'GRADE_7', isActive: true, subjectCount: 0 };
```

2. `Stubs`: add `classes?: (request: unknown) => Promise<unknown>;`; in `stubNemis`: `const classesList = vi.fn(stubs.classes ?? (async () => ({ items: [jss1a], total: 1 })));`, use `classes: { list: classesList }`, and return `{ createAndEnroll, bulkClaim, classesList }`.
3. `sheetRow` options gain `klass = ''`, placed in the class cell (`…, grade, klass, nemisId, …`).
4. `upload()` ends with `await screen.findByRole('heading', { name: 'Enrollment' });` (was `'Batch placement'`). Same replacement for the two `await screen.findByText('Batch placement')` lines after "Retry Failed Rows".
5. Replace `pickBatch` with:

```ts
async function pickTerm(user: User) {
  await waitFor(() => expect(selectNear(/^term/i).querySelector('option[value="t1"]')).not.toBeNull());
  await user.selectOptions(selectNear(/^term/i), 't1');
}

/** The Class select of a review row (1-based). */
function classSelect(row: number): HTMLSelectElement {
  return screen.getByRole('combobox', { name: `Class for row ${row}` }) as HTMLSelectElement;
}
```

   and rename every `pickBatch(user)` call to `pickTerm(user)`.
6. Replace the first test ("Import is disabled until grade, class and term are chosen") with:

```ts
  it('auto-picks the only class of the row grade; Import waits for a term', async () => {
    stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);

    await waitFor(() => expect(classSelect(1).value).toBe('c1'));
    expect(importButtons().every((b) => b.disabled)).toBe(true);
    await pickTerm(user);
    await waitFor(() => expect(importButtons().every((b) => !b.disabled)).toBe(true));
  });

  it('a mixed-grade file imports each row into its own class', async () => {
    const id = generateNemisId();
    const { createAndEnroll, bulkClaim } = stubNemis({
      classes: async () => ({ items: [jss1a, jss2a], total: 2 }),
      bulkClaim: async () => ({ data: { created: [{ index: 0, nemisId: id }], failed: [], registryUnavailableMessage: null }, refreshed: true }),
    });
    const { user } = await renderPage();
    await upload(user, [
      sheetRow('Ama', { grade: 'GRADE_7' }),
      sheetRow('Bola', { grade: 'GRADE_8' }),
      sheetRow('Cece', { grade: 'GRADE_8', nemisId: id }),
    ]);
    await pickTerm(user);
    await runImport(user);

    expect(createAndEnroll.mock.calls.map((c) => (c[0] as { classId: string }).classId)).toEqual(['c1', 'c2']);
    const claim = bulkClaim.mock.calls[0]?.[0] as { students: { classId: string }[] };
    expect(claim).not.toHaveProperty('classId');
    expect(claim.students.map((s) => s.classId)).toEqual(['c2']);
  });

  it('a grade with several classes asks for a pick; picking enables Import', async () => {
    const { createAndEnroll } = stubNemis({ classes: async () => ({ items: [jss1a, jss1b], total: 2 }) });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await pickTerm(user);

    expect(await screen.findByText('Pick a class')).toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 0 Students');
    await user.selectOptions(classSelect(1), 'c3');
    await waitFor(() => expect(importButtons().every((b) => !b.disabled)).toBe(true));
    await runImport(user);
    expect((createAndEnroll.mock.calls[0]?.[0] as { classId: string }).classId).toBe('c3');
  });

  it("matches the file's Class column, and flags a name that matches no class", async () => {
    stubNemis({ classes: async () => ({ items: [jss1a, jss1b], total: 2 }) });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama', { klass: 'jss1-b' }), sheetRow('Bola', { klass: '7Z' })]);

    await waitFor(() => expect(classSelect(1).value).toBe('c3'));
    expect(screen.getByText('No GRADE 7 class named "7Z" — pick one')).toBeInTheDocument();
    expect(importButtons()[0]).toHaveTextContent('Import 1 Student');
  });

  it('changing a row grade drops its class and re-resolves for the new grade', async () => {
    stubNemis({ classes: async () => ({ items: [jss1a, jss2a], total: 2 }) });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await waitFor(() => expect(classSelect(1).value).toBe('c1'));

    const gradeSelect = classSelect(1).closest('tr')!.querySelectorAll('select')[1] as HTMLSelectElement;
    await user.selectOptions(gradeSelect, 'GRADE_8');
    await waitFor(() => expect(classSelect(1).value).toBe('c2'));
  });

  it('while classes load: no class errors and Import stays disabled', async () => {
    stubNemis({ classes: () => new Promise(() => {}) });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await pickTerm(user);

    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);
    expect(screen.queryByText(/create one under Teaching/)).not.toBeInTheDocument();
    expect(importButtons().every((b) => b.disabled)).toBe(true);
  });

  it('a failed class load offers Try again, never "create one"; a retry recovers', async () => {
    const { classesList } = stubNemis({ classes: async () => { throw new Error('[DB_ERROR] boom'); } });
    const { user } = await renderPage();
    await upload(user, [sheetRow('Ama')]);
    await pickTerm(user);

    expect(await screen.findByText(/Couldn.t load classes/)).toBeInTheDocument();
    expect(screen.queryByText(/create one under Teaching/)).not.toBeInTheDocument();
    expect(importButtons().every((b) => b.disabled)).toBe(true);

    classesList.mockResolvedValue({ items: [jss1a], total: 1 });
    await user.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    await waitFor(() => expect(classSelect(1).value).toBe('c1'));
    await waitFor(() => expect(importButtons().every((b) => !b.disabled)).toBe(true));
  });
```

7. "a mixed batch online…" test: `claimRequest` assertion becomes `expect(claimRequest).toMatchObject({ academicYearId: 'y1', termId: 't1' }); expect(claimRequest).not.toHaveProperty('classId');` and add `expect(claimRequest.students.map((s) => (s as unknown as { classId: string }).classId)).toEqual(['c1', 'c1']);`. Row 5 (Efua, GRADE_8, no GRADE_8 class in the default stub) now expects `'Fix before importing: classId: No GRADE 8 class — create one under Teaching → Classes'` instead of the grade-mismatch text.
8. Replace "a grade-mismatch row fails with the server-worded message and is never sent" with:

```ts
  it('a row whose grade has no class is never sent and says to create one', async () => {
    const { bulkClaim, createAndEnroll } = stubNemis();
    const { user } = await renderPage();
    await upload(user, [sheetRow('Efua', { grade: 'GRADE_8', nemisId: generateNemisId() }), sheetRow('Ama')]);
    expect(screen.getByText('No GRADE 8 class — create one under Teaching → Classes')).toBeInTheDocument();
    await pickTerm(user);
    await runImport(user);

    expect(bulkClaim).not.toHaveBeenCalled();
    expect(createAndEnroll).toHaveBeenCalledTimes(1);
    expect(
      within(entryFor('Row 1')).getByText('Fix before importing: classId: No GRADE 8 class — create one under Teaching → Classes'),
    ).toBeInTheDocument();
  });
```

Run: `pnpm vitest run apps/desktop/renderer/components/students/BulkImportPage.test.tsx`
Expected: FAIL (no "Enrollment" heading, no row Class selects; page doesn't compile against the new `runBulkImport`).

- [ ] **Step 6: Implement the page**

In `BulkImportPage.tsx`:

1. Imports: change React import to include `useMemo`; replace `import { ClassTermPicker, isClassTermComplete, type ClassTermValue } from './add-student/ClassTermPicker';` with:

```ts
import { useAcademicFoundationViewModel, useSettingsViewModel, useStudentsListViewModel } from '@/lib/presentation/hooks/school-admin';
import { TermPicker, type TermValue } from './bulk-import/TermPicker';
import { isImportable, placeRows, type ClassOption } from './bulk-import/class-placement';
```

   (merge with the existing `@/lib/presentation/hooks/school-admin` import; remove the `Select` import from `@nemis-desktop/ui` if no longer used and the `GradeLevelValue` type import if unused).
2. Replace `EMPTY_TARGET` with `const EMPTY_TERM: TermValue = { academicYearId: '', termId: '' };`.
3. State: delete `batchGrade` and `target`; add `const [term, setTerm] = useState<TermValue>(EMPTY_TERM);`.
4. After the `useEffect` that loads the school, add:

```ts
  const foundation = useAcademicFoundationViewModel();
  const yearClasses = useViewModel(foundation.store, (s) => s.yearClasses);

  useEffect(() => {
    if (term.academicYearId) void foundation.loadYearClasses(term.academicYearId);
  }, [foundation, term.academicYearId]);

  // null while loading or after a failed load: rows then show no class
  // errors and nothing is importable (never a "create one" on a failure).
  const classOptions = useMemo<ClassOption[] | null>(() => {
    if (yearClasses.status === 'empty') return [];
    if (yearClasses.status !== 'success' && yearClasses.status !== 'refreshing') return null;
    return yearClasses.data
      .filter((c) => c.isActive && c.academicYearId === term.academicYearId)
      .map((c) => ({ id: c.id, name: c.name, gradeLevel: c.gradeLevel }));
  }, [yearClasses, term.academicYearId]);
```

5. `updateRow`: a grade change drops the picked class:

```ts
  const updateRow = (id: string, patch: Partial<Omit<BulkRow, 'id' | 'errors'>>) => {
    setRows((prev) =>
      validateRows(
        prev.map((r) =>
          r.id === id ? { ...r, ...patch, ...(patch.gradeLevel !== undefined && { classId: '' }) } : r,
        ),
      ),
    );
  };
```

6. Replace `validRows` / `placementReady` / `canImport` with:

```ts
  // Placement is derived, not stored: auto-picks and file class names
  // re-resolve whenever rows or the class list change.
  const placedRows = useMemo(() => placeRows(rows, classOptions), [rows, classOptions]);
  const validRows = placedRows.filter(isImportable);
  const errorRowCount = placedRows.filter((r) => Object.keys(r.errors).length > 0).length;
  const canImport =
    validRows.length > 0 &&
    Boolean(term.academicYearId && term.termId) &&
    classOptions !== null &&
    Boolean(institutionId) &&
    !isSubmitting;
```

7. `handleSubmit`: guard `if (!canImport || !institutionId) return;`; `const submitted = placedRows;`; call:

```ts
      const outcome = await runBulkImport({
        rows: submitted,
        institutionId,
        academicYearId: term.academicYearId,
        termId: term.termId,
        online,
        createAndEnroll: (request) => listVm.createAndEnrollStudent(request),
        bulkClaim: (request) => registryBridge.bulkClaimStudents(request),
      });
```

8. Header help text (`Download the template…`): `Download the template, fill in student details, upload, review each row's class, choose the term, then import. Rows without a NEMIS ID are created on this device and enrolled in their row's class; rows with a NEMIS ID are claimed from the national registry, which needs a connection.`
9. Step 1 help: after `Leave the NEMIS ID blank for a student who has never had one.` add ` Class is optional: type the class name as shown on the Classes page, or leave it blank and pick it on the review screen.`
10. Replace the "Batch placement" card body with:

```tsx
            <div className="mb-5 max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Enrollment</h2>
              <p className="mb-4 text-sm text-gray-600">
                Each row is enrolled in its own class; choose the term once.
              </p>
              <TermPicker value={term} onChange={setTerm} />
            </div>
```

11. Counter: `{rows.length - validRows.length}` → `{errorRowCount}`.
12. Grid header: after `Grade Level *` add `<th className="min-w-[140px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Class *</th>`.
13. Grid body: `{rows.map((row, i) => {` → `{placedRows.map((row, i) => {`. After the Grade Level `<td>` add:

```tsx
                        <td className="px-3 py-2 align-top">
                          {classOptions === null ? (
                            yearClasses.status === 'error' ? (
                              <p className="pt-2 text-xs text-red-700">
                                Couldn&apos;t load classes.{' '}
                                <button type="button" className="underline"
                                  onClick={() => void foundation.loadYearClasses(term.academicYearId)}>
                                  Try again
                                </button>
                              </p>
                            ) : (
                              <p className="pt-2 text-xs text-gray-500">Loading…</p>
                            )
                          ) : (
                            <>
                              <select aria-label={`Class for row ${i + 1}`} value={row.classId}
                                onChange={(e) => updateRow(row.id, { classId: e.target.value, className: '' })}
                                className={inputClass(Boolean(row.errors.classId))}>
                                <option value="">Select class</option>
                                {classOptions
                                  .filter((c) => c.gradeLevel === row.gradeLevel.toUpperCase())
                                  .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              {row.errors.classId && <p className="mt-0.5 text-xs text-red-500">{row.errors.classId}</p>}
                            </>
                          )}
                        </td>
```

   Note: `updateRow` with `{ classId, className: '' }` must not trigger the grade-change clear — it only fires when `patch.gradeLevel !== undefined`.
14. `handleRetryFailed`: unchanged — `failed.rows` are the placed rows, so each keeps its `classId` and resolved `className`; `validateRows` drops the old class error and placement re-derives.
15. `handleReset`: also `setTerm(EMPTY_TERM)` is **not** wanted (the term stays chosen for the next file) — leave `handleReset` unchanged.

Run: `pnpm vitest run apps/desktop/renderer/components/students`
Expected: all pass.

- [ ] **Step 7: Full gates**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 0 type errors, 0 lint errors. Tests: everything touched passes; any failures must be the known `better-sqlite3` ABI suites — confirm they fail identically on `main` and list them in the task report. Search the renderer for `isClassTermComplete`, `gradeMismatchMessage`, `Batch placement`: none may remain in the bulk-import files (ClassTermPicker's own export stays).

- [ ] **Step 8: Commit**

```bash
git add packages/types/src/registry.ts apps/desktop/electron apps/desktop/renderer
git commit -m "feat(bulk-import): enrol each row in its own class; choose the term once

Local creates use each row's class and NEMIS-ID rows go in one claim call
with classId per row. Requires the Nemis server with per-row classes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Manual GUI checklist (Alvin, after all tasks — against a server with Nemis Task 1 deployed)

1. Upload a Grade 7 + Grade 8 file without a Class column → auto-picks where a grade has one class, "Pick a class" where it has several, "No … class — create one" where it has none; choose the term; Import; each student appears in their class.
2. Same file with a `Class` column (valid name, typo, other grade's class) → the three messages appear on the right rows.
3. A file with NEMIS-ID rows of two grades while online → one claim, each child enrolled in the right class.
4. Offline: local rows created in their classes; NEMIS-ID rows go to the retry file with a filled Class column; re-import it online.
