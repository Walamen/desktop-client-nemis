# Phase 5 — Application Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@nemis-desktop/application`, a pure-TypeScript CQRS Application Layer that exposes the desktop app's business use cases over repository ports, decoupled from Electron/SQLite/React, and prove the hexagonal seam by wiring the two infra use cases to the real DAL.

**Architecture:** Hexagonal / ports-and-adapters. The package owns repository **port** interfaces and cross-cutting ports (`IUnitOfWork`, `IAppLogger`, `IClock`, `IEventPublisher`, `IPermissionEvaluator`). Use cases are CQRS command/query handlers that orchestrate the existing `@nemis-desktop/domain` entities behind those ports, using constructor DI. Business use cases are proven with in-memory mock repositories (TDD); the two infra use cases (`RegisterDevice`, `UpdateSettings`) additionally get adapters in the Electron composition root that delegate to the existing Phase-3 DAL.

**Tech Stack:** TypeScript (strict), Vitest, pnpm workspaces, ESLint flat config with `no-restricted-imports` boundary enforcement. No new runtime dependencies.

## Global Constraints

- **Package deps only:** `@nemis-desktop/domain`, `@nemis-desktop/types`. No new third-party runtime deps. (The package MAY later use `@nemis-desktop/shared`, but does not this phase.)
- **Forbidden imports in `packages/application/**`:** `react`, `react-dom`, `next`, `electron`, `better-sqlite3`, `better-sqlite3-multiple-ciphers`, and any `**/database/**`, `**/data/**`, `**/ipc/**`, `**/electron/**` path. Enforced by ESLint `no-restricted-imports` (Task 1).
- **TypeScript:** strict mode via `tsconfig.base.json`; `noUncheckedIndexedAccess` is ON — never index an array/record without a guard or `Object.entries`/`.find`, and never use `!` in non-test code.
- **Exports:** named exports only. No default exports.
- **Imports:** use `import type { … }` for type-only imports (enforced by `isolatedModules`).
- **Timestamps:** ISO-8601 UTC strings everywhere. The domain never reads the clock — use cases obtain time from the injected `IClock` and pass it into domain factories/methods (`occurredAt`, `at`).
- **Transactions are synchronous:** `IUnitOfWork.run`/`runImmediate` take a **synchronous** closure (`() => T`). Never `await` inside the closure. Command `execute` is `async`; the transactional work inside is pure-sync (mirrors the Phase-3 DAL).
- **CQRS:** commands mutate + may open a UnitOfWork + may publish an event; queries read-only, never receive a UnitOfWork, never publish events.
- **Tests:** colocated `*.test.ts`, run by `pnpm test` (Vitest already globs `packages/**/src/**/*.test.ts` — no config change needed). No UI tests.
- **Feature-first folders** inside `use-cases/`, `dto/`, `mappers/`, `interfaces/` (e.g. `use-cases/students/create-student.ts`), matching the domain package.
- **Commit** after every task's tests pass. Branch: `phase-5-application-layer` (already created).
- **Verification gate** (run from repo root): `pnpm --filter @nemis-desktop/application typecheck && pnpm lint && pnpm test`.

---

## File Structure

New package root: `packages/application/`

```
packages/application/
  package.json                     # @nemis-desktop/application; deps: domain, types
  tsconfig.json                    # extends ../../tsconfig.base.json
  eslint.config.mjs                # exports applicationImportGuard (wired into root config)
  src/
    index.ts                       # public barrel — the package's only entry point
    core/
      command.ts                   # Command marker, CommandHandler<C,R>
      query.ts                     # Query marker, QueryHandler<Q,R>
      response.ts                  # ApplicationResponse<T>, ok()
    exceptions/
      application-exception.ts     # ApplicationException base
      use-case-exception.ts
      application-validation-exception.ts
      permission-denied-exception.ts
      workflow-exception.ts
      unexpected-application-exception.ts
      index.ts
    interfaces/
      unit-of-work.ts              # IUnitOfWork (sync)
      app-logger.ts                # IAppLogger
      clock.ts                     # IClock
      event-publisher.ts           # IEventPublisher
      permission-evaluator.ts      # IPermissionEvaluator, PermissionRequest
      students/                    # IStudentRepository, IGuardianRepository
      academics/                   # IEnrollmentRepository, IClassRepository
      attendance/                  # IAttendanceRepository
      assessments/                 # IAssessmentRepository, IGradeRepository
      identity/                    # IUserRepository
      institution/                 # IInstitutionRepository, IGradingConfigRepository
      infra/                       # IDeviceGateway, ISettingsGateway
      index.ts
    defaults/
      system-clock.ts              # SystemClock (reads Date) — convenience default
      noop-event-publisher.ts      # NoopEventPublisher
      allow-all-permission-evaluator.ts
      console-logger.ts            # minimal IAppLogger over console (dev default)
      index.ts
    pipeline/
      use-case-invoker.ts          # invoke(): logging + exception translation
      index.ts
    dto/
      students/  academics/  attendance/  assessments/  identity/  institution/  infra/
    mappers/
      students/  academics/  attendance/  assessments/  identity/  institution/
    validators/
      validate.ts                  # tiny assert helpers throwing ApplicationValidationException
      students/  academics/  attendance/  assessments/  institution/
    events/
      students.ts  academics.ts  attendance.ts  assessments.ts  infra.ts  staff.ts  index.ts
    policies/
      permissions.ts               # PermissionRequest builders (advisory)
      index.ts
    commands/                      # command shape objects, feature-first
      students/ academics/ attendance/ assessments/ institution/ infra/ staff/
    queries/                       # query shape objects, feature-first
      students/ academics/ attendance/ assessments/ identity/ institution/
    use-cases/
      students/ academics/ attendance/ assessments/ identity/ institution/ infra/ staff/
    services/
      student-application-service.ts
      academics-application-service.ts
      attendance-application-service.ts
      assessments-application-service.ts
      identity-application-service.ts
      institution-application-service.ts
      infra-application-service.ts
      index.ts
    factories/
      create-application-layer.ts  # composition root (constructor DI)
      index.ts
    testing/
      fixed-clock.ts               # deterministic IClock
      recording-logger.ts          # capturing IAppLogger
      passthrough-unit-of-work.ts  # runs the closure directly
      collecting-event-publisher.ts
      index.ts
    _extension-template/
      README.md                    # recipe for adding a domain / use case

apps/desktop/electron/data/adapters/            # NEW — infra adapters (Task 19)
  DeviceGatewayAdapter.ts
  SettingsGatewayAdapter.ts
  createApplicationComposition.ts               # wires application layer to the DAL

docs/
  application-layer.md             # NEW (Task 20)
  conventions.md                   # MODIFY — add "Application Layer" section (Task 20)
```

---

## Task 1: Scaffold the `@nemis-desktop/application` package

**Files:**

- Create: `packages/application/package.json`
- Create: `packages/application/tsconfig.json`
- Create: `packages/application/eslint.config.mjs`
- Create: `packages/application/src/index.ts`
- Create: `packages/application/src/core/response.ts`
- Create: `packages/application/src/core/response.test.ts`
- Modify: `eslint.config.mjs` (repo root) — import & register `applicationImportGuard`

**Interfaces:**

- Produces: package `@nemis-desktop/application` resolvable from other workspaces; `ApplicationResponse<T>` and `ok<T>(data, warnings?)` from `core/response.ts`.

- [ ] **Step 1: Create `packages/application/package.json`**

```json
{
  "name": "@nemis-desktop/application",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nemis-desktop/domain": "workspace:*",
    "@nemis-desktop/types": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/application/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/application/eslint.config.mjs`**

```js
// Dependency guard for the application layer. The root flat config imports and
// registers this block. The application layer may import @nemis-desktop/domain
// and @nemis-desktop/types, but never UI/Electron/SQLite/IPC modules.
export const applicationImportGuard = {
  files: ['packages/application/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'electron', message: 'Application layer must not depend on Electron.' },
          { name: 'react', message: 'Application layer must not depend on React.' },
          { name: 'react-dom', message: 'Application layer must not depend on React DOM.' },
          { name: 'next', message: 'Application layer must not depend on Next.' },
          { name: 'better-sqlite3', message: 'Application layer must not depend on SQLite.' },
          {
            name: 'better-sqlite3-multiple-ciphers',
            message: 'Application layer must not depend on SQLite.',
          },
        ],
        patterns: [
          {
            group: [
              'better-sqlite3*',
              '**/database/**',
              '**/data/**',
              '**/ipc/**',
              '**/electron/**',
              'react',
              'react/*',
              'react-dom',
              'react-dom/*',
              'next',
              'next/*',
              'electron',
              'electron/*',
            ],
            message: 'Application layer must not import infrastructure or UI modules.',
          },
        ],
      },
    ],
  },
};
```

- [ ] **Step 4: Register the guard in the root `eslint.config.mjs`**

Add the import beside the existing domain guard import (top of file):

```js
import { domainImportGuard } from './packages/domain/eslint.config.mjs';
import { applicationImportGuard } from './packages/application/eslint.config.mjs';
```

And add `applicationImportGuard` to the config array, right after `domainImportGuard`:

```js
  domainImportGuard,
  applicationImportGuard,
  prettier,
);
```

- [ ] **Step 5: Write the failing test — `packages/application/src/core/response.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ok } from './response';

describe('ApplicationResponse', () => {
  it('wraps a payload with no warnings', () => {
    expect(ok({ id: 'x' })).toEqual({ data: { id: 'x' } });
  });

  it('includes warnings when provided', () => {
    expect(ok(42, ['stale'])).toEqual({ data: 42, warnings: ['stale'] });
  });
});
```

- [ ] **Step 6: Install workspaces so the new package is linked**

Run: `pnpm install`
Expected: completes; `@nemis-desktop/application` appears in the workspace, `node_modules/@nemis-desktop/application` symlink created.

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm test -- response`
Expected: FAIL — `Cannot find module './response'`.

- [ ] **Step 8: Implement `packages/application/src/core/response.ts`**

```ts
/** The standard envelope every use case returns to callers. Never exposes
 * domain entities or database rows — only DTOs. */
export interface ApplicationResponse<T> {
  readonly data: T;
  readonly warnings?: readonly string[];
}

export function ok<T>(data: T, warnings?: readonly string[]): ApplicationResponse<T> {
  return warnings && warnings.length > 0 ? { data, warnings } : { data };
}
```

- [ ] **Step 9: Create the barrel `packages/application/src/index.ts`**

```ts
export * from './core/response';
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm test -- response`
Expected: PASS (2 tests).

- [ ] **Step 11: Typecheck and lint the new package**

Run: `pnpm --filter @nemis-desktop/application typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 12: Commit**

```bash
git add packages/application eslint.config.mjs pnpm-lock.yaml
git commit -m "feat(application): scaffold @nemis-desktop/application package with boundary guard"
```

---

## Task 2: Application exceptions

**Files:**

- Create: `packages/application/src/exceptions/application-exception.ts`
- Create: `packages/application/src/exceptions/use-case-exception.ts`
- Create: `packages/application/src/exceptions/application-validation-exception.ts`
- Create: `packages/application/src/exceptions/permission-denied-exception.ts`
- Create: `packages/application/src/exceptions/workflow-exception.ts`
- Create: `packages/application/src/exceptions/unexpected-application-exception.ts`
- Create: `packages/application/src/exceptions/index.ts`
- Test: `packages/application/src/exceptions/exceptions.test.ts`

**Interfaces:**

- Produces: `ApplicationException` (base; `code: string`, optional `cause`), `UseCaseException`, `ApplicationValidationException` (carries `issues: ValidationIssue[]`), `PermissionDeniedException`, `WorkflowException`, `UnexpectedApplicationException`. `ValidationIssue = { field: string; message: string }`.

- [ ] **Step 1: Write the failing test — `exceptions.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  ApplicationException,
  ApplicationValidationException,
  PermissionDeniedException,
  UnexpectedApplicationException,
  UseCaseException,
  WorkflowException,
} from './index';

describe('application exceptions', () => {
  it('base carries a code and name', () => {
    const err = new UseCaseException('nope');
    expect(err).toBeInstanceOf(ApplicationException);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UseCaseException');
    expect(err.code).toBe('USE_CASE_ERROR');
  });

  it('validation exception carries issues', () => {
    const err = new ApplicationValidationException('bad', [
      { field: 'firstName', message: 'required' },
    ]);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.issues).toEqual([{ field: 'firstName', message: 'required' }]);
  });

  it('permission and workflow have distinct codes', () => {
    expect(new PermissionDeniedException('x').code).toBe('PERMISSION_DENIED');
    expect(new WorkflowException('x').code).toBe('WORKFLOW_ERROR');
  });

  it('unexpected preserves the cause', () => {
    const cause = new Error('boom');
    const err = new UnexpectedApplicationException('wrapped', { cause });
    expect(err.code).toBe('UNEXPECTED_ERROR');
    expect(err.cause).toBe(cause);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- exceptions`
Expected: FAIL — cannot find `./index`.

- [ ] **Step 3: Implement `application-exception.ts`**

```ts
/** Base for every error the application layer raises. `code` is a stable,
 * renderer-safe classifier that Phase 6 maps to IpcResult payloads. */
export abstract class ApplicationException extends Error {
  readonly code: string;

  protected constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}
```

- [ ] **Step 4: Implement the five named exceptions**

`use-case-exception.ts`:

```ts
import { ApplicationException } from './application-exception';

/** A use case failed for a reason surfaced to the caller (often a translated
 * domain rule violation). */
export class UseCaseException extends ApplicationException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('USE_CASE_ERROR', message, options);
  }
}
```

`application-validation-exception.ts`:

```ts
import { ApplicationException } from './application-exception';

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Input DTO failed application-level validation (shape / required / cross-field),
 * distinct from domain invariants enforced inside entities. */
export class ApplicationValidationException extends ApplicationException {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super('VALIDATION_ERROR', message);
    this.issues = issues;
  }
}
```

`permission-denied-exception.ts`:

```ts
import { ApplicationException } from './application-exception';

export class PermissionDeniedException extends ApplicationException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('PERMISSION_DENIED', message, options);
  }
}
```

`workflow-exception.ts`:

```ts
import { ApplicationException } from './application-exception';

/** A precondition/orchestration rule failed (e.g. referenced entity missing,
 * duplicate not allowed) before or around the domain operation. */
export class WorkflowException extends ApplicationException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('WORKFLOW_ERROR', message, options);
  }
}
```

`unexpected-application-exception.ts`:

```ts
import { ApplicationException } from './application-exception';

/** An error the application layer did not anticipate. The pipeline wraps unknown
 * throwables in this so callers always receive an ApplicationException. */
export class UnexpectedApplicationException extends ApplicationException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('UNEXPECTED_ERROR', message, options);
  }
}
```

- [ ] **Step 5: Create `exceptions/index.ts`**

```ts
export * from './application-exception';
export * from './use-case-exception';
export * from './application-validation-exception';
export * from './permission-denied-exception';
export * from './workflow-exception';
export * from './unexpected-application-exception';
```

- [ ] **Step 6: Re-export from the package barrel**

Add to `packages/application/src/index.ts`:

```ts
export * from './exceptions';
```

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm test -- exceptions`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/application/src/exceptions packages/application/src/index.ts
git commit -m "feat(application): add application exception taxonomy"
```

---

## Task 3: Core CQRS base types

**Files:**

- Create: `packages/application/src/core/command.ts`
- Create: `packages/application/src/core/query.ts`
- Test: `packages/application/src/core/cqrs.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

- Produces:
  - `interface CommandHandler<TCommand, TResult> { execute(command: TCommand): Promise<TResult>; }`
  - `interface QueryHandler<TQuery, TResult> { execute(query: TQuery): Promise<TResult>; }`
  - Marker types `Command` and `Query` (branded empty interfaces for documentation/intent).

- [ ] **Step 1: Write the failing test — `cqrs.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { CommandHandler, QueryHandler } from './command';
import type { QueryHandler as QH } from './query';

describe('CQRS base types', () => {
  it('a command handler is awaitable and returns its result type', async () => {
    const handler: CommandHandler<{ n: number }, number> = {
      execute: (c) => Promise.resolve(c.n + 1),
    };
    await expect(handler.execute({ n: 1 })).resolves.toBe(2);
  });

  it('a query handler is awaitable and returns its result type', async () => {
    const handler: QH<{ id: string }, string> = {
      execute: (q) => Promise.resolve(q.id.toUpperCase()),
    };
    await expect(handler.execute({ id: 'ab' })).resolves.toBe('AB');
  });
});
```

Note: `command.ts` re-exports `QueryHandler` too for convenience; the test imports both to lock the signatures.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- cqrs`
Expected: FAIL — cannot find `./command`.

- [ ] **Step 3: Implement `query.ts`**

```ts
/** Marker for a read-intent object. Queries never mutate state, never open a
 * UnitOfWork, and never publish events. */
export type Query = Readonly<Record<string, unknown>>;

export interface QueryHandler<TQuery, TResult> {
  execute(query: TQuery): Promise<TResult>;
}
```

- [ ] **Step 4: Implement `command.ts`**

```ts
export type { QueryHandler } from './query';

/** Marker for a state-changing intent object. */
export type Command = Readonly<Record<string, unknown>>;

export interface CommandHandler<TCommand, TResult> {
  execute(command: TCommand): Promise<TResult>;
}
```

- [ ] **Step 5: Re-export from the barrel**

Add to `packages/application/src/index.ts`:

```ts
export * from './core/command';
export * from './core/query';
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test -- cqrs`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/core packages/application/src/index.ts
git commit -m "feat(application): add CQRS command/query base types"
```

---

## Task 4: Cross-cutting ports and default implementations

**Files:**

- Create: `packages/application/src/interfaces/unit-of-work.ts`
- Create: `packages/application/src/interfaces/app-logger.ts`
- Create: `packages/application/src/interfaces/clock.ts`
- Create: `packages/application/src/interfaces/event-publisher.ts`
- Create: `packages/application/src/interfaces/permission-evaluator.ts`
- Create: `packages/application/src/interfaces/id-generator.ts`
- Create: `packages/application/src/interfaces/index.ts`
- Create: `packages/application/src/defaults/system-clock.ts`
- Create: `packages/application/src/defaults/noop-event-publisher.ts`
- Create: `packages/application/src/defaults/allow-all-permission-evaluator.ts`
- Create: `packages/application/src/defaults/console-logger.ts`
- Create: `packages/application/src/defaults/crypto-id-generator.ts`
- Create: `packages/application/src/defaults/index.ts`
- Test: `packages/application/src/defaults/defaults.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

- Produces:
  - `interface IUnitOfWork { run<T>(work: () => T): T; runImmediate<T>(work: () => T): T; }`
  - `interface IAppLogger { info(msg: string, meta?: Record<string, unknown>): void; warn(...): void; error(msg: string, meta?: Record<string, unknown>): void; }`
  - `interface IClock { now(): string; }` (ISO-8601 UTC)
  - `interface IIdGenerator { next(): string; }` (client-minted entity ids for offline-first)
  - `interface ApplicationEvent { readonly name: string; readonly occurredAt: string; }` and `interface IEventPublisher { publish(event: ApplicationEvent): void; }`
  - `interface PermissionRequest { readonly action: string; readonly resource?: string; readonly actorId?: string; }` and `interface IPermissionEvaluator { evaluate(request: PermissionRequest): { allowed: boolean; reason?: string }; }`
  - Defaults: `SystemClock`, `CryptoIdGenerator`, `NoopEventPublisher`, `AllowAllPermissionEvaluator`, `ConsoleLogger`.

- [ ] **Step 1: Write the failing test — `defaults/defaults.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { AllowAllPermissionEvaluator } from './allow-all-permission-evaluator';
import { CryptoIdGenerator } from './crypto-id-generator';
import { NoopEventPublisher } from './noop-event-publisher';
import { SystemClock } from './system-clock';

describe('default port implementations', () => {
  it('SystemClock returns an ISO string', () => {
    const iso = new SystemClock().now();
    expect(new Date(iso).toISOString()).toBe(iso);
  });

  it('CryptoIdGenerator returns distinct non-empty ids', () => {
    const gen = new CryptoIdGenerator();
    const a = gen.next();
    const b = gen.next();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('NoopEventPublisher does nothing and does not throw', () => {
    expect(() =>
      new NoopEventPublisher().publish({ name: 'X', occurredAt: '2026-01-01T00:00:00.000Z' }),
    ).not.toThrow();
  });

  it('AllowAllPermissionEvaluator allows everything', () => {
    expect(new AllowAllPermissionEvaluator().evaluate({ action: 'students:create' })).toEqual({
      allowed: true,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- defaults`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement the ports**

`interfaces/unit-of-work.ts`:

```ts
/** Synchronous transaction boundary. Mirrors the Phase-3 DAL TransactionRunner:
 * better-sqlite3 cannot await inside a transaction, so `work` MUST be synchronous.
 * Throwing inside `work` aborts (rolls back) the transaction. */
export interface IUnitOfWork {
  run<T>(work: () => T): T; // deferred BEGIN
  runImmediate<T>(work: () => T): T; // BEGIN IMMEDIATE
}
```

`interfaces/app-logger.ts`:

```ts
export interface IAppLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
```

`interfaces/clock.ts`:

```ts
/** Supplies the injected timestamp the domain requires (the domain never reads
 * the clock itself). Returns ISO-8601 UTC. */
export interface IClock {
  now(): string;
}
```

`interfaces/id-generator.ts`:

```ts
/** Mints ids for new aggregates. Offline-first clients generate the entity id
 * locally so the record can be created and queued for sync without a round-trip. */
export interface IIdGenerator {
  next(): string;
}
```

`interfaces/event-publisher.ts`:

```ts
/** An application-level event emitted after a command's state change succeeds. */
export interface ApplicationEvent {
  readonly name: string;
  readonly occurredAt: string; // ISO-8601 UTC
}

/** No event bus is built this phase; the default publisher is a no-op. */
export interface IEventPublisher {
  publish(event: ApplicationEvent): void;
}
```

`interfaces/permission-evaluator.ts`:

```ts
/** Advisory permission hook. Authorization remains backend-authoritative; this
 * lets the desktop shell enforce coarse local checks as a convenience. */
export interface PermissionRequest {
  readonly action: string;
  readonly resource?: string;
  readonly actorId?: string;
}

export interface PermissionDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface IPermissionEvaluator {
  evaluate(request: PermissionRequest): PermissionDecision;
}
```

`interfaces/index.ts`:

```ts
export * from './unit-of-work';
export * from './app-logger';
export * from './clock';
export * from './id-generator';
export * from './event-publisher';
export * from './permission-evaluator';
```

- [ ] **Step 4: Implement the defaults**

`defaults/system-clock.ts`:

```ts
import type { IClock } from '../interfaces/clock';

export class SystemClock implements IClock {
  now(): string {
    return new Date().toISOString();
  }
}
```

`defaults/crypto-id-generator.ts`:

```ts
import type { IIdGenerator } from '../interfaces/id-generator';

/** Uses the Web Crypto UUID available as a Node global (v18+). */
export class CryptoIdGenerator implements IIdGenerator {
  next(): string {
    return crypto.randomUUID();
  }
}
```

