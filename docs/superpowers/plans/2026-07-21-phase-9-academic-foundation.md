# Phase 9 — Academic Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete offline CRUD for the academic reference data every operational module depends on — Academic Years, Terms, Grade Levels, Classes, Subjects, School Profile, Settings — flowing React → Presentation → Application → Repositories → SQLite, with dashboard integration.

**Architecture:** Extend every existing layer in place, honoring the backend Prisma schema as source of truth. New SQLite tables (`terms`, `subjects`, `class_subjects`) via migration 003; domain entities gain `create()`/mutators; ~20 new CQRS use cases behind the existing `AcademicsApplicationService`; ~21 new validated IPC channels; new ViewModels registered in `createPresentationLayer`; renderer pages replace ComingSoon stubs, porting UX from `portal-web` school-admin pages onto `@nemis-desktop/ui` components.

**Tech Stack:** TypeScript strict, Electron 42.7.0, better-sqlite3-multiple-ciphers (SQLCipher), Next.js static renderer, vanilla Zustand, Vitest.

## Global Constraints

- Backend (`apps/Server/prisma/schema.prisma` in the Nemis repo) is the source of truth. **GradeLevel is an enum** (KG, K1, K2, GRADE_1..GRADE_12) — never a table. AcademicYear status enum: ACTIVE | CLOSED | ARCHIVED.
- Uniqueness rules (backend parity): year name per institution; class name per (institution, academicYear); subject code per institution; (classId, subjectId) per assignment. Term name per academic year (backend service rule).
- "Current" rules (backend parity): setting a year current unsets all other years of the institution **in the same transaction**; setting a term current unsets other terms **of the same year**.
- The renderer never touches repositories or `window.nemis` outside `renderer/services/nemis-bridge.ts` (ESLint-enforced).
- Every IPC endpoint: contract-first in `packages/types/src/ipc.ts`, mandatory validator, errors via `toIpcError` only.
- Application package imports only `@nemis-desktop/domain` + `@nemis-desktop/types` (ESLint-enforced). Domain imports only `@nemis-desktop/types`.
- Writes go through `unitOfWork.run()`; entities carry sync metadata (version/updatedAt/lastModifiedBy/deviceId). **No synchronization logic** — sync-queue enqueueing stays out (listed as accepted debt, same as Phases 5–8 writes).
- Soft delete: classes and subjects use `isActive`; academic years use `status` transitions; terms hard-delete (backend parity).
- Copy style: professional government-software tone; empty states with clear calls to action; Lucide icons; existing color tokens; no shadows.
- Tests colocated `foo.ts` → `foo.test.ts`; run via workspace `pnpm test`.
- Commit after each task; branch `phase-9-academic-foundation` off `main`.

---

### Task 0: Branch

- [ ] `git checkout -b phase-9-academic-foundation` (from `main` @ 2947cce)

### Task 1: Shared types — enums, wire results, IPC contract

**Files:**
- Modify: `packages/types/src/enums.ts` (add `AcademicYearStatus` if absent)
- Create: `packages/types/src/academics.ts` (wire shapes)
- Modify: `packages/types/src/dashboard.ts` (extend `DashboardOverviewResult` with `totalSubjects: number`)
- Modify: `packages/types/src/ipc.ts`, `packages/types/src/api.ts`, `packages/types/src/index.ts`

**Interfaces (produces — exact wire types):**

