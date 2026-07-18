# Phase 5 — Application Layer Design

**Date:** 2026-07-18
**Branch:** `phase-5-application-layer`
**Status:** Approved (design), pending implementation plan
**Builds on:** Phase 4 Enterprise Domain Layer (`@nemis-desktop/domain`, merged to `main` at `6f6d0c8`) and Phase 3 Data Access Layer (`apps/desktop/electron/data`, merged at `32f9a4a`).

---

## 1. Purpose & scope

Establish the **Application Layer** as the single public entry point for every business
operation and future UI interaction. It orchestrates the Domain Layer and the Repository
Layer into named business use cases (CQRS commands and queries). It contains **no** UI,
Electron, SQLite, or IPC code.

React components must never call repositories directly. From Phase 6 onward, the UI talks
only to Application Services / Use Cases.

### Ground truth discovered in the repo (shapes this design)

- The **domain package** `@nemis-desktop/domain` has 6 built slices — identity,
  institution, students, academics, attendance, assessments — with real entities
  (`Student`, `Guardian`, `Enrollment`, `Class`, `AcademicYear`, `Term`, `Attendance`,
  `Assessment`, `Grade`, `Institution`, `GradingConfig`, `User`, `UserOrganization`…).
- The **repository layer** lives **inside the Electron app** at
  `apps/desktop/electron/data/` and today has only **5 infra repositories** — Device,
  AppSettings, SyncMetadata, SyncQueue, AuditLog — returning **plain data models, not
  domain entities**.
- Therefore **no built domain slice has a repository**, and **no repository touches the
  domain**. The infra repos (`RegisterDevice`, `UpdateSettings`) have persistence but no
  domain; the business examples (`CreateStudent`, `RecordAttendance`, `PublishAssessment`)
  have domain entities but no persistence.
- Transactions are **synchronous** by design: `TransactionRunner.run<T>(work: () => T): T`
  (better-sqlite3 cannot `await` inside a transaction).

### Decisions locked with the user