`defaults/noop-event-publisher.ts`:

```ts
import type { ApplicationEvent, IEventPublisher } from '../interfaces/event-publisher';

export class NoopEventPublisher implements IEventPublisher {
  publish(_event: ApplicationEvent): void {
    // intentionally empty — no bus this phase
  }
}
```

`defaults/allow-all-permission-evaluator.ts`:

```ts
import type {
  IPermissionEvaluator,
  PermissionDecision,
  PermissionRequest,
} from '../interfaces/permission-evaluator';

export class AllowAllPermissionEvaluator implements IPermissionEvaluator {
  evaluate(_request: PermissionRequest): PermissionDecision {
    return { allowed: true };
  }
}
```

`defaults/console-logger.ts`:

```ts
import type { IAppLogger } from '../interfaces/app-logger';

/** Minimal dev logger. Production wiring (electron-log) is supplied by the app. */
export class ConsoleLogger implements IAppLogger {
  info(message: string, meta?: Record<string, unknown>): void {
    console.info(message, meta ?? {});
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(message, meta ?? {});
  }
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(message, meta ?? {});
  }
}
```

`defaults/index.ts`:

```ts
export * from './system-clock';
export * from './crypto-id-generator';
export * from './noop-event-publisher';
export * from './allow-all-permission-evaluator';
export * from './console-logger';
```

- [ ] **Step 5: Re-export from the barrel**

Add to `packages/application/src/index.ts`:

```ts
export * from './interfaces';
export * from './defaults';
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test -- defaults`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/interfaces packages/application/src/defaults packages/application/src/index.ts
git commit -m "feat(application): add cross-cutting ports and default implementations"
```

---

## Task 5: Use case invoker (pipeline)

**Files:**

- Create: `packages/application/src/pipeline/use-case-invoker.ts`
- Create: `packages/application/src/pipeline/index.ts`
- Test: `packages/application/src/pipeline/use-case-invoker.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

- Consumes: `IAppLogger` (Task 4); `ApplicationException`, `UseCaseException`, `UnexpectedApplicationException` (Task 2); `DomainException` from `@nemis-desktop/domain`.
- Produces: `invokeUseCase<T>(name: string, logger: IAppLogger, work: () => Promise<T>): Promise<T>` — logs start/success/failure, passes `ApplicationException` through untouched, translates `DomainException` → `UseCaseException`, wraps anything else in `UnexpectedApplicationException`.

- [ ] **Step 1: Confirm the domain exports `DomainException`**

Run: `pnpm exec grep -r "class DomainException" packages/domain/src`
Expected: prints the class declaration in `packages/domain/src/exceptions/`. (It is re-exported from `@nemis-desktop/domain` via `packages/domain/src/exceptions/index.ts`.)

- [ ] **Step 2: Write the failing test — `use-case-invoker.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { BusinessRuleViolationException, DomainException } from '@nemis-desktop/domain';
import { invokeUseCase } from './use-case-invoker';
import {
  ApplicationValidationException,
  UnexpectedApplicationException,
  UseCaseException,
} from '../exceptions';
import { RecordingLogger } from '../testing/recording-logger';

describe('invokeUseCase', () => {
  it('returns the work result and logs start + success', async () => {
    const logger = new RecordingLogger();
    const result = await invokeUseCase('CreateStudent', logger, () => Promise.resolve(7));
    expect(result).toBe(7);
    expect(logger.infos.map((e) => e.message)).toEqual(['use-case.start', 'use-case.success']);
  });

  it('passes ApplicationException through unchanged and logs a failure', async () => {
    const logger = new RecordingLogger();
    const thrown = new ApplicationValidationException('bad', []);
    await expect(invokeUseCase('CreateStudent', logger, () => Promise.reject(thrown))).rejects.toBe(
      thrown,
    );
    expect(logger.errors).toHaveLength(1);
  });

  it('translates a DomainException into a UseCaseException', async () => {
    const logger = new RecordingLogger();
    const domainErr = new BusinessRuleViolationException('rule broke');
    expect(domainErr).toBeInstanceOf(DomainException);
    await expect(invokeUseCase('X', logger, () => Promise.reject(domainErr))).rejects.toMatchObject(
      { code: 'USE_CASE_ERROR', message: 'rule broke' },
    );
  });

  it('wraps unknown errors in UnexpectedApplicationException', async () => {
    const logger = new RecordingLogger();
    const boom = new Error('boom');
    await expect(invokeUseCase('X', logger, () => Promise.reject(boom))).rejects.toBeInstanceOf(
      UnexpectedApplicationException,
    );
  });

  it('reuses the same UseCaseException type as a subclass of ApplicationException', () => {
    expect(new UseCaseException('x').code).toBe('USE_CASE_ERROR');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test -- use-case-invoker`
Expected: FAIL — cannot find `./use-case-invoker` (and `../testing/recording-logger`, which Task 6 also creates; create the minimal `RecordingLogger` now inline in Step 4 so this task is self-contained).

- [ ] **Step 4: Create the test double `packages/application/src/testing/recording-logger.ts`**

