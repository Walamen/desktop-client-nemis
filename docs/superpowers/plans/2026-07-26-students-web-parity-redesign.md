# Students Pages Web-Parity Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the desktop's Students list/create/profile pages to match the production web app's design (header bands, stat cards, filter sidebar, Table/Grid toggle, 4-step create wizard, profile fact-card layout), adding a new "student statistics" read slice, while keeping every existing ViewModel/IPC/SQLite contract intact.

**Architecture:** Hexagonal layering stays untouched end-to-end (SQLite → application use case → IPC → renderer ViewModel → React) for everything except one new vertical slice (student statistics) built the same way the existing `GetDashboardOverview` feature is built. All renderer changes are pure presentation — no new REST calls, no renderer access to Node/SQLite.

**Tech Stack:** TypeScript, React (Next.js renderer, static export), Zustand vanilla stores, Vitest + Testing Library, better-sqlite3, Electron IPC (`contextBridge`/`ipcRenderer.invoke`), `@nemis-desktop/ui` component kit, Tailwind CSS.

## Global Constraints

- No REST calls anywhere in the renderer — all data flows through `window.nemis.*` (preload) → IPC → application use cases → SQLite. (Source: `desktop-client-nemis/CLAUDE.md`, "Electron NEVER owns... business logic"; renderer must access APIs only via `window.nemis.*`.)
- No new authentication/account-provisioning logic — no student or parent portal account creation, no activation tokens, anywhere in this plan.
- `recentEnrollments` = count of **active** students with `admissionDate` on/after (now − 3 months), matching the production backend exactly (`Nemis/apps/Server/src/students/students.service.ts:633`). `totalStudents`/`maleStudents`/`femaleStudents` are active-student counts only.
- List page filters shown in the UI are exactly: Search (keyword), Grade Level, Status (All/Active/Inactive). No gender/academic-year/class/enrollment-status/sort controls in the redesigned sidebar.
- Create wizard drops `nationalId`, `admissionDate` input, and all guardian fields the desktop domain doesn't support (email/address/occupation/isEmergencyContact) — these fields do not exist in `CreateStudentDto`/`CreateGuardianDto` today and are out of scope to add.
- `inter-school-transfer` and `promote` pages are not touched by this plan.
- Every new/changed TypeScript file must pass `pnpm typecheck` and `pnpm lint`; every new/changed test must pass under `pnpm test` (Vitest).

Full design rationale: `docs/superpowers/specs/2026-07-26-students-web-parity-redesign-design.md`.

---

## Part A — Student Statistics vertical slice (backend)

### Task 1: Repository layer — `countByGender` / `countRecentAdmissions`

**Files:**
- Modify: `packages/application/src/interfaces/students/student-repository.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`
- Modify: `packages/application/src/testing/students/in-memory-student-repository.ts`

**Interfaces:**
- Produces: `IStudentRepository.countByGender(): { gender: Gender; studentCount: number }[]` — active students only, grouped by gender.
- Produces: `IStudentRepository.countRecentAdmissions(sinceDate: string): number` — count of active students whose `admissionDate` (YYYY-MM-DD) is `>= sinceDate`. Caller computes `sinceDate`; the repository does no date math.

- [ ] **Step 1: Write the failing SQLite repository tests**

Add to `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts` (keep the existing `newStudent` helper and tests untouched; add a second helper and two new `it` blocks):

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Student } from '@nemis-desktop/domain';
import { Gender } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteStudentRepository } from './SqliteStudentRepository';

function newStudent(id: string, admission: string): Student {
  return Student.create({
    id,
    institutionId: 'inst-1',
    firstName: 'Grace',
    lastName: 'Toe',
    admissionNumber: admission,
    dateOfBirth: '2015-01-01',
    gender: Gender.FEMALE,
    occurredAt: '2026-07-20T00:00:00.000Z',
  });
}

function newStudentWith(
  id: string,
  admission: string,
  overrides: { gender?: Gender; admissionDate?: string; isActive?: boolean } = {},
): Student {
  const student = Student.create({
    id,
    institutionId: 'inst-1',
    firstName: 'Grace',
    lastName: 'Toe',
    admissionNumber: admission,
    dateOfBirth: '2015-01-01',
    gender: overrides.gender ?? Gender.FEMALE,
    admissionDate: overrides.admissionDate,
    occurredAt: '2026-07-20T00:00:00.000Z',
  });
  if (overrides.isActive === false) student.deactivate('tester', '2026-07-20T00:00:00.000Z');
  return student;
}