```ts
// academics.ts
export interface AcademicYearListItemResult extends AcademicYearResult { status: AcademicYearStatus; termCount: number; classCount: number; }
export interface CreateAcademicYearRequest { code: string; startDate: string; endDate: string; makeCurrent?: boolean; }
export interface UpdateAcademicYearRequest { id: string; code?: string; startDate?: string; endDate?: string; }
export interface SetAcademicYearStatusRequest { id: string; status: AcademicYearStatus; }
export interface TermResult { id: string; academicYearId: string; name: string; startDate: string; endDate: string; isCurrent: boolean; }
export interface CreateTermRequest { academicYearId: string; name: string; startDate: string; endDate: string; makeCurrent?: boolean; }
export interface UpdateTermRequest { id: string; name?: string; startDate?: string; endDate?: string; }
export interface ClassResult { id: string; academicYearId: string; name: string; section?: string; gradeLevel: GradeLevel; capacity?: number; isActive: boolean; subjectCount: number; }
export interface ClassListRequest { limit?: number; offset?: number; keyword?: string; academicYearId?: string; gradeLevel?: GradeLevel; includeInactive?: boolean; sort?: 'name' | 'gradeLevel' | 'updatedAt'; }
export interface CreateClassRequest { academicYearId: string; name: string; section?: string; gradeLevel: GradeLevel; capacity?: number; }
export interface UpdateClassRequest { id: string; name?: string; section?: string | null; gradeLevel?: GradeLevel; capacity?: number | null; }
export interface SetActiveRequest { id: string; isActive: boolean; }
export interface SubjectResult { id: string; name: string; code: string; description?: string; isActive: boolean; classCount: number; }
export interface SubjectListRequest { limit?: number; offset?: number; keyword?: string; includeInactive?: boolean; sort?: 'name' | 'code' | 'updatedAt'; }
export interface CreateSubjectRequest { name: string; code: string; description?: string; }
export interface UpdateSubjectRequest { id: string; name?: string; code?: string; description?: string | null; }
export interface ClassSubjectResult { classId: string; subjectId: string; subjectName: string; subjectCode: string; assignedAt: string; }
export interface GradeLevelCountResult { gradeLevel: GradeLevel; classCount: number; }
export interface PagedResult<T> { items: T[]; total: number; limit: number; offset: number; }
export interface DeletedResult { id: string; }
```

**IPC channels (contract entries + constants; `domain:action` naming):**

| Channel | args | result |
|---|---|---|
| `academic-year:list` | [] | `AcademicYearListItemResult[]` |
| `academic-year:create` | [CreateAcademicYearRequest] | `AcademicYearListItemResult` |
| `academic-year:update` | [UpdateAcademicYearRequest] | `AcademicYearListItemResult` |
| `academic-year:set-current` | [id: string] | `AcademicYearListItemResult` |
| `academic-year:set-status` | [SetAcademicYearStatusRequest] | `AcademicYearListItemResult` |
| `term:list` | [academicYearId: string] | `TermResult[]` |
| `term:get-current` | [] | `TermResult \| null` |
| `term:create` | [CreateTermRequest] | `TermResult` |
| `term:update` | [UpdateTermRequest] | `TermResult` |
| `term:set-current` | [id: string] | `TermResult` |
| `term:delete` | [id: string] | `DeletedResult` |
| `class:list` | [ClassListRequest] | `PagedResult<ClassResult>` |
| `class:create` | [CreateClassRequest] | `ClassResult` |
| `class:update` | [UpdateClassRequest] | `ClassResult` |
| `class:set-active` | [SetActiveRequest] | `ClassResult` |
| `class:grade-level-counts` | [] | `GradeLevelCountResult[]` |
| `subject:list` | [SubjectListRequest] | `PagedResult<SubjectResult>` |
| `subject:create` | [CreateSubjectRequest] | `SubjectResult` |
| `subject:update` | [UpdateSubjectRequest] | `SubjectResult` |
| `subject:set-active` | [SetActiveRequest] | `SubjectResult` |
| `class-subject:list` | [classId: string] | `ClassSubjectResult[]` |
| `class-subject:assign` | [{classId; subjectId}] | `ClassSubjectResult` |
| `class-subject:unassign` | [{classId; subjectId}] | `DeletedResult` |

`NemisApi` gains groups: `academicYear.{list,create,update,setCurrent,setStatus}`, `term.{...}`, `clazz`→ name the group `classes.{list,create,update,setActive,gradeLevelCounts,listSubjects,assignSubject,unassignSubject}`, `subject.{list,create,update,setActive}`. `IPC_CHANNELS_EXHAUSTIVE` keeps compiling.

- [ ] Add types + contract; typecheck `packages/types`; commit `feat(types): academic foundation wire types + IPC contract`

### Task 2: Migration 003 — terms, subjects, class_subjects, year status, class section