(Task 6 formalizes the `testing/` barrel; this file is created here because Task 5's test needs it.)

```ts
import type { IAppLogger } from '../interfaces/app-logger';

interface LogEntry {
  message: string;
  meta?: Record<string, unknown>;
}

export class RecordingLogger implements IAppLogger {
  readonly infos: LogEntry[] = [];
  readonly warns: LogEntry[] = [];
  readonly errors: LogEntry[] = [];

  info(message: string, meta?: Record<string, unknown>): void {
    this.infos.push({ message, meta });
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.warns.push({ message, meta });
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.errors.push({ message, meta });
  }
}
```

- [ ] **Step 5: Implement `pipeline/use-case-invoker.ts`**

```ts
import { DomainException } from '@nemis-desktop/domain';
import type { IAppLogger } from '../interfaces/app-logger';
import {
  ApplicationException,
  UnexpectedApplicationException,
  UseCaseException,
} from '../exceptions';

/** Wraps every use case execution with concise logging and exception
 * normalization. No verbose logging: one start line, then success or failure. */
export async function invokeUseCase<T>(
  name: string,
  logger: IAppLogger,
  work: () => Promise<T>,
): Promise<T> {
  logger.info('use-case.start', { useCase: name });
  try {
    const result = await work();
    logger.info('use-case.success', { useCase: name });
    return result;
  } catch (error) {
    logger.error('use-case.failure', {
      useCase: name,
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof ApplicationException) throw error;
    if (error instanceof DomainException) {
      throw new UseCaseException(error.message, { cause: error });
    }
    throw new UnexpectedApplicationException('An unexpected error occurred.', { cause: error });
  }
}
```

- [ ] **Step 6: Create `pipeline/index.ts` and re-export from the barrel**

`pipeline/index.ts`:

```ts
export * from './use-case-invoker';
```

Add to `packages/application/src/index.ts`:

```ts
export * from './pipeline';
```

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm test -- use-case-invoker`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/application/src/pipeline packages/application/src/testing/recording-logger.ts packages/application/src/index.ts
git commit -m "feat(application): add use case invoker pipeline (logging + exception translation)"
```

---

## Task 6: Testing fakes and input validation helpers

**Files:**

- Create: `packages/application/src/testing/fixed-clock.ts`
- Create: `packages/application/src/testing/passthrough-unit-of-work.ts`
- Create: `packages/application/src/testing/collecting-event-publisher.ts`
- Create: `packages/application/src/testing/sequential-id-generator.ts`
- Create: `packages/application/src/testing/index.ts`
- Create: `packages/application/src/validators/validate.ts`
- Test: `packages/application/src/validators/validate.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

- Produces:
  - `FixedClock(iso: string)` → `IClock` returning `iso`.
  - `PassthroughUnitOfWork` → `IUnitOfWork` running the closure directly (records call count).
  - `CollectingEventPublisher` → `IEventPublisher` with a `published: ApplicationEvent[]` array.
  - `RecordingLogger` (from Task 5) re-exported via `testing/index.ts`.
  - `requireFields(input, fields)` and `assertValid(condition, field, message)` — throw `ApplicationValidationException` collecting `ValidationIssue[]`.

- [ ] **Step 1: Write the failing test — `validators/validate.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { assertValid, requireFields } from './validate';
import { ApplicationValidationException } from '../exceptions';

describe('input validation helpers', () => {
  it('requireFields passes when all present', () => {
    expect(() => requireFields({ a: 'x', b: 1 }, ['a', 'b'])).not.toThrow();
  });

  it('requireFields collects every missing/blank field', () => {
    try {
      requireFields({ a: '', b: undefined, c: 'ok' }, ['a', 'b', 'c']);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApplicationValidationException);
      const issues = (err as ApplicationValidationException).issues;
      expect(issues.map((i) => i.field)).toEqual(['a', 'b']);
    }
  });

  it('assertValid throws with the given field/message when false', () => {
    expect(() => assertValid(false, 'total', 'must be positive')).toThrow(
      ApplicationValidationException,
    );
    expect(() => assertValid(true, 'total', 'must be positive')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- validate`
Expected: FAIL — cannot find `./validate`.

- [ ] **Step 3: Implement `validators/validate.ts`**

```ts
import { ApplicationValidationException, type ValidationIssue } from '../exceptions';

/** Throws if any listed field is missing, null, or a blank string. */
export function requireFields<T extends Record<string, unknown>>(
  input: T,
  fields: readonly (keyof T & string)[],
): void {
  const issues: ValidationIssue[] = [];
  for (const field of fields) {
    const value = input[field];
    const blank =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0);
    if (blank) issues.push({ field, message: 'is required' });
  }
  if (issues.length > 0) {
    throw new ApplicationValidationException('One or more fields are invalid.', issues);
  }
}

/** Throws a single-issue validation error when `condition` is false. */
export function assertValid(condition: boolean, field: string, message: string): void {
  if (!condition) {
    throw new ApplicationValidationException('One or more fields are invalid.', [
      { field, message },
    ]);
  }
}
```

- [ ] **Step 4: Implement the remaining testing fakes**

`testing/fixed-clock.ts`:

```ts
import type { IClock } from '../interfaces/clock';

export class FixedClock implements IClock {
  constructor(private readonly iso: string) {}
  now(): string {
    return this.iso;
  }
}
```

`testing/passthrough-unit-of-work.ts`:

```ts
import type { IUnitOfWork } from '../interfaces/unit-of-work';

/** Runs the closure inline (no real transaction). Records how many times each
 * entry point ran so tests can assert a write happened transactionally. */
export class PassthroughUnitOfWork implements IUnitOfWork {
  runCount = 0;
  runImmediateCount = 0;
  run<T>(work: () => T): T {
    this.runCount += 1;
    return work();
  }
  runImmediate<T>(work: () => T): T {
    this.runImmediateCount += 1;
    return work();
  }
}
```

`testing/collecting-event-publisher.ts`:

```ts
import type { ApplicationEvent, IEventPublisher } from '../interfaces/event-publisher';

export class CollectingEventPublisher implements IEventPublisher {
  readonly published: ApplicationEvent[] = [];
  publish(event: ApplicationEvent): void {
    this.published.push(event);
  }
}
```

`testing/sequential-id-generator.ts`:

```ts
import type { IIdGenerator } from '../interfaces/id-generator';

/** Deterministic ids for tests: id-1, id-2, … (optional prefix). */
export class SequentialIdGenerator implements IIdGenerator {
  private n = 0;
  constructor(private readonly prefix = 'id') {}
  next(): string {
    this.n += 1;
    return `${this.prefix}-${this.n}`;
  }
}
```

`testing/index.ts`:

```ts
export * from './fixed-clock';
export * from './recording-logger';
export * from './passthrough-unit-of-work';
export * from './collecting-event-publisher';
export * from './sequential-id-generator';
```

- [ ] **Step 5: Re-export validators + testing from the barrel**

Add to `packages/application/src/index.ts`:

```ts
export * from './validators/validate';
export * from './testing';
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test -- validate`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the whole package suite green so far**

Run: `pnpm --filter @nemis-desktop/application typecheck && pnpm test -- packages/application`
Expected: typecheck exits 0; all tests from Tasks 1–6 PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/application/src/testing packages/application/src/validators packages/application/src/index.ts
git commit -m "feat(application): add testing fakes and input validation helpers"
```

---

## Task 7: Students — ports, pagination, DTOs, mapper

**Files:**

- Create: `packages/application/src/core/pagination.ts`
- Create: `packages/application/src/interfaces/students/student-repository.ts`
- Create: `packages/application/src/interfaces/students/guardian-repository.ts`
- Create: `packages/application/src/interfaces/students/index.ts`
- Create: `packages/application/src/dto/students/student-dto.ts`
- Create: `packages/application/src/mappers/students/student-mapper.ts`
- Test: `packages/application/src/mappers/students/student-mapper.test.ts`
- Modify: `packages/application/src/interfaces/index.ts`, `packages/application/src/index.ts`

**Interfaces:**

- Consumes: `Student`, `Guardian` from `@nemis-desktop/domain`.
- Produces:
  - `PageRequest { limit: number; offset: number }`, `PagedResult<T> { items: readonly T[]; total: number; limit: number; offset: number }`.
  - `IStudentRepository { findById(id: string): Student | null; save(student: Student): void; exists(id: string): boolean; existsByAdmissionNumber(institutionId: string, admissionNumber: string): boolean; findPage(request: PageRequest): { items: Student[]; total: number }; findByClassId(classId: string): Student[]; }`
  - `IGuardianRepository { findById(id: string): Guardian | null; exists(id: string): boolean; }`
  - DTOs: `CreateStudentDto`, `DeactivateStudentDto`, `LinkGuardianDto`, `ListStudentsDto`, output `StudentOutput`, `StudentSummaryOutput`, `StudentGuardianOutput`.
  - `toStudentOutput(student: Student): StudentOutput`, `toStudentSummary(student: Student): StudentSummaryOutput`.

- [ ] **Step 1: Create `core/pagination.ts` and re-export it**

```ts
export interface PageRequest {
  limit: number;
  offset: number;
}

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}
```

Add to `packages/application/src/index.ts`:

```ts
export * from './core/pagination';
```

- [ ] **Step 2: Create the repository ports**

`interfaces/students/student-repository.ts`:

```ts
import type { Student } from '@nemis-desktop/domain';
import type { PageRequest } from '../../core/pagination';

/** Persistence port for the Student aggregate. Speaks in domain entities; the
 * SQLite adapter (Phase 6) maps entities to rows. */
export interface IStudentRepository {
  findById(id: string): Student | null;
  save(student: Student): void;
  exists(id: string): boolean;
  existsByAdmissionNumber(institutionId: string, admissionNumber: string): boolean;
  findPage(request: PageRequest): { items: Student[]; total: number };
  findByClassId(classId: string): Student[];
}
```

`interfaces/students/guardian-repository.ts`:

```ts
import type { Guardian } from '@nemis-desktop/domain';

export interface IGuardianRepository {
  findById(id: string): Guardian | null;
  exists(id: string): boolean;
}
```

`interfaces/students/index.ts`:

```ts
export * from './student-repository';
export * from './guardian-repository';
```

Add to `interfaces/index.ts`:

```ts
export * from './students';
```

- [ ] **Step 3: Create the DTOs — `dto/students/student-dto.ts`**

```ts
import type { Gender, GradeLevel } from '@nemis-desktop/types';

export interface CreateStudentDto {
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string; // ISO date
  gender: Gender;
  gradeLevel?: GradeLevel;
}

export interface DeactivateStudentDto {
  studentId: string;
  actorId: string;
}

export interface LinkGuardianDto {
  studentId: string;
  guardianId: string;
  isPrimary: boolean;
  actorId: string;
}

export interface ListStudentsDto {
  limit?: number;
  offset?: number;
}

export interface StudentGuardianOutput {
  id: string;
  guardianId: string;
  isPrimary: boolean;
}

export interface StudentOutput {
  id: string;
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel?: GradeLevel;
  isActive: boolean;
  version: number;
  updatedAt: string;
  guardians: StudentGuardianOutput[];
}

export type StudentSummaryOutput = Pick<
  StudentOutput,
  'id' | 'fullName' | 'admissionNumber' | 'gradeLevel' | 'isActive'
>;
```

- [ ] **Step 4: Write the failing test — `mappers/students/student-mapper.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Student } from '@nemis-desktop/domain';
import { Gender, GradeLevel } from '@nemis-desktop/types';
import { toStudentOutput, toStudentSummary } from './student-mapper';

function makeStudent(): Student {
  return Student.create({
    id: 'stu-1',
    institutionId: 'inst-1',
    firstName: 'Ada',
    middleName: 'M',
    lastName: 'Lovelace',
    admissionNumber: 'ADM-001',
    dateOfBirth: '2015-06-01',
    gender: Gender.FEMALE,
    gradeLevel: GradeLevel.GRADE_1,
    occurredAt: '2026-07-18T00:00:00.000Z',
  });
}

describe('student mapper', () => {
  it('maps a Student entity to StudentOutput without exposing the entity', () => {
    const out = toStudentOutput(makeStudent());
    expect(out).toMatchObject({
      id: 'stu-1',
      institutionId: 'inst-1',
      firstName: 'Ada',
      middleName: 'M',
      lastName: 'Lovelace',
      fullName: 'Ada M Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
      gradeLevel: GradeLevel.GRADE_1,
      isActive: true,
      version: 1,
      guardians: [],
    });
  });

  it('maps a Student to a compact summary', () => {
    expect(toStudentSummary(makeStudent())).toEqual({
      id: 'stu-1',
      fullName: 'Ada M Lovelace',
      admissionNumber: 'ADM-001',
      gradeLevel: GradeLevel.GRADE_1,
      isActive: true,
    });
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm test -- student-mapper`
Expected: FAIL — cannot find `./student-mapper`.

- [ ] **Step 6: Implement `mappers/students/student-mapper.ts`**

```ts
import type { Student } from '@nemis-desktop/domain';
import type {
  StudentGuardianOutput,
  StudentOutput,
  StudentSummaryOutput,
} from '../../dto/students/student-dto';

function toGuardianOutput(link: Student['guardians'][number]): StudentGuardianOutput {
  return { id: link.id, guardianId: link.guardianId, isPrimary: link.isPrimary };
}

export function toStudentOutput(student: Student): StudentOutput {
  return {
    id: student.id,
    institutionId: student.institutionId,
    firstName: student.name.firstName,
    middleName: student.name.middleName,
    lastName: student.name.lastName,
    fullName: student.name.full,
    admissionNumber: student.admissionNumber.value,
    dateOfBirth: student.dateOfBirth.value,
    gender: student.gender,
    gradeLevel: student.gradeLevel,
    isActive: student.isActive,
    version: student.version,
    updatedAt: student.updatedAt,
    guardians: student.guardians.map(toGuardianOutput),
  };
}

export function toStudentSummary(student: Student): StudentSummaryOutput {
  return {
    id: student.id,
    fullName: student.name.full,
    admissionNumber: student.admissionNumber.value,
    gradeLevel: student.gradeLevel,
    isActive: student.isActive,
  };
}
```

- [ ] **Step 7: Re-export DTOs + mapper from the barrel**

Add to `packages/application/src/index.ts`:

```ts
export * from './dto/students/student-dto';
export * from './mappers/students/student-mapper';
```

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm test -- student-mapper`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/application/src/core/pagination.ts packages/application/src/interfaces packages/application/src/dto/students packages/application/src/mappers/students packages/application/src/index.ts
git commit -m "feat(application): add student ports, DTOs, and mapper"
```

---

## Task 8: Students — command use cases + events

**Files:**

- Create: `packages/application/src/events/students.ts`
- Create: `packages/application/src/use-cases/students/create-student.ts`
- Create: `packages/application/src/use-cases/students/deactivate-student.ts`
- Create: `packages/application/src/use-cases/students/link-guardian-to-student.ts`
- Create: `packages/application/src/testing/students/in-memory-student-repository.ts`
- Create: `packages/application/src/testing/students/in-memory-guardian-repository.ts`
- Test: `packages/application/src/use-cases/students/create-student.test.ts`
- Test: `packages/application/src/use-cases/students/deactivate-student.test.ts`
- Test: `packages/application/src/use-cases/students/link-guardian-to-student.test.ts`
- Modify: `packages/application/src/events/index.ts` (create), `packages/application/src/index.ts`

**Interfaces:**

- Consumes: `IStudentRepository`, `IGuardianRepository` (Task 7); `IUnitOfWork`, `IClock`, `IIdGenerator`, `IEventPublisher` (Task 4); `Student`, `StudentGuardian` from `@nemis-desktop/domain`; validation helpers (Task 6); `ApplicationResponse`, `ok` (Task 1).
- Produces:
  - `CreateStudentUseCase` implementing `CommandHandler<CreateStudentDto, ApplicationResponse<StudentOutput>>`.
  - `DeactivateStudentUseCase` implementing `CommandHandler<DeactivateStudentDto, ApplicationResponse<StudentOutput>>`.
  - `LinkGuardianToStudentUseCase` implementing `CommandHandler<LinkGuardianDto, ApplicationResponse<StudentOutput>>`.
  - Event types `StudentRegistered`, `StudentGuardianLinked` (both `ApplicationEvent`).
  - Test doubles `InMemoryStudentRepository`, `InMemoryGuardianRepository`.

- [ ] **Step 1: Create the event types — `events/students.ts`**

```ts
import type { ApplicationEvent } from '../interfaces/event-publisher';

export interface StudentRegistered extends ApplicationEvent {
  readonly name: 'StudentRegistered';
  readonly studentId: string;
  readonly institutionId: string;
  readonly admissionNumber: string;
}

export interface StudentGuardianLinked extends ApplicationEvent {
  readonly name: 'StudentGuardianLinked';
  readonly studentId: string;
  readonly guardianId: string;
  readonly isPrimary: boolean;
}
```

Create `events/index.ts`:

```ts
export * from './students';
```

Add to `packages/application/src/index.ts`:

```ts
export * from './events';
```

- [ ] **Step 2: Create the in-memory test doubles**

`testing/students/in-memory-student-repository.ts`:

```ts
import type { Student } from '@nemis-desktop/domain';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { PageRequest } from '../../core/pagination';

/** Map-backed IStudentRepository for use-case tests. */
export class InMemoryStudentRepository implements IStudentRepository {
  readonly store = new Map<string, Student>();

  findById(id: string): Student | null {
    return this.store.get(id) ?? null;
  }
  save(student: Student): void {
    this.store.set(student.id, student);
  }
  exists(id: string): boolean {
    return this.store.has(id);
  }
  existsByAdmissionNumber(institutionId: string, admissionNumber: string): boolean {
    for (const s of this.store.values()) {
      if (s.institutionId === institutionId && s.admissionNumber.value === admissionNumber) {
        return true;
      }
    }
    return false;
  }
  findPage(request: PageRequest): { items: Student[]; total: number } {
    const all = [...this.store.values()];
    return { items: all.slice(request.offset, request.offset + request.limit), total: all.length };
  }
  findByClassId(_classId: string): Student[] {
    return [];
  }
}
```

`testing/students/in-memory-guardian-repository.ts`:

```ts
import type { Guardian } from '@nemis-desktop/domain';
import type { IGuardianRepository } from '../../interfaces/students/guardian-repository';

export class InMemoryGuardianRepository implements IGuardianRepository {
  readonly store = new Map<string, Guardian>();
  findById(id: string): Guardian | null {
    return this.store.get(id) ?? null;
  }
  exists(id: string): boolean {
    return this.store.has(id);
  }
}
```

Add both to a testing sub-barrel `testing/students/index.ts`:

```ts
export * from './in-memory-student-repository';
export * from './in-memory-guardian-repository';
```

And add to `packages/application/src/testing/index.ts`:

```ts
export * from './students';
```

- [ ] **Step 3: Write the failing test — `create-student.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Gender, GradeLevel } from '@nemis-desktop/types';
import { CreateStudentUseCase } from './create-student';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { ApplicationValidationException, WorkflowException } from '../../exceptions';

function build() {
  const students = new InMemoryStudentRepository();
  const events = new CollectingEventPublisher();
  const uow = new PassthroughUnitOfWork();
  const useCase = new CreateStudentUseCase({
    students,
    unitOfWork: uow,
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    ids: new SequentialIdGenerator('stu'),
    events,
    logger: new RecordingLogger(),
  });
  return { students, events, uow, useCase };
}

const validInput = {
  institutionId: 'inst-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  admissionNumber: 'ADM-001',
  dateOfBirth: '2015-06-01',
  gender: Gender.FEMALE,
  gradeLevel: GradeLevel.GRADE_1,
};

describe('CreateStudentUseCase', () => {
  it('creates, persists inside the unit of work, and returns the output', async () => {
    const { students, uow, useCase } = build();
    const res = await useCase.execute(validInput);
    expect(res.data.id).toBe('stu-1');
    expect(res.data.fullName).toBe('Ada Lovelace');
    expect(students.store.has('stu-1')).toBe(true);
    expect(uow.runCount).toBe(1);
  });

  it('publishes StudentRegistered after persistence', async () => {
    const { events, useCase } = build();
    await useCase.execute(validInput);
    expect(events.published).toEqual([
      {
        name: 'StudentRegistered',
        occurredAt: '2026-07-18T00:00:00.000Z',
        studentId: 'stu-1',
        institutionId: 'inst-1',
        admissionNumber: 'ADM-001',
      },
    ]);
  });

  it('rejects missing required fields with a validation exception', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ ...validInput, firstName: '', admissionNumber: '' }),
    ).rejects.toBeInstanceOf(ApplicationValidationException);
  });

  it('rejects a duplicate admission number in the same institution', async () => {
    const { useCase } = build();
    await useCase.execute(validInput);
    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(WorkflowException);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm test -- create-student`
Expected: FAIL — cannot find `./create-student`.

- [ ] **Step 5: Implement `use-cases/students/create-student.ts`**

```ts
import { Student } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CreateStudentDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { StudentRegistered } from '../../events/students';

export interface CreateStudentDeps {
  students: IStudentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class CreateStudentUseCase implements CommandHandler<
  CreateStudentDto,
  ApplicationResponse<StudentOutput>
> {
  constructor(private readonly deps: CreateStudentDeps) {}

  execute(command: CreateStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('CreateStudent', this.deps.logger, async () => {
      requireFields(command, [
        'institutionId',
        'firstName',
        'lastName',
        'admissionNumber',
        'dateOfBirth',
        'gender',
      ]);

      if (
        this.deps.students.existsByAdmissionNumber(command.institutionId, command.admissionNumber)
      ) {
        throw new WorkflowException(
          `Admission number ${command.admissionNumber} already exists in this institution.`,
        );
      }

      const occurredAt = this.deps.clock.now();
      const student = Student.create({
        id: this.deps.ids.next(),
        institutionId: command.institutionId,
        firstName: command.firstName,
        middleName: command.middleName,
        lastName: command.lastName,
        admissionNumber: command.admissionNumber,
        dateOfBirth: command.dateOfBirth,
        gender: command.gender,
        gradeLevel: command.gradeLevel,
        occurredAt,
      });

      this.deps.unitOfWork.run(() => this.deps.students.save(student));

      const event: StudentRegistered = {
        name: 'StudentRegistered',
        occurredAt,
        studentId: student.id,
        institutionId: student.institutionId,
        admissionNumber: student.admissionNumber.value,
      };
      this.deps.events.publish(event);

      return ok(toStudentOutput(student));
    });
  }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test -- create-student`
Expected: PASS (4 tests).

- [ ] **Step 7: Write the failing test — `deactivate-student.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { Student } from '@nemis-desktop/domain';
import { DeactivateStudentUseCase } from './deactivate-student';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { FixedClock, PassthroughUnitOfWork, RecordingLogger } from '../../testing';
import { WorkflowException } from '../../exceptions';

function seedStudent(repo: InMemoryStudentRepository): void {
  repo.save(
    Student.create({
      id: 'stu-1',
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
      occurredAt: '2026-07-18T00:00:00.000Z',
    }),
  );
}

function build() {
  const students = new InMemoryStudentRepository();
  const useCase = new DeactivateStudentUseCase({
    students,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-19T00:00:00.000Z'),
    logger: new RecordingLogger(),
  });
  return { students, useCase };
}

describe('DeactivateStudentUseCase', () => {
  it('deactivates an existing student and bumps the version', async () => {
    const { students, useCase } = build();
    seedStudent(students);
    const res = await useCase.execute({ studentId: 'stu-1', actorId: 'user-9' });
    expect(res.data.isActive).toBe(false);
    expect(res.data.version).toBe(2);
    expect(students.findById('stu-1')?.isActive).toBe(false);
  });

  it('throws a workflow exception when the student does not exist', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ studentId: 'missing', actorId: 'user-9' }),
    ).rejects.toBeInstanceOf(WorkflowException);
  });
});
```

- [ ] **Step 8: Run to verify it fails, then implement `deactivate-student.ts`**

Run: `pnpm test -- deactivate-student` → FAIL (module not found).

```ts
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { DeactivateStudentDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface DeactivateStudentDeps {
  students: IStudentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class DeactivateStudentUseCase implements CommandHandler<
  DeactivateStudentDto,
  ApplicationResponse<StudentOutput>
> {
  constructor(private readonly deps: DeactivateStudentDeps) {}

  execute(command: DeactivateStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('DeactivateStudent', this.deps.logger, async () => {
      const student = this.deps.students.findById(command.studentId);
      if (!student) {
        throw new WorkflowException(`Student ${command.studentId} does not exist.`);
      }
      student.deactivate(command.actorId, this.deps.clock.now());
      this.deps.unitOfWork.run(() => this.deps.students.save(student));
      return ok(toStudentOutput(student));
    });
  }
}
```

Run: `pnpm test -- deactivate-student`
Expected: PASS (2 tests).

- [ ] **Step 9: Write the failing test — `link-guardian-to-student.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { Guardian, Student } from '@nemis-desktop/domain';
import { LinkGuardianToStudentUseCase } from './link-guardian-to-student';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { InMemoryGuardianRepository } from '../../testing/students/in-memory-guardian-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { WorkflowException } from '../../exceptions';

function build() {
  const students = new InMemoryStudentRepository();
  const guardians = new InMemoryGuardianRepository();
  students.save(
    Student.create({
      id: 'stu-1',
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
      occurredAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  guardians.store.set(
    'grd-1',
    Guardian.reconstitute({
      id: 'grd-1',
      firstName: 'Grace',
      lastName: 'Hopper',
      relationship: 'mother',
      phoneNumber: '0770000000',
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const events = new CollectingEventPublisher();
  const useCase = new LinkGuardianToStudentUseCase({
    students,
    guardians,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-19T00:00:00.000Z'),
    ids: new SequentialIdGenerator('lnk'),
    events,
    logger: new RecordingLogger(),
  });
  return { students, events, useCase };
}

describe('LinkGuardianToStudentUseCase', () => {
  it('links an existing guardian to an existing student', async () => {
    const { students, events, useCase } = build();
    const res = await useCase.execute({
      studentId: 'stu-1',
      guardianId: 'grd-1',
      isPrimary: true,
      actorId: 'user-9',
    });
    expect(res.data.guardians).toEqual([{ id: 'lnk-1', guardianId: 'grd-1', isPrimary: true }]);
    expect(students.findById('stu-1')?.guardians).toHaveLength(1);
    expect(events.published[0]?.name).toBe('StudentGuardianLinked');
  });

  it('throws when the student is missing', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ studentId: 'nope', guardianId: 'grd-1', isPrimary: false, actorId: 'u' }),
    ).rejects.toBeInstanceOf(WorkflowException);
  });

  it('throws when the guardian is missing', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ studentId: 'stu-1', guardianId: 'nope', isPrimary: false, actorId: 'u' }),
    ).rejects.toBeInstanceOf(WorkflowException);
  });
});
```

- [ ] **Step 10: Run to verify it fails, then implement `link-guardian-to-student.ts`**

Run: `pnpm test -- link-guardian-to-student` → FAIL (module not found).

```ts
import { StudentGuardian } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { LinkGuardianDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IGuardianRepository } from '../../interfaces/students/guardian-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { StudentGuardianLinked } from '../../events/students';

export interface LinkGuardianDeps {
  students: IStudentRepository;
  guardians: IGuardianRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class LinkGuardianToStudentUseCase implements CommandHandler<
  LinkGuardianDto,
  ApplicationResponse<StudentOutput>
> {
  constructor(private readonly deps: LinkGuardianDeps) {}

  execute(command: LinkGuardianDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('LinkGuardianToStudent', this.deps.logger, async () => {
      const student = this.deps.students.findById(command.studentId);
      if (!student) {
        throw new WorkflowException(`Student ${command.studentId} does not exist.`);
      }
      if (!this.deps.guardians.exists(command.guardianId)) {
        throw new WorkflowException(`Guardian ${command.guardianId} does not exist.`);
      }

      const at = this.deps.clock.now();
      const link = StudentGuardian.reconstitute({
        id: this.deps.ids.next(),
        guardianId: command.guardianId,
        isPrimary: command.isPrimary,
      });
      student.addGuardian(link, command.actorId, at);
      this.deps.unitOfWork.run(() => this.deps.students.save(student));

      const event: StudentGuardianLinked = {
        name: 'StudentGuardianLinked',
        occurredAt: at,
        studentId: student.id,
        guardianId: command.guardianId,
        isPrimary: command.isPrimary,
      };
      this.deps.events.publish(event);

      return ok(toStudentOutput(student));
    });
  }
}
```

Run: `pnpm test -- link-guardian-to-student`
Expected: PASS (3 tests).

- [ ] **Step 11: Re-export the use cases from the barrel**

Add to `packages/application/src/index.ts`:

```ts
export * from './use-cases/students/create-student';
export * from './use-cases/students/deactivate-student';
export * from './use-cases/students/link-guardian-to-student';
```

- [ ] **Step 12: Commit**

```bash
git add packages/application/src/use-cases/students packages/application/src/events packages/application/src/testing/students packages/application/src/index.ts
git commit -m "feat(application): add student command use cases (create, deactivate, link guardian)"
```

---

## Task 9: Students — query use cases + application service

**Files:**

- Create: `packages/application/src/queries/students/list-students.ts` (query shape)
- Create: `packages/application/src/use-cases/students/get-student-by-id.ts`
- Create: `packages/application/src/use-cases/students/list-students.ts`
- Create: `packages/application/src/services/student-application-service.ts`
- Test: `packages/application/src/use-cases/students/get-student-by-id.test.ts`
- Test: `packages/application/src/use-cases/students/list-students.test.ts`
- Test: `packages/application/src/services/student-application-service.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

- Consumes: `IStudentRepository` (Task 7); `PagedResult`, `PageRequest` (Task 7); mapper (Task 7); the three command use cases (Task 8).
- Produces:
  - `GetStudentByIdUseCase` implementing `QueryHandler<{ studentId: string }, ApplicationResponse<StudentOutput | null>>`.
  - `ListStudentsUseCase` implementing `QueryHandler<ListStudentsDto, ApplicationResponse<PagedResult<StudentSummaryOutput>>>`. Defaults: `limit=25` (max 100), `offset=0`.
  - `StudentApplicationService` — a façade exposing `create/deactivate/linkGuardian/getById/list` delegating to the use cases.

- [ ] **Step 1: Write the failing test — `get-student-by-id.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { Student } from '@nemis-desktop/domain';
import { GetStudentByIdUseCase } from './get-student-by-id';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { RecordingLogger } from '../../testing';

function build() {
  const students = new InMemoryStudentRepository();
  const useCase = new GetStudentByIdUseCase({ students, logger: new RecordingLogger() });
  return { students, useCase };
}

describe('GetStudentByIdUseCase', () => {
  it('returns the mapped student when found', async () => {
    const { students, useCase } = build();
    students.save(
      Student.create({
        id: 'stu-1',
        institutionId: 'inst-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        admissionNumber: 'ADM-001',
        dateOfBirth: '2015-06-01',
        gender: Gender.FEMALE,
        occurredAt: '2026-07-18T00:00:00.000Z',
      }),
    );
    const res = await useCase.execute({ studentId: 'stu-1' });
    expect(res.data?.id).toBe('stu-1');
  });

  it('returns null data when not found', async () => {
    const { useCase } = build();
    const res = await useCase.execute({ studentId: 'missing' });
    expect(res.data).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement `get-student-by-id.ts`**

Run: `pnpm test -- get-student-by-id` → FAIL (module not found).

```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetStudentByIdDeps {
  students: IStudentRepository;
  logger: IAppLogger;
}

export class GetStudentByIdUseCase implements QueryHandler<
  { studentId: string },
  ApplicationResponse<StudentOutput | null>
> {
  constructor(private readonly deps: GetStudentByIdDeps) {}

  execute(query: { studentId: string }): Promise<ApplicationResponse<StudentOutput | null>> {
    return invokeUseCase('GetStudentById', this.deps.logger, async () => {
      const student = this.deps.students.findById(query.studentId);
      return ok(student ? toStudentOutput(student) : null);
    });
  }
}
```

Run: `pnpm test -- get-student-by-id`
Expected: PASS (2 tests).

- [ ] **Step 3: Write the failing test — `list-students.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { Student } from '@nemis-desktop/domain';
import { ListStudentsUseCase } from './list-students';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { RecordingLogger } from '../../testing';

function seed(repo: InMemoryStudentRepository, n: number): void {
  for (let i = 1; i <= n; i += 1) {
    repo.save(
      Student.create({
        id: `stu-${i}`,
        institutionId: 'inst-1',
        firstName: `First${i}`,
        lastName: 'Last',
        admissionNumber: `ADM-${i}`,
        dateOfBirth: '2015-06-01',
        gender: Gender.MALE,
        occurredAt: '2026-07-18T00:00:00.000Z',
      }),
    );
  }
}

describe('ListStudentsUseCase', () => {
  it('returns a page of summaries with defaults (limit 25, offset 0)', async () => {
    const students = new InMemoryStudentRepository();
    seed(students, 3);
    const useCase = new ListStudentsUseCase({ students, logger: new RecordingLogger() });
    const res = await useCase.execute({});
    expect(res.data.total).toBe(3);
    expect(res.data.limit).toBe(25);
    expect(res.data.offset).toBe(0);
    expect(res.data.items).toHaveLength(3);
    expect(res.data.items[0]).toHaveProperty('fullName');
    expect(res.data.items[0]).not.toHaveProperty('dateOfBirth');
  });

  it('clamps limit to the 1..100 range', async () => {
    const students = new InMemoryStudentRepository();
    seed(students, 1);
    const useCase = new ListStudentsUseCase({ students, logger: new RecordingLogger() });
    const res = await useCase.execute({ limit: 5000 });
    expect(res.data.limit).toBe(100);
  });
});
```

- [ ] **Step 4: Run to verify it fails, then implement `list-students.ts`**

Run: `pnpm test -- list-students` → FAIL (module not found).

Query shape `queries/students/list-students.ts`:

```ts
import type { Query } from '../../core/query';

export interface ListStudentsQuery extends Query {
  limit?: number;
  offset?: number;
}
```

Use case `use-cases/students/list-students.ts`:

```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { PagedResult } from '../../core/pagination';
import type { ListStudentsDto, StudentSummaryOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentSummary } from '../../mappers/students/student-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface ListStudentsDeps {
  students: IStudentRepository;
  logger: IAppLogger;
}

export class ListStudentsUseCase implements QueryHandler<
  ListStudentsDto,
  ApplicationResponse<PagedResult<StudentSummaryOutput>>
> {
  constructor(private readonly deps: ListStudentsDeps) {}

  execute(query: ListStudentsDto): Promise<ApplicationResponse<PagedResult<StudentSummaryOutput>>> {
    return invokeUseCase('ListStudents', this.deps.logger, async () => {
      const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
      const offset = Math.max(query.offset ?? 0, 0);
      const { items, total } = this.deps.students.findPage({ limit, offset });
      return ok({ items: items.map(toStudentSummary), total, limit, offset });
    });
  }
}
```

Run: `pnpm test -- list-students`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test — `student-application-service.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { StudentApplicationService } from './student-application-service';
import { CreateStudentUseCase } from '../use-cases/students/create-student';
import { GetStudentByIdUseCase } from '../use-cases/students/get-student-by-id';
import { InMemoryStudentRepository } from '../testing/students/in-memory-student-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../testing';

describe('StudentApplicationService', () => {
  it('delegates create then get through the service façade', async () => {
    const students = new InMemoryStudentRepository();
    const shared = {
      unitOfWork: new PassthroughUnitOfWork(),
      clock: new FixedClock('2026-07-18T00:00:00.000Z'),
      ids: new SequentialIdGenerator('stu'),
      events: new CollectingEventPublisher(),
      logger: new RecordingLogger(),
    };
    const service = new StudentApplicationService({
      create: new CreateStudentUseCase({ students, ...shared }),
      getById: new GetStudentByIdUseCase({ students, logger: shared.logger }),
    });
    const created = await service.create({
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
    });
    const fetched = await service.getById({ studentId: created.data.id });
    expect(fetched.data?.id).toBe(created.data.id);
  });
});
```

- [ ] **Step 6: Run to verify it fails, then implement `student-application-service.ts`**

Run: `pnpm test -- student-application-service` → FAIL (module not found).

```ts
import type { ApplicationResponse } from '../core/response';
import type { PagedResult } from '../core/pagination';
import type {
  CreateStudentDto,
  DeactivateStudentDto,
  LinkGuardianDto,
  ListStudentsDto,
  StudentOutput,
  StudentSummaryOutput,
} from '../dto/students/student-dto';
import type { CreateStudentUseCase } from '../use-cases/students/create-student';
import type { DeactivateStudentUseCase } from '../use-cases/students/deactivate-student';
import type { LinkGuardianToStudentUseCase } from '../use-cases/students/link-guardian-to-student';
import type { GetStudentByIdUseCase } from '../use-cases/students/get-student-by-id';
import type { ListStudentsUseCase } from '../use-cases/students/list-students';

/** Optional façade grouping the student use cases for consumer convenience.
 * Holds no logic — every method delegates to a use case. */
export interface StudentApplicationServiceDeps {
  create: CreateStudentUseCase;
  deactivate?: DeactivateStudentUseCase;
  linkGuardian?: LinkGuardianToStudentUseCase;
  getById: GetStudentByIdUseCase;
  list?: ListStudentsUseCase;
}

export class StudentApplicationService {
  constructor(private readonly deps: StudentApplicationServiceDeps) {}

  create(dto: CreateStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    return this.deps.create.execute(dto);
  }
  deactivate(dto: DeactivateStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    if (!this.deps.deactivate) throw new Error('deactivate use case not configured');
    return this.deps.deactivate.execute(dto);
  }
  linkGuardian(dto: LinkGuardianDto): Promise<ApplicationResponse<StudentOutput>> {
    if (!this.deps.linkGuardian) throw new Error('linkGuardian use case not configured');
    return this.deps.linkGuardian.execute(dto);
  }
  getById(query: { studentId: string }): Promise<ApplicationResponse<StudentOutput | null>> {
    return this.deps.getById.execute(query);
  }
  list(dto: ListStudentsDto): Promise<ApplicationResponse<PagedResult<StudentSummaryOutput>>> {
    if (!this.deps.list) throw new Error('list use case not configured');
    return this.deps.list.execute(dto);
  }
}
```

Run: `pnpm test -- student-application-service`
Expected: PASS (1 test).

- [ ] **Step 7: Re-export from the barrel**

Add to `packages/application/src/index.ts`:

```ts
export * from './use-cases/students/get-student-by-id';
export * from './use-cases/students/list-students';
export * from './services/student-application-service';
```

- [ ] **Step 8: Commit**

```bash
git add packages/application/src/queries/students packages/application/src/use-cases/students packages/application/src/services/student-application-service.ts packages/application/src/index.ts
git commit -m "feat(application): add student query use cases and application service"
```

---

## Task 10: Academics — ports, DTOs, mapper

**Files:**

- Create: `packages/application/src/interfaces/academics/enrollment-repository.ts`
- Create: `packages/application/src/interfaces/academics/class-repository.ts`
- Create: `packages/application/src/interfaces/academics/index.ts`
- Create: `packages/application/src/dto/academics/academics-dto.ts`
- Create: `packages/application/src/mappers/academics/enrollment-mapper.ts`
- Test: `packages/application/src/mappers/academics/enrollment-mapper.test.ts`
- Create: `packages/application/src/testing/academics/in-memory-enrollment-repository.ts`
- Create: `packages/application/src/testing/academics/in-memory-class-repository.ts`
- Create: `packages/application/src/testing/academics/index.ts`
- Modify: `packages/application/src/interfaces/index.ts`, `packages/application/src/testing/index.ts`, `packages/application/src/index.ts`

**Interfaces:**

- Consumes: `Enrollment`, `Class` from `@nemis-desktop/domain`.
- Produces:
  - `IEnrollmentRepository { findById(id: string): Enrollment | null; save(e: Enrollment): void; hasActiveEnrollment(studentId: string, classId: string): boolean; findByClassId(classId: string): Enrollment[]; }`
  - `IClassRepository { findById(id: string): Class | null; exists(id: string): boolean; }`
  - DTOs `EnrollStudentDto`, `WithdrawEnrollmentDto`, `GetClassRosterDto`, `EnrollmentOutput`, `ClassRosterOutput`.
  - `toEnrollmentOutput(e: Enrollment): EnrollmentOutput`.
  - Test doubles `InMemoryEnrollmentRepository`, `InMemoryClassRepository`.

- [ ] **Step 1: Create the ports**

`interfaces/academics/enrollment-repository.ts`:

```ts
import type { Enrollment } from '@nemis-desktop/domain';

export interface IEnrollmentRepository {
  findById(id: string): Enrollment | null;
  save(enrollment: Enrollment): void;
  hasActiveEnrollment(studentId: string, classId: string): boolean;
  findByClassId(classId: string): Enrollment[];
}
```

`interfaces/academics/class-repository.ts`:

```ts
import type { Class } from '@nemis-desktop/domain';

export interface IClassRepository {
  findById(id: string): Class | null;
  exists(id: string): boolean;
}
```

`interfaces/academics/index.ts`:

```ts
export * from './enrollment-repository';
export * from './class-repository';
```

Add `export * from './academics';` to `interfaces/index.ts`.

- [ ] **Step 2: Create the DTOs — `dto/academics/academics-dto.ts`**

```ts
import type { EnrollmentStatus } from '@nemis-desktop/types';

export interface EnrollStudentDto {
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  actorId?: string;
}

export interface WithdrawEnrollmentDto {
  enrollmentId: string;
  actorId: string;
}

export interface GetClassRosterDto {
  classId: string;
}

export interface EnrollmentOutput {
  id: string;
  studentId: string;
  classId: string;
  status: EnrollmentStatus;
  version: number;
  updatedAt: string;
}

export interface ClassRosterOutput {
  classId: string;
  enrollments: EnrollmentOutput[];
}
```

- [ ] **Step 3: Write the failing test — `enrollment-mapper.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Enrollment } from '@nemis-desktop/domain';
import { EnrollmentStatus } from '@nemis-desktop/types';
import { toEnrollmentOutput } from './enrollment-mapper';

describe('enrollment mapper', () => {
  it('maps an Enrollment to EnrollmentOutput', () => {
    const e = Enrollment.create({
      id: 'enr-1',
      studentId: 'stu-1',
      classId: 'cls-1',
      academicYearId: 'ay-1',
      termId: 'term-1',
      occurredAt: '2026-07-18T00:00:00.000Z',
    });
    expect(toEnrollmentOutput(e)).toEqual({
      id: 'enr-1',
      studentId: 'stu-1',
      classId: 'cls-1',
      status: EnrollmentStatus.ACTIVE,
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    });
  });
});
```

- [ ] **Step 4: Run to verify it fails, then implement `enrollment-mapper.ts`**

Run: `pnpm test -- enrollment-mapper` → FAIL (module not found).

```ts
import type { Enrollment } from '@nemis-desktop/domain';
import type { EnrollmentOutput } from '../../dto/academics/academics-dto';

export function toEnrollmentOutput(enrollment: Enrollment): EnrollmentOutput {
  return {
    id: enrollment.id,
    studentId: enrollment.studentId,
    classId: enrollment.classId,
    status: enrollment.status,
    version: enrollment.version,
    updatedAt: enrollment.updatedAt,
  };
}
```

Run: `pnpm test -- enrollment-mapper`
Expected: PASS (1 test).

- [ ] **Step 5: Create the in-memory test doubles**

`testing/academics/in-memory-enrollment-repository.ts`:

```ts
import { EnrollmentStatus } from '@nemis-desktop/types';
import type { Enrollment } from '@nemis-desktop/domain';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';

export class InMemoryEnrollmentRepository implements IEnrollmentRepository {
  readonly store = new Map<string, Enrollment>();
  findById(id: string): Enrollment | null {
    return this.store.get(id) ?? null;
  }
  save(enrollment: Enrollment): void {
    this.store.set(enrollment.id, enrollment);
  }
  hasActiveEnrollment(studentId: string, classId: string): boolean {
    for (const e of this.store.values()) {
      if (
        e.studentId === studentId &&
        e.classId === classId &&
        e.status === EnrollmentStatus.ACTIVE
      ) {
        return true;
      }
    }
    return false;
  }
  findByClassId(classId: string): Enrollment[] {
    return [...this.store.values()].filter((e) => e.classId === classId);
  }
}
```

`testing/academics/in-memory-class-repository.ts`:

```ts
import type { Class } from '@nemis-desktop/domain';
import type { IClassRepository } from '../../interfaces/academics/class-repository';

export class InMemoryClassRepository implements IClassRepository {
  readonly store = new Map<string, Class>();
  findById(id: string): Class | null {
    return this.store.get(id) ?? null;
  }
  exists(id: string): boolean {
    return this.store.has(id);
  }
}
```

`testing/academics/index.ts`:

```ts
export * from './in-memory-enrollment-repository';
export * from './in-memory-class-repository';
```

Add `export * from './academics';` to `testing/index.ts`.

- [ ] **Step 6: Re-export DTOs + mapper from the barrel**

Add to `packages/application/src/index.ts`:

```ts
export * from './dto/academics/academics-dto';
export * from './mappers/academics/enrollment-mapper';
```

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/interfaces/academics packages/application/src/dto/academics packages/application/src/mappers/academics packages/application/src/testing/academics packages/application/src/interfaces/index.ts packages/application/src/testing/index.ts packages/application/src/index.ts
git commit -m "feat(application): add academics ports, DTOs, and enrollment mapper"
```

---

## Task 11: Academics — use cases + events + service

**Files:**

- Create: `packages/application/src/events/academics.ts`
- Create: `packages/application/src/use-cases/academics/enroll-student.ts`
- Create: `packages/application/src/use-cases/academics/withdraw-enrollment.ts`
- Create: `packages/application/src/use-cases/academics/get-class-roster.ts`
- Create: `packages/application/src/services/academics-application-service.ts`
- Test: `packages/application/src/use-cases/academics/enroll-student.test.ts`
- Test: `packages/application/src/use-cases/academics/withdraw-enrollment.test.ts`
- Test: `packages/application/src/use-cases/academics/get-class-roster.test.ts`
- Modify: `packages/application/src/events/index.ts`, `packages/application/src/index.ts`

**Interfaces:**

- Consumes: `IEnrollmentRepository`, `IClassRepository` (Task 10); `IStudentRepository` (Task 7); cross-cutting ports; `Enrollment` from domain.
- Produces:
  - `EnrollStudentUseCase: CommandHandler<EnrollStudentDto, ApplicationResponse<EnrollmentOutput>>`.
  - `WithdrawEnrollmentUseCase: CommandHandler<WithdrawEnrollmentDto, ApplicationResponse<EnrollmentOutput>>`.
  - `GetClassRosterUseCase: QueryHandler<GetClassRosterDto, ApplicationResponse<ClassRosterOutput>>`.
  - Event `EnrollmentRegistered` (`ApplicationEvent`).
  - `AcademicsApplicationService`.

- [ ] **Step 1: Create the event type — `events/academics.ts`**

```ts
import type { ApplicationEvent } from '../interfaces/event-publisher';

export interface EnrollmentRegistered extends ApplicationEvent {
  readonly name: 'EnrollmentRegistered';
  readonly enrollmentId: string;
  readonly studentId: string;
  readonly classId: string;
}
```

Add `export * from './academics';` to `events/index.ts`.

- [ ] **Step 2: Write the failing test — `enroll-student.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { EnrollStudentUseCase } from './enroll-student';
import { InMemoryEnrollmentRepository } from '../../testing/academics/in-memory-enrollment-repository';
import { InMemoryClassRepository } from '../../testing/academics/in-memory-class-repository';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { Class, Student } from '@nemis-desktop/domain';
import { Gender, GradeLevel } from '@nemis-desktop/types';
import { EnrollmentStatus } from '@nemis-desktop/types';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { WorkflowException } from '../../exceptions';

function build() {
  const enrollments = new InMemoryEnrollmentRepository();
  const classes = new InMemoryClassRepository();
  const students = new InMemoryStudentRepository();
  students.save(
    Student.create({
      id: 'stu-1',
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
      occurredAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  classes.store.set(
    'cls-1',
    Class.reconstitute({
      id: 'cls-1',
      institutionId: 'inst-1',
      academicYearId: 'ay-1',
      name: 'Grade 1 A',
      gradeLevel: GradeLevel.GRADE_1,
      isActive: true,
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const events = new CollectingEventPublisher();
  const useCase = new EnrollStudentUseCase({
    enrollments,
    classes,
    students,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    ids: new SequentialIdGenerator('enr'),
    events,
    logger: new RecordingLogger(),
  });
  return { enrollments, events, useCase };
}

const dto = {
  studentId: 'stu-1',
  classId: 'cls-1',
  academicYearId: 'ay-1',
  termId: 'term-1',
} as const;

describe('EnrollStudentUseCase', () => {
  it('creates an active enrollment and emits an event', async () => {
    const { enrollments, events, useCase } = build();
    const res = await useCase.execute(dto);
    expect(res.data.id).toBe('enr-1');
    expect(res.data.status).toBe(EnrollmentStatus.ACTIVE);
    expect(enrollments.store.has('enr-1')).toBe(true);
    expect(events.published[0]?.name).toBe('EnrollmentRegistered');
  });

  it('rejects when the student does not exist', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ ...dto, studentId: 'nope' })).rejects.toBeInstanceOf(
      WorkflowException,
    );
  });

  it('rejects a duplicate active enrollment in the same class', async () => {
    const { useCase } = build();
    await useCase.execute(dto);
    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(WorkflowException);
  });
});
```

- [ ] **Step 3: Run to verify it fails, then implement `enroll-student.ts`**

Run: `pnpm test -- enroll-student` → FAIL (module not found).

```ts
import { Enrollment } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { EnrollStudentDto, EnrollmentOutput } from '../../dto/academics/academics-dto';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toEnrollmentOutput } from '../../mappers/academics/enrollment-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { EnrollmentRegistered } from '../../events/academics';

export interface EnrollStudentDeps {
  enrollments: IEnrollmentRepository;
  classes: IClassRepository;
  students: IStudentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class EnrollStudentUseCase implements CommandHandler<
  EnrollStudentDto,
  ApplicationResponse<EnrollmentOutput>
> {
  constructor(private readonly deps: EnrollStudentDeps) {}

  execute(command: EnrollStudentDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return invokeUseCase('EnrollStudent', this.deps.logger, async () => {
      requireFields(command, ['studentId', 'classId', 'academicYearId', 'termId']);
      if (!this.deps.students.exists(command.studentId)) {
        throw new WorkflowException(`Student ${command.studentId} does not exist.`);
      }
      if (!this.deps.classes.exists(command.classId)) {
        throw new WorkflowException(`Class ${command.classId} does not exist.`);
      }
      if (this.deps.enrollments.hasActiveEnrollment(command.studentId, command.classId)) {
        throw new WorkflowException('Student is already actively enrolled in this class.');
      }

      const occurredAt = this.deps.clock.now();
      const enrollment = Enrollment.create({
        id: this.deps.ids.next(),
        studentId: command.studentId,
        classId: command.classId,
        academicYearId: command.academicYearId,
        termId: command.termId,
        occurredAt,
      });
      this.deps.unitOfWork.run(() => this.deps.enrollments.save(enrollment));

      const event: EnrollmentRegistered = {
        name: 'EnrollmentRegistered',
        occurredAt,
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        classId: enrollment.classId,
      };
      this.deps.events.publish(event);

      return ok(toEnrollmentOutput(enrollment));
    });
  }
}
```

Run: `pnpm test -- enroll-student`
Expected: PASS (3 tests).

- [ ] **Step 4: Write the failing test — `withdraw-enrollment.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Enrollment } from '@nemis-desktop/domain';
import { EnrollmentStatus } from '@nemis-desktop/types';
import { WithdrawEnrollmentUseCase } from './withdraw-enrollment';
import { InMemoryEnrollmentRepository } from '../../testing/academics/in-memory-enrollment-repository';
import { FixedClock, PassthroughUnitOfWork, RecordingLogger } from '../../testing';
import { UseCaseException, WorkflowException } from '../../exceptions';

function seed(repo: InMemoryEnrollmentRepository): void {
  repo.save(
    Enrollment.create({
      id: 'enr-1',
      studentId: 'stu-1',
      classId: 'cls-1',
      academicYearId: 'ay-1',
      termId: 'term-1',
      occurredAt: '2026-07-18T00:00:00.000Z',
    }),
  );
}

function build() {
  const enrollments = new InMemoryEnrollmentRepository();
  const useCase = new WithdrawEnrollmentUseCase({
    enrollments,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-20T00:00:00.000Z'),
    logger: new RecordingLogger(),
  });
  return { enrollments, useCase };
}

describe('WithdrawEnrollmentUseCase', () => {
  it('withdraws an active enrollment', async () => {
    const { enrollments, useCase } = build();
    seed(enrollments);
    const res = await useCase.execute({ enrollmentId: 'enr-1', actorId: 'user-9' });
    expect(res.data.status).toBe(EnrollmentStatus.WITHDRAWN);
  });

  it('throws a workflow exception when the enrollment is missing', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ enrollmentId: 'nope', actorId: 'u' })).rejects.toBeInstanceOf(
      WorkflowException,
    );
  });

  it('translates the domain double-withdraw error into a UseCaseException', async () => {
    const { enrollments, useCase } = build();
    seed(enrollments);
    await useCase.execute({ enrollmentId: 'enr-1', actorId: 'user-9' });
    await expect(
      useCase.execute({ enrollmentId: 'enr-1', actorId: 'user-9' }),
    ).rejects.toBeInstanceOf(UseCaseException);
  });
});
```

- [ ] **Step 5: Run to verify it fails, then implement `withdraw-enrollment.ts`**

Run: `pnpm test -- withdraw-enrollment` → FAIL (module not found).

```ts
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { WithdrawEnrollmentDto, EnrollmentOutput } from '../../dto/academics/academics-dto';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toEnrollmentOutput } from '../../mappers/academics/enrollment-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface WithdrawEnrollmentDeps {
  enrollments: IEnrollmentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class WithdrawEnrollmentUseCase implements CommandHandler<
  WithdrawEnrollmentDto,
  ApplicationResponse<EnrollmentOutput>
> {
  constructor(private readonly deps: WithdrawEnrollmentDeps) {}

  execute(command: WithdrawEnrollmentDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return invokeUseCase('WithdrawEnrollment', this.deps.logger, async () => {
      const enrollment = this.deps.enrollments.findById(command.enrollmentId);
      if (!enrollment) {
        throw new WorkflowException(`Enrollment ${command.enrollmentId} does not exist.`);
      }
      enrollment.withdraw(command.actorId, this.deps.clock.now());
      this.deps.unitOfWork.run(() => this.deps.enrollments.save(enrollment));
      return ok(toEnrollmentOutput(enrollment));
    });
  }
}
```

Run: `pnpm test -- withdraw-enrollment`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing test — `get-class-roster.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Enrollment } from '@nemis-desktop/domain';
import { GetClassRosterUseCase } from './get-class-roster';
import { InMemoryEnrollmentRepository } from '../../testing/academics/in-memory-enrollment-repository';
import { RecordingLogger } from '../../testing';

describe('GetClassRosterUseCase', () => {
  it('returns all enrollments for the class', async () => {
    const enrollments = new InMemoryEnrollmentRepository();
    enrollments.save(
      Enrollment.create({
        id: 'enr-1',
        studentId: 'stu-1',
        classId: 'cls-1',
        academicYearId: 'ay-1',
        termId: 'term-1',
        occurredAt: '2026-07-18T00:00:00.000Z',
      }),
    );
    const useCase = new GetClassRosterUseCase({ enrollments, logger: new RecordingLogger() });
    const res = await useCase.execute({ classId: 'cls-1' });
    expect(res.data.classId).toBe('cls-1');
    expect(res.data.enrollments).toHaveLength(1);
    expect(res.data.enrollments[0]?.studentId).toBe('stu-1');
  });
});
```

- [ ] **Step 7: Run to verify it fails, then implement `get-class-roster.ts`**

Run: `pnpm test -- get-class-roster` → FAIL (module not found).

```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { GetClassRosterDto, ClassRosterOutput } from '../../dto/academics/academics-dto';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toEnrollmentOutput } from '../../mappers/academics/enrollment-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetClassRosterDeps {
  enrollments: IEnrollmentRepository;
  logger: IAppLogger;
}

export class GetClassRosterUseCase implements QueryHandler<
  GetClassRosterDto,
  ApplicationResponse<ClassRosterOutput>
> {
  constructor(private readonly deps: GetClassRosterDeps) {}

  execute(query: GetClassRosterDto): Promise<ApplicationResponse<ClassRosterOutput>> {
    return invokeUseCase('GetClassRoster', this.deps.logger, async () => {
      const enrollments = this.deps.enrollments
        .findByClassId(query.classId)
        .map(toEnrollmentOutput);
      return ok({ classId: query.classId, enrollments });
    });
  }
}
```

Run: `pnpm test -- get-class-roster`
Expected: PASS (1 test).

- [ ] **Step 8: Implement the service `services/academics-application-service.ts`**

```ts
import type { ApplicationResponse } from '../core/response';
import type {
  ClassRosterOutput,
  EnrollStudentDto,
  EnrollmentOutput,
  GetClassRosterDto,
  WithdrawEnrollmentDto,
} from '../dto/academics/academics-dto';
import type { EnrollStudentUseCase } from '../use-cases/academics/enroll-student';
import type { WithdrawEnrollmentUseCase } from '../use-cases/academics/withdraw-enrollment';
import type { GetClassRosterUseCase } from '../use-cases/academics/get-class-roster';

export interface AcademicsApplicationServiceDeps {
  enroll: EnrollStudentUseCase;
  withdraw: WithdrawEnrollmentUseCase;
  getClassRoster: GetClassRosterUseCase;
}

export class AcademicsApplicationService {
  constructor(private readonly deps: AcademicsApplicationServiceDeps) {}
  enroll(dto: EnrollStudentDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return this.deps.enroll.execute(dto);
  }
  withdraw(dto: WithdrawEnrollmentDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return this.deps.withdraw.execute(dto);
  }
  getClassRoster(dto: GetClassRosterDto): Promise<ApplicationResponse<ClassRosterOutput>> {
    return this.deps.getClassRoster.execute(dto);
  }
}
```

- [ ] **Step 9: Re-export from the barrel**

Add to `packages/application/src/index.ts`:

```ts
export * from './use-cases/academics/enroll-student';
export * from './use-cases/academics/withdraw-enrollment';
export * from './use-cases/academics/get-class-roster';
export * from './services/academics-application-service';
```

- [ ] **Step 10: Commit**

```bash
git add packages/application/src/use-cases/academics packages/application/src/services/academics-application-service.ts packages/application/src/events packages/application/src/index.ts
git commit -m "feat(application): add academics use cases (enroll, withdraw, class roster)"
```

---

## Task 12: Attendance — ports, DTOs, mapper, use cases, service

**Files:**

- Create: `packages/application/src/interfaces/attendance/attendance-repository.ts`
- Create: `packages/application/src/interfaces/attendance/index.ts`
- Create: `packages/application/src/dto/attendance/attendance-dto.ts`
- Create: `packages/application/src/mappers/attendance/attendance-mapper.ts`
- Create: `packages/application/src/events/attendance.ts`
- Create: `packages/application/src/use-cases/attendance/record-attendance.ts`
- Create: `packages/application/src/use-cases/attendance/get-attendance-by-class-and-date.ts`
- Create: `packages/application/src/services/attendance-application-service.ts`
- Create: `packages/application/src/testing/attendance/in-memory-attendance-repository.ts`
- Create: `packages/application/src/testing/attendance/index.ts`
- Test: `packages/application/src/use-cases/attendance/record-attendance.test.ts`
- Test: `packages/application/src/use-cases/attendance/get-attendance-by-class-and-date.test.ts`
- Modify: `interfaces/index.ts`, `events/index.ts`, `testing/index.ts`, `packages/application/src/index.ts`

**Interfaces:**

- Consumes: `Attendance` from domain; `IStudentRepository` (Task 7); cross-cutting ports.
- Produces:
  - `IAttendanceRepository { save(a: Attendance): void; findByClassAndDate(classId: string, date: string): Attendance[]; }`
  - DTOs `RecordAttendanceDto`, `GetAttendanceByClassAndDateDto`, `AttendanceOutput`.
  - `toAttendanceOutput(a: Attendance): AttendanceOutput`.
  - `RecordAttendanceUseCase: CommandHandler<RecordAttendanceDto, ApplicationResponse<AttendanceOutput>>`.
  - `GetAttendanceByClassAndDateUseCase: QueryHandler<GetAttendanceByClassAndDateDto, ApplicationResponse<AttendanceOutput[]>>`.
  - Event `AttendanceRecorded` (`ApplicationEvent`). `AttendanceApplicationService`. `InMemoryAttendanceRepository`.

- [ ] **Step 1: Create the port, DTOs, event, and test double**

`interfaces/attendance/attendance-repository.ts`:

```ts
import type { Attendance } from '@nemis-desktop/domain';

export interface IAttendanceRepository {
  save(attendance: Attendance): void;
  findByClassAndDate(classId: string, date: string): Attendance[];
}
```

`interfaces/attendance/index.ts`: `export * from './attendance-repository';` and add `export * from './attendance';` to `interfaces/index.ts`.

`dto/attendance/attendance-dto.ts`:

```ts
import type { AttendanceStatus } from '@nemis-desktop/types';

export interface RecordAttendanceDto {
  studentId: string;
  classId: string;
  subjectId?: string;
  date: string; // ISO date
  status: AttendanceStatus;
  recordedBy?: string;
}

export interface GetAttendanceByClassAndDateDto {
  classId: string;
  date: string;
}

export interface AttendanceOutput {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  status: AttendanceStatus;
  version: number;
  updatedAt: string;
}
```

`events/attendance.ts`:

```ts
import type { ApplicationEvent } from '../interfaces/event-publisher';
import type { AttendanceStatus } from '@nemis-desktop/types';

export interface AttendanceRecorded extends ApplicationEvent {
  readonly name: 'AttendanceRecorded';
  readonly attendanceId: string;
  readonly studentId: string;
  readonly date: string;
  readonly status: AttendanceStatus;
}
```

Add `export * from './attendance';` to `events/index.ts`.

`testing/attendance/in-memory-attendance-repository.ts`:

```ts
import type { Attendance } from '@nemis-desktop/domain';
import type { IAttendanceRepository } from '../../interfaces/attendance/attendance-repository';

export class InMemoryAttendanceRepository implements IAttendanceRepository {
  readonly store = new Map<string, Attendance>();
  save(attendance: Attendance): void {
    this.store.set(attendance.id, attendance);
  }
  findByClassAndDate(classId: string, date: string): Attendance[] {
    return [...this.store.values()].filter((a) => a.classId === classId && a.date === date);
  }
}
```

`testing/attendance/index.ts`: `export * from './in-memory-attendance-repository';` and add `export * from './attendance';` to `testing/index.ts`.

- [ ] **Step 2: Create the mapper `mappers/attendance/attendance-mapper.ts`**

```ts
import type { Attendance } from '@nemis-desktop/domain';
import type { AttendanceOutput } from '../../dto/attendance/attendance-dto';

export function toAttendanceOutput(attendance: Attendance): AttendanceOutput {
  return {
    id: attendance.id,
    studentId: attendance.studentId,
    classId: attendance.classId,
    date: attendance.date,
    status: attendance.status,
    version: attendance.version,
    updatedAt: attendance.updatedAt,
  };
}
```

- [ ] **Step 3: Write the failing test — `record-attendance.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Student } from '@nemis-desktop/domain';
import { AttendanceStatus, Gender } from '@nemis-desktop/types';
import { RecordAttendanceUseCase } from './record-attendance';
import { InMemoryAttendanceRepository } from '../../testing/attendance/in-memory-attendance-repository';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { WorkflowException } from '../../exceptions';

