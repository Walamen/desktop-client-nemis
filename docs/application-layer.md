# Application Layer

Phase 5 architecture reference. Spec:
`docs/superpowers/specs/2026-07-18-phase-5-application-layer-design.md`.
Package: `@nemis-desktop/application` (`packages/application/`).

## 1. Philosophy

The application layer is the **only** entry point for business operations.
Every use case a UI (or, today, a test) wants to perform — register a
student, record attendance, publish a grade — is a named class here. React
components (Phase 6) never call a repository, never import
`@nemis-desktop/domain` entities to mutate them directly, and never assemble
a SQL query. They call a use case through `createApplicationLayer(...)` and
get back a DTO.

The package is built hexagonally: it owns the **ports** (interfaces) it
needs — repositories, a unit of work, a clock, an id generator, an event
publisher, a permission evaluator — and depends on nothing that would tie it
to Electron, SQLite, or a UI framework. `packages/application/eslint.config.mjs`
enforces this with `no-restricted-imports` (see §8). The Electron app is the
composition root: it builds concrete adapters for those ports and hands them
to `createApplicationLayer`. This means the same use case classes can run
against in-memory fakes in a unit test, against real SQLite in the desktop
app, and — unchanged — against whatever host wraps a future sync worker.

## 2. Architecture diagram

Dependencies point **inward**, toward the pure core:

    React UI  (Phase 6)
       │  calls use cases / application services only — never repositories
       ▼
    @nemis-desktop/application            ← this package (pure TypeScript)
       │  depends on: repository PORTS (interfaces/), domain entities, DTOs
       ▼
    Repository PORTS (interfaces/)  +  Domain entities (@nemis-desktop/domain)
       ▲  implemented by
       │
    Electron adapters  (apps/desktop/electron/data/adapters/, composition root)
       ▼
    Existing SQLite DAL (apps/desktop/electron/data/)  →  SQLite / SQLCipher

The application package never imports `apps/desktop/electron/**`. The
Electron app imports `@nemis-desktop/application` and supplies adapters —
see `apps/desktop/electron/data/adapters/createApplicationComposition.ts` for
the concrete composition root wired into the running app.

## 3. CQRS strategy

- **Commands** change state: they validate input, may check preconditions
  through a repository port, run a domain operation, persist inside a
  `IUnitOfWork`, and may publish an application event. They return a small
  Output DTO wrapped in `ApplicationResponse<T>`.
- **Queries** read state: they return Output DTOs and **never** take an
  `IUnitOfWork`, **never** publish events, and never mutate anything.
- The split is structural, not just a naming convention: query handler
  classes are constructed only with read-capable dependencies (no
  `unitOfWork`, no `events` in their `Deps` interface), so a query cannot
  accidentally acquire a transaction or an event publisher.
- Base handler types live in `core/`:

  ```ts
  // core/command.ts
  interface CommandHandler<TCommand, TResult> {
    execute(command: TCommand): Promise<TResult>;
  }

  // core/query.ts
  interface QueryHandler<TQuery, TResult> {
    execute(query: TQuery): Promise<TResult>;
  }
  ```

  Both `execute` methods are `async` for a uniform calling convention — the
  transactional work _inside_ a command is a synchronous closure (§7).

- In the shipped code, the "command" and "query" objects passed to `execute`
  are the use case's own Input DTO (e.g. `CreateStudentDto`,
  `ListStudentsDto`) rather than a separate wrapper type. `core/command.ts`
  and `core/query.ts` also export `Command`/`Query` marker types for cases
  that want a dedicated intent object; `queries/students/list-students.ts`
  shows that shape (`ListStudentsQuery`), but the shipped `ListStudentsUseCase`
  itself is typed against `ListStudentsDto`. Either shape satisfies
  `CommandHandler`/`QueryHandler` — DTOs are used throughout for now because
  Input DTO and command/query intent are identical for every use case built
  so far.

## 4. Use-case lifecycle

Every command follows the same shell, implemented by hand inside each
`execute` method and wrapped by `invokeUseCase` (`pipeline/use-case-invoker.ts`):

    execute(input)                         [async signature; sync work inside]
      1. Application validation            validators/  → ApplicationValidationException
      2. Permission hook (optional)        policies/ + IPermissionEvaluator → PermissionDeniedException
      3. Precondition checks               via repo ports (exists / not-duplicate) → WorkflowException
      4. Map DTO → domain args             inline, or mappers/
      5. Domain operation                  Entity.create() / entity method (throws DomainException)
      6. Persist inside a UnitOfWork       unitOfWork.run(() => repo.save(entity))   [sync closure]
      7. Publish an event                  events.publish(SomethingHappened)          [no-op by default]
      8. Map domain → Output DTO           mappers/ → ApplicationResponse<T>

Queries follow the same shell minus steps 3, 6, and 7: they validate input if
needed, read through repository ports, map to an Output DTO, and return —
no preconditions beyond "does it exist," no transaction, no event.