**Files:**
- Create: `apps/desktop/electron/database/migrations/003-create-academic-foundation-tables.ts` (+ colocated test)
- Modify: `apps/desktop/electron/database/migrations/registry.ts`, `apps/desktop/electron/database/schema/tableNames.ts` (add `terms`, `subjects`, `classSubjects`)

**SQL (complete):**

```sql
ALTER TABLE academic_years ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE classes ADD COLUMN section TEXT;

CREATE TABLE terms (
  id TEXT PRIMARY KEY,
  academicYearId TEXT NOT NULL,
  name TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  isCurrent INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL,
  updatedAt TEXT NOT NULL,
  lastModifiedBy TEXT,
  deviceId TEXT
);
CREATE INDEX idx_terms_academicYearId ON terms (academicYearId);
CREATE INDEX idx_terms_isCurrent ON terms (isCurrent);
CREATE UNIQUE INDEX idx_terms_year_name ON terms (academicYearId, name);

CREATE TABLE subjects (
  id TEXT PRIMARY KEY,
  institutionId TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL,
  updatedAt TEXT NOT NULL,
  lastModifiedBy TEXT,
  deviceId TEXT
);
CREATE INDEX idx_subjects_institutionId ON subjects (institutionId);
CREATE UNIQUE INDEX idx_subjects_institution_code ON subjects (institutionId, code);

CREATE TABLE class_subjects (
  id TEXT PRIMARY KEY,
  classId TEXT NOT NULL,
  subjectId TEXT NOT NULL,
  assignedAt TEXT NOT NULL,
  version INTEGER NOT NULL,
  updatedAt TEXT NOT NULL,
  lastModifiedBy TEXT,
  deviceId TEXT
);
CREATE UNIQUE INDEX idx_class_subjects_pair ON class_subjects (classId, subjectId);
CREATE INDEX idx_class_subjects_subjectId ON class_subjects (subjectId);
```

Also unique indexes for backend parity on existing tables:
`CREATE UNIQUE INDEX idx_academic_years_institution_code ON academic_years (institutionId, code);`
`CREATE UNIQUE INDEX idx_classes_year_name ON classes (institutionId, academicYearId, name);`
`down()` drops the three tables + the two new unique indexes (ALTER COLUMN drops are not supported; document that `down` recreates academic_years/classes is NOT attempted — follow existing 002 down which just drops; for 003 down, drop tables and indexes only and leave added columns, consistent with SQLite limitations — note in file comment).

- [ ] Migration + registry + tableNames; tests mirror `002`'s (fresh DB has tables/indexes; down drops); commit `feat(db): migration 003 academic foundation tables`

### Task 3: Domain layer — entity factories and mutators

**Files (all in `packages/domain/src`):**
- Modify: `academics/entities/academic-year.ts`, `term.ts`, `class.ts`, `subject.ts` (+ colocated tests)
- Create: `academics/events/` additions: `academic-year-created.ts`, `term-created.ts`, `class-created.ts`, `subject-created.ts` (follow `student-created.ts` shape), export via `academics/events/index.ts`

**Interfaces (produces):**
- `AcademicYear.create({id, institutionId, code, start, end, isCurrent, occurredAt})`; mutators `rename(code, by, at)`, `reschedule(start, end, by, at)`, `makeCurrent(by, at)`, `clearCurrent(by, at)`, `close(by, at)`, `archive(by, at)`, `restore(by, at)`; new field `status: AcademicYearStatus` (reconstitute input gains `status`).
  - Transitions guarded (`BusinessRuleViolationException`): close only from ACTIVE; archive from ACTIVE|CLOSED; restore from CLOSED|ARCHIVED→ACTIVE; a CLOSED/ARCHIVED year cannot `makeCurrent` and cannot be rescheduled/renamed.