function build() {
  const attendance = new InMemoryAttendanceRepository();
  const students = new InMemoryStudentRepository();
  students.save(
    Student.create({
      id: 'stu-1',
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
      occurredAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const events = new CollectingEventPublisher();
  const useCase = new RecordAttendanceUseCase({
    attendance,
    students,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-18T08:00:00.000Z'),
    ids: new SequentialIdGenerator('att'),
    events,
    logger: new RecordingLogger(),
  });
  return { attendance, events, useCase };
}

const dto = {
  studentId: 'stu-1',
  classId: 'cls-1',
  date: '2026-07-18',
  status: AttendanceStatus.PRESENT,
  recordedBy: 'teacher-1',
};

describe('RecordAttendanceUseCase', () => {
  it('records attendance and emits an event', async () => {
    const { attendance, events, useCase } = build();
    const res = await useCase.execute(dto);
    expect(res.data.id).toBe('att-1');
    expect(res.data.status).toBe(AttendanceStatus.PRESENT);
    expect(attendance.store.has('att-1')).toBe(true);
    expect(events.published[0]?.name).toBe('AttendanceRecorded');
  });

  it('rejects when the student does not exist', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ ...dto, studentId: 'nope' })).rejects.toBeInstanceOf(
      WorkflowException,
    );
  });
});
```

- [ ] **Step 4: Run to verify it fails, then implement `record-attendance.ts`**

Run: `pnpm test -- record-attendance` → FAIL (module not found).

```ts
import { Attendance } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { RecordAttendanceDto, AttendanceOutput } from '../../dto/attendance/attendance-dto';
import type { IAttendanceRepository } from '../../interfaces/attendance/attendance-repository';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAttendanceOutput } from '../../mappers/attendance/attendance-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { AttendanceRecorded } from '../../events/attendance';