1. **Location:** new package `@nemis-desktop/application` at `packages/application`
   (not the spec's literal `shared/application/` folder) — follows the established
   package-per-layer monorepo convention.
2. **Repository access:** **hexagonal / ports-and-adapters.** The Application Layer owns
   the repository **port** interfaces it depends on; the Electron composition root supplies
   adapters. The package never imports Electron/SQLite.
3. **Implementation depth:** **fully implement** use cases for the 6 built domains against
   repository ports, TDD with in-memory mock repositories. No SQLite, no adapters for
   business domains yet.
4. **Future domains** (geography, staff, finance, communication, resources, reporting —
   no entities, no repos): **extension points only** (conventions, layout, recipe). No
   invented DTOs or behavior. `CreateTeacher`/`AssignTeacher` fall here → skeleton contracts.
5. **Catalog breadth:** **representative catalog (~16 full use cases)**, not exhaustive CRUD.
6. **Infra end-to-end:** `RegisterDevice` and `UpdateSettings` are wired to the **real DAL**
   via port adapters in the Electron composition root, proving the hexagonal seam end-to-end
   (no new IPC handlers, no new SQLite).

---

## 2. Architecture & dependency direction

```
React UI  (Phase 6)
   │  calls use cases / application services only — never repositories
   ▼
@nemis-desktop/application            ← THIS PHASE (pure TypeScript package)
   │  depends on: ports (interfaces/), domain entities, shared types
   ▼
Repository PORTS (interfaces/)  +  Domain entities (@nemis-desktop/domain)
   ▲  implemented by
   │
Electron adapters  (apps/desktop/electron/data/... composition root)
   ▼
Existing SQLite DAL  →  SQLite / SQLCipher
```

Dependencies point **inward** toward the pure core (hexagonal). The Electron app depends on
the application package and supplies adapters; the package depends on nothing outward.

**Allowed imports:** `@nemis-desktop/domain`, `@nemis-desktop/types`, `@nemis-desktop/shared`.
**Forbidden imports** (ESLint `no-restricted-imports`, mirroring the domain package's
`eslint.config.mjs`): `react`, `react-dom`, `next`, `electron`, `better-sqlite3`,
`better-sqlite3-multiple-ciphers`, any `**/electron/**` path, tailwind, and IPC modules.

---

## 3. Package structure — `packages/application/src/`

```
core/          Command / Query / UseCase base types, ApplicationResponse<T> envelope
exceptions/    ApplicationException base + the 5 named exceptions
interfaces/    PORTS — repository ports (per domain, speak in domain entities),
               IUnitOfWork (sync), IAppLogger, IClock, IEventPublisher, IPermissionEvaluator
dto/           Per use case: Input / Output DTOs; shared ApplicationResponse<T>
mappers/       DTO ↔ domain only (never rows; never entities to UI)
validators/    Application input validation (shape / required / cross-field)
commands/      Command definitions (state-changing intent objects)
queries/       Query definitions (read intent objects)
use-cases/     Command & Query handlers (the logic), feature-first per domain
services/      Thin Application Service facades grouping a domain's use cases
events/        Application event types + IEventPublisher port (NO bus yet)
policies/      Permission hooks / business policies (interfaces + default-allow)
pipeline/      UseCaseInvoker: logging + exception translation + timing (composition)
factories/     createApplicationLayer(ports) composition root — constructor DI
_extension-template/   recipe for adding a domain / use case
```

Feature-first inside `use-cases/`, `dto/`, `mappers/`, `interfaces/`
(e.g. `use-cases/students/create-student.ts`), matching the domain package layout.

Package `package.json` mirrors `@nemis-desktop/domain`: `"type": "module"`,
`main`/`types` → `./src/index.ts`, dependency on `@nemis-desktop/domain`,
`@nemis-desktop/types`, `@nemis-desktop/shared`, `typecheck` script.

---

## 4. CQRS strategy

- **Commands** change state, return minimal results (`ApplicationResponse<{ id }>` or a
  small Output DTO), may open a `UnitOfWork`, may emit an application event.
- **Queries** read state, return Output DTOs, **never** take a `UnitOfWork`, **never** emit
  events, never mutate.
- Enforced structurally: separate `commands/` vs `queries/` folders, `*Command` / `*Query`
  naming, and query handlers are simply never constructed with an `IUnitOfWork` dependency.
- Base types (in `core/`):
  - `interface CommandHandler<TCommand, TResult> { execute(command: TCommand): Promise<TResult>; }`
  - `interface QueryHandler<TQuery, TResult> { execute(query: TQuery): Promise<TResult>; }`
  - `execute` is `async` for API uniformity and future-proofing; transactional work inside is
    a **synchronous** closure (see §7).

---

## 5. Use-case lifecycle (per command)

```
execute(input)                        [async; sync work + sync tx closure inside]
  1. Application validation           validators/  → ApplicationValidationException
  2. Permission hook (optional)       policies/    → PermissionDeniedException
  3. Precondition checks              via repo ports (exists / not-duplicate) → WorkflowException
  4. Map DTO → domain args            mappers/
  5. Domain operation                 Entity.create()/behavior (domain throws DomainException)
  6. Persist inside UnitOfWork        uow.run(() => repo.save(entity))    [sync closure]
  7. Record event                     eventPublisher.publish(StudentRegistered)  [no-op default]
  8. Map domain → Output DTO          mappers/ → ApplicationResponse<T>

The pipeline wraps every handler: logs start / success / failure, translates
DomainException → UseCaseException and unknown → UnexpectedApplicationException.
No verbose logging.
```

Queries follow the same shell minus steps 3/6/7 (no preconditions, no transaction, no events).

---

## 6. DTO & mapping strategy

- **Input DTO** — UI → use case parameters.
- **Output DTO** — the payload returned to the UI.
- **`ApplicationResponse<T>`** — standard envelope `{ data: T; warnings?: string[] }`.
- Database rows and domain entities are **never** returned to the UI.
- **Mappers** do **DTO ↔ domain only**: Input DTO → domain create-args / value objects, and
  domain entity → Output DTO. Entity ↔ row mapping is the **adapter's** job (Phase 6, out of
  scope here). The UI maps nothing.

---

## 7. Transaction strategy (honors the synchronous DAL)

Application-owned port:

```ts
interface IUnitOfWork {
  run<T>(work: () => T): T;          // deferred BEGIN
  runImmediate<T>(work: () => T): T; // BEGIN IMMEDIATE
}
```

**Synchronous**, mirroring the DAL's `TransactionRunner` (better-sqlite3 cannot `await`
mid-transaction). The `execute` method is `async` for API uniformity, but the transactional
closure passed to `uow.run` is pure-synchronous — no `await` inside. Rollback = throwing
inside the closure aborts the transaction; the pipeline then translates + logs. The Electron
adapter maps `IUnitOfWork` → the real `TransactionRunner` produced by `createDataLayer`.

Single-aggregate writes may use `runImmediate`; multi-aggregate writes use `run`. Queries
never receive a `UnitOfWork`.

---

## 8. Ports (interfaces/)

**Repository ports** (speak in **domain entities**, one per relevant aggregate):
`IStudentRepository`, `IGuardianRepository`, `IStudentGuardianRepository`,
`IEnrollmentRepository`, `IClassRepository`, `IAcademicYearRepository`, `ITermRepository`,
`IAttendanceRepository`, `IAssessmentRepository`, `IGradeRepository`,
`IInstitutionRepository`, `IGradingConfigRepository`, `IUserRepository`.
Plus infra gateway ports for the E2E path: `IDeviceGateway`, `ISettingsGateway` (adapting the
existing infra repositories).

**Cross-cutting ports:** `IUnitOfWork`, `IAppLogger`, `IClock` (supplies the injected
timestamp the domain's `touch(by, at)` convention requires), `IEventPublisher` (interface
only; default no-op), `IPermissionEvaluator` (advisory; default allow).