- `Term` becomes `AggregateRoot<string>` with metadata (reconstitute input gains `version`, `updatedAt`, `lastModifiedBy?`); `Term.create({id, academicYearId, name, start, end, isCurrent, occurredAt})`; mutators `rename`, `reschedule`, `makeCurrent`, `clearCurrent`.
- `Class.create({id, institutionId, academicYearId, name, section?, gradeLevel, capacity?, occurredAt})`; field `section?: string`; mutators `update({name?, section?, gradeLevel?, capacity?}, by, at)`, `deactivate(by, at)`, `activate(by, at)`. Capacity guard: integer 1..1000 when present.
- `Subject.create({id, institutionId, name, code, description?, occurredAt})`; field `description?: string`; mutators `update({name?, code?, description?}, by, at)`, `deactivate`, `activate`. Code normalized to trimmed uppercase.

All mutators call `touch(by, at)`; `create()` emits its created event; reconstitute never emits. `AcademicYearStatus` imported from `@nemis-desktop/types`.

- [ ] Write failing entity tests (transitions, guards, touch/version bump) → implement → pass → commit `feat(domain): academic foundation entity lifecycle`

### Task 4: Application layer — ports, DTOs, use cases, service, fakes

**Files (all in `packages/application/src`):**
- Modify: `interfaces/academics/academic-year-repository.ts`, `class-repository.ts`
- Create: `interfaces/academics/term-repository.ts`, `subject-repository.ts` (export in `interfaces/academics/index.ts`)
- Modify: `dto/academics/academic-year-dto.ts` (+status), `dto/academics/academics-dto.ts` (add all input/output DTOs mirroring Task-1 wire shapes 1:1)
- Create: use cases in `use-cases/academics/`: `list-academic-years.ts`, `create-academic-year.ts`, `update-academic-year.ts`, `set-current-academic-year.ts`, `set-academic-year-status.ts`, `list-terms.ts`, `get-current-term.ts`, `create-term.ts`, `update-term.ts`, `set-current-term.ts`, `delete-term.ts`, `list-classes.ts`, `create-class.ts`, `update-class.ts`, `set-class-active.ts`, `get-grade-level-counts.ts`, `list-subjects.ts`, `create-subject.ts`, `update-subject.ts`, `set-subject-active.ts`, `list-class-subjects.ts`, `assign-subject-to-class.ts`, `unassign-subject-from-class.ts` (+ colocated tests using in-memory fakes)
- Modify: `services/academics-application-service.ts`, `factories/create-application-layer.ts`, `mappers/academics/` (add `academic-year-mapper.ts` extensions, `term-mapper.ts`, `class-mapper.ts`, `subject-mapper.ts`)
- Modify/Create testing fakes: `testing/academics/in-memory-academic-year-repository.ts` (extend), `in-memory-class-repository.ts` (extend), create `in-memory-term-repository.ts`, `in-memory-subject-repository.ts`

**Ports (produces — exact):**

```ts
export interface AcademicYearPage { items: AcademicYear[]; }
export interface IAcademicYearRepository {
  findCurrent(): AcademicYear | null;
  findById(id: string): AcademicYear | null;
  findAll(): AcademicYear[];                       // ordered startDate DESC
  existsByCode(institutionId: string, code: string, excludeId?: string): boolean;
  findCurrentOthers(institutionId: string, excludeId: string): AcademicYear[];
  save(year: AcademicYear): void;
  countTerms(academicYearId: string): number;
  countClasses(academicYearId: string): number;
}
export interface ITermRepository {
  findById(id: string): Term | null;
  findByYear(academicYearId: string): Term[];      // ordered startDate ASC
  findCurrent(): Term | null;                      // isCurrent within current year
  existsByName(academicYearId: string, name: string, excludeId?: string): boolean;
  findCurrentOthers(academicYearId: string, excludeId: string): Term[];
  save(term: Term): void;
  delete(id: string): void;
}
export interface ClassPageFilter { limit: number; offset: number; keyword?: string; academicYearId?: string; gradeLevel?: GradeLevel; includeInactive?: boolean; sort?: 'name' | 'gradeLevel' | 'updatedAt'; }
export interface IClassRepository {
  findById(id: string): Class | null;
  exists(id: string): boolean;
  countAll(): number;
  findPage(filter: ClassPageFilter): { items: Class[]; total: number };
  existsByName(institutionId: string, academicYearId: string, name: string, excludeId?: string): boolean;
  countByGradeLevel(): { gradeLevel: GradeLevel; classCount: number }[];
  countSubjects(classId: string): number;
  save(entity: Class): void;
}
export interface SubjectPageFilter { limit: number; offset: number; keyword?: string; includeInactive?: boolean; sort?: 'name' | 'code' | 'updatedAt'; }
export interface ClassSubjectLink { classId: string; subjectId: string; subjectName: string; subjectCode: string; assignedAt: string; }
export interface ISubjectRepository {
  findById(id: string): Subject | null;
  findPage(filter: SubjectPageFilter): { items: Subject[]; total: number };
  existsByCode(institutionId: string, code: string, excludeId?: string): boolean;
  countAll(): number;                              // active only
  countClasses(subjectId: string): number;
  save(subject: Subject): void;
  listClassSubjects(classId: string): ClassSubjectLink[];
  isAssigned(classId: string, subjectId: string): boolean;
  assign(link: { id: string; classId: string; subjectId: string; assignedAt: string }): void;
  unassign(classId: string, subjectId: string): void;
}
```