export interface RecordAttendanceDeps {
  attendance: IAttendanceRepository;
  students: IStudentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class RecordAttendanceUseCase implements CommandHandler<
  RecordAttendanceDto,
  ApplicationResponse<AttendanceOutput>
> {
  constructor(private readonly deps: RecordAttendanceDeps) {}

  execute(command: RecordAttendanceDto): Promise<ApplicationResponse<AttendanceOutput>> {
    return invokeUseCase('RecordAttendance', this.deps.logger, async () => {
      requireFields(command, ['studentId', 'classId', 'date', 'status']);
      if (!this.deps.students.exists(command.studentId)) {
        throw new WorkflowException(`Student ${command.studentId} does not exist.`);
      }

      const occurredAt = this.deps.clock.now();
      const attendance = Attendance.record({
        id: this.deps.ids.next(),
        studentId: command.studentId,
        classId: command.classId,
        subjectId: command.subjectId,
        date: command.date,
        status: command.status,
        recordedBy: command.recordedBy,
        occurredAt,
      });
      this.deps.unitOfWork.run(() => this.deps.attendance.save(attendance));

      const event: AttendanceRecorded = {
        name: 'AttendanceRecorded',
        occurredAt,
        attendanceId: attendance.id,
        studentId: attendance.studentId,
        date: attendance.date,
        status: attendance.status,
      };
      this.deps.events.publish(event);

      return ok(toAttendanceOutput(attendance));
    });
  }
}
```

Run: `pnpm test -- record-attendance`
Expected: PASS (2 tests).

- [ ] **Step 5: Write & pass the query test — `get-attendance-by-class-and-date.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Attendance } from '@nemis-desktop/domain';
import { AttendanceStatus } from '@nemis-desktop/types';
import { GetAttendanceByClassAndDateUseCase } from './get-attendance-by-class-and-date';
import { InMemoryAttendanceRepository } from '../../testing/attendance/in-memory-attendance-repository';
import { RecordingLogger } from '../../testing';

describe('GetAttendanceByClassAndDateUseCase', () => {
  it('returns attendance for the class on the date', async () => {
    const attendance = new InMemoryAttendanceRepository();
    attendance.save(
      Attendance.record({
        id: 'att-1',
        studentId: 'stu-1',
        classId: 'cls-1',
        date: '2026-07-18',
        status: AttendanceStatus.PRESENT,
        occurredAt: '2026-07-18T08:00:00.000Z',
      }),
    );
    const useCase = new GetAttendanceByClassAndDateUseCase({
      attendance,
      logger: new RecordingLogger(),
    });
    const res = await useCase.execute({ classId: 'cls-1', date: '2026-07-18' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.studentId).toBe('stu-1');
  });
});
```

Run: `pnpm test -- get-attendance-by-class-and-date` → FAIL, then implement `get-attendance-by-class-and-date.ts`:

```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  GetAttendanceByClassAndDateDto,
  AttendanceOutput,
} from '../../dto/attendance/attendance-dto';
import type { IAttendanceRepository } from '../../interfaces/attendance/attendance-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAttendanceOutput } from '../../mappers/attendance/attendance-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetAttendanceByClassAndDateDeps {
  attendance: IAttendanceRepository;
  logger: IAppLogger;
}

export class GetAttendanceByClassAndDateUseCase implements QueryHandler<
  GetAttendanceByClassAndDateDto,
  ApplicationResponse<AttendanceOutput[]>
> {
  constructor(private readonly deps: GetAttendanceByClassAndDateDeps) {}

  execute(query: GetAttendanceByClassAndDateDto): Promise<ApplicationResponse<AttendanceOutput[]>> {
    return invokeUseCase('GetAttendanceByClassAndDate', this.deps.logger, async () => {
      const records = this.deps.attendance
        .findByClassAndDate(query.classId, query.date)
        .map(toAttendanceOutput);
      return ok(records);
    });
  }
}
```

Run: `pnpm test -- get-attendance-by-class-and-date`
Expected: PASS (1 test).

- [ ] **Step 6: Implement `services/attendance-application-service.ts`**

```ts
import type { ApplicationResponse } from '../core/response';
import type {
  AttendanceOutput,
  GetAttendanceByClassAndDateDto,
  RecordAttendanceDto,
} from '../dto/attendance/attendance-dto';
import type { RecordAttendanceUseCase } from '../use-cases/attendance/record-attendance';
import type { GetAttendanceByClassAndDateUseCase } from '../use-cases/attendance/get-attendance-by-class-and-date';

export interface AttendanceApplicationServiceDeps {
  record: RecordAttendanceUseCase;
  getByClassAndDate: GetAttendanceByClassAndDateUseCase;
}

export class AttendanceApplicationService {
  constructor(private readonly deps: AttendanceApplicationServiceDeps) {}
  record(dto: RecordAttendanceDto): Promise<ApplicationResponse<AttendanceOutput>> {
    return this.deps.record.execute(dto);
  }
  getByClassAndDate(
    dto: GetAttendanceByClassAndDateDto,
  ): Promise<ApplicationResponse<AttendanceOutput[]>> {
    return this.deps.getByClassAndDate.execute(dto);
  }
}
```

- [ ] **Step 7: Re-export from the barrel and commit**

Add to `packages/application/src/index.ts`:

```ts
export * from './dto/attendance/attendance-dto';
export * from './mappers/attendance/attendance-mapper';
export * from './use-cases/attendance/record-attendance';
export * from './use-cases/attendance/get-attendance-by-class-and-date';
export * from './services/attendance-application-service';
```

```bash
git add packages/application/src/interfaces/attendance packages/application/src/dto/attendance packages/application/src/mappers/attendance packages/application/src/events packages/application/src/use-cases/attendance packages/application/src/services/attendance-application-service.ts packages/application/src/testing/attendance packages/application/src/interfaces/index.ts packages/application/src/testing/index.ts packages/application/src/index.ts
git commit -m "feat(application): add attendance ports, use cases, and service"
```

---

## Task 13: Assessments — ports, DTOs, mappers, test doubles

**Files:**

- Create: `packages/application/src/interfaces/assessments/assessment-repository.ts`
- Create: `packages/application/src/interfaces/assessments/grade-repository.ts`
- Create: `packages/application/src/interfaces/assessments/index.ts`
- Create: `packages/application/src/dto/assessments/assessments-dto.ts`
- Create: `packages/application/src/mappers/assessments/assessment-mapper.ts`
- Create: `packages/application/src/mappers/assessments/grade-mapper.ts`
- Test: `packages/application/src/mappers/assessments/grade-mapper.test.ts`
- Create: `packages/application/src/testing/assessments/in-memory-assessment-repository.ts`
- Create: `packages/application/src/testing/assessments/in-memory-grade-repository.ts`
- Create: `packages/application/src/testing/assessments/index.ts`
- Modify: `interfaces/index.ts`, `testing/index.ts`, `packages/application/src/index.ts`

**Interfaces:**

- Consumes: `Assessment`, `Grade` from domain.
- Produces:
  - `IAssessmentRepository { findById(id: string): Assessment | null; save(a: Assessment): void; }`
  - `IGradeRepository { findById(id: string): Grade | null; save(g: Grade): void; findByStudentId(studentId: string): Grade[]; }`
  - DTOs `CreateAssessmentDto`, `RecordGradeDto`, `PublishGradeDto`, `GetGradesByStudentDto`, `AssessmentOutput`, `GradeOutput`.
  - `toAssessmentOutput(a: Assessment): AssessmentOutput`, `toGradeOutput(g: Grade): GradeOutput`.
  - Test doubles `InMemoryAssessmentRepository`, `InMemoryGradeRepository`.

- [ ] **Step 1: Create the ports**

`interfaces/assessments/assessment-repository.ts`:

```ts
import type { Assessment } from '@nemis-desktop/domain';

export interface IAssessmentRepository {
  findById(id: string): Assessment | null;
  save(assessment: Assessment): void;
}
```

`interfaces/assessments/grade-repository.ts`:

```ts
import type { Grade } from '@nemis-desktop/domain';

export interface IGradeRepository {
  findById(id: string): Grade | null;
  save(grade: Grade): void;
  findByStudentId(studentId: string): Grade[];
}
```

`interfaces/assessments/index.ts`:

```ts
export * from './assessment-repository';
export * from './grade-repository';
```

Add `export * from './assessments';` to `interfaces/index.ts`.

- [ ] **Step 2: Create the DTOs — `dto/assessments/assessments-dto.ts`**

```ts
import type { AssessmentType, GradeStatus } from '@nemis-desktop/types';

export interface CreateAssessmentDto {
  classId: string;
  subjectId: string;
  gradingPeriodId: string;
  type: AssessmentType;
  totalMarks: number;
}

export interface RecordGradeDto {
  studentId: string;
  subjectId: string;
  obtained: number;
  total: number;
  status: GradeStatus;
}

export interface PublishGradeDto {
  gradeId: string;
  actorId: string;
}

export interface GetGradesByStudentDto {
  studentId: string;
}

export interface AssessmentOutput {
  id: string;
  type: AssessmentType;
  obtainedMarks: number;
  totalMarks: number;
  version: number;
  updatedAt: string;
}

export interface GradeOutput {
  id: string;
  studentId: string;
  subjectId: string;
  obtained: number;
  total: number;
  status: GradeStatus;
  isPublished: boolean;
  version: number;
  updatedAt: string;
}
```

- [ ] **Step 3: Create the mappers**

`mappers/assessments/assessment-mapper.ts`:

```ts
import type { Assessment } from '@nemis-desktop/domain';
import type { AssessmentOutput } from '../../dto/assessments/assessments-dto';

export function toAssessmentOutput(assessment: Assessment): AssessmentOutput {
  return {
    id: assessment.id,
    type: assessment.type,
    obtainedMarks: assessment.marks.obtained,
    totalMarks: assessment.marks.total,
    version: assessment.version,
    updatedAt: assessment.updatedAt,
  };
}
```

`mappers/assessments/grade-mapper.ts`:

```ts
import type { Grade } from '@nemis-desktop/domain';
import type { GradeOutput } from '../../dto/assessments/assessments-dto';

export function toGradeOutput(grade: Grade): GradeOutput {
  return {
    id: grade.id,
    studentId: grade.studentId,
    subjectId: grade.subjectId,
    obtained: grade.marks.obtained,
    total: grade.marks.total,
    status: grade.status,
    isPublished: grade.isPublished,
    version: grade.version,
    updatedAt: grade.updatedAt,
  };
}
```

- [ ] **Step 4: Write the failing test — `grade-mapper.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Grade } from '@nemis-desktop/domain';
import { GradeStatus } from '@nemis-desktop/types';
import { toGradeOutput } from './grade-mapper';

describe('grade mapper', () => {
  it('maps a Grade to GradeOutput', () => {
    const grade = Grade.create({
      id: 'grd-1',
      studentId: 'stu-1',
      subjectId: 'sub-1',
      obtained: 80,
      total: 100,
      status: GradeStatus.SUBMITTED,
      occurredAt: '2026-07-18T00:00:00.000Z',
    });
    expect(toGradeOutput(grade)).toEqual({
      id: 'grd-1',
      studentId: 'stu-1',
      subjectId: 'sub-1',
      obtained: 80,
      total: 100,
      status: GradeStatus.SUBMITTED,
      isPublished: false,
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    });
  });
});
```

- [ ] **Step 5: Run to verify it fails, then pass**

Run: `pnpm test -- grade-mapper`
Expected: FAIL then, after Step 3 files exist, PASS (1 test). (If you wrote the mappers in Step 3 first, expect PASS immediately — that is fine; the mapper has no collaborators to mock.)

- [ ] **Step 6: Create the in-memory test doubles**

`testing/assessments/in-memory-assessment-repository.ts`:

```ts
import type { Assessment } from '@nemis-desktop/domain';
import type { IAssessmentRepository } from '../../interfaces/assessments/assessment-repository';

export class InMemoryAssessmentRepository implements IAssessmentRepository {
  readonly store = new Map<string, Assessment>();
  findById(id: string): Assessment | null {
    return this.store.get(id) ?? null;
  }
  save(assessment: Assessment): void {
    this.store.set(assessment.id, assessment);
  }
}
```

`testing/assessments/in-memory-grade-repository.ts`:

```ts
import type { Grade } from '@nemis-desktop/domain';
import type { IGradeRepository } from '../../interfaces/assessments/grade-repository';

export class InMemoryGradeRepository implements IGradeRepository {
  readonly store = new Map<string, Grade>();
  findById(id: string): Grade | null {
    return this.store.get(id) ?? null;
  }
  save(grade: Grade): void {
    this.store.set(grade.id, grade);
  }
  findByStudentId(studentId: string): Grade[] {
    return [...this.store.values()].filter((g) => g.studentId === studentId);
  }
}
```

`testing/assessments/index.ts`:

```ts
export * from './in-memory-assessment-repository';
export * from './in-memory-grade-repository';
```

Add `export * from './assessments';` to `testing/index.ts`.

- [ ] **Step 7: Re-export DTOs + mappers from the barrel and commit**

Add to `packages/application/src/index.ts`:

```ts
export * from './dto/assessments/assessments-dto';
export * from './mappers/assessments/assessment-mapper';
export * from './mappers/assessments/grade-mapper';
```

```bash
git add packages/application/src/interfaces/assessments packages/application/src/dto/assessments packages/application/src/mappers/assessments packages/application/src/testing/assessments packages/application/src/interfaces/index.ts packages/application/src/testing/index.ts packages/application/src/index.ts
git commit -m "feat(application): add assessments ports, DTOs, and mappers"
```

---

## Task 14: Assessments — use cases + events + service

**Files:**

- Create: `packages/application/src/events/assessments.ts`
- Create: `packages/application/src/use-cases/assessments/create-assessment.ts`
- Create: `packages/application/src/use-cases/assessments/record-grade.ts`
- Create: `packages/application/src/use-cases/assessments/publish-grade.ts`
- Create: `packages/application/src/use-cases/assessments/get-grades-by-student.ts`
- Create: `packages/application/src/services/assessments-application-service.ts`
- Test: `packages/application/src/use-cases/assessments/create-assessment.test.ts`
- Test: `packages/application/src/use-cases/assessments/record-grade.test.ts`
- Test: `packages/application/src/use-cases/assessments/publish-grade.test.ts`
- Test: `packages/application/src/use-cases/assessments/get-grades-by-student.test.ts`
- Modify: `events/index.ts`, `packages/application/src/index.ts`

**Interfaces:**

- Consumes: `IAssessmentRepository`, `IGradeRepository` (Task 13); cross-cutting ports; `Assessment`, `Grade` from domain.
- Produces:
  - `CreateAssessmentUseCase: CommandHandler<CreateAssessmentDto, ApplicationResponse<AssessmentOutput>>`.
  - `RecordGradeUseCase: CommandHandler<RecordGradeDto, ApplicationResponse<GradeOutput>>`.
  - `PublishGradeUseCase: CommandHandler<PublishGradeDto, ApplicationResponse<GradeOutput>>`.
  - `GetGradesByStudentUseCase: QueryHandler<GetGradesByStudentDto, ApplicationResponse<GradeOutput[]>>`.
  - Events `AssessmentCreated`, `GradePublished` (`ApplicationEvent`). `AssessmentsApplicationService`.

- [ ] **Step 1: Create the events — `events/assessments.ts`**

```ts
import type { ApplicationEvent } from '../interfaces/event-publisher';

export interface AssessmentCreated extends ApplicationEvent {
  readonly name: 'AssessmentCreated';
  readonly assessmentId: string;
}

export interface GradePublished extends ApplicationEvent {
  readonly name: 'GradePublished';
  readonly gradeId: string;
  readonly studentId: string;
  readonly subjectId: string;
}
```

Add `export * from './assessments';` to `events/index.ts`.

- [ ] **Step 2: Write the failing test — `create-assessment.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { AssessmentType } from '@nemis-desktop/types';
import { CreateAssessmentUseCase } from './create-assessment';
import { InMemoryAssessmentRepository } from '../../testing/assessments/in-memory-assessment-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { ApplicationValidationException } from '../../exceptions';

function build() {
  const assessments = new InMemoryAssessmentRepository();
  const events = new CollectingEventPublisher();
  const useCase = new CreateAssessmentUseCase({
    assessments,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    ids: new SequentialIdGenerator('asm'),
    events,
    logger: new RecordingLogger(),
  });
  return { assessments, events, useCase };
}

const dto = {
  classId: 'cls-1',
  subjectId: 'sub-1',
  gradingPeriodId: 'gp-1',
  type: AssessmentType.EXAM,
  totalMarks: 100,
};

describe('CreateAssessmentUseCase', () => {
  it('creates an assessment and emits an event', async () => {
    const { assessments, events, useCase } = build();
    const res = await useCase.execute(dto);
    expect(res.data.id).toBe('asm-1');
    expect(res.data.totalMarks).toBe(100);
    expect(assessments.store.has('asm-1')).toBe(true);
    expect(events.published[0]?.name).toBe('AssessmentCreated');
  });

  it('rejects a non-positive total marks value', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ ...dto, totalMarks: 0 })).rejects.toBeInstanceOf(
      ApplicationValidationException,
    );
  });
});
```

- [ ] **Step 3: Run to verify it fails, then implement `create-assessment.ts`**

Run: `pnpm test -- create-assessment` → FAIL (module not found).

```ts
import { Assessment } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CreateAssessmentDto, AssessmentOutput } from '../../dto/assessments/assessments-dto';
import type { IAssessmentRepository } from '../../interfaces/assessments/assessment-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAssessmentOutput } from '../../mappers/assessments/assessment-mapper';
import { assertValid, requireFields } from '../../validators/validate';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { AssessmentCreated } from '../../events/assessments';

export interface CreateAssessmentDeps {
  assessments: IAssessmentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class CreateAssessmentUseCase implements CommandHandler<
  CreateAssessmentDto,
  ApplicationResponse<AssessmentOutput>
> {
  constructor(private readonly deps: CreateAssessmentDeps) {}

  execute(command: CreateAssessmentDto): Promise<ApplicationResponse<AssessmentOutput>> {
    return invokeUseCase('CreateAssessment', this.deps.logger, async () => {
      requireFields(command, ['classId', 'subjectId', 'gradingPeriodId', 'type']);
      assertValid(command.totalMarks > 0, 'totalMarks', 'must be a positive number');

      const occurredAt = this.deps.clock.now();
      const assessment = Assessment.create({
        id: this.deps.ids.next(),
        classId: command.classId,
        subjectId: command.subjectId,
        gradingPeriodId: command.gradingPeriodId,
        type: command.type,
        totalMarks: command.totalMarks,
        occurredAt,
      });
      this.deps.unitOfWork.run(() => this.deps.assessments.save(assessment));

      const event: AssessmentCreated = {
        name: 'AssessmentCreated',
        occurredAt,
        assessmentId: assessment.id,
      };
      this.deps.events.publish(event);

      return ok(toAssessmentOutput(assessment));
    });
  }
}
```

Run: `pnpm test -- create-assessment`
Expected: PASS (2 tests).

- [ ] **Step 4: Write & pass `record-grade.test.ts` + `record-grade.ts`**

Test:

```ts
import { describe, expect, it } from 'vitest';
import { GradeStatus } from '@nemis-desktop/types';
import { RecordGradeUseCase } from './record-grade';
import { InMemoryGradeRepository } from '../../testing/assessments/in-memory-grade-repository';
import {
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { UseCaseException } from '../../exceptions';

function build() {
  const grades = new InMemoryGradeRepository();
  const useCase = new RecordGradeUseCase({
    grades,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    ids: new SequentialIdGenerator('grd'),
    logger: new RecordingLogger(),
  });
  return { grades, useCase };
}

describe('RecordGradeUseCase', () => {
  it('records a grade', async () => {
    const { grades, useCase } = build();
    const res = await useCase.execute({
      studentId: 'stu-1',
      subjectId: 'sub-1',
      obtained: 80,
      total: 100,
      status: GradeStatus.SUBMITTED,
    });
    expect(res.data.id).toBe('grd-1');
    expect(res.data.obtained).toBe(80);
    expect(grades.store.has('grd-1')).toBe(true);
  });

  it('translates a domain marks violation (obtained > total) into a UseCaseException', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({
        studentId: 'stu-1',
        subjectId: 'sub-1',
        obtained: 120,
        total: 100,
        status: GradeStatus.SUBMITTED,
      }),
    ).rejects.toBeInstanceOf(UseCaseException);
  });
});
```

Implementation `record-grade.ts`:

```ts
import { Grade } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { RecordGradeDto, GradeOutput } from '../../dto/assessments/assessments-dto';
import type { IGradeRepository } from '../../interfaces/assessments/grade-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toGradeOutput } from '../../mappers/assessments/grade-mapper';
import { requireFields } from '../../validators/validate';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface RecordGradeDeps {
  grades: IGradeRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  logger: IAppLogger;
}

export class RecordGradeUseCase implements CommandHandler<
  RecordGradeDto,
  ApplicationResponse<GradeOutput>