`CreateStudentUseCase` (`use-cases/students/create-student.ts`) is a
representative example: it validates required fields with `requireFields`,
checks `students.existsByAdmissionNumber(...)` and throws `WorkflowException`
on a duplicate, calls `Student.create(...)`, persists with
`unitOfWork.run(() => students.save(student))`, publishes a `StudentRegistered`
event, and maps the entity to `StudentOutput` via `toStudentOutput`.

**Permission hook, as shipped:** `interfaces/permission-evaluator.ts` defines
`IPermissionEvaluator` (advisory; `defaults/allow-all-permission-evaluator.ts`
is the default no-op-allow implementation), and `policies/permissions.ts`
defines the canonical action strings (`APPLICATION_ACTIONS`) and a
`permission()` helper. This is a real, exported port — but none of the ~17
shipped use cases currently call `evaluate()` in their body; the hook exists
as an optional step in the lifecycle contract and pipeline, ready for a use
case (or Phase 6) to opt into. Authorization stays backend-authoritative;
this port only supports coarse local/UX checks.

**The `invokeUseCase` pipeline** (`pipeline/use-case-invoker.ts`) wraps every
handler body:

- Logs one `use-case.start` line, then `use-case.success` or `use-case.failure`
  (concise — no verbose per-step logging).
- Translates exceptions on the way out: an `ApplicationException` passes
  through unchanged; a `DomainException` (from `@nemis-desktop/domain`) is
  wrapped as `UseCaseException`; anything else is wrapped as
  `UnexpectedApplicationException`. This is the exception taxonomy Phase 6
  will map onto `IpcResult` payloads.

## 5. DTO strategy

- **Input DTOs** (`dto/<domain>/*.ts`, e.g. `CreateStudentDto`,
  `ListStudentsDto`) carry UI → use case parameters.