**Business rules enforced in use cases (validation matrix):**
- Create/update year: `requireFields`; `AcademicYearCode` + `DateRange` via domain; duplicate code → `WorkflowException('An academic year with this code already exists.')`; `makeCurrent` unsets others via `findCurrentOthers` + `clearCurrent` + save, all inside one `unitOfWork.run`.
- Set-current year: year must exist and be ACTIVE.
- Set-status: delegates to entity transition guards; a year that `isCurrent` cannot be closed/archived without first losing current (raise WorkflowException telling the user to set another year current).
- Terms: parent year must exist and not be ARCHIVED; term DateRange must lie within the year period (`WorkflowException('Term dates must fall within the academic year.')`); duplicate name per year; set-current requires parent year to be the current year is NOT required (backend allows any), but current term lookup joins on current year; delete allowed (no local dependents yet — documented debt).
- Classes: parent year must exist, not ARCHIVED; gradeLevel ∈ GradeLevel enum; capacity integer 1..1000; duplicate name per (institution, year); institutionId comes from `institutions.findFirst()` (single-school install), error if no institution configured yet → `WorkflowException('No school is configured on this device yet.')`.
- Subjects: duplicate code per institution (case-insensitive via normalized upper code); name required; institution required as above.
- Assign subject↔class: both must exist and be active; duplicate pair → WorkflowException; unassign of a missing pair → WorkflowException.
- Lists: limit clamp 1..100 default 25 (same as ListStudents); keyword trimmed, min 1 char to apply; sort whitelisted by DTO union type.

**Service/facade:** `AcademicsApplicationService` gains one method per use case (names: `listAcademicYears`, `createAcademicYear`, `updateAcademicYear`, `setCurrentAcademicYear`, `setAcademicYearStatus`, `listTerms`, `getCurrentTerm`, `createTerm`, `updateTerm`, `setCurrentTerm`, `deleteTerm`, `listClasses`, `createClass`, `updateClass`, `setClassActive`, `getGradeLevelCounts`, `listSubjects`, `createSubject`, `updateSubject`, `setSubjectActive`, `listClassSubjects`, `assignSubjectToClass`, `unassignSubjectFromClass`). `ApplicationPorts` gains `terms: ITermRepository`, `subjects: ISubjectRepository`. `GetDashboardOverviewUseCase` gains `subjects` dep → `totalSubjects: subjects.countAll()`.

- [ ] TDD each use case against fakes; extend factory test; commit `feat(application): academic foundation CRUD use cases`

### Task 5: SQLite repositories + composition root

**Files:**
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteAcademicYearRepository.ts`, `SqliteClassRepository.ts` (+tests)
- Create: `SqliteTermRepository.ts`, `SqliteSubjectRepository.ts` (+tests)
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts` (register `terms`, `subjects`), `apps/desktop/electron/data/adapters/createApplicationComposition.ts` (wire both ports), `apps/desktop/electron/data/adapters/business-e2e.test.ts` (year→term→class→subject→assignment E2E through the application layer to real SQLite)