> {
  constructor(private readonly deps: RecordGradeDeps) {}

  execute(command: RecordGradeDto): Promise<ApplicationResponse<GradeOutput>> {
    return invokeUseCase('RecordGrade', this.deps.logger, async () => {
      requireFields(command, ['studentId', 'subjectId', 'status']);
      const grade = Grade.create({
        id: this.deps.ids.next(),
        studentId: command.studentId,
        subjectId: command.subjectId,
        obtained: command.obtained,
        total: command.total,
        status: command.status,
        occurredAt: this.deps.clock.now(),
      });
      this.deps.unitOfWork.run(() => this.deps.grades.save(grade));
      return ok(toGradeOutput(grade));
    });
  }
}
```

Run: `pnpm test -- record-grade`
Expected: PASS (2 tests).

- [ ] **Step 5: Write & pass `publish-grade.test.ts` + `publish-grade.ts`**

Test:

```ts
import { describe, expect, it } from 'vitest';
import { Grade } from '@nemis-desktop/domain';
import { GradeStatus } from '@nemis-desktop/types';
import { PublishGradeUseCase } from './publish-grade';
import { InMemoryGradeRepository } from '../../testing/assessments/in-memory-grade-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
} from '../../testing';
import { UseCaseException, WorkflowException } from '../../exceptions';

function seed(repo: InMemoryGradeRepository, status: GradeStatus): void {
  repo.save(
    Grade.create({
      id: 'grd-1',
      studentId: 'stu-1',
      subjectId: 'sub-1',
      obtained: 80,
      total: 100,
      status,
      occurredAt: '2026-07-18T00:00:00.000Z',
    }),
  );
}

function build() {
  const grades = new InMemoryGradeRepository();
  const events = new CollectingEventPublisher();
  const useCase = new PublishGradeUseCase({
    grades,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-19T00:00:00.000Z'),
    events,
    logger: new RecordingLogger(),
  });
  return { grades, events, useCase };
}

describe('PublishGradeUseCase', () => {
  it('publishes a submitted grade and emits GradePublished', async () => {
    const { grades, events, useCase } = build();
    seed(grades, GradeStatus.SUBMITTED);
    const res = await useCase.execute({ gradeId: 'grd-1', actorId: 'user-9' });
    expect(res.data.isPublished).toBe(true);
    expect(res.data.status).toBe(GradeStatus.PUBLISHED);
    expect(events.published[0]?.name).toBe('GradePublished');
  });

  it('throws a workflow exception when the grade is missing', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ gradeId: 'nope', actorId: 'u' })).rejects.toBeInstanceOf(
      WorkflowException,
    );
  });

  it('translates a non-publishable status into a UseCaseException', async () => {
    const { grades, useCase } = build();
    seed(grades, GradeStatus.DRAFT);
    await expect(useCase.execute({ gradeId: 'grd-1', actorId: 'user-9' })).rejects.toBeInstanceOf(
      UseCaseException,
    );
  });
});
```

Implementation `publish-grade.ts`:

```ts
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { PublishGradeDto, GradeOutput } from '../../dto/assessments/assessments-dto';
import type { IGradeRepository } from '../../interfaces/assessments/grade-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toGradeOutput } from '../../mappers/assessments/grade-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { GradePublished } from '../../events/assessments';

export interface PublishGradeDeps {
  grades: IGradeRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class PublishGradeUseCase implements CommandHandler<
  PublishGradeDto,
  ApplicationResponse<GradeOutput>
> {
  constructor(private readonly deps: PublishGradeDeps) {}

  execute(command: PublishGradeDto): Promise<ApplicationResponse<GradeOutput>> {
    return invokeUseCase('PublishGrade', this.deps.logger, async () => {
      const grade = this.deps.grades.findById(command.gradeId);
      if (!grade) {
        throw new WorkflowException(`Grade ${command.gradeId} does not exist.`);
      }
      const at = this.deps.clock.now();
      grade.publish(command.actorId, at);
      this.deps.unitOfWork.run(() => this.deps.grades.save(grade));

      const event: GradePublished = {
        name: 'GradePublished',
        occurredAt: at,
        gradeId: grade.id,
        studentId: grade.studentId,
        subjectId: grade.subjectId,
      };
      this.deps.events.publish(event);

      return ok(toGradeOutput(grade));
    });
  }
}
```

Run: `pnpm test -- publish-grade`
Expected: PASS (3 tests).

- [ ] **Step 6: Write & pass `get-grades-by-student.test.ts` + `get-grades-by-student.ts`**

Test:

```ts
import { describe, expect, it } from 'vitest';
import { Grade } from '@nemis-desktop/domain';
import { GradeStatus } from '@nemis-desktop/types';
import { GetGradesByStudentUseCase } from './get-grades-by-student';
import { InMemoryGradeRepository } from '../../testing/assessments/in-memory-grade-repository';
import { RecordingLogger } from '../../testing';

describe('GetGradesByStudentUseCase', () => {
  it('returns all grades for a student', async () => {
    const grades = new InMemoryGradeRepository();
    grades.save(
      Grade.create({
        id: 'grd-1',
        studentId: 'stu-1',
        subjectId: 'sub-1',
        obtained: 80,
        total: 100,
        status: GradeStatus.SUBMITTED,
        occurredAt: '2026-07-18T00:00:00.000Z',
      }),
    );
    const useCase = new GetGradesByStudentUseCase({ grades, logger: new RecordingLogger() });
    const res = await useCase.execute({ studentId: 'stu-1' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.subjectId).toBe('sub-1');
  });
});
```

Implementation `get-grades-by-student.ts`:

```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { GetGradesByStudentDto, GradeOutput } from '../../dto/assessments/assessments-dto';
import type { IGradeRepository } from '../../interfaces/assessments/grade-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toGradeOutput } from '../../mappers/assessments/grade-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetGradesByStudentDeps {
  grades: IGradeRepository;
  logger: IAppLogger;
}

export class GetGradesByStudentUseCase implements QueryHandler<
  GetGradesByStudentDto,
  ApplicationResponse<GradeOutput[]>
> {
  constructor(private readonly deps: GetGradesByStudentDeps) {}

  execute(query: GetGradesByStudentDto): Promise<ApplicationResponse<GradeOutput[]>> {
    return invokeUseCase('GetGradesByStudent', this.deps.logger, async () => {
      return ok(this.deps.grades.findByStudentId(query.studentId).map(toGradeOutput));
    });
  }
}
```

Run: `pnpm test -- get-grades-by-student`
Expected: PASS (1 test).

- [ ] **Step 7: Implement `services/assessments-application-service.ts`**

```ts
import type { ApplicationResponse } from '../core/response';
import type {
  AssessmentOutput,
  CreateAssessmentDto,
  GetGradesByStudentDto,
  GradeOutput,
  PublishGradeDto,
  RecordGradeDto,
} from '../dto/assessments/assessments-dto';
import type { CreateAssessmentUseCase } from '../use-cases/assessments/create-assessment';
import type { RecordGradeUseCase } from '../use-cases/assessments/record-grade';
import type { PublishGradeUseCase } from '../use-cases/assessments/publish-grade';
import type { GetGradesByStudentUseCase } from '../use-cases/assessments/get-grades-by-student';

export interface AssessmentsApplicationServiceDeps {
  createAssessment: CreateAssessmentUseCase;
  recordGrade: RecordGradeUseCase;
  publishGrade: PublishGradeUseCase;
  getGradesByStudent: GetGradesByStudentUseCase;
}

export class AssessmentsApplicationService {
  constructor(private readonly deps: AssessmentsApplicationServiceDeps) {}
  createAssessment(dto: CreateAssessmentDto): Promise<ApplicationResponse<AssessmentOutput>> {
    return this.deps.createAssessment.execute(dto);
  }
  recordGrade(dto: RecordGradeDto): Promise<ApplicationResponse<GradeOutput>> {
    return this.deps.recordGrade.execute(dto);
  }
  publishGrade(dto: PublishGradeDto): Promise<ApplicationResponse<GradeOutput>> {
    return this.deps.publishGrade.execute(dto);
  }
  getGradesByStudent(dto: GetGradesByStudentDto): Promise<ApplicationResponse<GradeOutput[]>> {
    return this.deps.getGradesByStudent.execute(dto);
  }
}
```

- [ ] **Step 8: Re-export from the barrel and commit**

Add to `packages/application/src/index.ts`:

```ts
export * from './use-cases/assessments/create-assessment';
export * from './use-cases/assessments/record-grade';
export * from './use-cases/assessments/publish-grade';
export * from './use-cases/assessments/get-grades-by-student';
export * from './services/assessments-application-service';
```

```bash
git add packages/application/src/use-cases/assessments packages/application/src/services/assessments-application-service.ts packages/application/src/events packages/application/src/index.ts
git commit -m "feat(application): add assessments use cases (assessment, grade record/publish, query)"
```

---

## Task 15: Identity & Institution — read queries + grading config

**Files:**

- Create: `packages/application/src/interfaces/identity/user-repository.ts`, `.../identity/index.ts`
- Create: `packages/application/src/interfaces/institution/institution-repository.ts`, `.../institution/grading-config-repository.ts`, `.../institution/index.ts`
- Create: `packages/application/src/dto/identity/identity-dto.ts`
- Create: `packages/application/src/dto/institution/institution-dto.ts`
- Create: `packages/application/src/mappers/identity/user-mapper.ts`
- Create: `packages/application/src/mappers/institution/institution-mapper.ts`
- Create: `packages/application/src/mappers/institution/grading-config-mapper.ts`
- Create: `packages/application/src/use-cases/identity/get-user-by-id.ts`
- Create: `packages/application/src/use-cases/institution/get-institution-profile.ts`
- Create: `packages/application/src/use-cases/institution/update-grading-config.ts`
- Create: `packages/application/src/services/identity-application-service.ts`
- Create: `packages/application/src/services/institution-application-service.ts`
- Create: `packages/application/src/testing/identity/in-memory-user-repository.ts`, `.../identity/index.ts`
- Create: `packages/application/src/testing/institution/in-memory-institution-repository.ts`, `.../institution/in-memory-grading-config-repository.ts`, `.../institution/index.ts`
- Test: `packages/application/src/use-cases/identity/get-user-by-id.test.ts`
- Test: `packages/application/src/use-cases/institution/get-institution-profile.test.ts`
- Test: `packages/application/src/use-cases/institution/update-grading-config.test.ts`
- Modify: `interfaces/index.ts`, `testing/index.ts`, `packages/application/src/index.ts`

**Interfaces:**

- Consumes: `User`, `Institution`, `GradingConfig` from domain.
- Produces:
  - `IUserRepository { findById(id: string): User | null; }`
  - `IInstitutionRepository { findById(id: string): Institution | null; }`
  - `IGradingConfigRepository { findById(id: string): GradingConfig | null; save(config: GradingConfig): void; }`
  - DTOs `UserOutput`, `InstitutionProfileOutput`, `UpdateGradingConfigDto`, `GradingConfigOutput`.
  - Mappers `toUserOutput`, `toInstitutionProfileOutput`, `toGradingConfigOutput`.
  - `GetUserByIdUseCase`, `GetInstitutionProfileUseCase`, `UpdateGradingConfigUseCase`, and the two services.

- [ ] **Step 1: Create the ports**

`interfaces/identity/user-repository.ts`:

```ts
import type { User } from '@nemis-desktop/domain';

export interface IUserRepository {
  findById(id: string): User | null;
}
```

`interfaces/identity/index.ts`: `export * from './user-repository';`

`interfaces/institution/institution-repository.ts`:

```ts
import type { Institution } from '@nemis-desktop/domain';

export interface IInstitutionRepository {
  findById(id: string): Institution | null;
}
```

`interfaces/institution/grading-config-repository.ts`:

```ts
import type { GradingConfig } from '@nemis-desktop/domain';

export interface IGradingConfigRepository {
  findById(id: string): GradingConfig | null;
  save(config: GradingConfig): void;
}
```

`interfaces/institution/index.ts`:

```ts
export * from './institution-repository';
export * from './grading-config-repository';
```

Add `export * from './identity';` and `export * from './institution';` to `interfaces/index.ts`.

- [ ] **Step 2: Create the DTOs**

`dto/identity/identity-dto.ts`:

```ts
import type { SystemRole } from '@nemis-desktop/types';

export interface UserOutput {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  roles: SystemRole[];
}
```

`dto/institution/institution-dto.ts`:

```ts
import type { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';

export interface InstitutionProfileOutput {
  id: string;
  code: string;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  approvalStatus: ApprovalStatus;
  isApproved: boolean;
  street?: string;
  communityTown?: string;
}

export interface UpdateGradingConfigDto {
  id: string;
  maxMarks: number;
  passingMarks: number;
  requireAdminApproval: boolean;
}

export interface GradingConfigOutput {
  id: string;
  maxMarks: number;
  passingMarks: number;
  requireAdminApproval: boolean;
}
```

- [ ] **Step 3: Create the mappers**

`mappers/identity/user-mapper.ts`:

```ts
import type { User } from '@nemis-desktop/domain';
import type { UserOutput } from '../../dto/identity/identity-dto';

export function toUserOutput(user: User): UserOutput {
  return {
    id: user.id,
    fullName: user.name.full,
    email: user.email.value,
    isActive: user.isActive,
    roles: user.organizations.filter((o) => o.isActive).map((o) => o.role),
  };
}
```

`mappers/institution/institution-mapper.ts`:

```ts
import type { Institution } from '@nemis-desktop/domain';
import type { InstitutionProfileOutput } from '../../dto/institution/institution-dto';

export function toInstitutionProfileOutput(institution: Institution): InstitutionProfileOutput {
  return {
    id: institution.id,
    code: institution.code.value,
    name: institution.name,
    type: institution.type,
    ownership: institution.ownership,
    approvalStatus: institution.approvalStatus,
    isApproved: institution.isApproved,
    street: institution.address.street,
    communityTown: institution.address.communityTown,
  };
}
```

`mappers/institution/grading-config-mapper.ts`:

```ts
import type { GradingConfig } from '@nemis-desktop/domain';
import type { GradingConfigOutput } from '../../dto/institution/institution-dto';

export function toGradingConfigOutput(config: GradingConfig): GradingConfigOutput {
  return {
    id: config.id,
    maxMarks: config.maxMarks,
    passingMarks: config.passingMarks,
    requireAdminApproval: config.requireAdminApproval,
  };
}
```

- [ ] **Step 4: Create the in-memory test doubles**

`testing/identity/in-memory-user-repository.ts`:

```ts
import type { User } from '@nemis-desktop/domain';
import type { IUserRepository } from '../../interfaces/identity/user-repository';

export class InMemoryUserRepository implements IUserRepository {
  readonly store = new Map<string, User>();
  findById(id: string): User | null {
    return this.store.get(id) ?? null;
  }
}
```

`testing/identity/index.ts`: `export * from './in-memory-user-repository';`

`testing/institution/in-memory-institution-repository.ts`:

```ts
import type { Institution } from '@nemis-desktop/domain';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';

export class InMemoryInstitutionRepository implements IInstitutionRepository {
  readonly store = new Map<string, Institution>();
  findById(id: string): Institution | null {
    return this.store.get(id) ?? null;
  }
}
```

`testing/institution/in-memory-grading-config-repository.ts`:

```ts
import type { GradingConfig } from '@nemis-desktop/domain';
import type { IGradingConfigRepository } from '../../interfaces/institution/grading-config-repository';

export class InMemoryGradingConfigRepository implements IGradingConfigRepository {
  readonly store = new Map<string, GradingConfig>();
  findById(id: string): GradingConfig | null {
    return this.store.get(id) ?? null;
  }
  save(config: GradingConfig): void {
    this.store.set(config.id, config);
  }
}
```

`testing/institution/index.ts`:

```ts
export * from './in-memory-institution-repository';
export * from './in-memory-grading-config-repository';
```

Add `export * from './identity';` and `export * from './institution';` to `testing/index.ts`.

- [ ] **Step 5: Write & pass `get-user-by-id.test.ts` + `get-user-by-id.ts`**

Test:

```ts
import { describe, expect, it } from 'vitest';
import { User, UserOrganization } from '@nemis-desktop/domain';
import { SystemRole } from '@nemis-desktop/types';
import { GetUserByIdUseCase } from './get-user-by-id';
import { InMemoryUserRepository } from '../../testing/identity/in-memory-user-repository';
import { RecordingLogger } from '../../testing';

describe('GetUserByIdUseCase', () => {
  it('returns the mapped user with active roles', async () => {
    const users = new InMemoryUserRepository();
    users.store.set(
      'usr-1',
      User.reconstitute({
        id: 'usr-1',
        firstName: 'Joseph',
        lastName: 'Boakai',
        email: 'joseph@example.com',
        isActive: true,
        organizations: [
          UserOrganization.reconstitute({
            id: 'org-1',
            role: SystemRole.INSTITUTION_ADMIN,
            institutionId: 'inst-1',
            isActive: true,
          }),
        ],
        version: 1,
        updatedAt: '2026-07-18T00:00:00.000Z',
      }),
    );
    const useCase = new GetUserByIdUseCase({ users, logger: new RecordingLogger() });
    const res = await useCase.execute({ userId: 'usr-1' });
    expect(res.data?.email).toBe('joseph@example.com');
    expect(res.data?.roles).toEqual([SystemRole.INSTITUTION_ADMIN]);
  });

  it('returns null when the user is missing', async () => {
    const useCase = new GetUserByIdUseCase({
      users: new InMemoryUserRepository(),
      logger: new RecordingLogger(),
    });
    const res = await useCase.execute({ userId: 'missing' });
    expect(res.data).toBeNull();
  });
});
```

Implementation `get-user-by-id.ts`:

```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { UserOutput } from '../../dto/identity/identity-dto';
import type { IUserRepository } from '../../interfaces/identity/user-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toUserOutput } from '../../mappers/identity/user-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetUserByIdDeps {
  users: IUserRepository;
  logger: IAppLogger;
}

export class GetUserByIdUseCase implements QueryHandler<
  { userId: string },
  ApplicationResponse<UserOutput | null>
> {
  constructor(private readonly deps: GetUserByIdDeps) {}

  execute(query: { userId: string }): Promise<ApplicationResponse<UserOutput | null>> {
    return invokeUseCase('GetUserById', this.deps.logger, async () => {
      const user = this.deps.users.findById(query.userId);
      return ok(user ? toUserOutput(user) : null);
    });
  }
}
```

Run: `pnpm test -- get-user-by-id`
Expected: PASS (2 tests).

- [ ] **Step 6: Write & pass `get-institution-profile.test.ts` + `get-institution-profile.ts`**

Test:

```ts
import { describe, expect, it } from 'vitest';
import { Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { GetInstitutionProfileUseCase } from './get-institution-profile';
import { InMemoryInstitutionRepository } from '../../testing/institution/in-memory-institution-repository';
import { RecordingLogger } from '../../testing';

describe('GetInstitutionProfileUseCase', () => {
  it('returns the mapped institution profile', async () => {
    const institutions = new InMemoryInstitutionRepository();
    institutions.store.set(
      'inst-1',
      Institution.reconstitute({
        id: 'inst-1',
        code: 'lib-001',
        name: 'Monrovia Central',
        type: InstitutionType.SCHOOL,
        ownership: OwnershipType.GOVERNMENT,
        countyId: 'county-1',
        approvalStatus: ApprovalStatus.APPROVED,
        address: { communityTown: 'Sinkor' },
        version: 1,
        updatedAt: '2026-07-18T00:00:00.000Z',
      }),
    );
    const useCase = new GetInstitutionProfileUseCase({
      institutions,
      logger: new RecordingLogger(),
    });
    const res = await useCase.execute({ institutionId: 'inst-1' });
    expect(res.data?.code).toBe('LIB-001'); // SchoolCode upper-cases
    expect(res.data?.isApproved).toBe(true);
    expect(res.data?.communityTown).toBe('Sinkor');
  });

  it('returns null when the institution is missing', async () => {
    const useCase = new GetInstitutionProfileUseCase({
      institutions: new InMemoryInstitutionRepository(),
      logger: new RecordingLogger(),
    });
    expect((await useCase.execute({ institutionId: 'nope' })).data).toBeNull();
  });
});
```

Implementation `get-institution-profile.ts`:

```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { InstitutionProfileOutput } from '../../dto/institution/institution-dto';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toInstitutionProfileOutput } from '../../mappers/institution/institution-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetInstitutionProfileDeps {
  institutions: IInstitutionRepository;
  logger: IAppLogger;
}

export class GetInstitutionProfileUseCase implements QueryHandler<
  { institutionId: string },
  ApplicationResponse<InstitutionProfileOutput | null>
> {
  constructor(private readonly deps: GetInstitutionProfileDeps) {}

  execute(query: {
    institutionId: string;
  }): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return invokeUseCase('GetInstitutionProfile', this.deps.logger, async () => {
      const institution = this.deps.institutions.findById(query.institutionId);
      return ok(institution ? toInstitutionProfileOutput(institution) : null);
    });
  }
}
```

Run: `pnpm test -- get-institution-profile`
Expected: PASS (2 tests).

- [ ] **Step 7: Write & pass `update-grading-config.test.ts` + `update-grading-config.ts`**

Test:

```ts
import { describe, expect, it } from 'vitest';
import { UpdateGradingConfigUseCase } from './update-grading-config';
import { InMemoryGradingConfigRepository } from '../../testing/institution/in-memory-grading-config-repository';
import { FixedClock, PassthroughUnitOfWork, RecordingLogger } from '../../testing';
import { UseCaseException } from '../../exceptions';

function build() {
  const configs = new InMemoryGradingConfigRepository();
  const useCase = new UpdateGradingConfigUseCase({
    configs,
    unitOfWork: new PassthroughUnitOfWork(),
    logger: new RecordingLogger(),
  });
  return { configs, useCase };
}

describe('UpdateGradingConfigUseCase', () => {
  it('upserts a valid grading config', async () => {
    const { configs, useCase } = build();
    const res = await useCase.execute({
      id: 'inst-1',
      maxMarks: 100,
      passingMarks: 50,
      requireAdminApproval: true,
    });
    expect(res.data.passingMarks).toBe(50);
    expect(configs.store.has('inst-1')).toBe(true);
  });

  it('translates the domain invariant (passing > max) into a UseCaseException', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({
        id: 'inst-1',
        maxMarks: 50,
        passingMarks: 90,
        requireAdminApproval: false,
      }),
    ).rejects.toBeInstanceOf(UseCaseException);
  });
});
```

Note: `UpdateGradingConfigUseCase` takes an `IUnitOfWork` but no `IClock` — `GradingConfig` is a plain `Entity` with no concurrency metadata, so there is no `touch(at)` call.

Implementation `update-grading-config.ts`:

```ts
import { GradingConfig } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  UpdateGradingConfigDto,
  GradingConfigOutput,
} from '../../dto/institution/institution-dto';
import type { IGradingConfigRepository } from '../../interfaces/institution/grading-config-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toGradingConfigOutput } from '../../mappers/institution/grading-config-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface UpdateGradingConfigDeps {
  configs: IGradingConfigRepository;
  unitOfWork: IUnitOfWork;
  logger: IAppLogger;
}

export class UpdateGradingConfigUseCase implements CommandHandler<
  UpdateGradingConfigDto,
  ApplicationResponse<GradingConfigOutput>