- **Output DTOs** (e.g. `StudentOutput`, `StudentSummaryOutput`) carry the
  payload returned to the caller. Some use cases return a projection (e.g.
  `StudentSummaryOutput` is a `Pick` of `StudentOutput`'s fields for list views).
- **`ApplicationResponse<T>`** (`core/response.ts`) is the standard envelope
  every use case returns: `{ data: T; warnings?: readonly string[] }`,
  constructed with the `ok(data, warnings?)` helper.
- Paged queries return `PagedResult<T>` (`core/pagination.ts`:
  `{ items, total, limit, offset }`) as the `data` of an `ApplicationResponse`.
- Domain entities and SQLite rows are **never** returned to a caller —
  only these DTOs cross the use-case boundary.

## 6. Mapping strategy

Mappers (`mappers/<domain>/*.ts`) do **DTO ↔ domain only**:

- Domain entity → Output DTO (e.g. `toStudentOutput(student)`,
  `toStudentSummary(student)` in `mappers/students/student-mapper.ts`).
- Where needed, Input DTO fields feed a domain factory call directly inside
  the use case (e.g. `Student.create({ ...command, id, occurredAt })`) rather
  than through a separate "DTO → create-args" mapper function — the two
  shapes are close enough that use cases build the create-args object inline.

Entity ↔ database row mapping is explicitly **not** this package's job — that
lives with the SQLite adapter, same as the Data Access Layer's row mappers
(`docs/data-access.md`). This is the seam Phase 6 will fill in for the
business domains (see §11).

## 7. Transaction strategy

The application layer owns a synchronous unit-of-work port that mirrors the
Data Access Layer's `TransactionRunner`, because better-sqlite3 cannot
`await` in the middle of a transaction:

```ts
// interfaces/unit-of-work.ts
interface IUnitOfWork {
  run<T>(work: () => T): T; // deferred BEGIN
  runImmediate<T>(work: () => T): T; // BEGIN IMMEDIATE
}
```

`execute()` on a command handler is `async` (uniform calling convention), but
the closure passed to `unitOfWork.run(...)` / `runImmediate(...)` is pure
synchronous code — no `await` inside it. Throwing inside the closure aborts
(rolls back) the transaction; `invokeUseCase` then translates and logs the
error as usual.

In the Electron app, `UnitOfWorkAdapter`
(`apps/desktop/electron/data/adapters/UnitOfWorkAdapter.ts`) implements
`IUnitOfWork` on top of the real `TransactionRunner` produced by
`createDataLayer`. In tests, `testing/passthrough-unit-of-work.ts`'s
`PassthroughUnitOfWork` runs the closure inline and counts `run`/`runImmediate`
calls so a test can assert a write happened inside a transactional boundary
without needing a real database.

Queries never receive a unit of work.

## 8. Dependency rules

**Allowed:** `@nemis-desktop/domain`, `@nemis-desktop/types`. (The package's
own `package.json` dependencies list only these two; it does not currently
depend on `@nemis-desktop/shared`.)

**Forbidden**, enforced by `packages/application/eslint.config.mjs`'s
`applicationImportGuard` (`no-restricted-imports`, applied to
`packages/application/**/*.ts` from the root ESLint flat config): `electron`,
`react`, `react-dom`, `next`, `better-sqlite3`,
`better-sqlite3-multiple-ciphers`, and path patterns matching `**/database/**`,
`**/data/**`, `**/ipc/**`, `**/electron/**`. This mirrors the guard already in
place for `@nemis-desktop/domain`. The same config also relaxes
`@typescript-eslint/no-unused-vars` for underscore-prefixed identifiers
(no-op interface method params, stub args in the Phase-6 seam — see §11).

## 9. Testing strategy

- Vitest, colocated `*.test.ts`, following the Phase 3/4 convention. The
  package currently has 31 test files.
- **In-memory mock repositories** implementing each port live in `testing/`
  (e.g. `testing/students/in-memory-student-repository.ts`), one per domain
  folder, plus shared test doubles: `FixedClock`, `RecordingLogger`,
  `PassthroughUnitOfWork`, `CollectingEventPublisher`, `SequentialIdGenerator`.
- Every fully-implemented use case is tested for: the happy path, an
  application-validation failure, a precondition/workflow failure, and
  domain-exception translation (a `DomainException` thrown by the entity
  surfaces as `UseCaseException`).
- Mapper tests and pipeline tests (`pipeline/use-case-invoker.ts` — logging
  calls and exception translation) are colocated the same way.
- **Infra end-to-end:** the two infra use cases (`RegisterDevice`,
  `UpdateSettings`) are additionally tested against their real adapters and a
  real (temp-file) SQLite database via the DAL's `createTestContext()` — see
  `apps/desktop/electron/data/adapters/infra-e2e.test.ts`. This proves the
  hexagonal seam end-to-end for the one path that has both a domain-free
  gateway port and a real adapter today.
- No UI tests (there is no UI to test yet — Phase 6).

## 10. Extension pattern

New use cases and new domain slices follow one recipe, written out in full
in `packages/application/src/_extension-template/README.md`:

1. Add/extend a repository **port** in `interfaces/<domain>/` (domain
   entities only — never rows, never DTOs).
2. Add Input/Output **DTOs** in `dto/<domain>/`.
3. Add an entity → Output **mapper** in `mappers/<domain>/`.
4. Add the **use case** (`CommandHandler`/`QueryHandler`) in
   `use-cases/<domain>/`, wrapped in `invokeUseCase(name, logger, async () => {...})`.
5. Add an **event** in `events/<domain>.ts` only if the command needs one —
   never declare an event for a use case that doesn't exist yet.
6. Optionally add a façade in `services/` grouping the domain's use cases.
7. **Wire** the use case into `factories/create-application-layer.ts`.
8. **Test** with the in-memory fakes in `testing/`.

The template's README also documents the six domains that have no entities
yet and must not have invented behavior: `geography`, `staff`, `finance`,
`communication`, `resources`, `reporting`. It shows (commented out, not
enabled) what a future `staff` domain's `TeacherAssigned` event would look
like once that domain slice actually ships.

## 11. Catalog & status

**Fully implemented (17), mock-tested against ports:**

| Domain      | Commands                                                | Queries                              |
| ----------- | ------------------------------------------------------- | ------------------------------------ |
| Students    | CreateStudent, DeactivateStudent, LinkGuardianToStudent | GetStudentById, ListStudents (paged) |
| Academics   | EnrollStudent, WithdrawEnrollment                       | GetClassRoster                       |
| Attendance  | RecordAttendance                                        | GetAttendanceByClassAndDate          |
| Assessments | CreateAssessment, RecordGrade, PublishGrade             | GetGradesByStudent                   |
| Identity    | —                                                       | GetUserById                          |
| Institution | UpdateGradingConfig                                     | GetInstitutionProfile                |

(Identity has no commands — per `CLAUDE.md`, Electron never owns
authentication; that stays backend-owned.)

**Infra, wired end-to-end to the real Data Access Layer:** `RegisterDevice`
and `UpdateSettings`, via `DeviceGatewayAdapter` and `SettingsGatewayAdapter`
(`apps/desktop/electron/data/adapters/`), composed in
`createApplicationComposition.ts` and covered by the SQLite-backed E2E test
described in §9. These are the only two use cases that run against a real
database today.

**Not yet built — extension points only:** the six domains with no
`@nemis-desktop/domain` entities (`geography`, `staff`, `finance`,
`communication`, `resources`, `reporting`). No DTOs, ports, or use cases
exist for them; `_extension-template/README.md` is the recipe and the only
place that names example future use cases (`CreateTeacher`, `AssignTeacher`).

**The Phase 6 seam.** `createApplicationComposition.ts` wires the two infra
gateways to real repositories but stubs every business repository port
(`students`, `guardians`, `enrollments`, `classes`, `attendance`,
`assessments`, `grades`, `users`, `institutions`, `gradingConfigs`) with a
`Proxy` that throws `"<Name> repository is not built yet (Phase 6)."` on any
call. Making a business domain live in the running desktop app means:

1. Implement its SQLite repository **adapter** against the existing port
   interface (in `interfaces/<domain>/`), speaking in domain entities.
2. Implement the entity ↔ row **mapper** the adapter needs (this package
   does not do that mapping — see §6).
3. Replace the corresponding `Proxy` stub in `createApplicationComposition.ts`
   with the real adapter.

No changes to `@nemis-desktop/application` itself are required to light up a
business domain — the use cases, DTOs, and composition root already exist
and are mock-tested; only the adapter + mapper + wiring are new work.