All ports return/accept domain entities or primitives — never SQLite rows, never DTOs.

---

## 9. Use-case catalog

**Fully implemented (~16), mock-tested against ports:**

| Domain | Commands | Queries |
|---|---|---|
| Students | CreateStudent, UpdateStudent, LinkGuardianToStudent | GetStudentById, ListStudents (paged) |
| Academics | EnrollStudent, CreateClass, CreateAcademicYear | GetClassRoster |
| Attendance | RecordAttendance | GetAttendanceByClassAndDate |
| Assessments | PublishAssessment, RecordGrade, PublishGrade | GetGradesByStudent |
| Identity | — (authentication is backend-owned) | GetUserById |
| Institution | UpdateGradingConfig (local config write) | GetInstitutionProfile |

**Infra, wired end-to-end via adapters to the real DAL:**
`RegisterDevice`, `UpdateSettings`.

**Skeleton contracts / extension points only** (domain not built): `CreateTeacher`,
`AssignTeacher` (staff domain). Interfaces + `_extension-template` recipe, no logic.

**Rationale for read-mostly identity/institution:** per `CLAUDE.md`, Electron never owns
authentication or national-data validation; the offline-first rule is write-local →
queue-sync. So local writes are the school/teacher actions (students, enrollment, attendance,
grades) plus local config (grading config, settings) and device registration.

---

## 10. Application events

Type definitions only, plus the `IEventPublisher` port. **No event bus** is built this phase.
Events are defined **only** where the corresponding use case exists:
`StudentRegistered`, `AttendanceSaved`, `AssessmentPublished`, `GradePublished`,
`SettingsUpdated`, `DeviceRegistered`. (`TeacherAssigned` is declared as a skeleton alongside
its skeleton use case.) Default publisher is a no-op; commands call it after successful
persistence.

---

## 11. Exceptions

`ApplicationException` (base) and the five named:
`UseCaseException`, `ApplicationValidationException`, `PermissionDeniedException`,
`WorkflowException`, `UnexpectedApplicationException`. The pipeline maps domain exceptions
(`DomainException` subclasses) → `UseCaseException`, and unknown errors →
`UnexpectedApplicationException`. This taxonomy is the seam Phase 6 maps to `IpcResult`
payloads (per the Phase 3 recommendation on RepositoryError→IPC mapping).

---

## 12. Dependency injection

Constructor-based DI throughout. Use cases receive their ports via constructor; they never
instantiate repositories. `factories/createApplicationLayer(ports)` is the composition root
that assembles every use case and application service from injected ports and returns the
typed application API. The Electron app calls it once with real adapters; tests call it (or
construct handlers directly) with mocks. Project is left ready for a future IoC container
without requiring one now.

---

## 13. Testing strategy

- Vitest, colocated `*.test.ts`, following Phase 3/4 conventions.
- **In-memory mock repositories** implementing the ports.
- Every fully-implemented use case tested for: happy path, application-validation failure,
  precondition/workflow failure, and domain-exception translation.
- Mapper tests and pipeline tests (logging + exception translation).
- The two infra use cases additionally tested against their **adapters**.
- No UI tests.

---

## 14. Documentation

- New `docs/application-layer.md`: philosophy, CQRS strategy, use-case lifecycle, DTO
  strategy, mapping strategy, dependency rules, transaction strategy, testing strategy,
  extension pattern.
- `docs/conventions.md`: add an "Application Layer" section and an "adding a use case" recipe.

---

## 15. Acceptance criteria

- UI never accesses repositories directly (structurally impossible from the package boundary).
- Use cases depend only on repository **ports**; never instantiate repositories.
- Commands and queries separated (folders, naming, dependency shape).
- DTO ↔ domain mapping implemented; no rows/entities exposed to the UI.
- Constructor DI used everywhere; `createApplicationLayer` composition root.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` all green.
- ESLint boundary rules forbid react/electron/sqlite/ipc imports in the package.
- Docs updated.

---

## 16. Known technical debt carried in

- Business repository **adapters** + entity↔row mappers don't exist → only the infra path
  runs truly end-to-end; business use cases are mock-tested until Phase 6 builds their SQLite
  adapters.
- `IEventPublisher` is a no-op (no bus — by design).
- `IPermissionEvaluator` is advisory only (authorization stays backend-authoritative).
- Query pagination shape reuses the DAL's `QueryOptions`/paging idiom where sensible; final
  read-model paging optimizations deferred with the repository work.

---

## 17. Phase 6 readiness

The UI receives a single typed entry point (`createApplicationLayer`). Making a business
domain live = implement its repository port adapter + entity↔row mapper + register it in the
composition root — **no application-logic changes**. The exception taxonomy is ready to map
to `IpcResult`. The event port is ready for a bus when sync/eventing lands.