> {
  constructor(private readonly deps: UpdateGradingConfigDeps) {}

  execute(command: UpdateGradingConfigDto): Promise<ApplicationResponse<GradingConfigOutput>> {
    return invokeUseCase('UpdateGradingConfig', this.deps.logger, async () => {
      // reconstitute enforces the passingMarks <= maxMarks invariant (throws a domain
      // EntityValidationException, translated by the pipeline to a UseCaseException).
      const config = GradingConfig.reconstitute({
        id: command.id,
        maxMarks: command.maxMarks,
        passingMarks: command.passingMarks,
        requireAdminApproval: command.requireAdminApproval,
      });
      this.deps.unitOfWork.run(() => this.deps.configs.save(config));
      return ok(toGradingConfigOutput(config));
    });
  }
}
```

Run: `pnpm test -- update-grading-config`
Expected: PASS (2 tests).

- [ ] **Step 8: Implement the two services**

`services/identity-application-service.ts`:

```ts
import type { ApplicationResponse } from '../core/response';
import type { UserOutput } from '../dto/identity/identity-dto';
import type { GetUserByIdUseCase } from '../use-cases/identity/get-user-by-id';

export interface IdentityApplicationServiceDeps {
  getUserById: GetUserByIdUseCase;
}

export class IdentityApplicationService {
  constructor(private readonly deps: IdentityApplicationServiceDeps) {}
  getUserById(query: { userId: string }): Promise<ApplicationResponse<UserOutput | null>> {
    return this.deps.getUserById.execute(query);
  }
}
```

`services/institution-application-service.ts`:

```ts
import type { ApplicationResponse } from '../core/response';
import type {
  GradingConfigOutput,
  InstitutionProfileOutput,
  UpdateGradingConfigDto,
} from '../dto/institution/institution-dto';
import type { GetInstitutionProfileUseCase } from '../use-cases/institution/get-institution-profile';
import type { UpdateGradingConfigUseCase } from '../use-cases/institution/update-grading-config';

export interface InstitutionApplicationServiceDeps {
  getProfile: GetInstitutionProfileUseCase;
  updateGradingConfig: UpdateGradingConfigUseCase;
}

export class InstitutionApplicationService {
  constructor(private readonly deps: InstitutionApplicationServiceDeps) {}
  getProfile(query: {
    institutionId: string;
  }): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.deps.getProfile.execute(query);
  }
  updateGradingConfig(
    dto: UpdateGradingConfigDto,
  ): Promise<ApplicationResponse<GradingConfigOutput>> {
    return this.deps.updateGradingConfig.execute(dto);
  }
}
```

- [ ] **Step 9: Re-export from the barrel and commit**

Add to `packages/application/src/index.ts`:

```ts
export * from './dto/identity/identity-dto';
export * from './dto/institution/institution-dto';
export * from './mappers/identity/user-mapper';
export * from './mappers/institution/institution-mapper';
export * from './mappers/institution/grading-config-mapper';
export * from './use-cases/identity/get-user-by-id';
export * from './use-cases/institution/get-institution-profile';
export * from './use-cases/institution/update-grading-config';
export * from './services/identity-application-service';
export * from './services/institution-application-service';
```

```bash
git add packages/application/src/interfaces/identity packages/application/src/interfaces/institution packages/application/src/dto/identity packages/application/src/dto/institution packages/application/src/mappers/identity packages/application/src/mappers/institution packages/application/src/use-cases/identity packages/application/src/use-cases/institution packages/application/src/services packages/application/src/testing/identity packages/application/src/testing/institution packages/application/src/interfaces/index.ts packages/application/src/testing/index.ts packages/application/src/index.ts
git commit -m "feat(application): add identity/institution read queries and grading config command"
```

---

## Task 16: Policies + extension template for future domains

**Files:**

- Create: `packages/application/src/policies/permissions.ts`
- Create: `packages/application/src/policies/index.ts`
- Test: `packages/application/src/policies/permissions.test.ts`
- Create: `packages/application/src/_extension-template/README.md`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

- Produces: `permission(action, opts?)` builder returning a `PermissionRequest`; a set of named action constants `APPLICATION_ACTIONS`. The extension template documents how future domains (geography, staff, finance, communication, resources, reporting — incl. `CreateTeacher`/`AssignTeacher`) slot in. No use cases or DTOs are invented for unbuilt domains.

- [ ] **Step 1: Write the failing test — `policies/permissions.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { APPLICATION_ACTIONS, permission } from './permissions';