describe('SqliteStudentRepository', () => {
  let test: TestContext;
  let repo: SqliteStudentRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteStudentRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('countAll is 0 on an empty table', () => {
    expect(repo.countAll()).toBe(0);
  });

  it('save persists a student that round-trips through findById', () => {
    repo.save(newStudent('s-1', 'ADM-1'));
    const found = repo.findById('s-1');
    expect(found?.name.full).toBe('Grace Toe');
    expect(found?.admissionNumber.value).toBe('ADM-1');
    expect(found?.gender).toBe(Gender.FEMALE);
    expect(repo.countAll()).toBe(1);
  });

  it('existsByAdmissionNumber is scoped to the institution', () => {
    repo.save(newStudent('s-1', 'ADM-1'));
    expect(repo.existsByAdmissionNumber('inst-1', 'ADM-1')).toBe(true);
    expect(repo.existsByAdmissionNumber('inst-2', 'ADM-1')).toBe(false);
    expect(repo.existsByAdmissionNumber('inst-1', 'ADM-9')).toBe(false);
  });

  it('findPage returns items and total', () => {
    repo.save(newStudent('s-1', 'ADM-1'));
    repo.save(newStudent('s-2', 'ADM-2'));
    const page = repo.findPage({ limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
  });

  it('save updates an existing row (upsert on id)', () => {
    const s = newStudent('s-1', 'ADM-1');
    repo.save(s);
    repo.save(s); // same id — must not throw or duplicate
    expect(repo.countAll()).toBe(1);
  });

  it('countByGender counts only active students, grouped by gender', () => {
    repo.save(newStudentWith('s-1', 'ADM-1', { gender: Gender.MALE }));
    repo.save(newStudentWith('s-2', 'ADM-2', { gender: Gender.MALE }));
    repo.save(newStudentWith('s-3', 'ADM-3', { gender: Gender.FEMALE }));
    repo.save(newStudentWith('s-4', 'ADM-4', { gender: Gender.FEMALE, isActive: false }));
    const counts = repo.countByGender();
    expect(counts).toEqual(
      expect.arrayContaining([
        { gender: Gender.MALE, studentCount: 2 },
        { gender: Gender.FEMALE, studentCount: 1 },
      ]),
    );
    expect(counts).toHaveLength(2);
  });

  it('countRecentAdmissions counts active students admitted on/after the given date', () => {
    repo.save(newStudentWith('s-1', 'ADM-1', { admissionDate: '2026-07-01' }));
    repo.save(newStudentWith('s-2', 'ADM-2', { admissionDate: '2026-01-01' }));
    repo.save(newStudentWith('s-3', 'ADM-3', { admissionDate: '2026-07-15', isActive: false }));
    expect(repo.countRecentAdmissions('2026-04-20')).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`
Expected: the two new tests FAIL with `repo.countByGender is not a function` / `repo.countRecentAdmissions is not a function`.

- [ ] **Step 3: Add the methods to the `IStudentRepository` interface**

In `packages/application/src/interfaces/students/student-repository.ts`, add after `countByGradeLevel`:

```ts
  countByGradeLevel(): { gradeLevel: GradeLevel; studentCount: number }[];
  /** Active-student counts grouped by gender, for stat tiles. */
  countByGender(): { gender: Gender; studentCount: number }[];
  /** Active students with admissionDate on/after `sinceDate` (YYYY-MM-DD). */
  countRecentAdmissions(sinceDate: string): number;
  findRecentlyUpdated(limit: number): Student[];
```

(`Gender` is already imported at the top of this file.)

- [ ] **Step 4: Implement both methods in `SqliteStudentRepository`**

In `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts`, add right after the existing `countByGradeLevel` method:

```ts
  countByGender(): { gender: Gender; studentCount: number }[] {
    return guarded('SqliteStudentRepository.countByGender', () => this.#statements.get(`SELECT gender, COUNT(*) AS studentCount FROM ${TableNames.students} WHERE isActive = 1 GROUP BY gender`).all() as { gender: Gender; studentCount: number }[]);
  }
  countRecentAdmissions(sinceDate: string): number {
    return guarded('SqliteStudentRepository.countRecentAdmissions', () => {
      const row = this.#statements.get(`SELECT COUNT(*) AS n FROM ${TableNames.students} WHERE isActive = 1 AND admissionDate >= ?`).get(sinceDate) as { n: number };
      return row.n;
    });
  }
```

- [ ] **Step 5: Implement the fakes in `InMemoryStudentRepository`**

In `packages/application/src/testing/students/in-memory-student-repository.ts`, add right after the existing `countByGradeLevel` method (matching the file's existing single-line style):

```ts
  countByGender(): { gender: import('@nemis-desktop/types').Gender; studentCount: number }[] { const counts = new Map<import('@nemis-desktop/types').Gender, number>(); for (const s of this.store.values()) { if (!s.isActive) continue; counts.set(s.gender, (counts.get(s.gender) ?? 0) + 1); } return [...counts].map(([gender, studentCount]) => ({ gender, studentCount })); }
  countRecentAdmissions(sinceDate: string): number { let n = 0; for (const s of this.store.values()) { if (s.isActive && s.admissionDate && s.admissionDate >= sinceDate) n += 1; } return n; }
```

- [ ] **Step 6: Run the tests to verify they pass, then typecheck**

Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`
Expected: all 7 tests PASS.

Run: `pnpm typecheck`
Expected: no errors (confirms `SqliteStudentRepository` and `InMemoryStudentRepository` both still satisfy `IStudentRepository`).

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/interfaces/students/student-repository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts packages/application/src/testing/students/in-memory-student-repository.ts
git commit -m "feat(students): add countByGender/countRecentAdmissions to IStudentRepository"
```

---

### Task 2: Application layer — `GetStudentStatisticsUseCase`

**Files:**
- Modify: `packages/application/src/dto/reporting/reporting-dto.ts`
- Create: `packages/application/src/use-cases/reporting/get-student-statistics.ts`
- Create: `packages/application/src/use-cases/reporting/get-student-statistics.test.ts`
- Modify: `packages/application/src/services/reporting-application-service.ts`
- Modify: `packages/application/src/factories/create-application-layer.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**
- Consumes: `IStudentRepository.countByGender()` / `.countRecentAdmissions(sinceDate)` (Task 1), `IClock.now()`, `IAppLogger`.
- Produces: `StudentStatisticsOutput { totalStudents, maleStudents, femaleStudents, recentEnrollments }`; `GetStudentStatisticsUseCase.execute({}): Promise<ApplicationResponse<StudentStatisticsOutput>>`; `ReportingApplicationService.getStudentStatistics()`.

- [ ] **Step 1: Write the failing use-case test**

Create `packages/application/src/use-cases/reporting/get-student-statistics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Student } from '@nemis-desktop/domain';
import { Gender } from '@nemis-desktop/types';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { GetStudentStatisticsUseCase } from './get-student-statistics';

const logger = new RecordingLogger();

function student(id: string, gender: Gender, admissionDate: string): Student {
  return Student.create({
    id,
    institutionId: 'inst-1',
    firstName: 'A',
    lastName: 'B',
    admissionNumber: `ADM-${id}`,
    dateOfBirth: '2015-01-01',
    gender,
    admissionDate,
    occurredAt: '2026-07-20T00:00:00.000Z',
  });
}

describe('GetStudentStatisticsUseCase', () => {
  it('counts active students by gender and admissions within the last 3 months', async () => {
    const students = new InMemoryStudentRepository();
    students.save(student('s-1', Gender.MALE, '2026-07-01'));
    students.save(student('s-2', Gender.MALE, '2026-01-01'));
    students.save(student('s-3', Gender.FEMALE, '2026-07-10'));
    const inactive = student('s-4', Gender.FEMALE, '2026-07-15');
    inactive.deactivate('tester', '2026-07-20T00:00:00.000Z');
    students.save(inactive);

    const useCase = new GetStudentStatisticsUseCase({
      students,
      clock: new FixedClock('2026-07-20T00:00:00.000Z'),
      logger,
    });
    const res = await useCase.execute({});
    // cutoff = 2026-04-20: s-1 (07-01) and s-3 (07-10) qualify, s-2 (01-01) doesn't, s-4 is inactive.
    expect(res.data).toEqual({
      totalStudents: 3,
      maleStudents: 2,
      femaleStudents: 1,
      recentEnrollments: 2,
    });
  });

  it('returns zeros on an empty installation', async () => {
    const useCase = new GetStudentStatisticsUseCase({
      students: new InMemoryStudentRepository(),
      clock: new FixedClock('2026-07-20T00:00:00.000Z'),
      logger,
    });
    const res = await useCase.execute({});
    expect(res.data).toEqual({
      totalStudents: 0,
      maleStudents: 0,
      femaleStudents: 0,
      recentEnrollments: 0,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/application/src/use-cases/reporting/get-student-statistics.test.ts`
Expected: FAIL — `Cannot find module './get-student-statistics'`.

- [ ] **Step 3: Add `StudentStatisticsOutput` to the reporting DTO file**

In `packages/application/src/dto/reporting/reporting-dto.ts`, add:

```ts
export interface DashboardOverviewOutput {
  totalStudents: number;
  totalClasses: number;
  totalSubjects: number;
  attendanceToday: { present: number; total: number };
  studentsByGrade: { gradeLevel: string; studentCount: number }[];
  recentlyEnrolled: { id: string; fullName: string; admissionNumber: string; updatedAt: string }[];
}

export interface StudentStatisticsOutput {
  totalStudents: number;
  maleStudents: number;
  femaleStudents: number;
  recentEnrollments: number;
}
```

- [ ] **Step 4: Write the use case**

Create `packages/application/src/use-cases/reporting/get-student-statistics.ts`:

```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { StudentStatisticsOutput } from '../../dto/reporting/reporting-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetStudentStatisticsDeps {
  students: IStudentRepository;
  clock: IClock;
  logger: IAppLogger;
}

const RECENT_ADMISSION_WINDOW_MONTHS = 3;

export class GetStudentStatisticsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<StudentStatisticsOutput>
> {
  constructor(private readonly deps: GetStudentStatisticsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<StudentStatisticsOutput>> {
    return invokeUseCase('GetStudentStatistics', this.deps.logger, async () => {
      const byGender = this.deps.students.countByGender();
      const totalStudents = byGender.reduce((sum, g) => sum + g.studentCount, 0);
      const maleStudents = byGender.find((g) => g.gender === 'MALE')?.studentCount ?? 0;
      const femaleStudents = byGender.find((g) => g.gender === 'FEMALE')?.studentCount ?? 0;
      const since = new Date(this.deps.clock.now());
      since.setMonth(since.getMonth() - RECENT_ADMISSION_WINDOW_MONTHS);
      const recentEnrollments = this.deps.students.countRecentAdmissions(since.toISOString().slice(0, 10));
      return ok({ totalStudents, maleStudents, femaleStudents, recentEnrollments });
    });
  }
}
```

- [ ] **Step 5: Wire it into `ReportingApplicationService`**

Replace the full contents of `packages/application/src/services/reporting-application-service.ts`:

```ts
import type { ApplicationResponse } from '../core/response';
import type { DashboardOverviewOutput, StudentStatisticsOutput } from '../dto/reporting/reporting-dto';
import type { GetDashboardOverviewUseCase } from '../use-cases/reporting/get-dashboard-overview';
import type { GetStudentStatisticsUseCase } from '../use-cases/reporting/get-student-statistics';

export interface ReportingApplicationServiceDeps {
  getDashboardOverview: GetDashboardOverviewUseCase;
  getStudentStatistics: GetStudentStatisticsUseCase;
}

export class ReportingApplicationService {
  constructor(private readonly deps: ReportingApplicationServiceDeps) {}
  getDashboardOverview(): Promise<ApplicationResponse<DashboardOverviewOutput>> {
    return this.deps.getDashboardOverview.execute({});
  }
  getStudentStatistics(): Promise<ApplicationResponse<StudentStatisticsOutput>> {
    return this.deps.getStudentStatistics.execute({});
  }
}
```

- [ ] **Step 6: Wire the use case into the composition root**

In `packages/application/src/factories/create-application-layer.ts`, add the import right after the existing `GetDashboardOverviewUseCase` import (line 89):

```ts
import { GetDashboardOverviewUseCase } from '../use-cases/reporting/get-dashboard-overview';
import { GetStudentStatisticsUseCase } from '../use-cases/reporting/get-student-statistics';
```

Then replace the `reporting` construction block:

```ts
  const reporting = new ReportingApplicationService({
    getDashboardOverview: new GetDashboardOverviewUseCase({
      students: ports.students,
      classes: ports.classes,
      subjects: ports.subjects,
      attendance: ports.attendance,
      clock,
      logger,
    }),
    getStudentStatistics: new GetStudentStatisticsUseCase({
      students: ports.students,
      clock,
      logger,
    }),
  });
```

- [ ] **Step 7: Export the new use case from the package barrel**

In `packages/application/src/index.ts`, add right after line 84 (`export * from './use-cases/reporting/get-dashboard-overview';`):

```ts
export * from './use-cases/reporting/get-dashboard-overview';
export * from './use-cases/reporting/get-student-statistics';
export * from './services/reporting-application-service';
```

- [ ] **Step 8: Run the tests, typecheck**

Run: `pnpm vitest run packages/application/src/use-cases/reporting/get-student-statistics.test.ts`
Expected: both tests PASS.

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/application/src/dto/reporting/reporting-dto.ts packages/application/src/use-cases/reporting/get-student-statistics.ts packages/application/src/use-cases/reporting/get-student-statistics.test.ts packages/application/src/services/reporting-application-service.ts packages/application/src/factories/create-application-layer.ts packages/application/src/index.ts
git commit -m "feat(students): add GetStudentStatisticsUseCase and wire into ReportingApplicationService"
```

---

### Task 3: IPC layer — channel, types, handler, preload

**Files:**
- Modify: `packages/types/src/students.ts`
- Modify: `packages/types/src/ipc.ts`
- Modify: `packages/types/src/api.ts`
- Modify: `apps/desktop/electron/ipc/handlers/students.ts`
- Modify: `apps/desktop/electron/preload/preload.ts`

**Interfaces:**
- Consumes: `ApplicationLayer.reporting.getStudentStatistics()` (Task 2).
- Produces: IPC channel `'student:get-statistics'` (no args) → `StudentStatisticsResult`; `window.nemis.student.getStatistics(): Promise<StudentStatisticsResult>`.

This task has no independent unit test of its own (it is wire-format-only glue over already-tested logic); it is verified end-to-end by Task 4's renderer test. Steps are still ordered smallest-safe-change-first.

- [ ] **Step 1: Add `StudentStatisticsResult` to the students wire types**

In `packages/types/src/students.ts`, add at the end of the file:

```ts
export type StudentPageResult = PagedListResult<StudentListItemResult>;

export interface StudentStatisticsResult {
  totalStudents: number;
  maleStudents: number;
  femaleStudents: number;
  recentEnrollments: number;
}
```

- [ ] **Step 2: Add the IPC channel**

In `packages/types/src/ipc.ts`, add `StudentStatisticsResult` to the existing `from './students'` import block (after `StudentResult`):

```ts
import type {
  CreateGuardianRequest,
  CreateStudentRequest,
  EnrollStudentRequest,
  EnrollmentResult,
  MoveEnrollmentClassRequest,
  SetStudentActiveRequest,
  StudentListRequest,
  StudentPageResult,
  StudentResult,
  StudentStatisticsResult,
  UpdateStudentRequest,
} from './students';
```

Add to `IpcContract` right after `'student:list-enrollments'`:

```ts
  'student:list-enrollments': { args: [id: string]; result: EnrollmentResult[] };
  'student:get-statistics': { args: []; result: StudentStatisticsResult };
```

Add to `IpcChannels` right after `STUDENT_LIST_ENROLLMENTS`:

```ts
  STUDENT_LIST_ENROLLMENTS: 'student:list-enrollments',
  STUDENT_GET_STATISTICS: 'student:get-statistics',
```

- [ ] **Step 3: Add the method to `StudentApi`**

In `packages/types/src/api.ts`, add `StudentStatisticsResult` to the `from './students'` import block (same as Step 2), then add to `StudentApi`:

```ts
export interface StudentApi {
  list(request: StudentListRequest): Promise<StudentPageResult>;
  get(id: string): Promise<StudentResult | null>;
  create(request: CreateStudentRequest): Promise<StudentResult>;
  update(request: UpdateStudentRequest): Promise<StudentResult>;
  setActive(request: SetStudentActiveRequest): Promise<StudentResult>;
  createGuardian(request: CreateGuardianRequest): Promise<StudentResult>;
  enroll(request: EnrollStudentRequest): Promise<EnrollmentResult>;
  moveClass(request: MoveEnrollmentClassRequest): Promise<EnrollmentResult>;
  listEnrollments(id: string): Promise<EnrollmentResult[]>;
  getStatistics(): Promise<StudentStatisticsResult>;
}
```

- [ ] **Step 4: Register the main-process IPC handler**

In `apps/desktop/electron/ipc/handlers/students.ts`, add `assertNoArgs` to the import:

```ts
import {
  assertSingleIdArg,
  assertListStudentsArgs,
  assertCreateStudentArgs,
  assertUpdateStudentArgs,
  assertSetStudentActiveArgs,
  assertCreateGuardianArgs,
  assertEnrollStudentArgs,
  assertMoveEnrollmentClassArgs,
  assertNoArgs,
} from '@app/security/validateIpc';
```

Add the handler at the end of `registerStudentHandlers`, right before the closing `}`:

```ts
  handle(
    IpcChannels.STUDENT_LIST_ENROLLMENTS,
    assertSingleIdArg,
    async (id) => (await app.students.listEnrollments(id)).data,
  );
  handle(
    IpcChannels.STUDENT_GET_STATISTICS,
    assertNoArgs,
    async () => (await app.reporting.getStudentStatistics()).data,
  );
}
```

- [ ] **Step 5: Expose it through preload**

In `apps/desktop/electron/preload/preload.ts`, change the `student` block to add `getStatistics`:

```ts
  student: {
    list: (request) => invoke(IpcChannels.STUDENT_LIST, request), get: (id) => invoke(IpcChannels.STUDENT_GET,id),
    create: (request) => invoke(IpcChannels.STUDENT_CREATE,request), update: (request) => invoke(IpcChannels.STUDENT_UPDATE,request),
    setActive: (request) => invoke(IpcChannels.STUDENT_SET_ACTIVE,request), createGuardian: (request) => invoke(IpcChannels.STUDENT_CREATE_GUARDIAN,request),
    enroll: (request) => invoke(IpcChannels.STUDENT_ENROLL,request),
    moveClass: (request) => invoke(IpcChannels.STUDENT_MOVE_CLASS, request),
    listEnrollments: (id) => invoke(IpcChannels.STUDENT_LIST_ENROLLMENTS,id),
    getStatistics: () => invoke(IpcChannels.STUDENT_GET_STATISTICS),
  },
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (this confirms `IPC_CHANNELS_EXHAUSTIVE` in `ipc.ts` still holds and every layer's types line up).

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/students.ts packages/types/src/ipc.ts packages/types/src/api.ts apps/desktop/electron/ipc/handlers/students.ts apps/desktop/electron/preload/preload.ts
git commit -m "feat(students): expose student:get-statistics over IPC"
```

---

### Task 4: Renderer IPC facade — bridge + ApplicationLayer wiring

**Files:**
- Modify: `apps/desktop/renderer/services/nemis-bridge.ts`
- Modify: `apps/desktop/renderer/lib/presentation/create-ipc-application-layer.ts`

**Interfaces:**
- Consumes: `window.nemis.student.getStatistics()` (Task 3).
- Produces: `nemisBridge.getStudentStatistics(): Promise<StudentStatisticsResult>`; `ApplicationLayer.reporting.getStudentStatistics()` on the renderer's IPC-backed facade (same method name/shape the main-process `ApplicationLayer` already exposes from Task 2, so presentation-layer code in Task 5 doesn't need to know it's talking to IPC).

- [ ] **Step 1: Add the bridge method**

In `apps/desktop/renderer/services/nemis-bridge.ts`, add `StudentStatisticsResult` to the first `@nemis-desktop/types` import block (alongside the other `Student*` symbols), then add, right after `listStudentEnrollments`:

```ts
  listStudentEnrollments: (id: string): Promise<EnrollmentResult[]> =>
    api().student.listEnrollments(id),
  getStudentStatistics: (): Promise<StudentStatisticsResult> => api().student.getStatistics(),
```

- [ ] **Step 2: Add it to the renderer's `ApplicationLayer` facade**

In `apps/desktop/renderer/lib/presentation/create-ipc-application-layer.ts`, change the `reporting` group:

```ts
    reporting: group('reporting', {
      getDashboardOverview: () => query(() => nemisBridge.getDashboardOverview()),
      getStudentStatistics: () => query(() => nemisBridge.getStudentStatistics()),
    }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/services/nemis-bridge.ts apps/desktop/renderer/lib/presentation/create-ipc-application-layer.ts
git commit -m "feat(students): wire getStudentStatistics through the renderer IPC facade"
```

---

### Task 5: Presentation layer — `StudentStatisticsViewModel`

**Files:**
- Create: `packages/presentation/src/view-models/students/student-statistics-views.ts`
- Create: `packages/presentation/src/queries/reporting/get-student-statistics-ui-query.ts`
- Create: `packages/presentation/src/view-models/students/student-statistics-view-model.ts`
- Create: `packages/presentation/src/view-models/students/student-statistics-view-model.test.ts`
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts`
- Modify: `apps/desktop/renderer/lib/presentation/hooks.ts`

**Interfaces:**
- Consumes: `ApplicationLayer.reporting.getStudentStatistics()` (Task 4, or `createTestApplication()`'s real one for tests).
- Produces: `StudentStatisticsView { totalStudents, maleStudents, femaleStudents, recentEnrollments }`; `StudentStatisticsViewModel.store: StoreApi<{ stats: AsyncState<StudentStatisticsView> }>`; `StudentStatisticsViewModel.loadStatistics(): Promise<void>`; `useStudentStatisticsViewModel()` hook — this is what Task 6 (list page) consumes.

- [ ] **Step 1: Write the failing ViewModel test**

Create `packages/presentation/src/view-models/students/student-statistics-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { StudentStatisticsViewModel } from './student-statistics-view-model';

describe('StudentStatisticsViewModel', () => {
  it('loads real active-student counts from the reporting service', async () => {
    const { app } = createTestApplication();
    await app.students.create({
      institutionId: 'inst-1', firstName: 'A', lastName: 'B',
      admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01', gender: Gender.MALE,
    });
    await app.students.create({
      institutionId: 'inst-1', firstName: 'C', lastName: 'D',
      admissionNumber: 'ADM-2', dateOfBirth: '2015-01-01', gender: Gender.FEMALE,
    });
    const vm = new StudentStatisticsViewModel({
      reporting: app.reporting,
      notifications: new NotificationStore(),
    });
    await vm.loadStatistics();
    const stats = vm.store.getState().stats;
    expect(stats.status).toBe('success');
    if (stats.status === 'success') {
      expect(stats.data).toEqual({
        totalStudents: 2,
        maleStudents: 1,
        femaleStudents: 1,
        recentEnrollments: 2,
      });
    }
  });

  it('renders real zeros (success, not empty) on a fresh install', async () => {
    const { app } = createTestApplication();
    const vm = new StudentStatisticsViewModel({
      reporting: app.reporting,
      notifications: new NotificationStore(),
    });
    await vm.loadStatistics();
    const stats = vm.store.getState().stats;
    expect(stats.status).toBe('success');
    if (stats.status === 'success') {
      expect(stats.data).toEqual({
        totalStudents: 0,
        maleStudents: 0,
        femaleStudents: 0,
        recentEnrollments: 0,
      });
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/presentation/src/view-models/students/student-statistics-view-model.test.ts`
Expected: FAIL — `Cannot find module './student-statistics-view-model'`.

- [ ] **Step 3: Add the view type**

Create `packages/presentation/src/view-models/students/student-statistics-views.ts`:

```ts
/** Real per-institution student counts backing the students list's stat
 * tiles. Every value is a repository count — no placeholder/sample tiles. */
export interface StudentStatisticsView {
  readonly totalStudents: number;
  readonly maleStudents: number;
  readonly femaleStudents: number;
  readonly recentEnrollments: number;
}
```

- [ ] **Step 4: Add the UiQuery**

Create `packages/presentation/src/queries/reporting/get-student-statistics-ui-query.ts`:

```ts
import type {
  ApplicationResponse,
  ReportingApplicationService,
  StudentStatisticsOutput,
} from '@nemis-desktop/application';

export class GetStudentStatisticsUiQuery {
  constructor(private readonly reporting: ReportingApplicationService) {}

  execute(): Promise<ApplicationResponse<StudentStatisticsOutput>> {
    return this.reporting.getStudentStatistics();
  }
}
```

- [ ] **Step 5: Add the ViewModel**

Create `packages/presentation/src/view-models/students/student-statistics-view-model.ts`:

```ts
import type { ReportingApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { GetStudentStatisticsUiQuery } from '../../queries/reporting/get-student-statistics-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { StudentStatisticsView } from './student-statistics-views';

export interface StudentStatisticsState {
  readonly stats: AsyncState<StudentStatisticsView>;
}

export interface StudentStatisticsViewModelDeps {
  readonly reporting: ReportingApplicationService;
  readonly notifications: NotificationStore;
}

export class StudentStatisticsViewModel {
  readonly store = createStore<StudentStatisticsState>(() => ({ stats: idleState() }));

  private readonly statisticsQuery: GetStudentStatisticsUiQuery;

  constructor(deps: StudentStatisticsViewModelDeps) {
    this.statisticsQuery = new GetStudentStatisticsUiQuery(deps.reporting);
  }

  async loadStatistics(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().stats,
        set: (stats) => this.store.setState({ stats }),
      },
      fetch: () => this.statisticsQuery.execute(),
      map: (dto): StudentStatisticsView => dto,
    });
  }
}
```

(`deps.notifications` is unused inside the class, same as `DashboardViewModel` — kept for wiring consistency with `create-presentation-layer.ts`.)

- [ ] **Step 6: Wire it into the presentation layer factory**

In `packages/presentation/src/factories/create-presentation-layer.ts`, add the import next to `DashboardViewModel`:

```ts
import { DashboardViewModel } from '../view-models/dashboard/dashboard-view-model';
import { DeviceViewModel } from '../view-models/device/device-view-model';
import { SettingsViewModel } from '../view-models/settings/settings-view-model';
import { StudentsViewModel } from '../view-models/students/students-view-model';
import { StudentStatisticsViewModel } from '../view-models/students/student-statistics-view-model';
```

Add to `PresentationViewModels`:

```ts
  readonly dashboard: DashboardViewModel;
  readonly studentStatistics: StudentStatisticsViewModel;
```

Add to the `viewModels` object literal, next to `dashboard`:

```ts
    dashboard: new DashboardViewModel({ reporting: app.reporting, notifications }),
    studentStatistics: new StudentStatisticsViewModel({ reporting: app.reporting, notifications }),
```

- [ ] **Step 7: Expose the hook**

In `apps/desktop/renderer/lib/presentation/hooks.ts`, add:

```ts
export const useDashboardViewModel = () => usePresentation().viewModels.dashboard;
export const useStudentStatisticsViewModel = () => usePresentation().viewModels.studentStatistics;
```

- [ ] **Step 8: Run the tests, typecheck**

Run: `pnpm vitest run packages/presentation/src/view-models/students/student-statistics-view-model.test.ts`
Expected: both tests PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/presentation/src/view-models/students/student-statistics-views.ts packages/presentation/src/queries/reporting/get-student-statistics-ui-query.ts packages/presentation/src/view-models/students/student-statistics-view-model.ts packages/presentation/src/view-models/students/student-statistics-view-model.test.ts packages/presentation/src/factories/create-presentation-layer.ts apps/desktop/renderer/lib/presentation/hooks.ts
git commit -m "feat(students): add StudentStatisticsViewModel and useStudentStatisticsViewModel"
```

---

## Part B — Renderer file split

### Task 6: Split `StudentManagementPages.tsx` into focused files

The file is 815 lines today and this plan adds a stat-tile row, a filter sidebar rewrite, a Table/Grid toggle, a `StudentCard` component, an edit `Drawer`, and a 4-step wizard — all before touching the profile page. Splitting first keeps every later task's diff small and independently reviewable, per this codebase's own "smaller, focused files" convention (e.g. `focused-student-view-models.ts` already separates concerns this way on the ViewModel side).

**Files:**
- Create: `apps/desktop/renderer/components/students/shared.tsx`
- Create: `apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx`
- Create: `apps/desktop/renderer/components/students/StudentFormPage.tsx`
- Create: `apps/desktop/renderer/components/students/StudentProfilePage.tsx`
- Create: `apps/desktop/renderer/components/students/EnrollmentPage.tsx`
- Delete: `apps/desktop/renderer/components/students/StudentManagementPages.tsx`
- Modify: `apps/desktop/renderer/app/government/school-admin/students/page.tsx`
- Modify: `apps/desktop/renderer/app/government/school-admin/students/create/page.tsx`
- Modify: `apps/desktop/renderer/app/government/school-admin/students/edit/page.tsx`
- Modify: `apps/desktop/renderer/app/government/school-admin/students/profile/page.tsx`
- Modify: `apps/desktop/renderer/app/government/school-admin/students/enroll/page.tsx`

**Interfaces:**
- Produces: `shared.tsx` exports `Page` (layout wrapper), `human(v: string): string`, `queryId(): string`, `grades: GradeLevel[]`, `genders: Gender[]` — every later task imports these instead of redefining them.
- No behavior change in this task — it is a pure move, verified by the existing manual/e2e testing conventions (no new tests; this is refactor-only, covered by whatever already exercises these pages) plus a full `pnpm typecheck`.

- [ ] **Step 1: Create `shared.tsx` with the code shared by all five pages**

Create `apps/desktop/renderer/components/students/shared.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Gender, GradeLevel } from '@nemis-desktop/types';

export const grades = Object.values(GradeLevel);
export const genders = Object.values(Gender);

export const human = (v: string) => v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const queryId = () =>
  typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.search).get('id') ?? '');

export function Page({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-6 space-y-5">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-slate-500">Offline student records stored on this device.</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Move `EnrollmentPage` verbatim**

Create `apps/desktop/renderer/components/students/EnrollmentPage.tsx` with the exact current body of `EnrollmentPage` from `StudentManagementPages.tsx` (lines 718–814), updating only its imports to pull `Page`/`human`/`queryId` from `./shared` instead of defining them locally:

```tsx
'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useAcademicFoundationViewModel, useEnrollmentViewModel } from '@/lib/presentation/hooks';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { human, Page, queryId } from './shared';

export function EnrollmentPage() {
  const students = useEnrollmentViewModel();
  const foundation = useAcademicFoundationViewModel();
  const years = useViewModel(foundation.store, (s) => s.academicYears);
  const terms = useViewModel(foundation.store, (s) => s.terms);
  const classes = useViewModel(foundation.store, (s) => s.classes);
  const [id, setId] = useState('');
  const [year, setYear] = useState('');
  const [term, setTerm] = useState('');
  const [clazz, setClazz] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  useEffect(() => {
    setId(queryId());
    void foundation.loadAcademicYears();
  }, [foundation]);
  useEffect(() => {
    if ((years.status === 'success' || years.status === 'refreshing') && !year) {
      const y = years.data.find((v) => v.isCurrent);
      if (y) setYear(y.id);
    }
  }, [years, year]);
  useEffect(() => {
    if (year) {
      void foundation.loadTerms(year);
      foundation.setClassFilters({ academicYearId: year });
      void foundation.loadClasses();
    }
  }, [foundation, year]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await students.enrollStudent({
      studentId: id,
      academicYearId: year,
      termId: term,
      classId: clazz,
      enrollmentDate: date,
    });
    if (r.ok) window.location.href = `/government/school-admin/students/profile?id=${id}`;
  };
  const yearOptions =
    years.status === 'success' || years.status === 'refreshing'
      ? years.data.map((v) => ({ value: v.id, label: v.code }))
      : [];
  const termOptions =
    terms.status === 'success' || terms.status === 'refreshing'
      ? terms.data.map((v) => ({ value: v.id, label: v.name }))
      : [];
  const classOptions =
    classes.status === 'success' || classes.status === 'refreshing'
      ? classes.data
          .filter((v) => v.isActive)
          .map((v) => ({ value: v.id, label: `${v.name} — ${human(v.gradeLevel)}` }))
      : [];
  return (
    <Page title="Enrollment Wizard">
      <form
        onSubmit={(e) => void submit(e)}
        className="bg-white border rounded-card p-6 max-w-2xl space-y-4"
      >
        <p className="text-sm text-slate-500">
          Assign the student to the current academic structure.
        </p>
        <Select
          label="Academic year"
          required
          options={yearOptions}
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <Select
          label="Term"
          required
          options={termOptions}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Select term"
        />
        <Select
          label="Class / section"
          required
          options={classOptions}
          value={clazz}
          onChange={(e) => setClazz(e.target.value)}
          placeholder="Select class"
        />
        <Input
          label="Enrollment date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button type="submit">Complete enrollment</Button>
      </form>
    </Page>
  );
}
```

- [ ] **Step 3: Move `StudentProfilePage` verbatim (restyle happens in Task 13/14)**

Create `apps/desktop/renderer/components/students/StudentProfilePage.tsx` with the current body of `StudentProfilePage` and its `Fact` helper (`StudentManagementPages.tsx` lines 464–716), updating imports to use `./shared` for `Page`/`human`/`queryId`. This is a pure copy-paste of the existing logic — do not change any JSX in this step.

- [ ] **Step 4: Move `StudentFormPage` verbatim (wizard rewrite happens in Task 11/12)**

Create `apps/desktop/renderer/components/students/StudentFormPage.tsx` with the current body of `StudentFormPage` (`StudentManagementPages.tsx` lines 312–462), updating imports to use `./shared`.

- [ ] **Step 5: Move `StudentsDirectoryPage` verbatim (redesign happens in Task 7–10)**

Create `apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx` with the current body of `StudentsDirectoryPage` (`StudentManagementPages.tsx` lines 62–310 only), updating imports to use `./shared`. Do **not** move the `StudentCard` helper (lines 696–779) — it is unused dead code from an earlier design (it references a `Student`/`getEnrolledClass` shape that doesn't exist in this codebase) with no live call site anywhere in `StudentManagementPages.tsx` today; drop it here rather than carrying it forward. Task 9 adds a new `StudentCard` built on the real `StudentRowView` type.

- [ ] **Step 6: Delete the old combined file**

```bash
git rm apps/desktop/renderer/components/students/StudentManagementPages.tsx
```

- [ ] **Step 7: Update the five route files' imports**

`apps/desktop/renderer/app/government/school-admin/students/page.tsx`:

```tsx
import { StudentsDirectoryPage } from '@/components/students/StudentsDirectoryPage';

export default StudentsDirectoryPage;
```

`apps/desktop/renderer/app/government/school-admin/students/create/page.tsx`:

```tsx
import { StudentFormPage } from '@/components/students/StudentFormPage';

export default function Page() {
  return <StudentFormPage />;
}
```

`apps/desktop/renderer/app/government/school-admin/students/edit/page.tsx`:

```tsx
import { StudentFormPage } from '@/components/students/StudentFormPage';

export default function Page() {
  return <StudentFormPage edit />;
}
```

`apps/desktop/renderer/app/government/school-admin/students/profile/page.tsx`:

```tsx
import { StudentProfilePage } from '@/components/students/StudentProfilePage';

export default StudentProfilePage;
```

`apps/desktop/renderer/app/government/school-admin/students/enroll/page.tsx`:

```tsx
import { EnrollmentPage } from '@/components/students/EnrollmentPage';

export default EnrollmentPage;
```

(Check each file's actual current content matches this shape before overwriting — they were confirmed as thin `export default` wrappers during design research; if any differs, preserve its other content and only change the import/export target.)

- [ ] **Step 8: Typecheck and lint**

Run: `pnpm typecheck`
Expected: no errors — confirms nothing outside these 5 route files imported from the deleted `StudentManagementPages.tsx` (double check with a repo-wide search first: `grep -r "StudentManagementPages" apps/ packages/` should return nothing after this step).

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/renderer/components/students/shared.tsx apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx apps/desktop/renderer/components/students/StudentFormPage.tsx apps/desktop/renderer/components/students/StudentProfilePage.tsx apps/desktop/renderer/components/students/EnrollmentPage.tsx apps/desktop/renderer/app/government/school-admin/students/page.tsx apps/desktop/renderer/app/government/school-admin/students/create/page.tsx apps/desktop/renderer/app/government/school-admin/students/edit/page.tsx apps/desktop/renderer/app/government/school-admin/students/profile/page.tsx apps/desktop/renderer/app/government/school-admin/students/enroll/page.tsx
git commit -m "refactor(students): split StudentManagementPages.tsx into one file per page"
```

---

## Part C — List page redesign

### Task 7: Stat cards + numbered pagination

**Files:**
- Modify: `apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx`
- Create: `apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`

**Interfaces:**
- Consumes: `useStudentStatisticsViewModel()` (Task 5), `useViewModel` (`@/hooks/use-view-model`), `vm.setPageSize`/`vm.goToPage`/`p.page`/`p.pageSize`/`p.totalCount` (existing `StudentsListViewModel`/`PaginationState`, `totalPages` helper from `@nemis-desktop/presentation`).
- Produces: a `StatCards` sub-component (4-up grid) and a `Pagination` sub-component (numbered buttons) exported from this file for reuse by no one else (kept local — this file is the only consumer).

- [ ] **Step 1: Write the failing test for the stat cards**

Create `apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { StudentsDirectoryPage } from './StudentsDirectoryPage';

function stubNemis() {
  (window as unknown as { nemis: unknown }).nemis = {
    student: {
      list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 12, totalPages: 0 })),
      getStatistics: vi.fn(async () => ({
        totalStudents: 42,
        maleStudents: 20,
        femaleStudents: 22,
        recentEnrollments: 5,
      })),
    },
    school: { getSummary: vi.fn(async () => null) },
    'academic-year': undefined,
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
    term: { getCurrent: vi.fn(async () => null) },
    class: { list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })) },
    classes: { list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })) },
  };
}