Pattern: compose `StatementCache`, wrap every statement in `guarded()`, upsert `save()` exactly like `SqliteStudentRepository.save`. Keyword search: `WHERE (name LIKE '%'||?||'%' OR code LIKE ...)` with `ESCAPE` not required (keep simple LIKE, consistent with any existing usage). Sorting: map whitelisted sort key → hardcoded ORDER BY strings (never interpolate user input). `academic_years` rows now read/write `status`; `classes` rows read/write `section`.

- [ ] TDD repos on in-memory better-sqlite3 harness (follow existing repo tests); commit `feat(data): SQLite academic foundation repositories`

### Task 6: IPC — validators, handlers, preload, bridge, facade

**Files:**
- Modify: `apps/desktop/electron/security/validateIpc.ts` — add a small bounded-shape validator helper plus one exported validator per channel (exact arity; strings non-empty ≤200 chars; dates matched against `/^\d{4}-\d{2}-\d{2}/` ISO prefix; enums checked with `Object.values(...)` membership; integers bounded; unknown extra keys rejected)
- Modify: `apps/desktop/electron/ipc/handlers/academicYear.ts`; Create: `handlers/term.ts`, `handlers/class.ts` (file name `classes.ts`), `handlers/subject.ts`; Modify: `ipc/registrar.ts`
- Modify: `apps/desktop/electron/preload/preload.ts`, `apps/desktop/renderer/services/nemis-bridge.ts`, `apps/desktop/renderer/lib/presentation/create-ipc-application-layer.ts` (wire all new academics facade methods so ViewModels reach IPC)
- Tests: validator unit tests; handler tests following `dashboard-handlers.test.ts`

Handlers stay one-liners: `handle(CHANNEL, validator, (dto) => app.academics.method(dto).then(r => r.data))`. DTO↔wire types are structurally identical, so no translation layer.

- [ ] TDD validators; wire handlers/preload/bridge/facade; commit `feat(ipc): academic foundation endpoints`

### Task 7: Presentation layer — ViewModels

**Files (in `packages/presentation/src`):**
- Create view-models + views + colocated tests:
  - `view-models/academic-years/academic-years-view-model.ts` — state `{ list: AsyncState<AcademicYearRowView[]>, submission }`; actions `load`, `create`, `update`, `setCurrent`, `setStatus` (each command → `CommandOutcome`, success notification, reload)
  - `view-models/terms/terms-view-model.ts` — state `{ selectedYearId, terms: AsyncState<TermRowView[]>, submission }`; actions `selectYear`, `load`, `create`, `update`, `setCurrent`, `remove`
  - `view-models/classes/classes-view-model.ts` — full list state: pagination (`createPagination`), search (`createSearch`), filters `{ academicYearId?, gradeLevel?, includeInactive }`, sort; commands create/update/setActive; `assignSubject`/`unassignSubject`/`loadClassSubjects` with `classSubjects: AsyncState<ClassSubjectView[]>`
  - `view-models/subjects/subjects-view-model.ts` — pagination + search + includeInactive + sort; commands create/update/setActive
  - `view-models/grade-levels/grade-levels-view-model.ts` — `counts: AsyncState<GradeLevelCountView[]>` over the fixed 15-level ladder (levels with zero classes still render)
  - `view-models/school-profile/school-profile-view-model.ts` — wraps `institution.getCurrentSchool`
- Create matching `queries/academics/*-ui-query.ts`, `commands/academics/*-ui-command.ts`, `mappers/academics/*-view-mapper.ts` following students patterns
- Modify: `view-models/dashboard/*` — `DashboardSummaryView` gains `totalSubjects`; `AcademicYearViewModel` untouched; add `currentTerm: AsyncState<TermView>` to a small `CurrentTermViewModel` or extend `AcademicYearViewModel` with `loadCurrentTerm()` (choose: extend `AcademicYearViewModel`, state key `currentTerm`)
- Modify: `factories/create-presentation-layer.ts` registering: `academicYears`, `terms`, `classes`, `subjects`, `gradeLevels`, `schoolProfile`

- [ ] TDD against `createTestApplication` (fakes now include terms/subjects); commit `feat(presentation): academic foundation ViewModels`

### Task 8: Renderer pages