describe('permission builder', () => {
  it('builds a PermissionRequest from an action', () => {
    expect(permission(APPLICATION_ACTIONS.STUDENTS_CREATE, { actorId: 'u1' })).toEqual({
      action: 'students:create',
      actorId: 'u1',
    });
  });

  it('omits optional fields when not supplied', () => {
    expect(permission(APPLICATION_ACTIONS.ATTENDANCE_RECORD)).toEqual({
      action: 'attendance:record',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement `policies/permissions.ts`**

Run: `pnpm test -- permissions` → FAIL (module not found).

```ts
import type { PermissionRequest } from '../interfaces/permission-evaluator';

/** Canonical action strings the (advisory) permission evaluator understands.
 * Authorization is backend-authoritative; these support coarse local checks. */
export const APPLICATION_ACTIONS = {
  STUDENTS_CREATE: 'students:create',
  STUDENTS_DEACTIVATE: 'students:deactivate',
  ACADEMICS_ENROLL: 'academics:enroll',
  ATTENDANCE_RECORD: 'attendance:record',
  ASSESSMENTS_PUBLISH_GRADE: 'assessments:publishGrade',
  INSTITUTION_UPDATE_GRADING: 'institution:updateGradingConfig',
} as const;

export type ApplicationAction = (typeof APPLICATION_ACTIONS)[keyof typeof APPLICATION_ACTIONS];

export function permission(
  action: ApplicationAction,
  opts?: { resource?: string; actorId?: string },
): PermissionRequest {
  const request: { action: string; resource?: string; actorId?: string } = { action };
  if (opts?.resource !== undefined) request.resource = opts.resource;
  if (opts?.actorId !== undefined) request.actorId = opts.actorId;
  return request;
}
```

`policies/index.ts`: `export * from './permissions';`

Add `export * from './policies';` to `packages/application/src/index.ts`.

Run: `pnpm test -- permissions`
Expected: PASS (2 tests).

- [ ] **Step 3: Create `_extension-template/README.md`**

```markdown
# Adding an application use case / domain slice

The application layer follows one shape for every feature. To add a use case:

1. **Port** — add/extend a repository port in `interfaces/<domain>/` that speaks in
   domain entities (never rows, never DTOs). If a cross-cutting need arises, extend the
   ports in `interfaces/` (unit-of-work, clock, id-generator, event-publisher, logger).
2. **DTOs** — add Input/Output DTOs in `dto/<domain>/`. Never expose entities or rows.
3. **Mapper** — add entity → Output mapping in `mappers/<domain>/`.
4. **Use case** — add a `CommandHandler`/`QueryHandler` in `use-cases/<domain>/`. Wrap the
   body in `invokeUseCase(name, logger, async () => { … })`. Commands validate → check
   preconditions via ports → call the domain factory/method → persist inside
   `unitOfWork.run(() => repo.save(entity))` → publish an event → map to Output. Queries
   read via ports and map; they never take a unit of work and never publish events.
5. **Event** — only if a command needs one, add it to `events/<domain>.ts`. Do NOT declare
   events for use cases that do not exist.
6. **Service** — optionally add a façade in `services/` grouping the domain's use cases.
7. **Wire** — register the use case in `factories/create-application-layer.ts`.
8. **Test** — colocate `*.test.ts` using the in-memory fakes in `testing/`.

## Not-yet-built domains (no domain entities exist — do NOT invent behavior)

`geography`, `staff`, `finance`, `communication`, `resources`, `reporting`.

Examples that belong to `staff` once its domain slice ships: `CreateTeacher`,
`AssignTeacher`. When the `staff` aggregate exists, the assignment command would emit a
`TeacherAssigned` event — declared only then. Example (do not enable until the entity exists):

    // events/staff.ts (FUTURE — only when the staff domain is built)
    // export interface TeacherAssigned extends ApplicationEvent {
    //   readonly name: 'TeacherAssigned';
    //   readonly teacherId: string;
    //   readonly classId: string;
    // }
```

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/policies packages/application/src/_extension-template packages/application/src/index.ts
git commit -m "feat(application): add advisory permission policies and extension template"
```

---

## Task 17: Infra use cases (RegisterDevice, UpdateSettings) — mock-tested

**Files:**

- Create: `packages/application/src/interfaces/infra/device-gateway.ts`, `.../infra/settings-gateway.ts`, `.../infra/index.ts`
- Create: `packages/application/src/dto/infra/infra-dto.ts`
- Create: `packages/application/src/events/infra.ts`
- Create: `packages/application/src/use-cases/infra/register-device.ts`
- Create: `packages/application/src/use-cases/infra/update-settings.ts`
- Create: `packages/application/src/services/infra-application-service.ts`
- Create: `packages/application/src/testing/infra/in-memory-device-gateway.ts`, `.../infra/in-memory-settings-gateway.ts`, `.../infra/index.ts`
- Test: `packages/application/src/use-cases/infra/register-device.test.ts`
- Test: `packages/application/src/use-cases/infra/update-settings.test.ts`
- Modify: `interfaces/index.ts`, `events/index.ts`, `testing/index.ts`, `packages/application/src/index.ts`

**Interfaces:**

- Produces:
  - `RegisterDeviceDto { deviceName: string; platform: string; osVersion: string; appVersion: string }`, `DeviceOutput { id: string; deviceName: string; platform: string; osVersion: string; appVersion: string; createdAt: string; updatedAt: string }`.
  - `UpdateSettingsDto { key: string; value: unknown }`, `SettingOutput { key: string; value: unknown; updatedAt: string }`.
  - `IDeviceGateway { register(input: RegisterDeviceDto): DeviceOutput }` (infra ports speak in application DTOs — there is no Device domain entity).
  - `ISettingsGateway { set(key: string, value: unknown): SettingOutput; get(key: string): unknown }`.
  - `RegisterDeviceUseCase: CommandHandler<RegisterDeviceDto, ApplicationResponse<DeviceOutput>>`, `UpdateSettingsUseCase: CommandHandler<UpdateSettingsDto, ApplicationResponse<SettingOutput>>`.
  - Events `DeviceRegistered`, `SettingsUpdated`. `InfraApplicationService`. `InMemoryDeviceGateway`, `InMemorySettingsGateway`.

- [ ] **Step 1: Create the DTOs, ports, events, and test doubles**

`dto/infra/infra-dto.ts`:

```ts
export interface RegisterDeviceDto {
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
}

export interface DeviceOutput {
  id: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSettingsDto {
  key: string;
  value: unknown;
}

export interface SettingOutput {
  key: string;
  value: unknown;
  updatedAt: string;
}
```

`interfaces/infra/device-gateway.ts`:

```ts
import type { DeviceOutput, RegisterDeviceDto } from '../../dto/infra/infra-dto';

/** Infra gateway for device identity. Speaks in application DTOs because there
 * is no Device domain entity. The Electron adapter maps to the SQLite DAL. */
export interface IDeviceGateway {
  register(input: RegisterDeviceDto): DeviceOutput;
}
```

`interfaces/infra/settings-gateway.ts`:

```ts
import type { SettingOutput } from '../../dto/infra/infra-dto';

export interface ISettingsGateway {
  set(key: string, value: unknown): SettingOutput;
  get(key: string): unknown;
}
```

`interfaces/infra/index.ts`:

```ts
export * from './device-gateway';
export * from './settings-gateway';
```

Add `export * from './infra';` to `interfaces/index.ts`.

`events/infra.ts`:

```ts
import type { ApplicationEvent } from '../interfaces/event-publisher';

export interface DeviceRegistered extends ApplicationEvent {
  readonly name: 'DeviceRegistered';
  readonly deviceId: string;
}

export interface SettingsUpdated extends ApplicationEvent {
  readonly name: 'SettingsUpdated';
  readonly key: string;
}
```

Add `export * from './infra';` to `events/index.ts`.

`testing/infra/in-memory-device-gateway.ts`:

```ts
import type { IDeviceGateway } from '../../interfaces/infra/device-gateway';
import type { DeviceOutput, RegisterDeviceDto } from '../../dto/infra/infra-dto';

export class InMemoryDeviceGateway implements IDeviceGateway {
  readonly registered: DeviceOutput[] = [];
  private n = 0;
  register(input: RegisterDeviceDto): DeviceOutput {
    this.n += 1;
    const now = '2026-07-18T00:00:00.000Z';
    const device: DeviceOutput = { id: `dev-${this.n}`, ...input, createdAt: now, updatedAt: now };
    this.registered.push(device);
    return device;
  }
}
```

`testing/infra/in-memory-settings-gateway.ts`:

```ts
import type { ISettingsGateway } from '../../interfaces/infra/settings-gateway';
import type { SettingOutput } from '../../dto/infra/infra-dto';

export class InMemorySettingsGateway implements ISettingsGateway {
  readonly store = new Map<string, unknown>();
  set(key: string, value: unknown): SettingOutput {
    this.store.set(key, value);
    return { key, value, updatedAt: '2026-07-18T00:00:00.000Z' };
  }
  get(key: string): unknown {
    return this.store.has(key) ? this.store.get(key) : null;
  }
}
```

`testing/infra/index.ts`:

```ts
export * from './in-memory-device-gateway';
export * from './in-memory-settings-gateway';
```

Add `export * from './infra';` to `testing/index.ts`.

- [ ] **Step 2: Write the failing test — `register-device.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { RegisterDeviceUseCase } from './register-device';
import { InMemoryDeviceGateway } from '../../testing/infra/in-memory-device-gateway';
import { CollectingEventPublisher, FixedClock, RecordingLogger } from '../../testing';
import { ApplicationValidationException } from '../../exceptions';

function build() {
  const gateway = new InMemoryDeviceGateway();
  const events = new CollectingEventPublisher();
  const useCase = new RegisterDeviceUseCase({
    deviceGateway: gateway,
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    events,
    logger: new RecordingLogger(),
  });
  return { gateway, events, useCase };
}

const dto = { deviceName: 'lab-01', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0' };

describe('RegisterDeviceUseCase', () => {
  it('registers the device and emits DeviceRegistered', async () => {
    const { gateway, events, useCase } = build();
    const res = await useCase.execute(dto);
    expect(res.data.id).toBe('dev-1');
    expect(gateway.registered).toHaveLength(1);
    expect(events.published[0]).toMatchObject({ name: 'DeviceRegistered', deviceId: 'dev-1' });
  });

  it('rejects missing device fields', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ ...dto, deviceName: '' })).rejects.toBeInstanceOf(
      ApplicationValidationException,
    );
  });
});
```

- [ ] **Step 3: Run to verify it fails, then implement `register-device.ts`**

Run: `pnpm test -- register-device` → FAIL (module not found).

```ts
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { RegisterDeviceDto, DeviceOutput } from '../../dto/infra/infra-dto';
import type { IDeviceGateway } from '../../interfaces/infra/device-gateway';
import type { IClock } from '../../interfaces/clock';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { requireFields } from '../../validators/validate';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { DeviceRegistered } from '../../events/infra';

export interface RegisterDeviceDeps {
  deviceGateway: IDeviceGateway;
  clock: IClock;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class RegisterDeviceUseCase implements CommandHandler<
  RegisterDeviceDto,
  ApplicationResponse<DeviceOutput>
> {
  constructor(private readonly deps: RegisterDeviceDeps) {}

  execute(command: RegisterDeviceDto): Promise<ApplicationResponse<DeviceOutput>> {
    return invokeUseCase('RegisterDevice', this.deps.logger, async () => {
      requireFields(command, ['deviceName', 'platform', 'osVersion', 'appVersion']);
      const device = this.deps.deviceGateway.register(command);

      const event: DeviceRegistered = {
        name: 'DeviceRegistered',
        occurredAt: this.deps.clock.now(),
        deviceId: device.id,
      };
      this.deps.events.publish(event);

      return ok(device);
    });
  }
}
```

Run: `pnpm test -- register-device`
Expected: PASS (2 tests).

- [ ] **Step 4: Write & pass `update-settings.test.ts` + `update-settings.ts`**

Test:

```ts
import { describe, expect, it } from 'vitest';
import { UpdateSettingsUseCase } from './update-settings';
import { InMemorySettingsGateway } from '../../testing/infra/in-memory-settings-gateway';
import { CollectingEventPublisher, FixedClock, RecordingLogger } from '../../testing';
import { ApplicationValidationException } from '../../exceptions';

function build() {
  const gateway = new InMemorySettingsGateway();
  const events = new CollectingEventPublisher();
  const useCase = new UpdateSettingsUseCase({
    settingsGateway: gateway,
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    events,
    logger: new RecordingLogger(),
  });
  return { gateway, events, useCase };
}

describe('UpdateSettingsUseCase', () => {
  it('writes the setting and emits SettingsUpdated', async () => {
    const { gateway, events, useCase } = build();
    const res = await useCase.execute({ key: 'theme', value: 'dark' });
    expect(res.data).toMatchObject({ key: 'theme', value: 'dark' });
    expect(gateway.get('theme')).toBe('dark');
    expect(events.published[0]).toMatchObject({ name: 'SettingsUpdated', key: 'theme' });
  });

  it('rejects a blank key', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ key: '', value: 1 })).rejects.toBeInstanceOf(
      ApplicationValidationException,
    );
  });
});
```

Implementation `update-settings.ts`:

```ts
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { UpdateSettingsDto, SettingOutput } from '../../dto/infra/infra-dto';
import type { ISettingsGateway } from '../../interfaces/infra/settings-gateway';
import type { IClock } from '../../interfaces/clock';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { requireFields } from '../../validators/validate';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { SettingsUpdated } from '../../events/infra';

export interface UpdateSettingsDeps {
  settingsGateway: ISettingsGateway;
  clock: IClock;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class UpdateSettingsUseCase implements CommandHandler<
  UpdateSettingsDto,
  ApplicationResponse<SettingOutput>
> {
  constructor(private readonly deps: UpdateSettingsDeps) {}

  execute(command: UpdateSettingsDto): Promise<ApplicationResponse<SettingOutput>> {
    return invokeUseCase('UpdateSettings', this.deps.logger, async () => {
      requireFields(command, ['key']);
      const setting = this.deps.settingsGateway.set(command.key, command.value);

      const event: SettingsUpdated = {
        name: 'SettingsUpdated',
        occurredAt: this.deps.clock.now(),
        key: command.key,
      };
      this.deps.events.publish(event);

      return ok(setting);
    });
  }
}
```

Run: `pnpm test -- update-settings`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `services/infra-application-service.ts`**

```ts
import type { ApplicationResponse } from '../core/response';
import type {
  DeviceOutput,
  RegisterDeviceDto,
  SettingOutput,
  UpdateSettingsDto,
} from '../dto/infra/infra-dto';
import type { RegisterDeviceUseCase } from '../use-cases/infra/register-device';
import type { UpdateSettingsUseCase } from '../use-cases/infra/update-settings';

export interface InfraApplicationServiceDeps {
  registerDevice: RegisterDeviceUseCase;
  updateSettings: UpdateSettingsUseCase;
}

export class InfraApplicationService {
  constructor(private readonly deps: InfraApplicationServiceDeps) {}
  registerDevice(dto: RegisterDeviceDto): Promise<ApplicationResponse<DeviceOutput>> {
    return this.deps.registerDevice.execute(dto);
  }
  updateSettings(dto: UpdateSettingsDto): Promise<ApplicationResponse<SettingOutput>> {
    return this.deps.updateSettings.execute(dto);
  }
}
```

- [ ] **Step 6: Re-export from the barrel and commit**

Add to `packages/application/src/index.ts`:

```ts
export * from './dto/infra/infra-dto';
export * from './use-cases/infra/register-device';
export * from './use-cases/infra/update-settings';
export * from './services/infra-application-service';
```

```bash
git add packages/application/src/interfaces/infra packages/application/src/dto/infra packages/application/src/events packages/application/src/use-cases/infra packages/application/src/services/infra-application-service.ts packages/application/src/testing/infra packages/application/src/interfaces/index.ts packages/application/src/testing/index.ts packages/application/src/index.ts
git commit -m "feat(application): add infra use cases (register device, update settings)"
```

---

## Task 18: Composition root — `createApplicationLayer`

**Files:**

- Create: `packages/application/src/factories/create-application-layer.ts`
- Create: `packages/application/src/factories/index.ts`
- Test: `packages/application/src/factories/create-application-layer.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

- Consumes: every use case + service + port defined in Tasks 4–17.
- Produces:
  - `ApplicationPorts` — the full DI input (all repository ports + infra gateways + cross-cutting ports).
  - `ApplicationLayer` — `{ students, academics, attendance, assessments, identity, institution, infra }` application services.
  - `createApplicationLayer(ports: ApplicationPorts): ApplicationLayer`.

- [ ] **Step 1: Write the failing test — `create-application-layer.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { createApplicationLayer } from './create-application-layer';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../testing';
import { InMemoryStudentRepository } from '../testing/students/in-memory-student-repository';
import { InMemoryGuardianRepository } from '../testing/students/in-memory-guardian-repository';
import { InMemoryEnrollmentRepository } from '../testing/academics/in-memory-enrollment-repository';
import { InMemoryClassRepository } from '../testing/academics/in-memory-class-repository';
import { InMemoryAttendanceRepository } from '../testing/attendance/in-memory-attendance-repository';
import { InMemoryAssessmentRepository } from '../testing/assessments/in-memory-assessment-repository';
import { InMemoryGradeRepository } from '../testing/assessments/in-memory-grade-repository';
import { InMemoryUserRepository } from '../testing/identity/in-memory-user-repository';
import { InMemoryInstitutionRepository } from '../testing/institution/in-memory-institution-repository';
import { InMemoryGradingConfigRepository } from '../testing/institution/in-memory-grading-config-repository';
import { InMemoryDeviceGateway } from '../testing/infra/in-memory-device-gateway';
import { InMemorySettingsGateway } from '../testing/infra/in-memory-settings-gateway';

function buildLayer() {
  return createApplicationLayer({
    students: new InMemoryStudentRepository(),
    guardians: new InMemoryGuardianRepository(),
    enrollments: new InMemoryEnrollmentRepository(),
    classes: new InMemoryClassRepository(),
    attendance: new InMemoryAttendanceRepository(),
    assessments: new InMemoryAssessmentRepository(),
    grades: new InMemoryGradeRepository(),
    users: new InMemoryUserRepository(),
    institutions: new InMemoryInstitutionRepository(),
    gradingConfigs: new InMemoryGradingConfigRepository(),
    deviceGateway: new InMemoryDeviceGateway(),
    settingsGateway: new InMemorySettingsGateway(),
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    ids: new SequentialIdGenerator('stu'),
    events: new CollectingEventPublisher(),
    logger: new RecordingLogger(),
  });
}

describe('createApplicationLayer', () => {
  it('assembles services that run a create → get flow end to end', async () => {
    const layer = buildLayer();
    const created = await layer.students.create({
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
    });
    const fetched = await layer.students.getById({ studentId: created.data.id });
    expect(fetched.data?.id).toBe(created.data.id);
  });

  it('exposes an infra service that registers a device', async () => {
    const layer = buildLayer();
    const res = await layer.infra.registerDevice({
      deviceName: 'lab-01',
      platform: 'win32',
      osVersion: '10.0',
      appVersion: '1.0.0',
    });
    expect(res.data.id).toBe('dev-1');
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement `create-application-layer.ts`**

Run: `pnpm test -- create-application-layer` → FAIL (module not found).

```ts
import type { IStudentRepository } from '../interfaces/students/student-repository';
import type { IGuardianRepository } from '../interfaces/students/guardian-repository';
import type { IEnrollmentRepository } from '../interfaces/academics/enrollment-repository';
import type { IClassRepository } from '../interfaces/academics/class-repository';
import type { IAttendanceRepository } from '../interfaces/attendance/attendance-repository';
import type { IAssessmentRepository } from '../interfaces/assessments/assessment-repository';
import type { IGradeRepository } from '../interfaces/assessments/grade-repository';
import type { IUserRepository } from '../interfaces/identity/user-repository';
import type { IInstitutionRepository } from '../interfaces/institution/institution-repository';
import type { IGradingConfigRepository } from '../interfaces/institution/grading-config-repository';
import type { IDeviceGateway } from '../interfaces/infra/device-gateway';
import type { ISettingsGateway } from '../interfaces/infra/settings-gateway';
import type { IUnitOfWork } from '../interfaces/unit-of-work';
import type { IClock } from '../interfaces/clock';
import type { IIdGenerator } from '../interfaces/id-generator';
import type { IEventPublisher } from '../interfaces/event-publisher';
import type { IAppLogger } from '../interfaces/app-logger';

import { CreateStudentUseCase } from '../use-cases/students/create-student';
import { DeactivateStudentUseCase } from '../use-cases/students/deactivate-student';
import { LinkGuardianToStudentUseCase } from '../use-cases/students/link-guardian-to-student';
import { GetStudentByIdUseCase } from '../use-cases/students/get-student-by-id';
import { ListStudentsUseCase } from '../use-cases/students/list-students';
import { StudentApplicationService } from '../services/student-application-service';

import { EnrollStudentUseCase } from '../use-cases/academics/enroll-student';
import { WithdrawEnrollmentUseCase } from '../use-cases/academics/withdraw-enrollment';
import { GetClassRosterUseCase } from '../use-cases/academics/get-class-roster';
import { AcademicsApplicationService } from '../services/academics-application-service';

import { RecordAttendanceUseCase } from '../use-cases/attendance/record-attendance';
import { GetAttendanceByClassAndDateUseCase } from '../use-cases/attendance/get-attendance-by-class-and-date';
import { AttendanceApplicationService } from '../services/attendance-application-service';

import { CreateAssessmentUseCase } from '../use-cases/assessments/create-assessment';
import { RecordGradeUseCase } from '../use-cases/assessments/record-grade';
import { PublishGradeUseCase } from '../use-cases/assessments/publish-grade';
import { GetGradesByStudentUseCase } from '../use-cases/assessments/get-grades-by-student';
import { AssessmentsApplicationService } from '../services/assessments-application-service';

import { GetUserByIdUseCase } from '../use-cases/identity/get-user-by-id';
import { IdentityApplicationService } from '../services/identity-application-service';

import { GetInstitutionProfileUseCase } from '../use-cases/institution/get-institution-profile';
import { UpdateGradingConfigUseCase } from '../use-cases/institution/update-grading-config';
import { InstitutionApplicationService } from '../services/institution-application-service';

import { RegisterDeviceUseCase } from '../use-cases/infra/register-device';
import { UpdateSettingsUseCase } from '../use-cases/infra/update-settings';
import { InfraApplicationService } from '../services/infra-application-service';

export interface ApplicationPorts {
  students: IStudentRepository;
  guardians: IGuardianRepository;
  enrollments: IEnrollmentRepository;
  classes: IClassRepository;
  attendance: IAttendanceRepository;
  assessments: IAssessmentRepository;
  grades: IGradeRepository;
  users: IUserRepository;
  institutions: IInstitutionRepository;
  gradingConfigs: IGradingConfigRepository;
  deviceGateway: IDeviceGateway;
  settingsGateway: ISettingsGateway;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export interface ApplicationLayer {
  students: StudentApplicationService;
  academics: AcademicsApplicationService;
  attendance: AttendanceApplicationService;
  assessments: AssessmentsApplicationService;
  identity: IdentityApplicationService;
  institution: InstitutionApplicationService;
  infra: InfraApplicationService;
}

/** Composition root: constructs every use case from injected ports and groups
 * them into application services. The Electron app calls this once with real
 * adapters; tests call it with in-memory fakes. */
export function createApplicationLayer(ports: ApplicationPorts): ApplicationLayer {
  const { unitOfWork, clock, ids, events, logger } = ports;

  const students = new StudentApplicationService({
    create: new CreateStudentUseCase({
      students: ports.students,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    deactivate: new DeactivateStudentUseCase({
      students: ports.students,
      unitOfWork,
      clock,
      logger,
    }),
    linkGuardian: new LinkGuardianToStudentUseCase({
      students: ports.students,
      guardians: ports.guardians,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    getById: new GetStudentByIdUseCase({ students: ports.students, logger }),
    list: new ListStudentsUseCase({ students: ports.students, logger }),
  });

  const academics = new AcademicsApplicationService({
    enroll: new EnrollStudentUseCase({
      enrollments: ports.enrollments,
      classes: ports.classes,
      students: ports.students,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    withdraw: new WithdrawEnrollmentUseCase({
      enrollments: ports.enrollments,
      unitOfWork,
      clock,
      logger,
    }),
    getClassRoster: new GetClassRosterUseCase({ enrollments: ports.enrollments, logger }),
  });

  const attendance = new AttendanceApplicationService({
    record: new RecordAttendanceUseCase({
      attendance: ports.attendance,
      students: ports.students,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    getByClassAndDate: new GetAttendanceByClassAndDateUseCase({
      attendance: ports.attendance,
      logger,
    }),
  });

  const assessments = new AssessmentsApplicationService({
    createAssessment: new CreateAssessmentUseCase({
      assessments: ports.assessments,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    recordGrade: new RecordGradeUseCase({ grades: ports.grades, unitOfWork, clock, ids, logger }),
    publishGrade: new PublishGradeUseCase({
      grades: ports.grades,
      unitOfWork,
      clock,
      events,
      logger,
    }),
    getGradesByStudent: new GetGradesByStudentUseCase({ grades: ports.grades, logger }),
  });

  const identity = new IdentityApplicationService({
    getUserById: new GetUserByIdUseCase({ users: ports.users, logger }),
  });

  const institution = new InstitutionApplicationService({
    getProfile: new GetInstitutionProfileUseCase({ institutions: ports.institutions, logger }),
    updateGradingConfig: new UpdateGradingConfigUseCase({
      configs: ports.gradingConfigs,
      unitOfWork,
      logger,
    }),
  });

  const infra = new InfraApplicationService({
    registerDevice: new RegisterDeviceUseCase({
      deviceGateway: ports.deviceGateway,
      clock,
      events,
      logger,
    }),
    updateSettings: new UpdateSettingsUseCase({
      settingsGateway: ports.settingsGateway,
      clock,
      events,
      logger,
    }),
  });

  return { students, academics, attendance, assessments, identity, institution, infra };
}
```

`factories/index.ts`: `export * from './create-application-layer';`

Add `export * from './factories';` to `packages/application/src/index.ts`.

Run: `pnpm test -- create-application-layer`
Expected: PASS (2 tests).

- [ ] **Step 3: Full package gate**

Run: `pnpm --filter @nemis-desktop/application typecheck && pnpm lint && pnpm test -- packages/application`
Expected: typecheck 0, lint 0, all application tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/factories packages/application/src/index.ts
git commit -m "feat(application): add createApplicationLayer composition root"
```

---

## Task 19: Electron adapters — wire the infra use cases to the real DAL (end-to-end)

**Files:**

- Create: `apps/desktop/electron/data/adapters/UnitOfWorkAdapter.ts`
- Create: `apps/desktop/electron/data/adapters/DeviceGatewayAdapter.ts`
- Create: `apps/desktop/electron/data/adapters/SettingsGatewayAdapter.ts`
- Create: `apps/desktop/electron/data/adapters/createApplicationComposition.ts`
- Test: `apps/desktop/electron/data/adapters/infra-e2e.test.ts`
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts` (export a helper `toApplicationPorts` is NOT required; the composition file reads the DataLayer)

**Interfaces:**

- Consumes: `DataLayer` (from `createDataLayer`), `IDeviceRepository`, `IAppSettingsRepository`, `AppSettingsService`, `TransactionRunner` (all from the DAL); application ports `IDeviceGateway`, `ISettingsGateway`, `IUnitOfWork`; `RegisterDeviceDto`, `DeviceOutput`, `SettingOutput` (from `@nemis-desktop/application`); `IAppLogger`.
- Produces: `UnitOfWorkAdapter`, `DeviceGatewayAdapter`, `SettingsGatewayAdapter`, and `createApplicationComposition(dataLayer, logger)` returning a partially-wired `ApplicationLayer` whose infra service runs against real SQLite. (Business repositories are not yet built, so their ports are backed by `notImplemented` stubs that throw — this is the documented Phase-6 seam.)

> This is the only task that touches `apps/`. It adds **no** IPC handlers and **no** new SQLite tables — it maps the existing DAL to the application ports.

- [ ] **Step 1: Implement `UnitOfWorkAdapter.ts`**

```ts
import type { IUnitOfWork } from '@nemis-desktop/application';
import type { TransactionRunner } from '../services/TransactionRunner';

/** Maps the application's synchronous IUnitOfWork onto the DAL TransactionRunner. */
export class UnitOfWorkAdapter implements IUnitOfWork {
  constructor(private readonly transactions: TransactionRunner) {}
  run<T>(work: () => T): T {
    return this.transactions.run(work);
  }
  runImmediate<T>(work: () => T): T {
    return this.transactions.runImmediate(work);
  }
}
```

- [ ] **Step 2: Implement `DeviceGatewayAdapter.ts`**

```ts
import type { DeviceOutput, IDeviceGateway, RegisterDeviceDto } from '@nemis-desktop/application';
import type { IDeviceRepository } from '../repositories/interfaces/IDeviceRepository';

/** Adapts the SQLite device repository to the application's IDeviceGateway. */
export class DeviceGatewayAdapter implements IDeviceGateway {
  constructor(private readonly devices: IDeviceRepository) {}
  register(input: RegisterDeviceDto): DeviceOutput {
    const device = this.devices.create({
      deviceName: input.deviceName,
      platform: input.platform,
      osVersion: input.osVersion,
      appVersion: input.appVersion,
    });
    return {
      id: device.id,
      deviceName: device.deviceName,
      platform: device.platform,
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }
}
```

- [ ] **Step 3: Implement `SettingsGatewayAdapter.ts`**

```ts
import type { ISettingsGateway, SettingOutput } from '@nemis-desktop/application';
import type { IAppSettingsRepository } from '../repositories/interfaces/IAppSettingsRepository';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';
import type { TransactionRunner } from '../services/TransactionRunner';

/** Adapts settings persistence to the application's ISettingsGateway. Writes the
 * setting and its audit entry atomically, mirroring AppSettingsService.set. */
export class SettingsGatewayAdapter implements ISettingsGateway {
  constructor(
    private readonly settings: IAppSettingsRepository,
    private readonly auditLog: IAuditLogRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  set(key: string, value: unknown): SettingOutput {
    const setting = this.transactions.run(() => {
      const written = this.settings.setByKey(key, value);
      this.auditLog.append({ category: 'application', event: 'setting.updated', details: { key } });
      return written;
    });
    return { key: setting.key, value: setting.value, updatedAt: setting.updatedAt };
  }

  get(key: string): unknown {
    return this.settings.getByKey(key)?.value ?? null;
  }
}
```

Note: confirm `IAuditLogRepository.append(input)` matches the shape used in `AppSettingsService` (`{ category, event, details }`); it does (see `apps/desktop/electron/data/services/AppSettingsService.ts`).

- [ ] **Step 4: Implement `createApplicationComposition.ts`**

```ts
import {
  createApplicationLayer,
  type ApplicationLayer,
  type ApplicationPorts,
} from '@nemis-desktop/application';
import {
  ConsoleLogger,
  CryptoIdGenerator,
  NoopEventPublisher,
  SystemClock,
} from '@nemis-desktop/application';
import type { IAppLogger } from '@nemis-desktop/application';
import type { DataLayer } from '../factories/createDataLayer';
import type { TransactionRunner } from '../services/TransactionRunner';
import { UnitOfWorkAdapter } from './UnitOfWorkAdapter';
import { DeviceGatewayAdapter } from './DeviceGatewayAdapter';
import { SettingsGatewayAdapter } from './SettingsGatewayAdapter';

function notBuilt(name: string): never {
  throw new Error(`${name} repository is not built yet (Phase 6).`);
}

/** Wires the application layer to the real DAL. Infra runs end-to-end; business
 * repository ports throw until their SQLite adapters land in Phase 6. */
export function createApplicationComposition(
  dataLayer: DataLayer,
  transactions: TransactionRunner,
  logger: IAppLogger = new ConsoleLogger(),
): ApplicationLayer {
  const ports: ApplicationPorts = {
    // Infra — wired to real SQLite.
    deviceGateway: new DeviceGatewayAdapter(dataLayer.repositories.devices),
    settingsGateway: new SettingsGatewayAdapter(
      dataLayer.repositories.appSettings,
      dataLayer.repositories.auditLog,
      transactions,
    ),
    unitOfWork: new UnitOfWorkAdapter(transactions),
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
    events: new NoopEventPublisher(),
    logger,
    // Business repositories — Phase 6 seam. Typed as their ports; throw if used.
    students: new Proxy({} as never, { get: () => () => notBuilt('Student') }),
    guardians: new Proxy({} as never, { get: () => () => notBuilt('Guardian') }),
    enrollments: new Proxy({} as never, { get: () => () => notBuilt('Enrollment') }),
    classes: new Proxy({} as never, { get: () => () => notBuilt('Class') }),
    attendance: new Proxy({} as never, { get: () => () => notBuilt('Attendance') }),
    assessments: new Proxy({} as never, { get: () => () => notBuilt('Assessment') }),
    grades: new Proxy({} as never, { get: () => () => notBuilt('Grade') }),
    users: new Proxy({} as never, { get: () => () => notBuilt('User') }),
    institutions: new Proxy({} as never, { get: () => () => notBuilt('Institution') }),
    gradingConfigs: new Proxy({} as never, { get: () => () => notBuilt('GradingConfig') }),
  };
  return createApplicationLayer(ports);
}
```

Note: the `Proxy` stubs keep the composition type-safe while making it explicit that business persistence is unbuilt. The Phase-6 task replaces each with a real SQLite adapter.

- [ ] **Step 5: Write the end-to-end test — `adapters/infra-e2e.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../testing/createTestContext';
import { SqliteDeviceRepository } from '../repositories/sqlite/SqliteDeviceRepository';
import { SqliteAppSettingsRepository } from '../repositories/sqlite/SqliteAppSettingsRepository';
import { SqliteAuditLogRepository } from '../repositories/sqlite/SqliteAuditLogRepository';
import { UnitOfWorkAdapter } from './UnitOfWorkAdapter';
import { DeviceGatewayAdapter } from './DeviceGatewayAdapter';
import { SettingsGatewayAdapter } from './SettingsGatewayAdapter';
import {
  RegisterDeviceUseCase,
  UpdateSettingsUseCase,
  SystemClock,
  NoopEventPublisher,
  ConsoleLogger,
} from '@nemis-desktop/application';

describe('infra use cases end-to-end against real SQLite', () => {
  let test: TestContext;

  beforeEach(() => {
    test = createTestContext();
  });
  afterEach(() => {
    test.cleanup();
  });

  it('RegisterDevice persists a real device row via the gateway adapter', async () => {
    const devices = new SqliteDeviceRepository(test.context);
    const useCase = new RegisterDeviceUseCase({
      deviceGateway: new DeviceGatewayAdapter(devices),
      clock: new SystemClock(),
      events: new NoopEventPublisher(),
      logger: new ConsoleLogger(),
    });
    const res = await useCase.execute({
      deviceName: 'lab-01',
      platform: 'win32',
      osVersion: '10.0',
      appVersion: '1.0.0',
    });
    expect(res.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(devices.findById(res.data.id)?.deviceName).toBe('lab-01');
  });

  it('UpdateSettings writes a real setting row atomically via the gateway adapter', async () => {
    const settings = new SqliteAppSettingsRepository(test.context);
    const auditLog = new SqliteAuditLogRepository(test.context);
    const useCase = new UpdateSettingsUseCase({
      settingsGateway: new SettingsGatewayAdapter(settings, auditLog, test.context.transactions),
      clock: new SystemClock(),
      events: new NoopEventPublisher(),
      logger: new ConsoleLogger(),
    });
    const res = await useCase.execute({ key: 'theme', value: 'dark' });
    expect(res.data.value).toBe('dark');
    expect(settings.getByKey('theme')?.value).toBe('dark');
  });
});
```

- [ ] **Step 6: Run the E2E test (Node ABI required for better-sqlite3)**

Run: `pnpm rebuild:node && pnpm test -- infra-e2e`
Expected: PASS (2 tests). (`pnpm rebuild:node` ensures `better-sqlite3` matches the Node/vitest ABI — see the Phase-4 env note. Run `pnpm rebuild:electron` again before `pnpm dev`/packaging.)

- [ ] **Step 7: Typecheck the app and commit**

Run: `pnpm --filter @nemis-desktop/app typecheck`
Expected: exit 0.

```bash
git add apps/desktop/electron/data/adapters
git commit -m "feat(application): wire infra use cases to the real SQLite DAL via adapters (e2e)"
```

---

## Task 20: Documentation

**Files:**

- Create: `docs/application-layer.md`
- Modify: `docs/conventions.md` (add an "Application Layer" section + "adding a use case" recipe)

**Interfaces:** none (docs only).

- [ ] **Step 1: Write `docs/application-layer.md`**

Include these sections (prose, drawn from the spec `docs/superpowers/specs/2026-07-18-phase-5-application-layer-design.md`):

1. **Philosophy** — the application layer is the only entry point for business operations; UI never touches repositories; hexagonal ports keep it free of Electron/SQLite.
2. **Architecture diagram** — the inward-pointing dependency chain (UI → application → ports+domain ← adapters ← DAL ← SQLite).
3. **CQRS strategy** — commands vs queries; separation rules; base handler types.
4. **Use-case lifecycle** — validation → permission hook → preconditions → map → domain → persist-in-UnitOfWork → event → map-out; pipeline logging + exception translation.
5. **DTO strategy** — Input/Output DTOs + `ApplicationResponse<T>`; never expose entities/rows.
6. **Mapping strategy** — DTO ↔ domain only; adapters own entity ↔ row.
7. **Transaction strategy** — synchronous `IUnitOfWork` mirroring the DAL; async `execute`, sync closure.
8. **Dependency rules** — allowed vs forbidden imports; ESLint enforcement.
9. **Testing strategy** — in-memory mock repos; happy/validation/precondition/domain-translation cases; infra e2e against real SQLite.
10. **Extension pattern** — point to `packages/application/src/_extension-template/README.md`.
11. **Catalog & status** — the ~17 implemented use cases; infra wired e2e; the six unbuilt domains as extension points; the Phase-6 seam (business repository adapters + entity↔row mappers).

- [ ] **Step 2: Add an "Application Layer" section to `docs/conventions.md`**

Append after the existing "Domain Layer" content: the folder responsibilities table row for `packages/application`, the boundary rule, and an "adding a use case" recipe that references the extension template.

- [ ] **Step 3: Commit**

```bash
git add docs/application-layer.md docs/conventions.md
git commit -m "docs(application): document application layer architecture and conventions"
```

---

## Task 21: Final verification gate + branch wrap-up

**Files:** none (verification only).

- [ ] **Step 1: Run the whole workspace gate**

Run: `pnpm rebuild:node && pnpm typecheck && pnpm lint && pnpm test`
Expected: all green. (Typecheck covers every package; lint enforces the application boundary guard; the full Vitest suite includes the new application tests and the infra e2e test.)

- [ ] **Step 2: Confirm the boundary guard actually bites (negative check)**

Temporarily add `import 'electron';` to `packages/application/src/index.ts`, run `pnpm lint`, and confirm it FAILS with the `no-restricted-imports` message. Then remove the import and confirm `pnpm lint` passes again. (Do not commit the temporary import.)

- [ ] **Step 3: Confirm the ABI is restored for the desktop app**

Run: `pnpm rebuild:electron`
Expected: completes. (Leaves `better-sqlite3` built for Electron so `pnpm dev`/packaging works — the test gate used the Node ABI.)

- [ ] **Step 4: Verify the git history is clean and the branch is ready**

Run: `git log --oneline main..phase-5-application-layer`
Expected: one commit per task (~20 commits), all tests green.

- [ ] **Step 5: Update project memory**

Update the NEMIS Desktop memory with a new `nemis-desktop-phase5-state.md` entry (Application Layer complete; `@nemis-desktop/application` package; hexagonal ports; ~17 use cases; infra wired e2e; the Phase-6 seam = business repository adapters + entity↔row mappers; the `pnpm rebuild:node`/`rebuild:electron` ABI dance). Add the one-line pointer to `MEMORY.md`.

- [ ] **Step 6 (optional): Finish the development branch**

Use the superpowers:finishing-a-development-branch skill to decide merge/PR/cleanup. Do not merge without explicit user direction.

---

## Self-Review Notes

- **Spec coverage:** Every numbered section of the design spec maps to tasks — package/boundary (T1), exceptions (T2), CQRS core (T3), ports+defaults (T4), pipeline (T5), validation/testing fakes (T6), DTO/mapper/port pattern (T7), commands+events (T8), queries+services (T9), and the same shape across academics (T10–11), attendance (T12), assessments (T13–14), identity/institution (T15); policies + extension points (T16); infra use cases (T17); composition root/DI (T18); transaction strategy + real E2E adapters (T19); documentation (T20); acceptance gate (T21).
- **Catalog note:** `UpdateStudent → DeactivateStudent`, `CreateClass`/`CreateAcademicYear → WithdrawEnrollment`, `PublishAssessment → CreateAssessment` — all to match real Phase-4 domain methods (recorded in spec §9).
- **Enum literals** are UPPERCASE (`ACTIVE`, `WITHDRAWN`, `PRESENT`, `SUBMITTED`, …); tests use the enum constants, not string literals.
- **`noUncheckedIndexedAccess`** — tests use `?.` on indexed access (`items[0]?.foo`); no non-test indexed access is unguarded.
- **Enum members verified** against `packages/types/src/enums.ts`: `SystemRole.INSTITUTION_ADMIN`, `InstitutionType.SCHOOL`, `OwnershipType.GOVERNMENT` (no `SCHOOL_ADMIN`/`PUBLIC` members exist).
- **Package names verified:** application package `@nemis-desktop/application`; desktop app `@nemis-desktop/app` (used in the Task 19 typecheck command). Root scripts confirmed: `test` = `vitest run` (so `pnpm test -- <name>` filters by path), `typecheck` = `pnpm -r typecheck`, `lint` = `eslint .`, plus `rebuild:node`/`rebuild:electron`.