beforeEach(stubNemis);
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('StudentsDirectoryPage stat cards', () => {
  it('shows real statistics counts, not the loaded page size', async () => {
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <StudentsDirectoryPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`
Expected: FAIL — `screen.getByText('42')` not found (no stat cards rendered yet).

- [ ] **Step 3: Add the stat cards and wire pagination**

In `apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx`, add the import and call `useStudentStatisticsViewModel`, `loadStatistics()` on mount, and set page size to 12 on mount:

```tsx
import { useStudentStatisticsViewModel } from '@/lib/presentation/hooks';
```

Inside `StudentsDirectoryPage`, alongside the existing `vm`/`search`/`foundation` declarations:

```tsx
  const stats = useStudentStatisticsViewModel();
  const statsState = useViewModel(stats.store, (s) => s.stats);
```

Change the mount effect:

```tsx
  useEffect(() => {
    void vm.setPageSize(12);
    void vm.loadStudents();
    void stats.loadStatistics();
    void foundation.loadAcademicYears();
    void foundation.loadClasses();
  }, [foundation, stats, vm]);
```

Add a `StatCards` component in the same file (place it above `StudentsDirectoryPage`) and render it right after the `<Page ...>` opening, before the filter grid:

```tsx
function StatCards({ stats }: { stats: ReturnType<typeof useStudentStatisticsViewModel> }) {
  const state = useViewModel(stats.store, (s) => s.stats);
  const value = (n: number) => n.toLocaleString();
  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white border border-slate-300 rounded-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Total Students</p>
        <p className="text-4xl font-bold text-slate-900 mt-2">{value(data?.totalStudents ?? 0)}</p>
        <p className="text-xs text-slate-400 mt-1">Registered in school</p>
      </div>
      <div className="bg-white border border-slate-300 rounded-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Male</p>
        <p className="text-4xl font-bold text-sky-600 mt-2">{value(data?.maleStudents ?? 0)}</p>
        <p className="text-xs text-slate-400 mt-1">Male students</p>
      </div>
      <div className="bg-white border border-slate-300 rounded-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Female</p>
        <p className="text-4xl font-bold text-pink-500 mt-2">{value(data?.femaleStudents ?? 0)}</p>
        <p className="text-xs text-slate-400 mt-1">Female students</p>
      </div>
      <div className="bg-white border border-slate-300 rounded-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">New This Quarter</p>
        <p className="text-4xl font-bold text-emerald-600 mt-2">{value(data?.recentEnrollments ?? 0)}</p>
        <p className="text-xs text-slate-400 mt-1">Recent enrollments</p>
      </div>
    </div>
  );
}
```

(Label reads "New This Quarter" rather than the web's "New This Month" — the underlying window really is 3 months, and the design spec calls out not to keep the web's misleading label.)

Render it: change the JSX returned by `StudentsDirectoryPage` so `<StatCards stats={stats} />` is the first child inside `<Page ...>`, immediately before the existing filter grid `<div className="bg-white border rounded-card p-4 grid ...">`.

Replace the pagination block (the `<div className="flex justify-between">...` at the end of the `success`/`refreshing` branch) with numbered buttons, using `totalPages` from `@nemis-desktop/presentation`:

```tsx
import { totalPages } from '@nemis-desktop/presentation';
```

```tsx
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>{p.totalCount} students</span>
              {selectedIds.size > 0 && (
                <>
                  <span>{selectedIds.size} selected</span>
                  <Button size="sm" variant="secondary" onClick={() => vm.clearSelection()}>
                    Clear
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.max(1, totalPages(p)) }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => void vm.goToPage(page)}
                  className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                    p.page === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 4: Run the test, typecheck**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`
Expected: PASS.

Run: `pnpm typecheck`
Expected: no errors. If `totalPages` isn't exported from `@nemis-desktop/presentation`'s package root, add `export * from './pagination/pagination';` to `packages/presentation/src/index.ts` (check first with `grep totalPages packages/presentation/src/index.ts`).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx
git commit -m "feat(students): add stat cards and numbered pagination to the students list"
```

---

### Task 8: Filter sidebar — trim to 3 filters, auto-search on change

**Files:**
- Modify: `apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx`
- Modify: `apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`

**Interfaces:**
- Consumes: `useStudentSearchViewModel()` (`setFilters`, `search`), `useViewModel(vm.store, s => s.filters)`.
- Produces: no new exports — internal filter markup only.

- [ ] **Step 1: Write the failing test for auto-search on keyword change**

Add to `StudentsDirectoryPage.test.tsx` (new `describe` block, keep the existing one):

```tsx
describe('StudentsDirectoryPage filters', () => {
  it('debounces the keyword filter and refetches without a Search button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const listMock = vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 12, totalPages: 0 }));
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: listMock,
        getStatistics: vi.fn(async () => ({ totalStudents: 0, maleStudents: 0, femaleStudents: 0, recentEnrollments: 0 })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: { list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })) },
    };
    const layer = createRendererPresentation();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup({ delay: null });
    render(
      <PresentationProvider layer={layer}>
        <StudentsDirectoryPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1)); // initial load on mount
    await user.type(screen.getByPlaceholderText('Name or student number'), 'Grace');
    expect(listMock).toHaveBeenCalledTimes(1); // not yet — still debouncing
    vi.advanceTimersByTime(350);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    expect(listMock.mock.calls[1]?.[0]).toMatchObject({ keyword: 'Grace' });
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`
Expected: FAIL — the current filter grid has no `placeholder="Name or student number"` input driving an auto-refetch (today's `Input` triggers `search.setFilters` only, and there's a separate `Search` button the test never clicks).

- [ ] **Step 3: Rewrite the filter grid to 3 filters with auto-search**

Replace the entire filter grid `<div className="bg-white border rounded-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">...</div>` block in `StudentsDirectoryPage` with:

```tsx
      <div className="bg-white border border-slate-300 p-5 space-y-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Filters</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Search
            </label>
            <Input
              placeholder="Name or student number"
              defaultValue={filters.keyword ?? ''}
              onChange={(e) => {
                const keyword = e.target.value;
                search.setFilters({ ...filters, keyword: keyword || undefined });
                if (keywordDebounce.current) clearTimeout(keywordDebounce.current);
                keywordDebounce.current = setTimeout(() => void search.search(), 300);
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Grade Level
            </label>
            <Select
              options={grades.map((v) => ({ value: v, label: human(v) }))}
              placeholder="All Grades"
              value={filters.gradeLevel ?? ''}
              onChange={(e) => {
                search.setFilters({
                  ...filters,
                  gradeLevel: (e.target.value || undefined) as GradeLevelValue | undefined,
                });
                void search.search();
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Status
            </label>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {(['all', 'active', 'inactive'] as const).map((s) => {
                const active =
                  s === 'all' ? filters.isActive === undefined : filters.isActive === (s === 'active');
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      search.setFilters({
                        ...filters,
                        isActive: s === 'all' ? undefined : s === 'active',
                      });
                      void search.search();
                    }}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                      active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
```

Add the debounce ref and the `grades`/`human` imports from `./shared` (they should already be imported after Task 6's move — verify, don't duplicate):

```tsx
  const keywordDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
```

(add `useRef` to the existing `'react'` import line at the top of the file.)

Remove the now-unused `academicYears`/`classRows`/`yearRows`/`classes`/`setAcademicYear` filter UI and the `genders`/`Object.values(EnrollmentStatus)`/sort `<Select>` blocks that read from `foundation` for the sidebar — but do **not** remove the `foundation.loadAcademicYears()`/`foundation.loadClasses()` calls from the mount effect or the `useAcademicFoundationViewModel()` call itself if anything else in the file still needs it. Check after this edit: if `foundation`/`academicYears`/`classes`/`yearRows`/`classRows`/`setAcademicYear` become fully unused, remove their declarations too — otherwise `pnpm lint` will flag unused variables.

- [ ] **Step 4: Run the tests, typecheck, lint**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`
Expected: both tests PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (in particular, no unused-variable errors from the removed filter UI).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx
git commit -m "feat(students): trim list filters to Search/Grade/Status with auto-search"
```

---

### Task 9: Header band, Table/Grid toggle, restyled table, `StudentCard` grid view

**Files:**
- Modify: `apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx`
- Modify: `apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`

**Interfaces:**
- Consumes: `useSettingsViewModel()` (school name for the header band), `@nemis-desktop/ui`'s `Avatar`/`Badge`/`Card`.
- Produces: a new local `StudentCard` component (this file had a dead-code `StudentCard` referencing a nonexistent shape before Task 6 deleted it as unused; this task adds the real one) rendered when `viewMode === 'grid'`.

- [ ] **Step 1: Write the failing test for the view toggle**

Add to `StudentsDirectoryPage.test.tsx`:

```tsx
describe('StudentsDirectoryPage view toggle', () => {
  it('switches between table and grid without refetching', async () => {
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: vi.fn(async () => ({
          data: [
            { id: 's-1', fullName: 'Grace Toe', admissionNumber: 'ADM-1', gradeLevel: 'Grade 1', gender: 'Female', isActive: true, updatedAt: '2026-07-01' },
          ],
          total: 1, page: 1, pageSize: 12, totalPages: 1,
        })),
        getStatistics: vi.fn(async () => ({ totalStudents: 1, maleStudents: 0, femaleStudents: 1, recentEnrollments: 1 })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: { list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })) },
    };
    const layer = createRendererPresentation();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(
      <PresentationProvider layer={layer}>
        <StudentsDirectoryPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    expect(screen.getByRole('table')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /grid view/i }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Grace Toe')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`
Expected: FAIL — no "grid view" button exists yet, there is only a `<table>`.

- [ ] **Step 3: Add the header band and view-mode state**

At the top of `StudentsDirectoryPage`, add view-mode state and pull the school name:

```tsx
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const settings = useSettingsViewModel();
  const profile = useViewModel(settings.store, (s) => s.profile);
  const schoolName = profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';
```

(Add `useSettingsViewModel` to the `@/lib/presentation/hooks` import and `useState` to the React import if not already present — both should already be imported from earlier code.)

Replace the outer `<Page title="Students" action={...}>` wrapper. Since `Page` renders its own generic title bar, stop using it for this page and inline the slate-900 header band instead (the other pages in this file keep using `Page`):

```tsx
  return (
    <div className="p-6 space-y-5">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between rounded-card">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
            {schoolName}
          </p>
          <h1 className="text-xl font-bold text-white">Students</h1>
        </div>
        <Link href="/government/school-admin/students/create">
          <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-slate-700 rounded-button hover:bg-slate-500">
            Add Single Student
          </button>
        </Link>
      </div>
      <StatCards stats={stats} />
      {/* ...existing filter block, toolbar, table/grid, pagination... */}
    </div>
  );
```

(Move the `<StatCards />`/filter/toolbar/content/pagination JSX that used to be inside `<Page>` to be direct children of this new outer `<div>`; delete the old `<Page title="Students" action={<Link>...Enroll new student...</Link>}>` wrapper entirely for this one page.)

Add a toolbar above the table/grid content, right after the filter sidebar block and before the `{(list.status === 'loading' ...)}` conditional:

```tsx
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-800">{p.totalCount}</span> students found
        </p>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          <button
            aria-label="table view"
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            aria-label="grid view"
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>
```

Add `List, LayoutGrid` to the `lucide-react` import (new import line if one doesn't exist yet in this file).

- [ ] **Step 4: Restyle the table and add the grid branch**

Replace the table's `<Avatar>`-less student cell — add `Avatar` to the row:

```tsx
                    <td className="p-4 font-medium flex items-center gap-3">
                      <Avatar firstName={s.fullName.split(' ')[0]} lastName={s.fullName.split(' ').slice(1).join(' ')} role="student" size="sm" />
                      {s.fullName}
                    </td>
```

Wrap the existing `<table>` block so it only renders `viewMode === 'table'`, and add a grid branch alongside it (both still inside the `(list.status === 'success' || list.status === 'refreshing')` block):

```tsx
      {(list.status === 'success' || list.status === 'refreshing') && (
        <>
          {viewMode === 'table' ? (
            <div className="bg-white border rounded-card overflow-x-auto">
              {/* ...existing <table> unchanged except the Avatar cell above... */}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {list.data.map((s) => (
                <StudentCard key={s.id} student={s} />
              ))}
            </div>
          )}
          {/* ...existing pagination block from Task 7 unchanged... */}
        </>
      )}
```

Add a new `StudentCard` built on `StudentRowView` (Task 6 deleted the old dead-code one that referenced the web's `Student`/`getEnrolledClass` shape, which doesn't exist here):

```tsx
function StudentCard({ student }: { student: StudentRowView }) {
  return (
    <Card hoverable bordered={false}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            firstName={student.fullName.split(' ')[0]}
            lastName={student.fullName.split(' ').slice(1).join(' ')}
            role="student"
            size="md"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 leading-snug truncate">
              {student.fullName}
            </p>
            <p className="text-xs font-mono text-slate-400 mt-0.5">{student.admissionNumber}</p>
          </div>
        </div>
        <Badge variant={student.status.badge === 'success' || student.status.badge === 'active' ? 'success' : 'neutral'} size="sm">
          {student.status.label}
        </Badge>
      </div>
      <div className="mt-3 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Grade</span>
          <span className="text-slate-700 font-medium">{student.gradeLevel || 'N/A'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Gender</span>
          <span className="text-slate-700 font-medium">{student.gender}</span>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
        <Link className="text-blue-700" href={`/government/school-admin/students/profile?id=${student.id}`}>
          View
        </Link>
        <Link className="text-blue-700" href={`/government/school-admin/students/edit?id=${student.id}`}>
          Edit
        </Link>
      </div>
    </Card>
  );
}
```

(`StudentRowView` — import as `import type { StudentRowView } from '@nemis-desktop/presentation';`, checking first whether it's exported from the package root; if not, add `export * from './view-models/students/students-views';` to `packages/presentation/src/index.ts`.)

Add `Avatar, Badge, Card` to the `@nemis-desktop/ui` import.

- [ ] **Step 5: Run the tests, typecheck, lint**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`
Expected: all tests PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx
git commit -m "feat(students): add header band, Table/Grid toggle, and restyled StudentCard"
```

---

### Task 10: Edit drawer replacing the `/edit` link on the list

**Files:**
- Modify: `apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx`
- Modify: `apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`

**Interfaces:**
- Consumes: `useStudentProfileViewModel()` (`loadDetails`, `updateStudent`, `setStudentActive` — for Archive/Restore row action), `Drawer`/`Skeleton` from `@nemis-desktop/ui`.
- Produces: no new exports — replaces the table/grid row "Edit" `<Link>` with a button that opens an in-page `Drawer`.

- [ ] **Step 1: Write the failing test**

Add to `StudentsDirectoryPage.test.tsx`:

```tsx
describe('StudentsDirectoryPage edit drawer', () => {
  it('opens a drawer with the student loaded, not a route navigation', async () => {
    const getMock = vi.fn(async () => ({
      id: 's-1', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
      admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE',
      isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
    }));
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        list: vi.fn(async () => ({
          data: [{ id: 's-1', fullName: 'Grace Toe', admissionNumber: 'ADM-1', gradeLevel: 'Grade 1', gender: 'Female', isActive: true, updatedAt: '2026-07-01' }],
          total: 1, page: 1, pageSize: 12, totalPages: 1,
        })),
        get: getMock,
        getStatistics: vi.fn(async () => ({ totalStudents: 1, maleStudents: 0, femaleStudents: 1, recentEnrollments: 1 })),
      },
      school: { getSummary: vi.fn(async () => null) },
      academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
      term: { getCurrent: vi.fn(async () => null) },
      classes: { list: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })) },
    };
    const layer = createRendererPresentation();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(
      <PresentationProvider layer={layer}>
        <StudentsDirectoryPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByText('Edit Student')).toBeInTheDocument();
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('s-1'));
    await waitFor(() => expect(screen.getByDisplayValue('Grace')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`
Expected: FAIL — there is no button named "Edit" (only a `<Link>` to `/edit?id=`) and no "Edit Student" drawer.

- [ ] **Step 3: Add drawer state and the edit form fields**

Add state, near `viewMode`:

```tsx
  const profileVm = useStudentProfileViewModel();
  const details = useViewModel(profileVm.store, (s) => s.details);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirst, setEditFirst] = useState('');
  const [editMiddle, setEditMiddle] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editGender, setEditGender] = useState<GenderValue>(Gender.FEMALE);
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');

  const openEdit = (id: string) => {
    setEditingId(id);
    void profileVm.loadDetails(id);
  };
  useEffect(() => {
    if (editingId && (details.status === 'success' || details.status === 'refreshing') && details.data.id === editingId) {
      setEditFirst(details.data.firstName);
      setEditMiddle(details.data.middleName ?? '');
      setEditLast(details.data.lastName);
      setEditDob(details.data.rawDateOfBirth.slice(0, 10));
      setEditGender(details.data.rawGender as GenderValue);
      setEditPhone(details.data.phoneNumber ?? '');
      setEditEmail(details.data.email ?? '');
      setEditAddress(details.data.address ?? '');
    }
  }, [details, editingId]);
  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const r = await profileVm.updateStudent({
      studentId: editingId,
      firstName: editFirst,
      middleName: editMiddle || undefined,
      lastName: editLast,
      dateOfBirth: editDob,
      gender: editGender,
      phoneNumber: editPhone || undefined,
      email: editEmail || undefined,
      address: editAddress || undefined,
    });
    if (r.ok) {
      setEditingId(null);
      void vm.loadStudents();
    }
  };
```

Add `FormEvent` to the `react` import, and `Gender`, `type Gender as GenderValue` to the `@nemis-desktop/types` import if not already present after Task 6's move.

- [ ] **Step 4: Replace the row/card "Edit" links with buttons that call `openEdit`**

In the table row actions cell, change:

```tsx
                      <Link
                        className="text-blue-700"
                        href={`/government/school-admin/students/edit?id=${s.id}`}
                      >
                        Edit
                      </Link>
```

to:

```tsx
                      <button className="text-blue-700" onClick={() => openEdit(s.id)}>
                        Edit
                      </button>
```

Make the same change inside `StudentCard`'s footer — since `StudentCard` doesn't have access to `openEdit`, add an `onEdit: () => void` prop:

```tsx
function StudentCard({ student, onEdit }: { student: StudentRowView; onEdit: () => void }) {
  /* ... */
        <button className="text-blue-700" onClick={onEdit}>
          Edit
        </button>
  /* ... */
}
```

and update the grid's render call: `<StudentCard key={s.id} student={s} onEdit={() => openEdit(s.id)} />`.

- [ ] **Step 5: Render the Drawer**

Add at the end of the component's returned JSX, as a sibling of the outer header/content `<div>` (both wrapped in a fragment):

```tsx
      <Drawer
        isOpen={editingId !== null}
        onClose={() => setEditingId(null)}
        title="Edit Student"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-student-form">
              Save changes
            </Button>
          </>
        }
      >
        {details.status === 'loading' || details.status === 'idle' ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <form id="edit-student-form" onSubmit={(e) => void submitEdit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First name" required value={editFirst} onChange={(e) => setEditFirst(e.target.value)} />
              <Input label="Last name" required value={editLast} onChange={(e) => setEditLast(e.target.value)} />
              <Input label="Middle name" value={editMiddle} onChange={(e) => setEditMiddle(e.target.value)} />
              <Input label="Date of birth" type="date" required value={editDob} onChange={(e) => setEditDob(e.target.value)} />
              <Select
                label="Gender"
                required
                options={genders.map((v) => ({ value: v, label: human(v) }))}
                value={editGender}
                onChange={(e) => setEditGender(e.target.value as GenderValue)}
              />
              <Input label="Phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              <Input label="Email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <Input label="Address" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
          </form>
        )}
      </Drawer>
```

Add `Drawer` to the `@nemis-desktop/ui` import.

- [ ] **Step 6: Run the tests, typecheck, lint**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx`
Expected: all tests PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/components/students/StudentsDirectoryPage.tsx apps/desktop/renderer/components/students/StudentsDirectoryPage.test.tsx
git commit -m "feat(students): replace list edit link with an inline edit drawer"
```

---

## Part D — Create wizard redesign

### Task 11: Wizard shell + Student Information + Grade Level steps

**Files:**
- Modify: `apps/desktop/renderer/components/students/StudentFormPage.tsx`
- Create: `apps/desktop/renderer/components/students/StudentFormPage.test.tsx`

**Interfaces:**
- Consumes: unchanged `listVm.createStudent(dto)` (existing `CreateStudentDto` shape — no new fields).
- Produces: `StudentFormPage({ edit: false })` becomes a 4-step wizard; `StudentFormPage({ edit: true })`'s single-page form is untouched by this task (verify with a regression test).

- [ ] **Step 1: Write the failing test for step navigation**

Create `apps/desktop/renderer/components/students/StudentFormPage.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { StudentFormPage } from './StudentFormPage';

beforeEach(() => {
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => ({ id: 'inst-1', code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isApproved: true })) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    term: { getCurrent: vi.fn(async () => null) },
  };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('StudentFormPage create wizard', () => {
  it('walks Student Information -> Grade Level -> Review, blocking on required fields', async () => {
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    const user = userEvent.setup();
    render(
      <PresentationProvider layer={layer}>
        <StudentFormPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Student Information')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Student Information')).toBeInTheDocument(); // blocked: required fields empty

    await user.type(screen.getByLabelText(/first name/i), 'Grace');
    await user.type(screen.getByLabelText(/last name/i), 'Toe');
    await user.type(screen.getByLabelText(/date of birth/i), '2015-01-01');
    await user.type(screen.getByLabelText(/student number|admission number/i), 'ADM-1');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText('Guardian Information')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText('Grade Level')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentFormPage.test.tsx`
Expected: FAIL — the current create form is a single page with no step titles/Next button.

- [ ] **Step 3: Rewrite the create-mode branch of `StudentFormPage`**

Replace the whole `StudentFormPage` function body in `apps/desktop/renderer/components/students/StudentFormPage.tsx`. Keep every existing hook/state declaration used by edit mode (`listVm`, `profileVm`, `settings`, `profile`, `details`, `id`, `firstName`...`address`, the two `useEffect`s, and the existing `submit` function) exactly as-is, and branch the returned JSX on `edit`:

```tsx
  if (edit) {
    return (
      <Page title="Edit Student">
        {/* unchanged existing single-page form JSX for edit mode */}
      </Page>
    );
  }

  const STEPS = [
    { number: 1, title: 'Student Information', description: 'Basic details' },
    { number: 2, title: 'Guardian Information', description: 'Parent/Guardian' },
    { number: 3, title: 'Grade Level', description: 'Level selection' },
    { number: 4, title: 'Review & Submit', description: 'Confirm details' },
  ] as const;
  const [currentStep, setCurrentStep] = useState(1);
  const [stepError, setStepError] = useState('');

  const validateStep1 = () => {
    if (!firstName.trim() || !lastName.trim() || !dob || !number.trim()) {
      setStepError('First name, last name, date of birth, and student number are required.');
      return false;
    }
    setStepError('');
    return true;
  };
  const validateStep3 = () => {
    if (!grade) {
      setStepError('Grade level is required.');
      return false;
    }
    setStepError('');
    return true;
  };
  const handleNext = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 3 && !validateStep3()) return;
    setCurrentStep((s) => Math.min(4, s + 1));
  };
  const handleBack = () => setCurrentStep((s) => Math.max(1, s - 1));

  return (
    <div className="p-6">
      <div className="flex gap-8">
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 sticky top-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Progress</h2>
            <div className="space-y-1">
              {STEPS.map((step) => (
                <div
                  key={step.number}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    currentStep === step.number
                      ? 'bg-slate-100 border-l-4 border-slate-900'
                      : currentStep > step.number
                        ? 'bg-green-50 border-l-4 border-green-500'
                        : 'bg-white border-l-4 border-transparent'
                  }`}
                >
                  <div
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                      currentStep === step.number
                        ? 'bg-slate-900 text-white'
                        : currentStep > step.number
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {step.number}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{step.title}</p>
                    <p className="text-xs text-slate-400">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-4">
          {stepError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{stepError}</p>}
          {currentStep === 1 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Student Information</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="First name" required value={firstName} onChange={(e) => setFirst(e.target.value)} />
                <Input label="Middle name" value={middleName} onChange={(e) => setMiddle(e.target.value)} />
                <Input label="Last name" required value={lastName} onChange={(e) => setLast(e.target.value)} />
                <Input label="Student number" required value={number} onChange={(e) => setNumber(e.target.value)} />
                <Input label="Date of birth" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
                <Select
                  label="Gender"
                  required
                  options={genders.map((v) => ({ value: v, label: human(v) }))}
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderValue)}
                />
                <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="mt-4">
                <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </div>
          )}
          {currentStep === 2 && <GuardianStep />}
          {currentStep === 3 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Grade Level</h2>
              <p className="text-sm text-gray-600 mb-6">
                Class assignment can be done later once classes are set up.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {grades.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrade(g)}
                    className={`p-4 rounded-lg border-2 text-center font-semibold ${
                      grade === g ? 'border-slate-900 bg-slate-100 text-sky-700' : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    {human(g)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {currentStep === 4 && <ReviewStep />}
          <div className="flex justify-between">
            <div>
              {currentStep > 1 && (
                <Button type="button" variant="secondary" onClick={handleBack}>
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Link href="/government/school-admin/students">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
              {currentStep < 4 ? (
                <Button type="button" onClick={handleNext}>
                  Next
                </Button>
              ) : (
                <Button type="button" onClick={() => void submit()}>
                  Create student
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
```

`GuardianStep` and `ReviewStep` are placeholders referenced here and implemented in Task 12 — for this task, stub them minimally so the file compiles and this task's test (which only walks through step 3) passes:

```tsx
function GuardianStep() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Guardian Information</h2>
      <p className="text-sm text-slate-500">Guardian fields are added in the next task.</p>
    </div>
  );
}
function ReviewStep() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Review & Submit</h2>
      <p className="text-sm text-slate-500">Review summary is added in the next task.</p>
    </div>
  );
}
```

Also change `submit`'s success branch — it currently does `if (r.ok) window.location.href = ...` for both create and edit; keep that behavior (Task 12 changes only the create branch's post-submit screen).

- [ ] **Step 4: Run the test, typecheck, lint**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentFormPage.test.tsx`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Manually verify edit mode is unaffected**

Run: `pnpm dev`, navigate to an existing student's edit page (`/government/school-admin/students/edit?id=<id>`), confirm the single-page form still renders and saves — this task's refactor must not have touched the `if (edit)` branch's JSX.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/students/StudentFormPage.tsx apps/desktop/renderer/components/students/StudentFormPage.test.tsx
git commit -m "feat(students): rewrite create-student form as a 4-step wizard shell"
```

---

### Task 12: Guardian step + Review & Submit with chained `createGuardian`

**Files:**
- Modify: `apps/desktop/renderer/components/students/StudentFormPage.tsx`
- Modify: `apps/desktop/renderer/components/students/StudentFormPage.test.tsx`

**Interfaces:**
- Consumes: `profileVm.createGuardian({ studentId, firstName, lastName, relationship, phoneNumber, isPrimary })` (existing method — `useStudentProfileViewModel` shares the same store as `listVm`).
- Produces: local guardian list state (`firstName, lastName, relationship, phoneNumber, isPrimary`), a plain success screen (no credentials).

- [ ] **Step 1: Write the failing test for the full submit flow**

Add to `StudentFormPage.test.tsx`:

```tsx
describe('StudentFormPage create wizard submit', () => {
  it('creates the student, then creates each guardian, then shows a plain success screen', async () => {
    const createMock = vi.fn(async () => ({
      id: 's-new', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
      admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01', gender: 'FEMALE', isActive: true,
      version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
    }));
    const createGuardianMock = vi.fn(async () => ({
      id: 's-new', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
      admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01', gender: 'FEMALE', isActive: true,
      version: 2, updatedAt: '2026-07-01T00:00:01.000Z', guardians: [{ id: 'g-1', guardianId: 'g-1', isPrimary: true }],
    }));
    (window as unknown as { nemis: unknown }).nemis = {
      school: { getSummary: vi.fn(async () => ({ id: 'inst-1', code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isApproved: true })) },
      academicYear: { getCurrent: vi.fn(async () => null) },
      term: { getCurrent: vi.fn(async () => null) },
      student: { create: createMock, createGuardian: createGuardianMock },
    };
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    const user = userEvent.setup();
    render(
      <PresentationProvider layer={layer}>
        <StudentFormPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Student Information')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/first name/i), 'Grace');
    await user.type(screen.getByLabelText(/last name/i), 'Toe');
    await user.type(screen.getByLabelText(/date of birth/i), '2015-01-01');
    await user.type(screen.getByLabelText(/student number/i), 'ADM-1');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => expect(screen.getByText('Guardian Information')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/guardian first name/i), 'John');
    await user.type(screen.getByLabelText(/guardian last name/i), 'Toe');
    await user.type(screen.getByLabelText(/relationship/i), 'Father');
    await user.type(screen.getByLabelText(/guardian phone/i), '0770000000');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => expect(screen.getByText('Grade Level')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^K1$/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => expect(screen.getByText('Review & Submit')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /create student/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    await waitFor(() => expect(createGuardianMock).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 's-new', firstName: 'John', lastName: 'Toe', relationship: 'Father', phoneNumber: '0770000000', isPrimary: true }),
    ));
    await waitFor(() => expect(screen.getByText(/student created/i)).toBeInTheDocument());
    expect(screen.queryByText(/login credentials/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentFormPage.test.tsx`
Expected: FAIL — `GuardianStep` is still a stub with no fields, and `submit` doesn't chain `createGuardian` or show a success screen.

- [ ] **Step 3: Implement guardian list state**

Add near the other create-mode state in `StudentFormPage` (after `const [address, setAddress] = useState('');`):

```tsx
  interface GuardianDraft {
    firstName: string;
    lastName: string;
    relationship: string;
    phoneNumber: string;
    isPrimary: boolean;
  }
  const [guardians, setGuardians] = useState<GuardianDraft[]>([
    { firstName: '', lastName: '', relationship: '', phoneNumber: '', isPrimary: true },
  ]);
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null);
  const updateGuardian = (index: number, field: keyof GuardianDraft, value: string | boolean) => {
    setGuardians((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  };
  const addGuardian = () =>
    setGuardians((prev) => [...prev, { firstName: '', lastName: '', relationship: '', phoneNumber: '', isPrimary: false }]);
  const removeGuardian = (index: number) => setGuardians((prev) => prev.filter((_, i) => i !== index));
```

Replace the `GuardianStep` stub:

```tsx
  function GuardianStep() {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Guardian Information</h2>
        {guardians.map((g, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">
                Guardian {index + 1} {g.isPrimary && <span className="text-xs text-sky-700">(Primary)</span>}
              </h3>
              {guardians.length > 1 && (
                <button type="button" className="text-red-600 text-sm" onClick={() => removeGuardian(index)}>
                  Remove
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Guardian first name"
                value={g.firstName}
                onChange={(e) => updateGuardian(index, 'firstName', e.target.value)}
              />
              <Input
                label="Guardian last name"
                value={g.lastName}
                onChange={(e) => updateGuardian(index, 'lastName', e.target.value)}
              />
              <Input
                label="Relationship"
                value={g.relationship}
                onChange={(e) => updateGuardian(index, 'relationship', e.target.value)}
              />
              <Input
                label="Guardian phone"
                value={g.phoneNumber}
                onChange={(e) => updateGuardian(index, 'phoneNumber', e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={g.isPrimary}
                onChange={(e) => updateGuardian(index, 'isPrimary', e.target.checked)}
              />
              Primary contact
            </label>
          </div>
        ))}
        <Button type="button" variant="secondary" fullWidth onClick={addGuardian}>
          Add another guardian
        </Button>
      </div>
    );
  }
```

Replace the `ReviewStep` stub:

```tsx
  function ReviewStep() {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Review & Submit</h2>
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">Student Information</h3>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-gray-600">Name</dt><dd className="font-medium">{firstName} {middleName} {lastName}</dd></div>
            <div><dt className="text-gray-600">Student number</dt><dd className="font-medium">{number}</dd></div>
            <div><dt className="text-gray-600">Date of birth</dt><dd className="font-medium">{dob}</dd></div>
            <div><dt className="text-gray-600">Grade</dt><dd className="font-medium">{grade ? human(grade) : 'Not selected'}</dd></div>
          </dl>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">Guardian Information</h3>
          {guardians.filter((g) => g.firstName && g.lastName).map((g, i) => (
            <p key={i} className="text-sm text-gray-700">
              {g.firstName} {g.lastName} — {g.relationship} {g.isPrimary && '(Primary)'}
            </p>
          ))}
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Chain `createGuardian` calls after `createStudent` and show a plain success screen**

Replace the `submit` function's create-mode branch (keep the `if (edit) { ... }` branch untouched):

```tsx
  const submitCreate = async () => {
    if (profile.status !== 'success' && profile.status !== 'refreshing') return;
    const r = await listVm.createStudent({
      institutionId: profile.data.id,
      firstName,
      middleName: middleName || undefined,
      lastName,
      admissionNumber: number,
      dateOfBirth: dob,
      gender,
      gradeLevel: grade || undefined,
      phoneNumber: phone || undefined,
      email: email || undefined,
      address: address || undefined,
    });
    if (!r.ok) return;
    for (const g of guardians.filter((guardian) => guardian.firstName && guardian.lastName && guardian.phoneNumber)) {
      await profileVm.createGuardian({
        studentId: r.data.id,
        firstName: g.firstName,
        lastName: g.lastName,
        relationship: g.relationship,
        phoneNumber: g.phoneNumber,
        isPrimary: g.isPrimary,
      });
    }
    setCreatedStudentId(r.data.id);
  };
```

Change the "Create student" button's handler from `() => void submit()` to `() => void submitCreate()`.

Add the success screen — render it instead of the wizard shell whenever `createdStudentId` is set. Wrap the wizard's outer `<div className="p-6">...</div>` (from Task 11) with a check placed right after the `if (edit) { ... }` block:

```tsx
  if (createdStudentId) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-green-800 text-sm">Student created successfully</p>
            <p className="text-xs text-green-700 mt-0.5">
              {firstName} {lastName} has been added to your school.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={`/government/school-admin/students/profile?id=${createdStudentId}`}>
            <Button>Go to student profile</Button>
          </Link>
          <Link href="/government/school-admin/students">
            <Button variant="secondary">Back to students list</Button>
          </Link>
        </div>
      </div>
    );
  }