**Files (in `apps/desktop/renderer`):**
- Modify: `components/shell/sidebar-config.ts` — ACADEMIC group gains `Academic Years` (`/government/school-admin/academic-years`, CalendarRange icon), `Terms` (`/government/school-admin/terms`, CalendarClock), `Grade Levels` (`/government/school-admin/grade-levels`, Layers); SYSTEM group gains `School Profile` (`/government/school-admin/school-profile`, Building2)
- Modify: `components/shell/page-titles.ts` for the four new routes
- Create pages (replace ComingSoon where present):
  - `app/government/school-admin/academic-years/page.tsx` — table (code, period, status badge, current badge, term/class counts), Create/Edit modal (code, start, end, make current), row actions Set Current / Close / Archive / Restore with confirm dialogs; empty state "No Academic Year has been configured." + CTA
  - `app/government/school-admin/terms/page.tsx` — year Select (from years list, defaults to current), terms table, Create/Edit modal (name, dates, make current), Delete confirm; empty state per year
  - `app/government/school-admin/grade-levels/page.tsx` — fixed ladder KG→Grade 12 with class counts and a "View classes" link routing to Classes filtered by level; read-only explainer that grade levels are national reference data
  - `app/government/school-admin/classes/page.tsx` — toolbar (search box, year filter, grade filter, include-inactive toggle, sort), paged table (name, section, grade, capacity, subjects count, status), Create/Edit modal, Deactivate/Restore confirm, per-row "Subjects" drawer to assign/unassign subjects; empty state "No Classes created."
  - `app/government/school-admin/subjects/page.tsx` — search + paging + sort, table (code, name, description, classes count, status), Create/Edit modal, Deactivate/Restore; empty state "No Subjects available."
  - `app/government/school-admin/school-profile/page.tsx` — read-only profile card from school summary (name, code, type, ownership, approval, address) + honest empty state when no school configured
  - `app/government/school-admin/settings/page.tsx` — replace ComingSoon: School Configuration section (read-only school summary + device info via existing ViewModels) and Academic Settings section (current year + current term with links to their pages)
- Reuse `@nemis-desktop/ui` (Table, Modal, Drawer, Select, Input, Badge, EmptyState, ErrorState, Skeleton, Toast) and `useViewModel` hook; UX ported/adapted from `portal-web/src/app/government/school-admin/{classes,subjects,settings}/page.tsx`
- Tests: page render tests following `dashboard.test.tsx` (empty state, loaded rows, create flow driving VM)

- [ ] Implement pages + nav; tests; commit `feat(renderer): academic foundation pages`

### Task 9: Dashboard integration

- Extend `InfoTile` row: Current Academic Year (exists), add Current Term tile, Total Classes (exists), add Total Subjects tile; School info card already present via school summary.
- `BootstrapService` also warms `term:get-current` (parallel, isolated like the other five).
- [ ] Update `components/dashboard/*`, page test assertions; commit `feat(renderer): dashboard shows current term + subject totals`

### Task 10: Verification gate + docs

- [ ] `pnpm typecheck` → 0 errors; `pnpm lint` → 0; `pnpm test` → all green; renderer static export; `pnpm make` → installer builds
- [ ] Create `docs/academic-foundation.md` (architecture, data flow, CRUD lifecycle, validation matrix, folder map, extension recipe for the next module); update `docs/conventions.md` if a new recipe emerged
- [ ] Final review vs. spec acceptance criteria; commit `docs: academic foundation`

## Self-Review Notes

- Spec coverage: Years/Terms/GradeLevels/Classes/Subjects/Profile/Settings ✓ (grade levels intentionally read-only — backend enum); CRUD+search+sort+filter+pagination ✓ (years/terms unpaged by design: bounded cardinality); dashboard ✓; IPC validation ✓; tests per layer ✓; docs ✓.
- Restore: years via `restore()`; classes/subjects via `setActive(true)`. Archive: years via status; classes/subjects deactivate ≙ archive (backend has no separate archive for them).
- Optimistic UI: commands return `CommandOutcome` and reload lists (established pattern) — no speculative cache mutation; noted in docs as deliberate.
- Sync-queue enqueueing on writes: accepted debt (consistent with Phases 5–8), listed for the sync phase.
