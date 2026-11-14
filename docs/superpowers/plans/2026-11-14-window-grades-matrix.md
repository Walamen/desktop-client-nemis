# Window Grades Per-Assessment Matrix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the desktop School Admin "View Grades" page (`WindowGradesPage.tsx`) so it shows one column per assessment with each student's marks, then the final grade and status, exactly as portal-web's `windows/[id]/grades` page does — and align two labels on both apps.

**Architecture:** A pure builder (`window-grades.ts`) reproduces the server's `getWindowGrades` algorithm from the local `grades` and `assessments` collections: final grade = the row with `assessmentId` null, assessment cells = rows whose `assessmentId` matches an `assessments` row for the period. The page loads the window, every `grades` row for its period (paged, no 250 cap) and every `assessments` row for the period, feeds the builder, and renders the web's table. portal-web gets two string changes.

**Tech Stack:** TypeScript, Next.js renderer under Electron, Vitest (`renderer` project, jsdom, React Testing Library), Tailwind. portal-web: Next.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-window-grades-matrix-design.md`

## Global Constraints

- Two repos. Desktop work on branch `feat/window-grades-matrix` in `desktop-client-nemis`; web work on branch `feat/window-grades-labels` in `Nemis`. Do **not** commit `desktop-client-nemis/apps/desktop/package.json` (Alvin's own uncommitted version bump).
- No new IPC channel, no main-process change, no server change, no change to the teacher gradebook (`renderer/app/government/teacher/grades/page.tsx`).
- Data semantics are the server's (`Nemis/apps/Server/src/grading/services/grade-entry-window.service.ts` `getWindowGrades`): a final grade is the `grades` row with `assessmentId == null`; a per-assessment mark is `marksObtained` of the row whose `assessmentId` equals an `assessments.id`; assessments order by `date` ascending; summary counts finals only, Submitted = status `SUBMITTED`, Published = status `PUBLISHED`.
- Labels (exact copy, both apps): column header `NEMIS ID`; search placeholder `Search student name or NEMIS ID…` (with the Unicode ellipsis `…`); subject tabs show the subject **name only**.
- Exam-type periods: no assessments exist, so the table is Student, NEMIS ID, Final Grade, Status. No Exam column.
- Final Grade cell (exact): `percentage.toFixed(1) + '%'` when `percentage` is a number, else `${marksObtained}/${maxMarks}`; then ` (${letterGrade})` in `font-normal text-slate-400` when present; `Not submitted` (`text-xs text-slate-400`) when no final row. Colour via existing `pctTone`.
- Status cell shows the final row's `status` only (no `· Published` suffix), using the existing `GRADE_STATUS_STYLE`.
- Collection reads page in chunks of 250 and stop when a page is empty or the fetched count reaches `total`.
- Roster page size is 100 (`MAX_LIMIT` in `electron/security/validateIpc.ts`).
- Run desktop tests from the repo root: `pnpm vitest run <file> [-t "<name>"]`. Typecheck: `pnpm -C apps/desktop typecheck`. Known machine state: the full suite may show better-sqlite3 Electron-ABI failures in `electron/**` tests unrelated to this plan; judge by the renderer files named in each task plus typecheck.
- portal-web: `pnpm -C apps/portal-web typecheck` and `pnpm -C apps/portal-web test` must stay green (359+ tests).

## Review Focus

1. A `grades` row whose `assessmentId` points at no `assessments` row for the period (unsynced or foreign instance) must produce no column and must not be shown as a final. → Task 2.
2. A student with per-assessment rows but no final row shows the marks and `Not submitted`, not a crash or a fabricated final. → Task 2 and Task 5.
3. A final row with `percentage` null falls back to `marksObtained/maxMarks`. → Task 2.
4. The paging loop must terminate when the bridge reports `total: 0` with a non-empty page (the existing test mock does exactly that) and must not loop forever. → Task 1.
5. Switching class must drop the previous class's subject selection and never show a stale subject's columns under the new class. → Task 5 (existing "follows a changed window id" test plus the new class-switch assertion).

---

### Task 1: Paged collection reads in `shared.tsx` and `assessments.ts`

**Files:**
- Modify: `apps/desktop/renderer/components/academic-grading/shared.tsx:94-105`
- Modify: `apps/desktop/renderer/components/academic-grading/assessments.ts`
- Create: `apps/desktop/renderer/components/academic-grading/shared.test.ts`
- Modify: `apps/desktop/renderer/components/academic-grading/assessments.test.ts`

**Interfaces:**
- Consumes: `sharedBridge.listSchoolAdminRecords({ collection, limit, offset }) → Promise<{ items: SchoolAdminRecord[]; total: number }>` from `@/services/nemis-bridge/shared`.
- Produces:
  - `export async function listAllRecords(collection: SchoolAdminCollection): Promise<SchoolAdminRecord[]>` in `shared.tsx` — pages with `limit: 250`, `offset` advancing by `items.length`; stops when `items.length === 0` or accumulated length `>= total`.
  - `listGradesForPeriod(gradingPeriodId)` in `shared.tsx` now uses `listAllRecords('grades')` then filters `item.gradingPeriodId === gradingPeriodId`.
  - `export async function listAssessmentsForGradingPeriod(gradingPeriodId: string): Promise<SchoolAdminRecord[]>` in `assessments.ts` — `listAllRecords('assessments')` filtered by `gradingPeriodId`, raw records (the builder in Task 2 maps them).

- [ ] **Step 1: Write the failing paging tests in `shared.test.ts`**

Mock pattern: same `vi.mock('@/services/nemis-bridge/shared', …)` as `GradeEntryWindowsDrawer.test.tsx`, but the mock reads `limit`/`offset` and slices a hoisted `data.grades` array, returning `total: data.total`.

```ts
describe('listGradesForPeriod', () => {
  it('pages past the first 250 rows before filtering by period', async () => {
    data.grades = Array.from({ length: 300 }, (_, i) => ({ id: `g${i}`, gradingPeriodId: i % 2 ? 'p1' : 'p2' }));
    data.total = 300;
    const rows = await listGradesForPeriod('p1');
    expect(rows).toHaveLength(150);
    const offsets = list().mock.calls.map(([r]) => r.offset ?? 0);
    expect(offsets).toEqual([0, 250]);
  });
  it('stops after one page when the bridge reports total 0 with items', async () => {
    data.grades = [{ id: 'g1', gradingPeriodId: 'p1' }];
    data.total = 0;
    await expect(listGradesForPeriod('p1')).resolves.toHaveLength(1);
    expect(list()).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/desktop/renderer/components/academic-grading/shared.test.ts`
Expected: FAIL — first test gets `offsets` `[0]` and 125 rows.

- [ ] **Step 3: Implement `listAllRecords` and switch `listGradesForPeriod` to it**

Keep `listPeriodsForTerm` and `listAllWindows` unchanged. Update the comment above `listPeriodsForTerm` to say grades now page the whole collection.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run apps/desktop/renderer/components/academic-grading/shared.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for `listAssessmentsForGradingPeriod` in `assessments.test.ts`**

Use the file's existing `installMock` helper (it ignores offset, so one page).

```ts
describe('listAssessmentsForGradingPeriod', () => {
  it('returns raw assessment rows of every class and subject in the period', async () => {
    installMock({ assessments: [
      { id: 'a1', templateId: 't1', classId: 'c1', subjectId: 's1', gradingPeriodId: 'p1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' },
      { id: 'a2', templateId: 't2', classId: 'c2', subjectId: 's9', gradingPeriodId: 'p1', name: 'Project', type: 'PROJECT', totalMarks: 50, weight: 30, date: '2026-02-10' },
      { id: 'a3', templateId: 't1', classId: 'c1', subjectId: 's1', gradingPeriodId: 'p2', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-05-01' },
    ] });
    const rows = await listAssessmentsForGradingPeriod('p1');
    expect(rows.map((r) => r.id)).toEqual(['a1', 'a2']);
  });
});
```

- [ ] **Step 6: Run to verify failure, implement, run to verify pass**

Run: `pnpm vitest run apps/desktop/renderer/components/academic-grading/assessments.test.ts`
Expected: FAIL (export missing) → implement `listAssessmentsForGradingPeriod` using `listAllRecords` imported from `./shared` → PASS.

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm -C apps/desktop typecheck` — Expected: clean.

```bash
git add apps/desktop/renderer/components/academic-grading/shared.tsx apps/desktop/renderer/components/academic-grading/shared.test.ts apps/desktop/renderer/components/academic-grading/assessments.ts apps/desktop/renderer/components/academic-grading/assessments.test.ts
git commit -m "feat(grades): page through the whole grades and assessments collections"
```

---

### Task 2: Pure builder `window-grades.ts`

**Files:**
- Create: `apps/desktop/renderer/components/academic-grading/window-grades.ts`
- Create: `apps/desktop/renderer/components/academic-grading/window-grades.test.ts`

**Interfaces:**
- Consumes: `SchoolAdminRecord` from `@nemis-desktop/types`. No bridge calls — pure.
- Produces (all exported from `window-grades.ts`):

```ts
export interface WindowAssessment { id: string; name: string; type: string; totalMarks: number; weight: number | null; date: string }
export interface WindowFinal { marksObtained: number; maxMarks: number; percentage: number | null; letterGrade: string | null; status: string }
export interface WindowGradesSummary { classes: number; studentsGraded: number; finalsSubmitted: number; finalsPublished: number }
export interface WindowGradesView {
  readonly classIds: readonly string[];                                  // distinct non-empty classId of grade rows, first-appearance order
  subjectIdsFor(classId: string): string[];                              // union of subjectIds seen in assessments and grades for the class, first-appearance order (page sorts by name)
  assessmentsFor(classId: string, subjectId: string): WindowAssessment[]; // ordered by date asc, then name
  marksFor(studentId: string, assessmentId: string): number | null;      // marksObtained of the matching per-assessment row
  finalFor(studentId: string, classId: string, subjectId: string): WindowFinal | null; // row with assessmentId == null
  readonly summary: WindowGradesSummary;
}
export function buildWindowGrades(grades: readonly SchoolAdminRecord[], assessments: readonly SchoolAdminRecord[]): WindowGradesView
```

Rules the tests pin: a grade row whose `assessmentId` is non-null but matches no assessment row is ignored entirely (neither a column nor a final); `percentage` is `Number(...)` when a number, else `null`; `letterGrade` is `String(...)` or `null`; `summary.classes === classIds.length`; `studentsGraded` = distinct `studentId` among final rows; `finalsSubmitted` = finals with `status === 'SUBMITTED'`; `finalsPublished` = finals with `status === 'PUBLISHED'`.

- [ ] **Step 1: Write the failing tests**

Fixtures: `grade(over)` with defaults `{ id, studentId: 'st1', classId: 'c1', subjectId: 'sub1', gradingPeriodId: 'p1', assessmentId: null, marksObtained: 78.6, maxMarks: 100, percentage: 78.6, letterGrade: 'B', status: 'SUBMITTED', isPublished: false }`; `assessment(over)` with defaults `{ id: 'a1', templateId: 't1', classId: 'c1', subjectId: 'sub1', gradingPeriodId: 'p1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' }`.

```ts
it('lists classes from grade rows and subjects from assessments and grades', () => {
  const view = buildWindowGrades(
    [grade(), grade({ id: 'g2', classId: 'c2', subjectId: 'sub2' })],
    [assessment({ classId: 'c1', subjectId: 'sub3' })],
  );
  expect(view.classIds).toEqual(['c1', 'c2']);
  expect(view.subjectIdsFor('c1')).toEqual(['sub3', 'sub1']);
  expect(view.subjectIdsFor('c2')).toEqual(['sub2']);
});
it('orders assessments by date then name and reads marks per assessment', () => {
  const view = buildWindowGrades(
    [grade({ id: 'g1', assessmentId: 'a2', marksObtained: 41, maxMarks: 50 }), grade({ id: 'g2', assessmentId: 'a1', marksObtained: 18, maxMarks: 20 })],
    [assessment({ id: 'a2', name: 'Project', totalMarks: 50, weight: 30, date: '2026-02-10' }), assessment({ id: 'a1', date: '2026-02-01' })],
  );
  expect(view.assessmentsFor('c1', 'sub1').map((a) => a.id)).toEqual(['a1', 'a2']);
  expect(view.marksFor('st1', 'a1')).toBe(18);
  expect(view.marksFor('st1', 'a2')).toBe(41);
  expect(view.marksFor('st1', 'missing')).toBeNull();
});
it('takes the final only from the row with no assessmentId', () => {
  const view = buildWindowGrades(
    [grade({ id: 'g1', assessmentId: 'a1', marksObtained: 18, maxMarks: 20, percentage: null, letterGrade: null, status: 'DRAFT' }), grade({ id: 'g2' })],
    [assessment()],
  );
  expect(view.finalFor('st1', 'c1', 'sub1')).toEqual({ marksObtained: 78.6, maxMarks: 100, percentage: 78.6, letterGrade: 'B', status: 'SUBMITTED' });
});
it('returns null final and keeps marks for a student without a final row', () => {
  const view = buildWindowGrades([grade({ assessmentId: 'a1', marksObtained: 18 })], [assessment()]);
  expect(view.finalFor('st1', 'c1', 'sub1')).toBeNull();
  expect(view.marksFor('st1', 'a1')).toBe(18);
});
it('ignores a per-assessment row whose assessment is not in the period', () => {
  const view = buildWindowGrades([grade({ assessmentId: 'ghost', marksObtained: 5 })], []);
  expect(view.assessmentsFor('c1', 'sub1')).toEqual([]);
  expect(view.finalFor('st1', 'c1', 'sub1')).toBeNull();
  expect(view.marksFor('st1', 'ghost')).toBeNull();
});
it('keeps a null percentage so the page can fall back to marks/max', () => {
  const view = buildWindowGrades([grade({ percentage: null, letterGrade: null, marksObtained: 72, maxMarks: 100 })], []);
  expect(view.finalFor('st1', 'c1', 'sub1')).toMatchObject({ percentage: null, letterGrade: null, marksObtained: 72, maxMarks: 100 });
});
it('exam-type period: subject listed with zero assessment columns', () => {
  const view = buildWindowGrades([grade({ examScore: 72 })], []);
  expect(view.subjectIdsFor('c1')).toEqual(['sub1']);
  expect(view.assessmentsFor('c1', 'sub1')).toEqual([]);
});
it('summary counts finals only, SUBMITTED and PUBLISHED separately', () => {
  const view = buildWindowGrades(
    [
      grade({ id: 'f1' }),
      grade({ id: 'f2', studentId: 'st2', status: 'PUBLISHED' }),
      grade({ id: 'f3', studentId: 'st3', status: 'DRAFT' }),
      grade({ id: 'f4', studentId: 'st1', subjectId: 'sub2', status: 'SUBMITTED' }),
      grade({ id: 'x1', studentId: 'st9', assessmentId: 'a1', status: 'SUBMITTED' }),
      grade({ id: 'c2', studentId: 'st4', classId: 'c2', status: 'LOCKED' }),
    ],
    [assessment()],
  );
  expect(view.summary).toEqual({ classes: 2, studentsGraded: 4, finalsSubmitted: 2, finalsPublished: 1 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/desktop/renderer/components/academic-grading/window-grades.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildWindowGrades`**

Index once: `assessmentById: Map<string, WindowAssessment & { classId; subjectId }>`; `marks: Map<\`${studentId}::${assessmentId}\`, number>`; `finals: Map<\`${studentId}::${classId}::${subjectId}\`, WindowFinal>`; `subjectsByClass: Map<string, Set<string>>` fed first from assessments (in input order) then from grades. Return a plain object whose methods close over the maps.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run apps/desktop/renderer/components/academic-grading/window-grades.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm -C apps/desktop typecheck` — Expected: clean.

```bash
git add apps/desktop/renderer/components/academic-grading/window-grades.ts apps/desktop/renderer/components/academic-grading/window-grades.test.ts
git commit -m "feat(grades): pure window-grades builder mirroring the server's getWindowGrades"
```

---

### Task 3: Test support — let page tests stub students, classes and subjects

**Files:**
- Modify: `apps/desktop/renderer/components/academic-grading/setup-test-support.tsx:26-50`

**Interfaces:**
- Produces: `stubNemis` gains an optional `more?: Record<string, unknown>` option spread **last** into the `window.nemis` stub, so a test can add `student`, `classes` and `subject` namespaces:
  All three return `PagedListResult<T>` from `packages/types/src/academics.ts`: `{ items, total, limit, offset }`.
  - `student.list(request)` items (per `StudentListItemResult`, mapped by `toStudentRowView`): `{ id, fullName, nemisId, gradeLevel, isActive, dateOfBirth, gender, updatedAt }`,
  - `classes.list(request)` items: `{ id, academicYearId, name, gradeLevel, isActive, subjectCount }`,
  - `subject.list(request)` items: `{ id, name, code, isActive, classCount }`.

- [ ] **Step 1: Add the `more` option**

```ts
export function stubNemis({ years = [...], terms = [], currentYear = null, academicYear = {}, term = {}, more = {} }: { …; more?: Record<string, unknown> } = {}) {
  (window as unknown as { nemis: unknown }).nemis = { …existing…, ...more };
}
```

- [ ] **Step 2: Run the sibling drawer tests to prove nothing changed**

Run: `pnpm vitest run apps/desktop/renderer/components/academic-grading/GradeEntryWindowsDrawer.test.tsx apps/desktop/renderer/components/academic-grading/AcademicGradingPage.test.tsx`
Expected: PASS, same counts as before.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/setup-test-support.tsx
git commit -m "test(grades): stubNemis accepts extra bridge namespaces"
```

---

### Task 4: Page rewrite — data loading and the matrix table

**Files:**
- Modify: `apps/desktop/renderer/components/academic-grading/WindowGradesPage.tsx` (whole file)

**Interfaces:**
- Consumes: `listGradesForPeriod` (Task 1), `listAssessmentsForGradingPeriod` (Task 1), `buildWindowGrades`/`WindowGradesView` (Task 2), existing `GRADE_STATUS_STYLE`, `pctTone`, `useQueryParam`, `useRevalidateOnSync`, `useAcademicFoundationViewModel`, `useStudentsViewModel`, `formatNemisId`, `normalizeNemisId`, `academicSetupHref`.
- Produces: the rendered page; no new exports.

- [ ] **Step 1: Replace the file header comment**

Delete the stale comment (lines 17–22) and write: the page mirrors portal-web's `windows/[id]/grades` page; `grades` holds one row per student × assessment (`assessmentId` set) plus a final row (`assessmentId` null); `buildWindowGrades` reproduces the server's `getWindowGrades`.

- [ ] **Step 2: Load window, grades and assessments together**

In the existing `useRevalidateOnSync` loader, after finding `found`, run `Promise.all([listGradesForPeriod(periodId), listAssessmentsForGradingPeriod(periodId)])` and store both (`const [grades, setGrades]`, `const [assessments, setAssessments]`), keeping the `cancelled` guard. Reset `assessments` to `[]` in the windowId-change reset effect. Derive `const view = useMemo(() => buildWindowGrades(grades, assessments), [grades, assessments])`.

- [ ] **Step 3: Replace the derived state**

- `classIds` → `view.classIds`.
- `subjectIdsForClass` → `view.subjectIdsFor(selectedClassId)` sorted by `subjectLabel` (`localeCompare`).
- `subjectLabel(id)` → the subject **name** from the foundation ViewModel, falling back to `id`.
- `gradeFor` → delete. Use `view.finalFor(student.id, selectedClassId, selectedSubjectId)` and `view.marksFor(student.id, a.id)`.
- `summary` → `view.summary`.
- Roster: when `selectedClassId` changes, `students.setFilters({ classId: selectedClassId, isActive: true, sort: 'name' })` then `void students.setPageSize(100)` (it reloads; drop the separate `loadStudents()` call).

- [ ] **Step 4: Render the web table**

Columns: `Student`, `NEMIS ID`, one `<th>` per `view.assessmentsFor(selectedClassId, selectedSubjectId)` with `<div>{a.name}</div><div className="normal-case font-normal text-slate-300">/{a.totalMarks}{a.weight != null ? ` · ${a.weight}%` : ''}</div>`, `Final Grade`, `Status`. Cell for an assessment: `marks != null ? <span className="font-semibold text-slate-700">{marks}<span className="text-slate-300 font-normal mx-0.5">/</span><span className="text-slate-500 font-normal">{a.totalMarks}</span></span> : <span className="text-slate-300">—</span>`. Final and Status cells per Global Constraints. `colSpan` of the "No students match your search." row = `4 + assessments.length`. Search placeholder exact: `Search student name or NEMIS ID…`. Subject tab text = `subjectLabel(id)`.

- [ ] **Step 5: CSV export mirrors the web**

Header: `['Student', 'NEMIS ID', ...assessments.map((a) => `${a.name} (/${a.totalMarks})`), 'Final %', 'Grade', 'Status']`. Row: name, formatted NEMIS ID (keep the existing DASHED-export comment), per-assessment `marksFor ?? ''`, `final?.percentage != null ? final.percentage.toFixed(1) : ''`, `final?.letterGrade ?? ''`, `final?.status ?? 'Not submitted'`. Filename: `grades-${classLabel}-${subjectLabel}.csv`.

- [ ] **Step 6: Existing tests and typecheck**

Run: `pnpm vitest run apps/desktop/renderer/components/academic-grading/WindowGradesPage.test.tsx` — Expected: the 3 existing tests PASS (they assert heading, not-found and class buttons only).
Run: `pnpm -C apps/desktop typecheck` — Expected: clean.
Run: `pnpm lint` — Expected: 0 errors (renderer boundary guard still satisfied; no `window.nemis` access added).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/WindowGradesPage.tsx
git commit -m "feat(grades): per-assessment matrix on the window grades page, mirroring the web"
```

---

### Task 5: Page tests for the matrix

**Files:**
- Modify: `apps/desktop/renderer/components/academic-grading/WindowGradesPage.test.tsx`

**Interfaces:**
- Consumes: `stubNemis({ more })` (Task 3); the hoisted `data` mock gains `assessments: []` and the mock serves `collection === 'assessments'`.

- [ ] **Step 1: Extend the mock and fixtures**

Add `assessments` to `data`; serve it from the `listSchoolAdminRecords` mock. In `beforeEach`, call `stubNemis({ more: { student: { list: vi.fn(async () => ({ items: [studentRow('st1', 'Grace Kollie', '250100420331')], total: 1, limit: 100, offset: 0 })) }, classes: { list: vi.fn(async () => ({ items: [classRow('c1', 'Grade 7A'), classRow('c2', 'Grade 7B')], total: 2, limit: 25, offset: 0 })) }, subject: { list: vi.fn(async () => ({ items: [subjectRow('sub1', 'Mathematics', 'MTH')], total: 1, limit: 25, offset: 0 })) } } })` with fixture helpers per Task 3's shapes. Seed `data.assessments = [assessment({ id: 'a1', name: 'Quiz 1', totalMarks: 20, weight: 20, date: '2026-02-01' }), assessment({ id: 'a2', name: 'Project', totalMarks: 50, weight: 30, date: '2026-02-10' })]` and grades: a per-assessment row `grade({ id: 'q1', assessmentId: 'a1', marksObtained: 18, maxMarks: 20, percentage: null, letterGrade: null, status: 'DRAFT' })` listed **before** the final row `grade({ id: 'g1' })` (defaults: `marksObtained: 78.6, maxMarks: 100, percentage: 78.6, letterGrade: 'B', status: 'SUBMITTED', assessmentId: null`), plus the existing `p2`/`c2` row.

- [ ] **Step 2: Write the failing tests**

```ts
it('renders one column per assessment with marks, weight and total', async () => {
  await renderWithLayer(<WindowGradesPage />);
  expect(await screen.findByText('Quiz 1')).toBeInTheDocument();
  expect(screen.getByText('/20 · 20%')).toBeInTheDocument();
  expect(screen.getByText('Project')).toBeInTheDocument();
  expect(screen.getByText('/50 · 30%')).toBeInTheDocument();
  const row = (await screen.findByText('Grace Kollie')).closest('tr')!;
  expect(within(row).getByText('18')).toBeInTheDocument();
  expect(within(row).getAllByText('—')).toHaveLength(1); // Project not entered
});
it('shows the final from the row without assessmentId, not the first matching row', async () => {
  await renderWithLayer(<WindowGradesPage />);
  const row = (await screen.findByText('Grace Kollie')).closest('tr')!;
  expect(within(row).getByText('78.6%')).toBeInTheDocument();
  expect(within(row).getByText('(B)')).toBeInTheDocument();
  expect(within(row).getByText('SUBMITTED')).toBeInTheDocument();
  expect(within(row).queryByText(/Published/)).toBeNull();
});
it('uses NEMIS ID and the subject name only', async () => {
  await renderWithLayer(<WindowGradesPage />);
  expect(await screen.findByRole('columnheader', { name: 'NEMIS ID' })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Search student name or NEMIS ID…')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Mathematics/ })).toBeInTheDocument();
  expect(screen.queryByText(/MTH/)).toBeNull();
});
it('counts finals only in the summary', async () => {
  await renderWithLayer(<WindowGradesPage />);
  await screen.findByText('Grace Kollie');
  const tile = (label: string) => screen.getByText(label).parentElement!.textContent;
  expect(tile('Students Graded')).toContain('1');
  expect(tile('Finals Submitted')).toContain('1');
  expect(tile('Finals Published')).toContain('0');
});
it('switching class drops the previous subject and its columns', async () => {
  await renderWithLayer(<WindowGradesPage />);
  await screen.findByText('Quiz 1');
  fireEvent.click(screen.getByRole('button', { name: /Grade 7B/ }));
  await waitFor(() => expect(screen.queryByText('Quiz 1')).toBeNull());
});
```

Note: the `/20 · 20%` text is rendered as one text node — if the implementation splits it, assert with a function matcher on the `<th>`.

- [ ] **Step 3: Run the file**

Run: `pnpm vitest run apps/desktop/renderer/components/academic-grading/WindowGradesPage.test.tsx`
Expected: all 8 tests PASS (3 existing + 5 new). Task 4 is already on the branch, so a failing new test is a Task 4 defect: fix it in `WindowGradesPage.tsx`, never by loosening the assertion. Import `within` from `@testing-library/react`. RTL's `getByText` matches an element's own text nodes, so `'18'` matches the outer marks span (its nested `/` and `20` are child spans) and `'/20 · 20%'` matches the header's second `<div>`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/WindowGradesPage.test.tsx
git commit -m "test(grades): window grades matrix, final-row selection, labels and summary"
```

---

### Task 6: portal-web labels

**Files:**
- Modify: `Nemis/apps/portal-web/src/app/government/school-admin/academic-grading/windows/[id]/grades/page.tsx:74-76,406`

**Interfaces:** none.

- [ ] **Step 1: Change the two strings**

In the `SubjectTable` header, the second `<th>` text `Adm #` → `NEMIS ID`. In the search `<input>`, `placeholder="Search student name or admission #…"` → `placeholder="Search student name or NEMIS ID…"`.

- [ ] **Step 2: Verify**

Run: `grep -n "Adm #\|admission #" "apps/portal-web/src/app/government/school-admin/academic-grading/windows/[id]/grades/page.tsx"` — Expected: no output.
Run: `pnpm -C apps/portal-web typecheck` — Expected: clean.
Run: `pnpm -C apps/portal-web test` — Expected: all PASS.

- [ ] **Step 3: Commit (Nemis repo, branch `feat/window-grades-labels`)**

```bash
git add "apps/portal-web/src/app/government/school-admin/academic-grading/windows/[id]/grades/page.tsx"
git commit -m "fix(web): grade results say NEMIS ID, matching the desktop"
```

---

### Task 7: Whole-branch verification

- [ ] **Step 1: Desktop renderer suite for the folder + typecheck + lint**

Run: `pnpm vitest run apps/desktop/renderer/components/academic-grading` — Expected: all PASS.
Run: `pnpm -C apps/desktop typecheck && pnpm lint` — Expected: clean, 0 errors.

- [ ] **Step 2: Full desktop suite**

Run: `pnpm test` — Expected: renderer project green; note any `electron/**` better-sqlite3 ABI failures as pre-existing and unrelated (see Global Constraints) and list them by file in the report.

- [ ] **Step 3: Commit the spec and plan on the desktop branch**

```bash
git add docs/superpowers/specs/2026-11-14-window-grades-matrix-design.md docs/superpowers/plans/2026-11-14-window-grades-matrix.md
git commit -m "docs: window grades matrix spec and plan"
```