```

Add `Check` to the `lucide-react` import.

- [ ] **Step 5: Run the tests, typecheck, lint**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentFormPage.test.tsx`
Expected: all tests PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/students/StudentFormPage.tsx apps/desktop/renderer/components/students/StudentFormPage.test.tsx
git commit -m "feat(students): implement guardian step and chained-createGuardian submit in the create wizard"
```

---

## Part E — Profile page redesign

### Task 13: Profile header card + fact-card grid

**Files:**
- Modify: `apps/desktop/renderer/components/students/StudentProfilePage.tsx`
- Create: `apps/desktop/renderer/components/students/StudentProfilePage.test.tsx`

**Interfaces:**
- Consumes: unchanged `useStudentProfileViewModel()` (`details`), `useEnrollmentViewModel()`, `useAcademicFoundationViewModel()` — no ViewModel contract changes.
- Produces: no new exports — visual restyle only, `Fact` helper renamed/restyled to `DetailRow` with an icon.

- [ ] **Step 1: Write the failing test for the restyled header**

Create `apps/desktop/renderer/components/students/StudentProfilePage.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { StudentProfilePage } from './StudentProfilePage';

beforeEach(() => {
  window.history.pushState({}, '', '/government/school-admin/students/profile?id=s-1');
  (window as unknown as { nemis: unknown }).nemis = {
    student: {
      get: vi.fn(async () => ({
        id: 's-1', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
        admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE', gradeLevel: 'GRADE_1',
        isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
      })),
      listEnrollments: vi.fn(async () => []),
    },
  };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.pushState({}, '', '/');
});

describe('StudentProfilePage', () => {
  it('renders the profile header with Grade/Gender/Status badges and fact cards', async () => {
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <StudentProfilePage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails or passes accidentally-weakly, then check section titles**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentProfilePage.test.tsx`
Expected: FAIL — the current layout has no "Personal Information"/"Contact Information" section headers (today's fact grid has no headers, just a flat `grid sm:grid-cols-2` of `Fact` rows).

- [ ] **Step 3: Restyle the profile header and split facts into titled cards**

Replace the `StudentProfilePage` function's returned JSX for the non-loading/error/empty case. Keep every existing hook, handler (`addGuardian`, `beginMove`, `moveClass`), and the Guardian/Enrollment-history/Modal sections at the bottom exactly as they are (Task 14 restyles those) — only change the header card and the top fact grid:

```tsx
  return (
    <Page
      title={d.fullName}
      action={
        <div className="flex gap-2">
          <Link href={`/government/school-admin/students/edit?id=${id}`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <Link href={`/government/school-admin/students/enroll?id=${id}`}>
            <Button>Enroll</Button>
          </Link>
          <Button
            variant={d.status.label === 'Active' ? 'destructive' : 'secondary'}
            onClick={() =>
              void vm.setStudentActive({ studentId: id, isActive: d.status.label !== 'Active' })
            }
          >
            {d.status.label === 'Active' ? 'Archive' : 'Restore'}
          </Button>
        </div>
      }
    >
      <div className="bg-white border border-slate-300 rounded-card p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <Avatar
            firstName={d.fullName.split(' ')[0]}
            lastName={d.fullName.split(' ').slice(1).join(' ')}
            role="student"
            size="xl"
          />
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold text-gray-900">{d.fullName}</h1>
            <p className="text-gray-500 text-sm mt-1">
              Admission No: <span className="font-mono font-medium text-gray-700">{d.admissionNumber}</span>
            </p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
              <Badge variant={d.status.label === 'Active' ? 'success' : 'neutral'} size="sm">
                {d.status.label}
              </Badge>
              <Badge variant="neutral" size="sm">{d.gender}</Badge>
              {d.gradeLevel && <Badge variant="neutral" size="sm">{d.gradeLevel}</Badge>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-300 rounded-card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Personal Information</h2>
          <div className="space-y-4">
            <DetailRow label="Grade" value={d.gradeLevel} />
            <DetailRow label="Date of birth" value={d.dateOfBirth} />
          </div>
        </section>
        <section className="bg-white border border-slate-300 rounded-card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Contact Information</h2>
          <div className="space-y-4">
            <DetailRow label="Phone" value={d.phoneNumber ?? '—'} />
            <DetailRow label="Email" value={d.email ?? '—'} />
            <DetailRow label="Address" value={d.address ?? '—'} />
          </div>
        </section>
      </div>
      {/* ...existing Enrollment History / Guardians sections and Modals, unchanged in this task... */}
    </Page>
  );
```

Replace the `Fact` helper at the bottom of the file with `DetailRow` (same signature, dropped icon prop — `@nemis-desktop/ui` has no bare icon-agnostic slot needed here since the web's icons are purely decorative):

```tsx
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-gray-900">{value}</p>
    </div>
  );
}
```

Update every remaining `<Fact .../>` call site further down the file (in the Enrollment History / Guardian sections, if any reference `Fact` directly — check with `grep -n "Fact" StudentProfilePage.tsx` after this edit) to `DetailRow`.

Add `Avatar, Badge` to the `@nemis-desktop/ui` import.

- [ ] **Step 4: Run the test, typecheck, lint**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentProfilePage.test.tsx`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/students/StudentProfilePage.tsx apps/desktop/renderer/components/students/StudentProfilePage.test.tsx
git commit -m "feat(students): restyle profile header and personal/contact fact cards"
```

---

### Task 14: Restyle Enrollment History / Guardians sections

**Files:**
- Modify: `apps/desktop/renderer/components/students/StudentProfilePage.tsx`
- Modify: `apps/desktop/renderer/components/students/StudentProfilePage.test.tsx`

**Interfaces:**
- Consumes: unchanged `enrollments` `AsyncState`, `d.guardians`, `beginMove`/`addGuardian`/`moveClass` handlers, `Modal` from `@nemis-desktop/ui`.
- Produces: no new exports — visual restyle only, same modals/handlers.

- [ ] **Step 1: Write the failing test**

Add to `StudentProfilePage.test.tsx`:

```tsx
describe('StudentProfilePage enrollment/guardians', () => {
  it('shows titled Enrollment History and Guardians cards matching the personal-info card style', async () => {
    window.history.pushState({}, '', '/government/school-admin/students/profile?id=s-1');
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        get: vi.fn(async () => ({
          id: 's-1', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
          admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE',
          isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
        })),
        listEnrollments: vi.fn(async () => []),
      },
    };
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <StudentProfilePage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    expect(screen.getByText('Enrollment History')).toBeInTheDocument();
    expect(screen.getByText('Guardians')).toBeInTheDocument();
    expect(screen.getByText('No enrollment history available.')).toBeInTheDocument();
    expect(screen.getByText('No guardians assigned.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it currently passes or fails**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentProfilePage.test.tsx`
Expected: this specific test likely already PASSES today (the section titles/empty-state copy already exist from before Task 13) — if so, that's fine; this task is a pure visual pass. Confirm by running and reading the actual pass/fail; if it fails because the guardian/enrollment sections were accidentally removed in Task 13, fix that first (they should have been left untouched — re-check Task 13's diff).

- [ ] **Step 3: Restyle the two sections to match the fact-card visual language**

Locate the existing Guardians `<section>` and Enrollment History `<section>` (below the fact-card grid added in Task 13) and change their wrapper classes from whatever ad hoc styling they have today to the same `bg-white border border-slate-300 rounded-card p-6` used by the Personal/Contact Information cards, and restyle the "Move class" button row to use `Button` consistently (it already does — verify, don't duplicate). Example target shape for the Guardians section:

```tsx
        <section className="bg-white border border-slate-300 rounded-card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-gray-900">Guardians</h2>
            <Button size="sm" onClick={() => setGuardianOpen(true)}>
              Add
            </Button>
          </div>
          {d.guardians.length === 0 ? (
            <p className="text-sm text-slate-500">No guardians assigned.</p>
          ) : (
            d.guardians.map((g) => (
              <p className="text-sm mt-3" key={g.id}>
                Guardian record {g.guardianId.slice(0, 8)}{' '}
                {g.isPrimary && <Badge size="sm">Primary</Badge>}
              </p>
            ))
          )}
        </section>
```

And the Enrollment History section:

```tsx
      <section className="bg-white border border-slate-300 rounded-card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Enrollment History</h2>
        {enrollments.status === 'empty' ? (
          <p className="text-sm text-slate-500">No enrollment history available.</p>
        ) : enrollments.status === 'success' || enrollments.status === 'refreshing' ? (
          enrollments.data.map((e) => (
            <div className="grid sm:grid-cols-5 gap-2 text-sm border-b py-2" key={e.id}>
              <span>{e.enrollmentDate.slice(0, 10)}</span>
              <span>Class {e.classId.slice(0, 8)}</span>
              <span>{e.status}</span>
              <span>Term {e.termId.slice(0, 8)}</span>
              {e.status === EnrollmentStatus.ACTIVE ? (
                <Button size="sm" variant="secondary" onClick={() => beginMove(e.id, e.academicYearId, e.classId)}>
                  Move class
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </section>
```

(These are largely the pre-existing bodies — the change is the wrapper `className` and section header sizing to match Task 13's cards; keep `beginMove`, `moveClass`, `addGuardian`, and both `Modal`s exactly as they are today.)

- [ ] **Step 4: Run the test, typecheck, lint**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentProfilePage.test.tsx`
Expected: all tests PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: all tests across the workspace PASS (this is the last task in the plan — a full green run confirms nothing in Parts A–E regressed anything else, e.g. the dashboard or teacher pages that also touch `IStudentRepository`/`ReportingApplicationService`).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/students/StudentProfilePage.tsx apps/desktop/renderer/components/students/StudentProfilePage.test.tsx
git commit -m "feat(students): restyle enrollment history and guardians sections to match profile card language"
```

---

## Self-review notes

- **Spec coverage:** Statistics slice (Tasks 1–5) ✓, list header/stat-cards/filters/table/grid/pagination/drawer (Tasks 7–10) ✓, file split enabling all of the above (Task 6) ✓, create wizard incl. chained guardian creation and dropped credentials screen (Tasks 11–12) ✓, profile header/fact-cards/enrollment/guardians (Tasks 13–14) ✓. `inter-school-transfer`/`promote` untouched ✓ (no task references them). Bulk-create button omission ✓ (Task 9's header band has one button only).
- **Type consistency:** `StudentStatisticsOutput` (application) → `StudentStatisticsResult` (IPC wire type, structurally identical, Task 3) → `StudentStatisticsView` (presentation, Task 5, also structurally identical — `map: (dto) => dto` is intentionally a passthrough) — verified the field names (`totalStudents`, `maleStudents`, `femaleStudents`, `recentEnrollments`) are spelled identically at all three layers. `IStudentRepository.countByGender()`/`countRecentAdmissions()` signatures match between the interface (Task 1), `SqliteStudentRepository`, and `InMemoryStudentRepository`.
- **No placeholders:** every step has runnable code, not prose-only descriptions; the two intentional stub functions (`GuardianStep`/`ReviewStep` in Task 11) are explicitly called out as temporary and are replaced with real implementations in the very next task (12), not left as permanent TODOs.
