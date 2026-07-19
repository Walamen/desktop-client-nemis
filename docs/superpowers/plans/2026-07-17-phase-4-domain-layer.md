# Phase 4 Domain Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-TypeScript `@nemis-desktop/domain` package — a shared kernel plus a fully-implemented vertical slice of the six offline-critical NEMIS domains (Identity, Institution, Students, Academics, Attendance, Assessments) — that mirrors the production business model with zero infrastructure dependencies.

**Architecture:** A new pnpm workspace package `packages/domain` depends only on `@nemis-desktop/types`. It contains a `core/` kernel (Entity, AggregateRoot, ValueObject, DomainEvent, Specification, guard), an `exceptions/` hierarchy, cross-cutting `value-objects/`, and one feature-first folder per domain (entities/value-objects/specifications/events/factories). Canonical enums are mirrored into `@nemis-desktop/types` from the backend `@nemis/types`. Rich models: private constructors, static `create()`/`reconstitute()` factories, behavior methods, no anemic entities.

**Tech Stack:** TypeScript 5.7 (strict, `noUncheckedIndexedAccess`, `isolatedModules`, ESNext/Bundler), Vitest 3, pnpm 10 workspaces, ESLint 9 flat config.

## Global Constraints

- **Dependency rule:** the domain package may import **only** from `@nemis-desktop/types` and its own files. Never import `electron`, `react`, `next`, `better-sqlite3*`, or any path under `apps/desktop/electron/{database,data,ipc}`, or `@nemis-desktop/shared`. Enforced by ESLint `no-restricted-imports` (Task 1) and by the package compiling standalone.
- **Purity:** no side effects at module load, no `Date.now()`/`crypto` in constructors except explicitly in `touch()`/event `occurredAt`. Entities receive ids and timestamps; they do not generate persistence ids.
- **Enum values:** every mirrored enum value must be identical, character-for-character, to `schema.prisma` / backend `@nemis/types` `enums.ts`.
- **TS config:** all packages extend `tsconfig.base.json`. `noUncheckedIndexedAccess` is ON — index access yields `T | undefined`; handle it.
- **No `any`:** ESLint `@typescript-eslint/no-explicit-any` is `error`. Use `unknown` + narrowing.
- **Immutability:** value objects freeze their props; entities expose readonly getters, never public setters.
- **Naming:** files `kebab-case.ts`; classes `PascalCase`; enum mirror uses `as const` object + derived union (matches `packages/types/src`... and `electron/data/models/platform.ts`).
- **Tests colocate** as `*.test.ts` beside sources; import from `vitest` (`describe`, `it`, `expect`). Run via root `pnpm test` (vitest `include` already globs `packages/**/src/**/*.test.ts`).
- **Commit** after every task with a `feat(domain):` or `chore(domain):` message.

**Scope note (fidelity vs. field-exhaustion):** aggregate roots model their **business-relevant** fields and behaviors. Wide "profile" models (notably `Institution` with ~50 infrastructure booleans) carry the exhaustive fields in their `reconstitute()` props type as a typed record, but only identity/classification/approval fields get individual invariants. This is intentional and documented in the domain README (Task 15).

---

### Task 1: Scaffold the `@nemis-desktop/domain` package

**Files:**

- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/eslint.config.mjs`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/index.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: workspace package `@nemis-desktop/domain` with entry `./src/index.ts`; empty barrel `export {}`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as domain from './index';

describe('@nemis-desktop/domain package', () => {
  it('exposes a module namespace', () => {
    expect(typeof domain).toBe('object');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/index.test.ts`
Expected: FAIL — cannot resolve `./index` (file does not exist yet).

- [ ] **Step 3: Create the package files**

`packages/domain/package.json`:

```json
{
  "name": "@nemis-desktop/domain",
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
    "@nemis-desktop/types": "workspace:*"
  }
}
```

`packages/domain/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/domain/eslint.config.mjs` (package-local guard; the root config still lints the files, this documents intent and can be referenced):

```js
// Dependency guard for the domain layer. The root flat config lints these files;
// this block is added to the ROOT eslint.config.mjs in Step 4. Kept here as the
// canonical source of the restricted-import rule for the domain package.
export const domainImportGuard = {
  files: ['packages/domain/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'electron', message: 'Domain layer must not depend on Electron.' },
          { name: 'react', message: 'Domain layer must not depend on React.' },
          { name: 'next', message: 'Domain layer must not depend on Next.' },
          { name: 'better-sqlite3', message: 'Domain layer must not depend on SQLite.' },
          {
            name: '@nemis-desktop/shared',
            message: 'Domain layer must not depend on the infra-facing shared package.',
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
            ],
            message: 'Domain layer must not import infrastructure modules.',
          },
        ],
      },
    ],
  },
};
```

`packages/domain/src/index.ts`:

```ts
export {};
```

- [ ] **Step 4: Wire the import guard into the root ESLint config**

Modify `eslint.config.mjs` (repo root). Add the import at the top:

```js
import { domainImportGuard } from './packages/domain/eslint.config.mjs';
```

Then add `domainImportGuard` as a config object in the `tseslint.config(...)` array, immediately before the final `prettier,`:

```js
  domainImportGuard,
  prettier,
);
```

- [ ] **Step 5: Install workspace dependency link**

Run: `pnpm install`
Expected: `@nemis-desktop/domain` linked; `@nemis-desktop/types` resolved via `workspace:*`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/index.test.ts`
Expected: PASS.

- [ ] **Step 7: Verify typecheck and lint**

Run: `pnpm --filter @nemis-desktop/domain typecheck && pnpm lint`
Expected: both succeed, no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/domain eslint.config.mjs pnpm-lock.yaml
git commit -m "chore(domain): scaffold @nemis-desktop/domain package with import guard"
```

---

### Task 2: Mirror canonical enums into `@nemis-desktop/types`

**Files:**

- Create: `packages/types/src/enums.ts`
- Create: `packages/types/src/enums.test.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `as const` enum objects + derived union types, exported from `@nemis-desktop/types`. Names/values below are the exact set the domain slice needs. Each is `export const X = {...} as const; export type X = (typeof X)[keyof typeof X];`.

Enums to mirror (values verbatim from `schema.prisma`): `SystemRole`, `Status`, `Gender`, `InstitutionType`, `OwnershipType`, `AccessMode`, `InstitutionLevel`, `ApprovalStatus`, `GradeLevel`, `EnrollmentStatus`, `AttendanceStatus`, `AssessmentType`, `GradeStatus`, `GradeAuditAction`, `PeriodType`, `WindowStatus`, `StaffPosition`, `EmploymentType`, `DayOfWeek`.

- [ ] **Step 1: Write the failing test**

`packages/types/src/enums.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AttendanceStatus,
  EnrollmentStatus,
  Gender,
  GradeStatus,
  InstitutionLevel,
  SystemRole,
} from './enums';

describe('canonical enum mirror', () => {
  it('SystemRole matches backend values', () => {
    expect(SystemRole.TEACHER).toBe('TEACHER');
    expect(Object.values(SystemRole)).toContain('DEO');
    expect(Object.values(SystemRole)).toHaveLength(10);
  });

  it('AttendanceStatus includes the five recorded states', () => {
    expect(Object.values(AttendanceStatus)).toEqual([
      'PRESENT',
      'ABSENT',
      'LATE',
      'EXCUSED',
      'SICK',
    ]);
  });

  it('EnrollmentStatus / GradeStatus / Gender / InstitutionLevel expose expected members', () => {
    expect(EnrollmentStatus.ACTIVE).toBe('ACTIVE');
    expect(GradeStatus.PUBLISHED).toBe('PUBLISHED');
    expect(Gender.FEMALE).toBe('FEMALE');
    expect(InstitutionLevel.SECONDARY).toBe('SECONDARY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/types/src/enums.test.ts`
Expected: FAIL — `./enums` not found.

- [ ] **Step 3: Create the enum mirror**

`packages/types/src/enums.ts` (canonical source: backend `@nemis/types` `enums.ts` + `apps/Server/prisma/schema.prisma`; keep values identical):

```ts
/**
 * Canonical business enums mirrored from the production backend
 * (`@nemis/types` enums.ts / prisma schema). The backend is the single source of
 * truth; this file is a hand-synced copy because the desktop is a separate pnpm
 * workspace. Values MUST stay identical. See Phase 4 spec §A.4 / recommendation D.3.
 */

export const SystemRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MINISTRY_ADMIN: 'MINISTRY_ADMIN',
  COUNTY_ADMIN: 'COUNTY_ADMIN',
  DEO: 'DEO',
  INSTITUTION_ADMIN: 'INSTITUTION_ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  DATA_OFFICER: 'DATA_OFFICER',
  VIEWER: 'VIEWER',
  PARENT: 'PARENT',
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];

export const Status = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const InstitutionType = {
  SCHOOL: 'SCHOOL',
  TVET: 'TVET',
  UNIVERSITY: 'UNIVERSITY',
} as const;
export type InstitutionType = (typeof InstitutionType)[keyof typeof InstitutionType];

export const OwnershipType = {
  GOVERNMENT: 'GOVERNMENT',
  PRIVATE: 'PRIVATE',
  COMMUNITY: 'COMMUNITY',
  NGO: 'NGO',
  MISSION: 'MISSION',
} as const;
export type OwnershipType = (typeof OwnershipType)[keyof typeof OwnershipType];

export const AccessMode = {
  VEHICLE: 'VEHICLE',
  BIKE: 'BIKE',
  FOOT: 'FOOT',
} as const;
export type AccessMode = (typeof AccessMode)[keyof typeof AccessMode];

export const InstitutionLevel = {
  PRE_PRIMARY: 'PRE_PRIMARY',
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
  CERTIFICATE: 'CERTIFICATE',
  DIPLOMA: 'DIPLOMA',
  UNDERGRADUATE: 'UNDERGRADUATE',
  POSTGRADUATE: 'POSTGRADUATE',
} as const;
export type InstitutionLevel = (typeof InstitutionLevel)[keyof typeof InstitutionLevel];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const GradeLevel = {
  KG: 'KG',
  K1: 'K1',
  K2: 'K2',
  GRADE_1: 'GRADE_1',
  GRADE_2: 'GRADE_2',
  GRADE_3: 'GRADE_3',
  GRADE_4: 'GRADE_4',
  GRADE_5: 'GRADE_5',
  GRADE_6: 'GRADE_6',
  GRADE_7: 'GRADE_7',
  GRADE_8: 'GRADE_8',
  GRADE_9: 'GRADE_9',
  GRADE_10: 'GRADE_10',
  GRADE_11: 'GRADE_11',
  GRADE_12: 'GRADE_12',
} as const;
export type GradeLevel = (typeof GradeLevel)[keyof typeof GradeLevel];

export const EnrollmentStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  WITHDRAWN: 'WITHDRAWN',
  TRANSFERRED: 'TRANSFERRED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
  EXCUSED: 'EXCUSED',
  SICK: 'SICK',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const AssessmentType = {
  EXAM: 'EXAM',
  TEST: 'TEST',
  QUIZ: 'QUIZ',
  ASSIGNMENT: 'ASSIGNMENT',
  PROJECT: 'PROJECT',
  PRACTICAL: 'PRACTICAL',
} as const;
export type AssessmentType = (typeof AssessmentType)[keyof typeof AssessmentType];

export const GradeStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  LOCKED: 'LOCKED',
} as const;
export type GradeStatus = (typeof GradeStatus)[keyof typeof GradeStatus];

export const GradeAuditAction = {
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  PUBLISHED: 'PUBLISHED',
  UNPUBLISHED: 'UNPUBLISHED',
  LOCKED: 'LOCKED',
  UNLOCKED: 'UNLOCKED',
  ADMIN_OVERRIDE: 'ADMIN_OVERRIDE',
  DELETED: 'DELETED',
} as const;
export type GradeAuditAction = (typeof GradeAuditAction)[keyof typeof GradeAuditAction];

export const PeriodType = {
  REGULAR_PERIOD: 'REGULAR_PERIOD',
  MIDTERM_EXAM: 'MIDTERM_EXAM',
  FINAL_EXAM: 'FINAL_EXAM',
} as const;
export type PeriodType = (typeof PeriodType)[keyof typeof PeriodType];

export const WindowStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PUBLISHED: 'PUBLISHED',
} as const;
export type WindowStatus = (typeof WindowStatus)[keyof typeof WindowStatus];

export const StaffPosition = {
  PRINCIPAL: 'PRINCIPAL',
  VICE_PRINCIPAL: 'VICE_PRINCIPAL',
  HEAD_OF_DEPARTMENT: 'HEAD_OF_DEPARTMENT',
  TEACHER: 'TEACHER',
  ASSISTANT_TEACHER: 'ASSISTANT_TEACHER',
  LIBRARIAN: 'LIBRARIAN',
  COUNSELOR: 'COUNSELOR',
  ADMINISTRATIVE_STAFF: 'ADMINISTRATIVE_STAFF',
  SUPPORT_STAFF: 'SUPPORT_STAFF',
} as const;
export type StaffPosition = (typeof StaffPosition)[keyof typeof StaffPosition];

export const EmploymentType = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACT',
  TEMPORARY: 'TEMPORARY',
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

export const DayOfWeek = {
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY',
  SATURDAY: 'SATURDAY',
  SUNDAY: 'SUNDAY',
} as const;
export type DayOfWeek = (typeof DayOfWeek)[keyof typeof DayOfWeek];
```

- [ ] **Step 4: Export from the types barrel**

Modify `packages/types/src/index.ts` to add (keep existing lines):

```ts
export * from './enums';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/types/src/enums.test.ts`
Expected: PASS (all assertions, including the 10-member `SystemRole` length and 5-member `AttendanceStatus` order).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/types typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/enums.ts packages/types/src/enums.test.ts packages/types/src/index.ts
git commit -m "feat(types): mirror canonical business enums from backend @nemis/types"
```

---

### Task 3: Domain exception hierarchy

**Files:**

- Create: `packages/domain/src/exceptions/domain-exception.ts`
- Create: `packages/domain/src/exceptions/index.ts`
- Create: `packages/domain/src/exceptions/exceptions.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `abstract class DomainException extends Error { readonly code: string }`
  - `class BusinessRuleViolationException extends DomainException` (code `BUSINESS_RULE_VIOLATION`)
  - `class EntityValidationException extends DomainException { readonly issues: ValidationIssue[] }` (code `ENTITY_VALIDATION`)
  - `class InvalidStateException extends DomainException` (code `INVALID_STATE`)
  - `class InvalidValueObjectException extends DomainException` (code `INVALID_VALUE_OBJECT`)
  - `interface ValidationIssue { field: string; message: string }`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/exceptions/exceptions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BusinessRuleViolationException,
  DomainException,
  EntityValidationException,
  InvalidStateException,
  InvalidValueObjectException,
} from './index';

describe('domain exceptions', () => {
  it('each subclass carries a stable code and its own name', () => {
    const rule = new BusinessRuleViolationException('enrollment closed');
    expect(rule.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(rule.name).toBe('BusinessRuleViolationException');
    expect(rule).toBeInstanceOf(DomainException);
    expect(rule).toBeInstanceOf(Error);

    expect(new InvalidStateException('x').code).toBe('INVALID_STATE');
    expect(new InvalidValueObjectException('x').code).toBe('INVALID_VALUE_OBJECT');
  });

  it('EntityValidationException carries field issues', () => {
    const err = new EntityValidationException('invalid student', [
      { field: 'admissionNumber', message: 'must not be empty' },
    ]);
    expect(err.code).toBe('ENTITY_VALIDATION');
    expect(err.issues).toEqual([{ field: 'admissionNumber', message: 'must not be empty' }]);
  });

  it('preserves cause when provided', () => {
    const cause = new Error('root');
    const err = new InvalidValueObjectException('bad email', { cause });
    expect(err.cause).toBe(cause);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/exceptions/exceptions.test.ts`
Expected: FAIL — `./index` not found.

- [ ] **Step 3: Implement the exceptions**

`packages/domain/src/exceptions/domain-exception.ts`:

```ts
export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Base for every domain-layer error. Carries a stable `code` (mirrors the shape of
 * the infra `ApplicationError` so a future IPC adapter can map codes) but does NOT
 * import infrastructure — the domain must stay dependency-free.
 */
export abstract class DomainException extends Error {
  readonly code: string;

  protected constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class BusinessRuleViolationException extends DomainException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('BUSINESS_RULE_VIOLATION', message, options);
  }
}

export class InvalidStateException extends DomainException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('INVALID_STATE', message, options);
  }
}

export class InvalidValueObjectException extends DomainException {
  constructor(message: string, options?: { cause?: unknown }) {
    super('INVALID_VALUE_OBJECT', message, options);
  }
}

export class EntityValidationException extends DomainException {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = [], options?: { cause?: unknown }) {
    super('ENTITY_VALIDATION', message, options);
    this.issues = issues;
  }
}
```

`packages/domain/src/exceptions/index.ts`:

```ts
export * from './domain-exception';
```

- [ ] **Step 4: Re-export from the package barrel**

Modify `packages/domain/src/index.ts`:

```ts
export * from './exceptions';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/exceptions/exceptions.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/exceptions packages/domain/src/index.ts
git commit -m "feat(domain): add domain exception hierarchy"
```

---

### Task 4: Kernel — identifier, Entity, AggregateRoot, DomainEvent, Specification

**Files:**

- Create: `packages/domain/src/core/identifier.ts`
- Create: `packages/domain/src/core/entity.ts`
- Create: `packages/domain/src/core/aggregate-root.ts`
- Create: `packages/domain/src/core/domain-event.ts`
- Create: `packages/domain/src/core/specification.ts`
- Create: `packages/domain/src/core/kernel.test.ts`
- Create: `packages/domain/src/core/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: nothing (exceptions not needed here).
- Produces:
  - `type EntityId<B extends string> = string & { readonly __brand: B }`
  - `function isUuid(value: string): boolean`
  - `abstract class Entity<TId extends string> { readonly id: TId; equals(o?): boolean }`
  - `interface AggregateMetadata { version: number; updatedAt: string; lastModifiedBy?: string }`
  - `abstract class AggregateRoot<TId extends string> extends Entity<TId>` with `get version`, `get updatedAt`, `get lastModifiedBy`, `protected addEvent(e)`, `pullDomainEvents(): DomainEvent[]`, `protected touch(by?, at?)`
  - `interface DomainEvent { readonly name: string; readonly aggregateId: string; readonly occurredAt: string }`
  - `abstract class Specification<T> { abstract isSatisfiedBy(c: T): boolean; and/or/not }`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/core/kernel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AggregateRoot } from './aggregate-root';
import type { AggregateMetadata } from './aggregate-root';
import { Entity } from './entity';
import type { DomainEvent } from './domain-event';
import { isUuid } from './identifier';
import { Specification } from './specification';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

class Widget extends Entity<string> {
  constructor(id: string) {
    super(id);
  }
}

interface CounterEvent extends DomainEvent {
  readonly name: 'Counted';
}

class Counter extends AggregateRoot<string> {
  constructor(id: string, meta: AggregateMetadata) {
    super(id, meta);
  }
  bump(by: string): void {
    this.touch(by, '2026-07-17T00:00:00.000Z');
    const event: CounterEvent = {
      name: 'Counted',
      aggregateId: this.id,
      occurredAt: '2026-07-17T00:00:00.000Z',
    };
    this.addEvent(event);
  }
}

class AlwaysTrue extends Specification<number> {
  isSatisfiedBy(): boolean {
    return true;
  }
}
class GreaterThan extends Specification<number> {
  constructor(private readonly min: number) {
    super();
  }
  isSatisfiedBy(c: number): boolean {
    return c > this.min;
  }
}

describe('isUuid', () => {
  it('accepts a valid uuid and rejects junk', () => {
    expect(isUuid(VALID_UUID)).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});

describe('Entity', () => {
  it('is equal by id and type, not reference', () => {
    expect(new Widget('a').equals(new Widget('a'))).toBe(true);
    expect(new Widget('a').equals(new Widget('b'))).toBe(false);
    expect(new Widget('a').equals(undefined)).toBe(false);
  });
});

describe('AggregateRoot', () => {
  it('touch bumps version and updatedAt; events drain once', () => {
    const c = new Counter('id', { version: 1, updatedAt: '2026-01-01T00:00:00.000Z' });
    c.bump('user-1');
    expect(c.version).toBe(2);
    expect(c.updatedAt).toBe('2026-07-17T00:00:00.000Z');
    expect(c.lastModifiedBy).toBe('user-1');

    const first = c.pullDomainEvents();
    expect(first).toHaveLength(1);
    expect(first[0]?.name).toBe('Counted');
    expect(c.pullDomainEvents()).toHaveLength(0);
  });
});

describe('Specification', () => {
  it('composes with and/or/not', () => {
    const gt5 = new GreaterThan(5);
    expect(gt5.and(new AlwaysTrue()).isSatisfiedBy(6)).toBe(true);
    expect(gt5.and(new AlwaysTrue()).isSatisfiedBy(4)).toBe(false);
    expect(gt5.or(new AlwaysTrue()).isSatisfiedBy(4)).toBe(true);
    expect(gt5.not().isSatisfiedBy(4)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/core/kernel.test.ts`
Expected: FAIL — modules under `./core` not found.

- [ ] **Step 3: Implement the kernel**

`packages/domain/src/core/identifier.ts`:

```ts
/** Branded id type so a StudentId cannot be passed where a ClassId is expected. */
export type EntityId<B extends string> = string & { readonly __brand: B };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
```

`packages/domain/src/core/entity.ts`:

```ts
export abstract class Entity<TId extends string> {
  readonly id: TId;

  protected constructor(id: TId) {
    this.id = id;
  }

  equals(other?: Entity<TId>): boolean {
    if (!other) return false;
    if (this === other) return true;
    if (this.constructor !== other.constructor) return false;
    return this.id === other.id;
  }
}
```

`packages/domain/src/core/domain-event.ts`:

```ts
/** Immutable record of something that happened to an aggregate. Definition only —
 * the domain never dispatches events. Callers drain via pullDomainEvents(). */
export interface DomainEvent {
  readonly name: string;
  readonly aggregateId: string;
  readonly occurredAt: string; // ISO-8601 UTC
}
```

`packages/domain/src/core/aggregate-root.ts`:

```ts
import { Entity } from './entity';
import type { DomainEvent } from './domain-event';

/** Concurrency metadata used by the sync/conflict layer. `deviceId` is intentionally
 * NOT here — it is infrastructure identity assigned at the sync boundary. */
export interface AggregateMetadata {
  version: number;
  updatedAt: string; // ISO-8601 UTC
  lastModifiedBy?: string;
}

export abstract class AggregateRoot<TId extends string> extends Entity<TId> {
  #events: DomainEvent[] = [];
  #metadata: AggregateMetadata;

  protected constructor(id: TId, metadata: AggregateMetadata) {
    super(id);
    this.#metadata = { ...metadata };
  }

  get version(): number {
    return this.#metadata.version;
  }

  get updatedAt(): string {
    return this.#metadata.updatedAt;
  }

  get lastModifiedBy(): string | undefined {
    return this.#metadata.lastModifiedBy;
  }

  protected addEvent(event: DomainEvent): void {
    this.#events.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const drained = this.#events;
    this.#events = [];
    return drained;
  }

  /** Advance concurrency metadata after a state change. `at` is injected (no clock
   * side-effect in the domain); callers pass an ISO timestamp. */
  protected touch(by?: string, at: string = new Date().toISOString()): void {
    this.#metadata = {
      version: this.#metadata.version + 1,
      updatedAt: at,
      lastModifiedBy: by ?? this.#metadata.lastModifiedBy,
    };
  }
}
```

`packages/domain/src/core/specification.ts`:

```ts
/** Reusable business rule. Compose with and/or/not. No side effects, no workflows. */
export abstract class Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;

  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }

  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }

  not(): Specification<T> {
    return new NotSpecification(this);
  }
}

class AndSpecification<T> extends Specification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }
  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate);
  }
}

class OrSpecification<T> extends Specification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }
  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate);
  }
}

class NotSpecification<T> extends Specification<T> {
  constructor(private readonly wrapped: Specification<T>) {
    super();
  }
  isSatisfiedBy(candidate: T): boolean {
    return !this.wrapped.isSatisfiedBy(candidate);
  }
}
```

`packages/domain/src/core/index.ts`:

```ts
export * from './identifier';
export * from './entity';
export * from './aggregate-root';
export * from './domain-event';
export * from './specification';
```

- [ ] **Step 4: Re-export from the package barrel**

Modify `packages/domain/src/index.ts` (add above the exceptions line so core is first):

```ts
export * from './core';
export * from './exceptions';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/core/kernel.test.ts`
Expected: PASS (note `first[0]?.name` — `noUncheckedIndexedAccess` requires the optional chain).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/core packages/domain/src/index.ts
git commit -m "feat(domain): add kernel (entity, aggregate root, event, specification)"
```

---

### Task 5: Kernel — ValueObject base + guard helpers

**Files:**

- Create: `packages/domain/src/core/value-object.ts`
- Create: `packages/domain/src/core/guard.ts`
- Create: `packages/domain/src/core/value-object.test.ts`
- Modify: `packages/domain/src/core/index.ts`

**Interfaces:**

- Consumes: `EntityValidationException`, `InvalidValueObjectException` from `../exceptions`.
- Produces:
  - `abstract class ValueObject<TProps extends object> { protected readonly props: Readonly<TProps>; equals(o?): boolean }`
  - `const guard` with: `againstEmpty(value, field): string`, `range(value, min, max, field): number`, `notFuture(iso, field): string`, `iso(value, field): string`. All throw `InvalidValueObjectException` on failure.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/core/value-object.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValueObject } from './value-object';
import { guard } from './guard';
import { InvalidValueObjectException } from '../exceptions';

interface CodeProps {
  value: string;
}
class Code extends ValueObject<CodeProps> {
  constructor(value: string) {
    super({ value });
  }
  get value(): string {
    return this.props.value;
  }
}

describe('ValueObject', () => {
  it('is frozen and equal by structure', () => {
    const a = new Code('X');
    expect(Object.isFrozen((a as unknown as { props: object }).props)).toBe(true);
    expect(a.equals(new Code('X'))).toBe(true);
    expect(a.equals(new Code('Y'))).toBe(false);
    expect(a.equals(undefined)).toBe(false);
  });
});

describe('guard', () => {
  it('againstEmpty rejects blank and returns trimmed value', () => {
    expect(guard.againstEmpty('  hi ', 'name')).toBe('hi');
    expect(() => guard.againstEmpty('   ', 'name')).toThrow(InvalidValueObjectException);
  });

  it('range enforces inclusive bounds', () => {
    expect(guard.range(5, 0, 10, 'score')).toBe(5);
    expect(() => guard.range(11, 0, 10, 'score')).toThrow(InvalidValueObjectException);
  });

  it('iso validates a timestamp and notFuture rejects tomorrow', () => {
    expect(guard.iso('2026-07-17T00:00:00.000Z', 'date')).toBe('2026-07-17T00:00:00.000Z');
    expect(() => guard.iso('nonsense', 'date')).toThrow(InvalidValueObjectException);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    expect(() => guard.notFuture(tomorrow, 'date')).toThrow(InvalidValueObjectException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/core/value-object.test.ts`
Expected: FAIL — `./value-object` / `./guard` not found.

- [ ] **Step 3: Implement value-object and guard**

`packages/domain/src/core/value-object.ts`:

```ts
export abstract class ValueObject<TProps extends object> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  /** Structural equality. Props are small, JSON-serialisable records built the same
   * way each time, so key order is stable and JSON comparison is sufficient. */
  equals(other?: ValueObject<TProps>): boolean {
    if (!other) return false;
    if (this === other) return true;
    if (this.constructor !== other.constructor) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
```

`packages/domain/src/core/guard.ts`:

```ts
import { InvalidValueObjectException } from '../exceptions';

function fail(message: string): never {
  throw new InvalidValueObjectException(message);
}

export const guard = {
  againstEmpty(value: string, field: string): string {
    const trimmed = (value ?? '').trim();
    if (trimmed.length === 0) fail(`${field} must not be empty`);
    return trimmed;
  },

  range(value: number, min: number, max: number, field: string): number {
    if (Number.isNaN(value) || value < min || value > max) {
      fail(`${field} must be between ${min} and ${max}`);
    }
    return value;
  },

  iso(value: string, field: string): string {
    const time = Date.parse(value);
    if (Number.isNaN(time)) fail(`${field} must be a valid ISO-8601 date`);
    return value;
  },

  notFuture(value: string, field: string): string {
    const time = Date.parse(value);
    if (Number.isNaN(time)) fail(`${field} must be a valid ISO-8601 date`);
    if (time > Date.now()) fail(`${field} must not be in the future`);
    return value;
  },
};
```

- [ ] **Step 4: Extend the core barrel**

Modify `packages/domain/src/core/index.ts` (append):

```ts
export * from './value-object';
export * from './guard';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/core/value-object.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/core
git commit -m "feat(domain): add ValueObject base and guard helpers"
```

---

### Task 6: Cross-cutting value objects — identity set (PersonName, EmailAddress, PhoneNumber, NationalId)

**Files:**

- Create: `packages/domain/src/value-objects/person-name.ts`
- Create: `packages/domain/src/value-objects/email-address.ts`
- Create: `packages/domain/src/value-objects/phone-number.ts`
- Create: `packages/domain/src/value-objects/national-id.ts`
- Create: `packages/domain/src/value-objects/identity-vos.test.ts`
- Create: `packages/domain/src/value-objects/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `ValueObject`, `guard` from `../core`; `InvalidValueObjectException` from `../exceptions`.
- Produces:
  - `PersonName.create({firstName, lastName, middleName?}): PersonName` with getters `firstName`, `lastName`, `middleName`, `full`.
  - `EmailAddress.create(value): EmailAddress` with getter `value` (lowercased).
  - `PhoneNumber.create(value): PhoneNumber` with getter `value`.
  - `NationalId.create(value): NationalId` with getter `value`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/value-objects/identity-vos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PersonName } from './person-name';
import { EmailAddress } from './email-address';
import { PhoneNumber } from './phone-number';
import { NationalId } from './national-id';
import { InvalidValueObjectException } from '../exceptions';

describe('PersonName', () => {
  it('builds full name and trims parts', () => {
    const name = PersonName.create({ firstName: ' Ama ', lastName: 'Kollie' });
    expect(name.firstName).toBe('Ama');
    expect(name.full).toBe('Ama Kollie');
    const withMiddle = PersonName.create({ firstName: 'Ama', middleName: 'B', lastName: 'Kollie' });
    expect(withMiddle.full).toBe('Ama B Kollie');
  });

  it('rejects empty first or last name', () => {
    expect(() => PersonName.create({ firstName: '', lastName: 'K' })).toThrow(
      InvalidValueObjectException,
    );
  });
});

describe('EmailAddress', () => {
  it('lowercases and validates', () => {
    expect(EmailAddress.create('Admin@School.LR').value).toBe('admin@school.lr');
    expect(() => EmailAddress.create('nope')).toThrow(InvalidValueObjectException);
  });
});

describe('PhoneNumber', () => {
  it('accepts digits with optional +, rejects letters', () => {
    expect(PhoneNumber.create('+231770000000').value).toBe('+231770000000');
    expect(() => PhoneNumber.create('call-me')).toThrow(InvalidValueObjectException);
  });
});

describe('NationalId', () => {
  it('trims and rejects empty', () => {
    expect(NationalId.create(' LR-123 ').value).toBe('LR-123');
    expect(() => NationalId.create('  ')).toThrow(InvalidValueObjectException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/value-objects/identity-vos.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the value objects**

`packages/domain/src/value-objects/person-name.ts`:

```ts
import { ValueObject, guard } from '../core';

interface PersonNameProps {
  firstName: string;
  lastName: string;
  middleName?: string;
}

export class PersonName extends ValueObject<PersonNameProps> {
  private constructor(props: PersonNameProps) {
    super(props);
  }

  static create(input: PersonNameProps): PersonName {
    const middle = input.middleName?.trim();
    return new PersonName({
      firstName: guard.againstEmpty(input.firstName, 'firstName'),
      lastName: guard.againstEmpty(input.lastName, 'lastName'),
      middleName: middle && middle.length > 0 ? middle : undefined,
    });
  }

  get firstName(): string {
    return this.props.firstName;
  }
  get lastName(): string {
    return this.props.lastName;
  }
  get middleName(): string | undefined {
    return this.props.middleName;
  }
  get full(): string {
    return [this.props.firstName, this.props.middleName, this.props.lastName]
      .filter((p): p is string => !!p)
      .join(' ');
  }
}
```

`packages/domain/src/value-objects/email-address.ts`:

```ts
import { ValueObject } from '../core';
import { InvalidValueObjectException } from '../exceptions';

interface EmailProps {
  value: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailAddress extends ValueObject<EmailProps> {
  private constructor(props: EmailProps) {
    super(props);
  }

  static create(value: string): EmailAddress {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      throw new InvalidValueObjectException(`Invalid email address: "${value}"`);
    }
    return new EmailAddress({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }
}
```

`packages/domain/src/value-objects/phone-number.ts`:

```ts
import { ValueObject } from '../core';
import { InvalidValueObjectException } from '../exceptions';

interface PhoneProps {
  value: string;
}

const PHONE_RE = /^\+?[0-9]{7,15}$/;

export class PhoneNumber extends ValueObject<PhoneProps> {
  private constructor(props: PhoneProps) {
    super(props);
  }

  static create(value: string): PhoneNumber {
    const normalized = (value ?? '').replace(/[\s-]/g, '');
    if (!PHONE_RE.test(normalized)) {
      throw new InvalidValueObjectException(`Invalid phone number: "${value}"`);
    }
    return new PhoneNumber({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }
}
```

`packages/domain/src/value-objects/national-id.ts`:

```ts
import { ValueObject, guard } from '../core';

interface NationalIdProps {
  value: string;
}

export class NationalId extends ValueObject<NationalIdProps> {
  private constructor(props: NationalIdProps) {
    super(props);
  }

  static create(value: string): NationalId {
    return new NationalId({ value: guard.againstEmpty(value, 'nationalId') });
  }

  get value(): string {
    return this.props.value;
  }
}
```

- [ ] **Step 4: Create the value-objects barrel and export from package**

`packages/domain/src/value-objects/index.ts`:

```ts
export * from './person-name';
export * from './email-address';
export * from './phone-number';
export * from './national-id';
```

Modify `packages/domain/src/index.ts` (append):

```ts
export * from './value-objects';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/value-objects/identity-vos.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/value-objects packages/domain/src/index.ts
git commit -m "feat(domain): add identity value objects (name, email, phone, national id)"
```

---

### Task 7: Cross-cutting value objects — place & time set (Address, GpsLocation, DateRange, DateOfBirth)

**Files:**

- Create: `packages/domain/src/value-objects/address.ts`
- Create: `packages/domain/src/value-objects/gps-location.ts`
- Create: `packages/domain/src/value-objects/date-range.ts`
- Create: `packages/domain/src/value-objects/date-of-birth.ts`
- Create: `packages/domain/src/value-objects/place-time-vos.test.ts`
- Modify: `packages/domain/src/value-objects/index.ts`

**Interfaces:**

- Consumes: `ValueObject`, `guard` from `../core`; `InvalidValueObjectException` from `../exceptions`.
- Produces:
  - `Address.create({street?, communityTown?}): Address` — getters `street`, `communityTown`, `isEmpty`.
  - `GpsLocation.create({latitude, longitude}): GpsLocation` — getters `latitude`, `longitude`; validates lat ∈ [-90,90], lng ∈ [-180,180].
  - `DateRange.create({start, end}): DateRange` — ISO strings; getters `start`, `end`; `contains(iso): boolean`; invariant start ≤ end.
  - `DateOfBirth.create(iso): DateOfBirth` — getter `value`; not in future; `ageOn(iso): number`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/value-objects/place-time-vos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Address } from './address';
import { GpsLocation } from './gps-location';
import { DateRange } from './date-range';
import { DateOfBirth } from './date-of-birth';
import { InvalidValueObjectException } from '../exceptions';

describe('Address', () => {
  it('reports empty when no parts', () => {
    expect(Address.create({}).isEmpty).toBe(true);
    expect(Address.create({ communityTown: 'Gbarnga' }).isEmpty).toBe(false);
  });
});

describe('GpsLocation', () => {
  it('validates coordinate bounds', () => {
    const loc = GpsLocation.create({ latitude: 6.3, longitude: -10.8 });
    expect(loc.latitude).toBe(6.3);
    expect(() => GpsLocation.create({ latitude: 200, longitude: 0 })).toThrow(
      InvalidValueObjectException,
    );
  });
});

describe('DateRange', () => {
  it('enforces start <= end and contains()', () => {
    const range = DateRange.create({ start: '2026-01-01', end: '2026-12-31' });
    expect(range.contains('2026-06-01')).toBe(true);
    expect(range.contains('2027-01-01')).toBe(false);
    expect(() => DateRange.create({ start: '2026-12-31', end: '2026-01-01' })).toThrow(
      InvalidValueObjectException,
    );
  });
});

describe('DateOfBirth', () => {
  it('computes age and rejects future dates', () => {
    const dob = DateOfBirth.create('2010-07-17');
    expect(dob.ageOn('2026-07-17')).toBe(16);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    expect(() => DateOfBirth.create(tomorrow)).toThrow(InvalidValueObjectException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/value-objects/place-time-vos.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the value objects**

`packages/domain/src/value-objects/address.ts`:

```ts
import { ValueObject } from '../core';

interface AddressProps {
  street?: string;
  communityTown?: string;
}

export class Address extends ValueObject<AddressProps> {
  private constructor(props: AddressProps) {
    super(props);
  }

  static create(input: AddressProps): Address {
    const street = input.street?.trim();
    const communityTown = input.communityTown?.trim();
    return new Address({
      street: street && street.length > 0 ? street : undefined,
      communityTown: communityTown && communityTown.length > 0 ? communityTown : undefined,
    });
  }

  get street(): string | undefined {
    return this.props.street;
  }
  get communityTown(): string | undefined {
    return this.props.communityTown;
  }
  get isEmpty(): boolean {
    return !this.props.street && !this.props.communityTown;
  }
}
```

`packages/domain/src/value-objects/gps-location.ts`:

```ts
import { ValueObject, guard } from '../core';

interface GpsProps {
  latitude: number;
  longitude: number;
}

export class GpsLocation extends ValueObject<GpsProps> {
  private constructor(props: GpsProps) {
    super(props);
  }

  static create(input: GpsProps): GpsLocation {
    return new GpsLocation({
      latitude: guard.range(input.latitude, -90, 90, 'latitude'),
      longitude: guard.range(input.longitude, -180, 180, 'longitude'),
    });
  }

  get latitude(): number {
    return this.props.latitude;
  }
  get longitude(): number {
    return this.props.longitude;
  }
}
```

`packages/domain/src/value-objects/date-range.ts`:

```ts
import { ValueObject, guard } from '../core';
import { InvalidValueObjectException } from '../exceptions';

interface DateRangeProps {
  start: string;
  end: string;
}

export class DateRange extends ValueObject<DateRangeProps> {
  private constructor(props: DateRangeProps) {
    super(props);
  }

  static create(input: DateRangeProps): DateRange {
    const start = guard.iso(input.start, 'start');
    const end = guard.iso(input.end, 'end');
    if (Date.parse(start) > Date.parse(end)) {
      throw new InvalidValueObjectException('DateRange start must not be after end');
    }
    return new DateRange({ start, end });
  }

  get start(): string {
    return this.props.start;
  }
  get end(): string {
    return this.props.end;
  }

  contains(iso: string): boolean {
    const t = Date.parse(iso);
    return t >= Date.parse(this.props.start) && t <= Date.parse(this.props.end);
  }
}
```

`packages/domain/src/value-objects/date-of-birth.ts`:

```ts
import { ValueObject, guard } from '../core';

interface DobProps {
  value: string;
}

export class DateOfBirth extends ValueObject<DobProps> {
  private constructor(props: DobProps) {
    super(props);
  }

  static create(value: string): DateOfBirth {
    return new DateOfBirth({ value: guard.notFuture(value, 'dateOfBirth') });
  }

  get value(): string {
    return this.props.value;
  }

  /** Whole years old on the given ISO date. */
  ageOn(iso: string): number {
    const birth = new Date(this.props.value);
    const at = new Date(iso);
    let age = at.getUTCFullYear() - birth.getUTCFullYear();
    const beforeBirthday =
      at.getUTCMonth() < birth.getUTCMonth() ||
      (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age;
  }
}
```

- [ ] **Step 4: Extend the value-objects barrel**

Modify `packages/domain/src/value-objects/index.ts` (append):

```ts
export * from './address';
export * from './gps-location';
export * from './date-range';
export * from './date-of-birth';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/value-objects/place-time-vos.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/value-objects
git commit -m "feat(domain): add place & time value objects (address, gps, date range, dob)"
```

---

### Task 8: Cross-cutting value objects — quantitative set (Money, Percentage, Marks)

**Files:**

- Create: `packages/domain/src/value-objects/money.ts`
- Create: `packages/domain/src/value-objects/percentage.ts`
- Create: `packages/domain/src/value-objects/marks.ts`
- Create: `packages/domain/src/value-objects/quantitative-vos.test.ts`
- Modify: `packages/domain/src/value-objects/index.ts`

**Interfaces:**

- Consumes: `ValueObject`, `guard` from `../core`; `InvalidValueObjectException` from `../exceptions`.
- Produces:
  - `Money.create({amount, currency?}): Money` — default currency `'LRD'`; getters `amount`, `currency`; `add(other): Money` (same-currency guard).
  - `Percentage.create(value): Percentage` — 0–100; getter `value`.
  - `Marks.create({obtained, total}): Marks` — obtained ≤ total, both ≥ 0; getters `obtained`, `total`, `percentage: Percentage`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/value-objects/quantitative-vos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Money } from './money';
import { Percentage } from './percentage';
import { Marks } from './marks';
import { InvalidValueObjectException } from '../exceptions';

describe('Money', () => {
  it('defaults to LRD and adds same currency', () => {
    const a = Money.create({ amount: 100 });
    expect(a.currency).toBe('LRD');
    expect(a.add(Money.create({ amount: 50 })).amount).toBe(150);
  });

  it('rejects negative amounts and cross-currency addition', () => {
    expect(() => Money.create({ amount: -1 })).toThrow(InvalidValueObjectException);
    expect(() =>
      Money.create({ amount: 1, currency: 'USD' }).add(Money.create({ amount: 1 })),
    ).toThrow(InvalidValueObjectException);
  });
});

describe('Percentage', () => {
  it('accepts 0-100 and rejects out of range', () => {
    expect(Percentage.create(72).value).toBe(72);
    expect(() => Percentage.create(101)).toThrow(InvalidValueObjectException);
  });
});

describe('Marks', () => {
  it('computes percentage and rejects obtained > total', () => {
    const marks = Marks.create({ obtained: 45, total: 60 });
    expect(marks.percentage.value).toBe(75);
    expect(() => Marks.create({ obtained: 70, total: 60 })).toThrow(InvalidValueObjectException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/value-objects/quantitative-vos.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the value objects**

`packages/domain/src/value-objects/money.ts`:

```ts
import { ValueObject } from '../core';
import { InvalidValueObjectException } from '../exceptions';

interface MoneyProps {
  amount: number;
  currency: string;
}

export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  static create(input: { amount: number; currency?: string }): Money {
    if (Number.isNaN(input.amount) || input.amount < 0) {
      throw new InvalidValueObjectException('Money amount must be a non-negative number');
    }
    return new Money({ amount: input.amount, currency: input.currency ?? 'LRD' });
  }

  get amount(): number {
    return this.props.amount;
  }
  get currency(): string {
    return this.props.currency;
  }

  add(other: Money): Money {
    if (other.currency !== this.props.currency) {
      throw new InvalidValueObjectException(
        `Cannot add ${other.currency} to ${this.props.currency}`,
      );
    }
    return Money.create({
      amount: this.props.amount + other.amount,
      currency: this.props.currency,
    });
  }
}
```

`packages/domain/src/value-objects/percentage.ts`:

```ts
import { ValueObject, guard } from '../core';

interface PercentageProps {
  value: number;
}

export class Percentage extends ValueObject<PercentageProps> {
  private constructor(props: PercentageProps) {
    super(props);
  }

  static create(value: number): Percentage {
    return new Percentage({ value: guard.range(value, 0, 100, 'percentage') });
  }

  get value(): number {
    return this.props.value;
  }
}
```

`packages/domain/src/value-objects/marks.ts`:

```ts
import { ValueObject } from '../core';
import { InvalidValueObjectException } from '../exceptions';
import { Percentage } from './percentage';

interface MarksProps {
  obtained: number;
  total: number;
}

export class Marks extends ValueObject<MarksProps> {
  private constructor(props: MarksProps) {
    super(props);
  }

  static create(input: MarksProps): Marks {
    if (input.total <= 0) {
      throw new InvalidValueObjectException('Marks total must be greater than zero');
    }
    if (input.obtained < 0 || input.obtained > input.total) {
      throw new InvalidValueObjectException('Marks obtained must be between 0 and total');
    }
    return new Marks({ obtained: input.obtained, total: input.total });
  }

  get obtained(): number {
    return this.props.obtained;
  }
  get total(): number {
    return this.props.total;
  }
  get percentage(): Percentage {
    return Percentage.create((this.props.obtained / this.props.total) * 100);
  }
}
```

- [ ] **Step 4: Extend the value-objects barrel**

Modify `packages/domain/src/value-objects/index.ts` (append):

```ts
export * from './money';
export * from './percentage';
export * from './marks';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/value-objects/quantitative-vos.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/value-objects
git commit -m "feat(domain): add quantitative value objects (money, percentage, marks)"
```

---

### Task 9: Identity domain — User aggregate, UserOrganization, CanSyncEntity spec, UserCreated event

**Files:**

- Create: `packages/domain/src/identity/entities/user-organization.ts`
- Create: `packages/domain/src/identity/entities/user.ts`
- Create: `packages/domain/src/identity/events/user-created.ts`
- Create: `packages/domain/src/identity/specifications/can-sync-entity.ts`
- Create: `packages/domain/src/identity/identity.test.ts`
- Create: `packages/domain/src/identity/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `AggregateRoot`, `AggregateMetadata`, `Entity`, `Specification`, `EntityId` from `../core`; `PersonName`, `EmailAddress` from `../value-objects`; `SystemRole` from `@nemis-desktop/types`; `EntityValidationException` from `../exceptions`.
- Produces:
  - `type UserId = EntityId<'User'>`
  - `class UserOrganization extends Entity<string>` with `role: SystemRole`, `institutionId?`, `isActive`, `deactivate()`.
  - `class User extends AggregateRoot<UserId>` with `name: PersonName`, `email: EmailAddress`, `isActive`, `organizations: readonly UserOrganization[]`, static `create(...)`/`reconstitute(...)`, `deactivate(by, at)`, `hasRole(role): boolean`.
  - `interface UserCreatedEvent extends DomainEvent { name: 'UserCreated'; email: string }`
  - `class CanSyncEntity extends Specification<{ version: number; updatedAt: string }>`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/identity/identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';
import { User } from './entities/user';
import { UserOrganization } from './entities/user-organization';
import { CanSyncEntity } from './specifications/can-sync-entity';
import { EntityValidationException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

function newUser(): User {
  return User.create({
    id: 'user-1',
    firstName: 'Ama',
    lastName: 'Kollie',
    email: 'ama@moe.gov.lr',
    organizations: [
      UserOrganization.reconstitute({
        id: 'org-1',
        role: SystemRole.TEACHER,
        institutionId: 'inst-1',
        isActive: true,
      }),
    ],
    occurredAt: ISO,
  });
}

describe('User', () => {
  it('creates with a normalized email and emits UserCreated', () => {
    const user = newUser();
    expect(user.email.value).toBe('ama@moe.gov.lr');
    expect(user.name.full).toBe('Ama Kollie');
    expect(user.hasRole(SystemRole.TEACHER)).toBe(true);
    expect(user.hasRole(SystemRole.DEO)).toBe(false);

    const events = user.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('UserCreated');
  });

  it('deactivate flips isActive and bumps version', () => {
    const user = newUser();
    expect(user.version).toBe(1);
    user.deactivate('admin', ISO);
    expect(user.isActive).toBe(false);
    expect(user.version).toBe(2);
  });

  it('rejects reconstitute without organizations having roles', () => {
    expect(() =>
      User.create({
        id: 'u',
        firstName: '',
        lastName: 'x',
        email: 'a@b.co',
        organizations: [],
        occurredAt: ISO,
      }),
    ).toThrow(EntityValidationException);
  });
});

describe('CanSyncEntity', () => {
  it('requires version >= 1 and a valid updatedAt', () => {
    const spec = new CanSyncEntity();
    expect(spec.isSatisfiedBy({ version: 1, updatedAt: ISO })).toBe(true);
    expect(spec.isSatisfiedBy({ version: 0, updatedAt: ISO })).toBe(false);
    expect(spec.isSatisfiedBy({ version: 1, updatedAt: 'bad' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/identity/identity.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the identity domain**

`packages/domain/src/identity/entities/user-organization.ts`:

```ts
import { Entity } from '../../core';
import type { SystemRole } from '@nemis-desktop/types';

interface UserOrganizationProps {
  id: string;
  role: SystemRole;
  institutionId?: string;
  countyId?: string;
  districtId?: string;
  isActive: boolean;
}

export class UserOrganization extends Entity<string> {
  #props: UserOrganizationProps;

  private constructor(props: UserOrganizationProps) {
    super(props.id);
    this.#props = props;
  }

  static reconstitute(props: UserOrganizationProps): UserOrganization {
    return new UserOrganization(props);
  }

  get role(): SystemRole {
    return this.#props.role;
  }
  get institutionId(): string | undefined {
    return this.#props.institutionId;
  }
  get isActive(): boolean {
    return this.#props.isActive;
  }

  deactivate(): void {
    this.#props = { ...this.#props, isActive: false };
  }
}
```

`packages/domain/src/identity/events/user-created.ts`:

```ts
import type { DomainEvent } from '../../core';

export interface UserCreatedEvent extends DomainEvent {
  readonly name: 'UserCreated';
  readonly email: string;
}
```

`packages/domain/src/identity/entities/user.ts`:

```ts
import { AggregateRoot } from '../../core';
import type { EntityId } from '../../core';
import { EmailAddress, PersonName } from '../../value-objects';
import { EntityValidationException } from '../../exceptions';
import type { SystemRole } from '@nemis-desktop/types';
import { UserOrganization } from './user-organization';
import type { UserCreatedEvent } from '../events/user-created';

export type UserId = EntityId<'User'>;

interface UserState {
  name: PersonName;
  email: EmailAddress;
  isActive: boolean;
  organizations: UserOrganization[];
}

export interface CreateUserInput {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  organizations: UserOrganization[];
  occurredAt: string;
}

export interface ReconstituteUserInput {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  isActive: boolean;
  organizations: UserOrganization[];
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class User extends AggregateRoot<UserId> {
  #state: UserState;

  private constructor(
    id: UserId,
    state: UserState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateUserInput): User {
    if (input.organizations.length === 0) {
      throw new EntityValidationException('User must have at least one organization role', [
        { field: 'organizations', message: 'must not be empty' },
      ]);
    }
    const user = new User(
      input.id as UserId,
      {
        name: PersonName.create({
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
        }),
        email: EmailAddress.create(input.email),
        isActive: true,
        organizations: input.organizations,
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: UserCreatedEvent = {
      name: 'UserCreated',
      aggregateId: user.id,
      occurredAt: input.occurredAt,
      email: user.email.value,
    };
    user.addEvent(event);
    return user;
  }

  static reconstitute(input: ReconstituteUserInput): User {
    return new User(
      input.id as UserId,
      {
        name: PersonName.create({
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
        }),
        email: EmailAddress.create(input.email),
        isActive: input.isActive,
        organizations: input.organizations,
      },
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get name(): PersonName {
    return this.#state.name;
  }
  get email(): EmailAddress {
    return this.#state.email;
  }
  get isActive(): boolean {
    return this.#state.isActive;
  }
  get organizations(): readonly UserOrganization[] {
    return this.#state.organizations;
  }

  hasRole(role: SystemRole): boolean {
    return this.#state.organizations.some((o) => o.isActive && o.role === role);
  }

  deactivate(by: string, at: string): void {
    if (!this.#state.isActive) return;
    this.#state = { ...this.#state, isActive: false };
    this.touch(by, at);
  }
}
```

`packages/domain/src/identity/specifications/can-sync-entity.ts`:

```ts
import { Specification } from '../../core';

export interface SyncableSnapshot {
  version: number;
  updatedAt: string;
}

/** An entity may sync only when it carries valid concurrency metadata. */
export class CanSyncEntity extends Specification<SyncableSnapshot> {
  isSatisfiedBy(candidate: SyncableSnapshot): boolean {
    return candidate.version >= 1 && !Number.isNaN(Date.parse(candidate.updatedAt));
  }
}
```

`packages/domain/src/identity/index.ts`:

```ts
export * from './entities/user';
export * from './entities/user-organization';
export * from './events/user-created';
export * from './specifications/can-sync-entity';
```

- [ ] **Step 4: Re-export from the package barrel**

Modify `packages/domain/src/index.ts` (append):

```ts
export * from './identity';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/identity/identity.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/identity packages/domain/src/index.ts
git commit -m "feat(domain): add identity domain (User aggregate, org roles, sync spec)"
```

---

### Task 10: Institution domain — Institution aggregate, GradingConfig, SchoolCode VO, IsInstitutionApproved spec

**Files:**

- Create: `packages/domain/src/institution/value-objects/school-code.ts`
- Create: `packages/domain/src/institution/entities/grading-config.ts`
- Create: `packages/domain/src/institution/entities/institution.ts`
- Create: `packages/domain/src/institution/specifications/is-institution-approved.ts`
- Create: `packages/domain/src/institution/institution.test.ts`
- Create: `packages/domain/src/institution/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `AggregateRoot`, `Entity`, `EntityId`, `Specification`, `ValueObject`, `guard` from `../core`; `Address`, `GpsLocation` from `../value-objects`; `InstitutionType`, `OwnershipType`, `ApprovalStatus` from `@nemis-desktop/types`; exceptions.
- Produces:
  - `type InstitutionId = EntityId<'Institution'>`
  - `class SchoolCode` VO (getter `value`, uppercased, non-empty).
  - `class GradingConfig extends Entity<string>` (`maxMarks`, `passingMarks`, `requireAdminApproval`).
  - `class Institution extends AggregateRoot<InstitutionId>` with `code: SchoolCode`, `name`, `type`, `ownership`, `approvalStatus`, `location?: GpsLocation`, `address: Address`, `isApproved`, static `create`/`reconstitute`, `approve(by, at)`, `reject(reason, by, at)`.
  - `class IsInstitutionApproved extends Specification<{ approvalStatus: ApprovalStatus }>`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/institution/institution.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { Institution } from './entities/institution';
import { SchoolCode } from './value-objects/school-code';
import { IsInstitutionApproved } from './specifications/is-institution-approved';
import { InvalidStateException, InvalidValueObjectException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

function pending(): Institution {
  return Institution.create({
    id: 'inst-1',
    code: 'LR-MON-001',
    name: 'Monrovia Central High',
    type: InstitutionType.SCHOOL,
    ownership: OwnershipType.GOVERNMENT,
    countyId: 'county-1',
    occurredAt: ISO,
  });
}

describe('SchoolCode', () => {
  it('uppercases and rejects empty', () => {
    expect(SchoolCode.create('lr-mon-001').value).toBe('LR-MON-001');
    expect(() => SchoolCode.create('  ')).toThrow(InvalidValueObjectException);
  });
});

describe('Institution', () => {
  it('starts PENDING and approves', () => {
    const inst = pending();
    expect(inst.isApproved).toBe(false);
    inst.approve('ministry', ISO);
    expect(inst.approvalStatus).toBe(ApprovalStatus.APPROVED);
    expect(inst.isApproved).toBe(true);
    expect(inst.version).toBe(2);
  });

  it('cannot approve an already-approved institution', () => {
    const inst = pending();
    inst.approve('ministry', ISO);
    expect(() => inst.approve('ministry', ISO)).toThrow(InvalidStateException);
  });
});

describe('IsInstitutionApproved', () => {
  it('is satisfied only for APPROVED', () => {
    const spec = new IsInstitutionApproved();
    expect(spec.isSatisfiedBy({ approvalStatus: ApprovalStatus.APPROVED })).toBe(true);
    expect(spec.isSatisfiedBy({ approvalStatus: ApprovalStatus.PENDING })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/institution/institution.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the institution domain**

`packages/domain/src/institution/value-objects/school-code.ts`:

```ts
import { ValueObject, guard } from '../../core';

interface SchoolCodeProps {
  value: string;
}

export class SchoolCode extends ValueObject<SchoolCodeProps> {
  private constructor(props: SchoolCodeProps) {
    super(props);
  }

  static create(value: string): SchoolCode {
    return new SchoolCode({ value: guard.againstEmpty(value, 'schoolCode').toUpperCase() });
  }

  get value(): string {
    return this.props.value;
  }
}
```

`packages/domain/src/institution/entities/grading-config.ts`:

```ts
import { Entity } from '../../core';
import { EntityValidationException } from '../../exceptions';

interface GradingConfigProps {
  id: string;
  maxMarks: number;
  passingMarks: number;
  requireAdminApproval: boolean;
}

export class GradingConfig extends Entity<string> {
  #props: GradingConfigProps;

  private constructor(props: GradingConfigProps) {
    super(props.id);
    this.#props = props;
  }

  static reconstitute(props: GradingConfigProps): GradingConfig {
    if (props.passingMarks > props.maxMarks) {
      throw new EntityValidationException('passingMarks cannot exceed maxMarks', [
        { field: 'passingMarks', message: 'must be <= maxMarks' },
      ]);
    }
    return new GradingConfig(props);
  }

  get maxMarks(): number {
    return this.#props.maxMarks;
  }
  get passingMarks(): number {
    return this.#props.passingMarks;
  }
  get requireAdminApproval(): boolean {
    return this.#props.requireAdminApproval;
  }
}
```

`packages/domain/src/institution/entities/institution.ts`:

```ts
import { AggregateRoot } from '../../core';
import type { EntityId } from '../../core';
import { Address, GpsLocation } from '../../value-objects';
import { InvalidStateException } from '../../exceptions';
import { ApprovalStatus } from '@nemis-desktop/types';
import type { InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { SchoolCode } from '../value-objects/school-code';

export type InstitutionId = EntityId<'Institution'>;

/** Wide profile fields (infrastructure booleans etc.) are carried opaquely to stay
 * faithful to the schema without inventing invariants for each. See domain README. */
export type InstitutionProfile = Record<string, unknown>;

interface InstitutionState {
  code: SchoolCode;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  countyId: string;
  districtId?: string;
  approvalStatus: ApprovalStatus;
  address: Address;
  location?: GpsLocation;
  rejectionReason?: string;
  profile: InstitutionProfile;
}

export interface CreateInstitutionInput {
  id: string;
  code: string;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  countyId: string;
  districtId?: string;
  address?: { street?: string; communityTown?: string };
  location?: { latitude: number; longitude: number };
  occurredAt: string;
}

export class Institution extends AggregateRoot<InstitutionId> {
  #state: InstitutionState;

  private constructor(
    id: InstitutionId,
    state: InstitutionState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateInstitutionInput): Institution {
    return new Institution(
      input.id as InstitutionId,
      {
        code: SchoolCode.create(input.code),
        name: input.name,
        type: input.type,
        ownership: input.ownership,
        countyId: input.countyId,
        districtId: input.districtId,
        approvalStatus: ApprovalStatus.PENDING,
        address: Address.create(input.address ?? {}),
        location: input.location ? GpsLocation.create(input.location) : undefined,
        profile: {},
      },
      { version: 1, updatedAt: input.occurredAt },
    );
  }

  get code(): SchoolCode {
    return this.#state.code;
  }
  get name(): string {
    return this.#state.name;
  }
  get type(): InstitutionType {
    return this.#state.type;
  }
  get ownership(): OwnershipType {
    return this.#state.ownership;
  }
  get approvalStatus(): ApprovalStatus {
    return this.#state.approvalStatus;
  }
  get address(): Address {
    return this.#state.address;
  }
  get location(): GpsLocation | undefined {
    return this.#state.location;
  }
  get isApproved(): boolean {
    return this.#state.approvalStatus === ApprovalStatus.APPROVED;
  }

  approve(by: string, at: string): void {
    if (this.#state.approvalStatus === ApprovalStatus.APPROVED) {
      throw new InvalidStateException('Institution is already approved');
    }
    this.#state = {
      ...this.#state,
      approvalStatus: ApprovalStatus.APPROVED,
      rejectionReason: undefined,
    };
    this.touch(by, at);
  }

  reject(reason: string, by: string, at: string): void {
    if (this.#state.approvalStatus === ApprovalStatus.REJECTED) {
      throw new InvalidStateException('Institution is already rejected');
    }
    this.#state = {
      ...this.#state,
      approvalStatus: ApprovalStatus.REJECTED,
      rejectionReason: reason,
    };
    this.touch(by, at);
  }
}
```

`packages/domain/src/institution/specifications/is-institution-approved.ts`:

```ts
import { Specification } from '../../core';
import { ApprovalStatus } from '@nemis-desktop/types';

export class IsInstitutionApproved extends Specification<{ approvalStatus: ApprovalStatus }> {
  isSatisfiedBy(candidate: { approvalStatus: ApprovalStatus }): boolean {
    return candidate.approvalStatus === ApprovalStatus.APPROVED;
  }
}
```

`packages/domain/src/institution/index.ts`:

```ts
export * from './value-objects/school-code';
export * from './entities/grading-config';
export * from './entities/institution';
export * from './specifications/is-institution-approved';
```

- [ ] **Step 4: Re-export from the package barrel**

Modify `packages/domain/src/index.ts` (append):

```ts
export * from './institution';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/institution/institution.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/institution packages/domain/src/index.ts
git commit -m "feat(domain): add institution domain (aggregate, grading config, approval)"
```

---

### Task 11: Students domain — Student aggregate, Guardian, StudentGuardian, AdmissionNumber VO, StudentCreated event

**Files:**

- Create: `packages/domain/src/students/value-objects/admission-number.ts`
- Create: `packages/domain/src/students/entities/guardian.ts`
- Create: `packages/domain/src/students/entities/student-guardian.ts`
- Create: `packages/domain/src/students/entities/student.ts`
- Create: `packages/domain/src/students/events/student-created.ts`
- Create: `packages/domain/src/students/students.test.ts`
- Create: `packages/domain/src/students/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `AggregateRoot`, `Entity`, `EntityId` from `../core`; `PersonName`, `DateOfBirth`, `NationalId` from `../value-objects`; `Gender`, `GradeLevel`, `ApprovalStatus` from `@nemis-desktop/types`; exceptions.
- Produces:
  - `type StudentId = EntityId<'Student'>`
  - `class AdmissionNumber` VO (getter `value`, non-empty, trimmed).
  - `class Guardian extends AggregateRoot<string>` (`name`, `relationship`, `phone`).
  - `class StudentGuardian extends Entity<string>` (`guardianId`, `isPrimary`).
  - `class Student extends AggregateRoot<StudentId>` with `name`, `admissionNumber`, `dateOfBirth`, `gender`, `gradeLevel?`, `guardians: readonly StudentGuardian[]`, `isActive`, static `create`/`reconstitute`, `addGuardian(link, by, at)`, `deactivate(by, at)`.
  - `interface StudentCreatedEvent extends DomainEvent { name: 'StudentCreated'; admissionNumber: string; institutionId: string }`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/students/students.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Gender, GradeLevel } from '@nemis-desktop/types';
import { Student } from './entities/student';
import { StudentGuardian } from './entities/student-guardian';
import { AdmissionNumber } from './value-objects/admission-number';
import { BusinessRuleViolationException, InvalidValueObjectException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

function newStudent(): Student {
  return Student.create({
    id: 'stu-1',
    institutionId: 'inst-1',
    firstName: 'Musu',
    lastName: 'Toe',
    admissionNumber: 'ADM-2026-001',
    dateOfBirth: '2012-03-04',
    gender: Gender.FEMALE,
    gradeLevel: GradeLevel.GRADE_7,
    occurredAt: ISO,
  });
}

describe('AdmissionNumber', () => {
  it('trims and rejects empty', () => {
    expect(AdmissionNumber.create(' ADM-1 ').value).toBe('ADM-1');
    expect(() => AdmissionNumber.create('')).toThrow(InvalidValueObjectException);
  });
});

describe('Student', () => {
  it('creates and emits StudentCreated with admission number', () => {
    const student = newStudent();
    expect(student.admissionNumber.value).toBe('ADM-2026-001');
    const events = student.pullDomainEvents();
    expect(events[0]?.name).toBe('StudentCreated');
  });

  it('adds a guardian and enforces a single primary', () => {
    const student = newStudent();
    student.addGuardian(
      StudentGuardian.reconstitute({ id: 'sg-1', guardianId: 'g-1', isPrimary: true }),
      'admin',
      ISO,
    );
    expect(student.guardians).toHaveLength(1);
    expect(() =>
      student.addGuardian(
        StudentGuardian.reconstitute({ id: 'sg-2', guardianId: 'g-2', isPrimary: true }),
        'admin',
        ISO,
      ),
    ).toThrow(BusinessRuleViolationException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/students/students.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the students domain**

`packages/domain/src/students/value-objects/admission-number.ts`:

```ts
import { ValueObject, guard } from '../../core';

interface AdmissionNumberProps {
  value: string;
}

export class AdmissionNumber extends ValueObject<AdmissionNumberProps> {
  private constructor(props: AdmissionNumberProps) {
    super(props);
  }

  static create(value: string): AdmissionNumber {
    return new AdmissionNumber({ value: guard.againstEmpty(value, 'admissionNumber') });
  }

  get value(): string {
    return this.props.value;
  }
}
```

`packages/domain/src/students/entities/student-guardian.ts`:

```ts
import { Entity } from '../../core';

interface StudentGuardianProps {
  id: string;
  guardianId: string;
  isPrimary: boolean;
}

export class StudentGuardian extends Entity<string> {
  #props: StudentGuardianProps;

  private constructor(props: StudentGuardianProps) {
    super(props.id);
    this.#props = props;
  }

  static reconstitute(props: StudentGuardianProps): StudentGuardian {
    return new StudentGuardian(props);
  }

  get guardianId(): string {
    return this.#props.guardianId;
  }
  get isPrimary(): boolean {
    return this.#props.isPrimary;
  }
}
```

`packages/domain/src/students/entities/guardian.ts`:

```ts
import { AggregateRoot } from '../../core';
import { PersonName, PhoneNumber } from '../../value-objects';
import { guard } from '../../core';

export interface ReconstituteGuardianInput {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class Guardian extends AggregateRoot<string> {
  #name: PersonName;
  #relationship: string;
  #phone: PhoneNumber;

  private constructor(
    id: string,
    name: PersonName,
    relationship: string,
    phone: PhoneNumber,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#name = name;
    this.#relationship = relationship;
    this.#phone = phone;
  }

  static reconstitute(input: ReconstituteGuardianInput): Guardian {
    return new Guardian(
      input.id,
      PersonName.create({ firstName: input.firstName, lastName: input.lastName }),
      guard.againstEmpty(input.relationship, 'relationship'),
      PhoneNumber.create(input.phoneNumber),
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get name(): PersonName {
    return this.#name;
  }
  get relationship(): string {
    return this.#relationship;
  }
  get phone(): PhoneNumber {
    return this.#phone;
  }
}
```

`packages/domain/src/students/events/student-created.ts`:

```ts
import type { DomainEvent } from '../../core';

export interface StudentCreatedEvent extends DomainEvent {
  readonly name: 'StudentCreated';
  readonly admissionNumber: string;
  readonly institutionId: string;
}
```

`packages/domain/src/students/entities/student.ts`:

```ts
import { AggregateRoot } from '../../core';
import type { EntityId } from '../../core';
import { DateOfBirth, PersonName } from '../../value-objects';
import { BusinessRuleViolationException } from '../../exceptions';
import type { Gender, GradeLevel } from '@nemis-desktop/types';
import { AdmissionNumber } from '../value-objects/admission-number';
import { StudentGuardian } from './student-guardian';
import type { StudentCreatedEvent } from '../events/student-created';

export type StudentId = EntityId<'Student'>;

interface StudentState {
  institutionId: string;
  name: PersonName;
  admissionNumber: AdmissionNumber;
  dateOfBirth: DateOfBirth;
  gender: Gender;
  gradeLevel?: GradeLevel;
  isActive: boolean;
  guardians: StudentGuardian[];
}

export interface CreateStudentInput {
  id: string;
  institutionId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: Gender;
  gradeLevel?: GradeLevel;
  occurredAt: string;
}

export class Student extends AggregateRoot<StudentId> {
  #state: StudentState;

  private constructor(
    id: StudentId,
    state: StudentState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateStudentInput): Student {
    const student = new Student(
      input.id as StudentId,
      {
        institutionId: input.institutionId,
        name: PersonName.create({
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
        }),
        admissionNumber: AdmissionNumber.create(input.admissionNumber),
        dateOfBirth: DateOfBirth.create(input.dateOfBirth),
        gender: input.gender,
        gradeLevel: input.gradeLevel,
        isActive: true,
        guardians: [],
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: StudentCreatedEvent = {
      name: 'StudentCreated',
      aggregateId: student.id,
      occurredAt: input.occurredAt,
      admissionNumber: student.admissionNumber.value,
      institutionId: input.institutionId,
    };
    student.addEvent(event);
    return student;
  }

  get institutionId(): string {
    return this.#state.institutionId;
  }
  get name(): PersonName {
    return this.#state.name;
  }
  get admissionNumber(): AdmissionNumber {
    return this.#state.admissionNumber;
  }
  get dateOfBirth(): DateOfBirth {
    return this.#state.dateOfBirth;
  }
  get gender(): Gender {
    return this.#state.gender;
  }
  get gradeLevel(): GradeLevel | undefined {
    return this.#state.gradeLevel;
  }
  get isActive(): boolean {
    return this.#state.isActive;
  }
  get guardians(): readonly StudentGuardian[] {
    return this.#state.guardians;
  }

  addGuardian(link: StudentGuardian, by: string, at: string): void {
    if (link.isPrimary && this.#state.guardians.some((g) => g.isPrimary)) {
      throw new BusinessRuleViolationException('Student already has a primary guardian');
    }
    this.#state = { ...this.#state, guardians: [...this.#state.guardians, link] };
    this.touch(by, at);
  }

  deactivate(by: string, at: string): void {
    if (!this.#state.isActive) return;
    this.#state = { ...this.#state, isActive: false };
    this.touch(by, at);
  }
}
```

`packages/domain/src/students/index.ts`:

```ts
export * from './value-objects/admission-number';
export * from './entities/guardian';
export * from './entities/student-guardian';
export * from './entities/student';
export * from './events/student-created';
```

- [ ] **Step 4: Re-export from the package barrel**

Modify `packages/domain/src/index.ts` (append):

```ts
export * from './students';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/students/students.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/students packages/domain/src/index.ts
git commit -m "feat(domain): add students domain (Student/Guardian aggregates, guardian link)"
```

---

### Task 12: Academics domain — AcademicYear, Term, Class, Subject, Enrollment, IsEnrollmentOpen spec, EnrollmentCreated event

**Files:**

- Create: `packages/domain/src/academics/value-objects/academic-year-code.ts`
- Create: `packages/domain/src/academics/entities/academic-year.ts`
- Create: `packages/domain/src/academics/entities/term.ts`
- Create: `packages/domain/src/academics/entities/subject.ts`
- Create: `packages/domain/src/academics/entities/class.ts`
- Create: `packages/domain/src/academics/entities/enrollment.ts`
- Create: `packages/domain/src/academics/events/enrollment-created.ts`
- Create: `packages/domain/src/academics/specifications/is-enrollment-open.ts`
- Create: `packages/domain/src/academics/academics.test.ts`
- Create: `packages/domain/src/academics/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `AggregateRoot`, `Entity`, `EntityId`, `Specification`, `ValueObject`, `guard` from `../core`; `DateRange` from `../value-objects`; `GradeLevel`, `EnrollmentStatus` from `@nemis-desktop/types`; exceptions.
- Produces:
  - `class AcademicYearCode` VO (e.g. `2025/2026`; getter `value`).
  - `class AcademicYear extends AggregateRoot<string>` (`code`, `period: DateRange`, `isCurrent`, `makeCurrent()`).
  - `class Term extends Entity<string>` (`name`, `period: DateRange`, `isCurrent`).
  - `class Subject extends AggregateRoot<string>` (`name`, `code`, `isActive`).
  - `class Class extends AggregateRoot<string>` (`name`, `gradeLevel`, `capacity?`, `isActive`).
  - `class Enrollment extends AggregateRoot<string>` (`studentId`, `classId`, `academicYearId`, `termId`, `status`, static `create`, `withdraw(by, at)`).
  - `interface EnrollmentCreatedEvent extends DomainEvent { name: 'EnrollmentCreated'; studentId: string; classId: string }`
  - `class IsEnrollmentOpen extends Specification<{ yearIsCurrent: boolean; termIsCurrent: boolean }>`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/academics/academics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EnrollmentStatus, GradeLevel } from '@nemis-desktop/types';
import { AcademicYear } from './entities/academic-year';
import { AcademicYearCode } from './value-objects/academic-year-code';
import { Class } from './entities/class';
import { Enrollment } from './entities/enrollment';
import { IsEnrollmentOpen } from './specifications/is-enrollment-open';
import { InvalidStateException, InvalidValueObjectException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

describe('AcademicYearCode', () => {
  it('accepts YYYY/YYYY and rejects malformed', () => {
    expect(AcademicYearCode.create('2025/2026').value).toBe('2025/2026');
    expect(() => AcademicYearCode.create('2025-2026')).toThrow(InvalidValueObjectException);
  });
});

describe('AcademicYear', () => {
  it('makeCurrent flips the flag and bumps version', () => {
    const year = AcademicYear.reconstitute({
      id: 'ay-1',
      institutionId: 'inst-1',
      code: '2025/2026',
      start: '2025-09-01',
      end: '2026-07-31',
      isCurrent: false,
      version: 1,
      updatedAt: ISO,
    });
    year.makeCurrent('admin', ISO);
    expect(year.isCurrent).toBe(true);
    expect(year.version).toBe(2);
  });
});

describe('Class', () => {
  it('exposes grade level and capacity', () => {
    const klass = Class.reconstitute({
      id: 'c-1',
      institutionId: 'inst-1',
      academicYearId: 'ay-1',
      name: 'JSS1-A',
      gradeLevel: GradeLevel.GRADE_7,
      capacity: 40,
      isActive: true,
      version: 1,
      updatedAt: ISO,
    });
    expect(klass.gradeLevel).toBe(GradeLevel.GRADE_7);
    expect(klass.capacity).toBe(40);
  });
});

describe('Enrollment', () => {
  it('creates ACTIVE and emits EnrollmentCreated; withdraw guards double-withdraw', () => {
    const enrollment = Enrollment.create({
      id: 'e-1',
      studentId: 'stu-1',
      classId: 'c-1',
      academicYearId: 'ay-1',
      termId: 't-1',
      occurredAt: ISO,
    });
    expect(enrollment.status).toBe(EnrollmentStatus.ACTIVE);
    expect(enrollment.pullDomainEvents()[0]?.name).toBe('EnrollmentCreated');

    enrollment.withdraw('admin', ISO);
    expect(enrollment.status).toBe(EnrollmentStatus.WITHDRAWN);
    expect(() => enrollment.withdraw('admin', ISO)).toThrow(InvalidStateException);
  });
});

describe('IsEnrollmentOpen', () => {
  it('requires both year and term current', () => {
    const spec = new IsEnrollmentOpen();
    expect(spec.isSatisfiedBy({ yearIsCurrent: true, termIsCurrent: true })).toBe(true);
    expect(spec.isSatisfiedBy({ yearIsCurrent: true, termIsCurrent: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/academics/academics.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the academics domain**

`packages/domain/src/academics/value-objects/academic-year-code.ts`:

```ts
import { ValueObject } from '../../core';
import { InvalidValueObjectException } from '../../exceptions';

interface AcademicYearCodeProps {
  value: string;
}

const CODE_RE = /^\d{4}\/\d{4}$/;

export class AcademicYearCode extends ValueObject<AcademicYearCodeProps> {
  private constructor(props: AcademicYearCodeProps) {
    super(props);
  }

  static create(value: string): AcademicYearCode {
    const normalized = (value ?? '').trim();
    if (!CODE_RE.test(normalized)) {
      throw new InvalidValueObjectException(
        `Invalid academic year code: "${value}" (expected YYYY/YYYY)`,
      );
    }
    return new AcademicYearCode({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }
}
```

`packages/domain/src/academics/entities/academic-year.ts`:

```ts
import { AggregateRoot } from '../../core';
import { DateRange } from '../../value-objects';
import { AcademicYearCode } from '../value-objects/academic-year-code';

export interface ReconstituteAcademicYearInput {
  id: string;
  institutionId: string;
  code: string;
  start: string;
  end: string;
  isCurrent: boolean;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class AcademicYear extends AggregateRoot<string> {
  #institutionId: string;
  #code: AcademicYearCode;
  #period: DateRange;
  #isCurrent: boolean;

  private constructor(
    id: string,
    institutionId: string,
    code: AcademicYearCode,
    period: DateRange,
    isCurrent: boolean,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#institutionId = institutionId;
    this.#code = code;
    this.#period = period;
    this.#isCurrent = isCurrent;
  }

  static reconstitute(input: ReconstituteAcademicYearInput): AcademicYear {
    return new AcademicYear(
      input.id,
      input.institutionId,
      AcademicYearCode.create(input.code),
      DateRange.create({ start: input.start, end: input.end }),
      input.isCurrent,
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get institutionId(): string {
    return this.#institutionId;
  }
  get code(): AcademicYearCode {
    return this.#code;
  }
  get period(): DateRange {
    return this.#period;
  }
  get isCurrent(): boolean {
    return this.#isCurrent;
  }

  makeCurrent(by: string, at: string): void {
    if (this.#isCurrent) return;
    this.#isCurrent = true;
    this.touch(by, at);
  }
}
```

`packages/domain/src/academics/entities/term.ts`:

```ts
import { Entity } from '../../core';
import { DateRange } from '../../value-objects';
import { guard } from '../../core';

interface TermProps {
  id: string;
  academicYearId: string;
  name: string;
  start: string;
  end: string;
  isCurrent: boolean;
}

export class Term extends Entity<string> {
  #academicYearId: string;
  #name: string;
  #period: DateRange;
  #isCurrent: boolean;

  private constructor(props: TermProps) {
    super(props.id);
    this.#academicYearId = props.academicYearId;
    this.#name = guard.againstEmpty(props.name, 'name');
    this.#period = DateRange.create({ start: props.start, end: props.end });
    this.#isCurrent = props.isCurrent;
  }

  static reconstitute(props: TermProps): Term {
    return new Term(props);
  }

  get academicYearId(): string {
    return this.#academicYearId;
  }
  get name(): string {
    return this.#name;
  }
  get period(): DateRange {
    return this.#period;
  }
  get isCurrent(): boolean {
    return this.#isCurrent;
  }
}
```

`packages/domain/src/academics/entities/subject.ts`:

```ts
import { AggregateRoot } from '../../core';
import { guard } from '../../core';

interface ReconstituteSubjectInput {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class Subject extends AggregateRoot<string> {
  #institutionId: string;
  #name: string;
  #code: string;
  #isActive: boolean;

  private constructor(
    id: string,
    institutionId: string,
    name: string,
    code: string,
    isActive: boolean,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#institutionId = institutionId;
    this.#name = name;
    this.#code = code;
    this.#isActive = isActive;
  }

  static reconstitute(input: ReconstituteSubjectInput): Subject {
    return new Subject(
      input.id,
      input.institutionId,
      guard.againstEmpty(input.name, 'name'),
      guard.againstEmpty(input.code, 'code'),
      input.isActive,
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get institutionId(): string {
    return this.#institutionId;
  }
  get name(): string {
    return this.#name;
  }
  get code(): string {
    return this.#code;
  }
  get isActive(): boolean {
    return this.#isActive;
  }
}
```

`packages/domain/src/academics/entities/class.ts`:

```ts
import { AggregateRoot } from '../../core';
import { guard } from '../../core';
import type { GradeLevel } from '@nemis-desktop/types';

interface ReconstituteClassInput {
  id: string;
  institutionId: string;
  academicYearId: string;
  name: string;
  gradeLevel: GradeLevel;
  capacity?: number;
  isActive: boolean;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export class Class extends AggregateRoot<string> {
  #institutionId: string;
  #academicYearId: string;
  #name: string;
  #gradeLevel: GradeLevel;
  #capacity?: number;
  #isActive: boolean;

  private constructor(
    id: string,
    fields: {
      institutionId: string;
      academicYearId: string;
      name: string;
      gradeLevel: GradeLevel;
      capacity?: number;
      isActive: boolean;
    },
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#institutionId = fields.institutionId;
    this.#academicYearId = fields.academicYearId;
    this.#name = fields.name;
    this.#gradeLevel = fields.gradeLevel;
    this.#capacity = fields.capacity;
    this.#isActive = fields.isActive;
  }

  static reconstitute(input: ReconstituteClassInput): Class {
    return new Class(
      input.id,
      {
        institutionId: input.institutionId,
        academicYearId: input.academicYearId,
        name: guard.againstEmpty(input.name, 'name'),
        gradeLevel: input.gradeLevel,
        capacity: input.capacity,
        isActive: input.isActive,
      },
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }

  get institutionId(): string {
    return this.#institutionId;
  }
  get academicYearId(): string {
    return this.#academicYearId;
  }
  get name(): string {
    return this.#name;
  }
  get gradeLevel(): GradeLevel {
    return this.#gradeLevel;
  }
  get capacity(): number | undefined {
    return this.#capacity;
  }
  get isActive(): boolean {
    return this.#isActive;
  }
}
```

`packages/domain/src/academics/events/enrollment-created.ts`:

```ts
import type { DomainEvent } from '../../core';

export interface EnrollmentCreatedEvent extends DomainEvent {
  readonly name: 'EnrollmentCreated';
  readonly studentId: string;
  readonly classId: string;
}
```

`packages/domain/src/academics/entities/enrollment.ts`:

```ts
import { AggregateRoot } from '../../core';
import { InvalidStateException } from '../../exceptions';
import { EnrollmentStatus } from '@nemis-desktop/types';
import type { EnrollmentCreatedEvent } from '../events/enrollment-created';

interface EnrollmentState {
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  status: EnrollmentStatus;
}

export interface CreateEnrollmentInput {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  occurredAt: string;
}

export class Enrollment extends AggregateRoot<string> {
  #state: EnrollmentState;

  private constructor(
    id: string,
    state: EnrollmentState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateEnrollmentInput): Enrollment {
    const enrollment = new Enrollment(
      input.id,
      {
        studentId: input.studentId,
        classId: input.classId,
        academicYearId: input.academicYearId,
        termId: input.termId,
        status: EnrollmentStatus.ACTIVE,
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: EnrollmentCreatedEvent = {
      name: 'EnrollmentCreated',
      aggregateId: enrollment.id,
      occurredAt: input.occurredAt,
      studentId: input.studentId,
      classId: input.classId,
    };
    enrollment.addEvent(event);
    return enrollment;
  }

  get studentId(): string {
    return this.#state.studentId;
  }
  get classId(): string {
    return this.#state.classId;
  }
  get status(): EnrollmentStatus {
    return this.#state.status;
  }

  withdraw(by: string, at: string): void {
    if (this.#state.status === EnrollmentStatus.WITHDRAWN) {
      throw new InvalidStateException('Enrollment is already withdrawn');
    }
    this.#state = { ...this.#state, status: EnrollmentStatus.WITHDRAWN };
    this.touch(by, at);
  }
}
```

`packages/domain/src/academics/specifications/is-enrollment-open.ts`:

```ts
import { Specification } from '../../core';

export interface EnrollmentWindowSnapshot {
  yearIsCurrent: boolean;
  termIsCurrent: boolean;
}

export class IsEnrollmentOpen extends Specification<EnrollmentWindowSnapshot> {
  isSatisfiedBy(candidate: EnrollmentWindowSnapshot): boolean {
    return candidate.yearIsCurrent && candidate.termIsCurrent;
  }
}
```

`packages/domain/src/academics/index.ts`:

```ts
export * from './value-objects/academic-year-code';
export * from './entities/academic-year';
export * from './entities/term';
export * from './entities/subject';
export * from './entities/class';
export * from './entities/enrollment';
export * from './events/enrollment-created';
export * from './specifications/is-enrollment-open';
```

- [ ] **Step 4: Re-export from the package barrel**

Modify `packages/domain/src/index.ts` (append):

```ts
export * from './academics';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/academics/academics.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/academics packages/domain/src/index.ts
git commit -m "feat(domain): add academics domain (year, term, class, subject, enrollment)"
```

---

### Task 13: Attendance domain — Attendance aggregate, CanRecordAttendance spec, AttendanceRecorded/Corrected events

**Files:**

- Create: `packages/domain/src/attendance/entities/attendance.ts`
- Create: `packages/domain/src/attendance/events/attendance-events.ts`
- Create: `packages/domain/src/attendance/specifications/can-record-attendance.ts`
- Create: `packages/domain/src/attendance/attendance.test.ts`
- Create: `packages/domain/src/attendance/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `AggregateRoot`, `Specification` from `../core`; `AttendanceStatus` from `@nemis-desktop/types`; `InvalidStateException` from `../exceptions`.
- Produces:
  - `class Attendance extends AggregateRoot<string>` (`studentId`, `classId`, `subjectId?`, `date`, `status`, `recordedBy?`, static `record(...)`, `correct(status, reason, by, at)`).
  - `interface AttendanceRecordedEvent extends DomainEvent { name: 'AttendanceRecorded'; studentId: string; date: string; status: AttendanceStatus }`
  - `interface AttendanceCorrectedEvent extends DomainEvent { name: 'AttendanceCorrected'; reason: string }`
  - `class CanRecordAttendance extends Specification<{ enrollmentActive: boolean; dateIsFuture: boolean; alreadyRecorded: boolean }>`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/attendance/attendance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AttendanceStatus } from '@nemis-desktop/types';
import { Attendance } from './entities/attendance';
import { CanRecordAttendance } from './specifications/can-record-attendance';
import { InvalidStateException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

function record(): Attendance {
  return Attendance.record({
    id: 'att-1',
    studentId: 'stu-1',
    classId: 'c-1',
    date: '2026-07-17',
    status: AttendanceStatus.PRESENT,
    recordedBy: 'teacher-1',
    occurredAt: ISO,
  });
}

describe('Attendance', () => {
  it('records and emits AttendanceRecorded', () => {
    const attendance = record();
    expect(attendance.status).toBe(AttendanceStatus.PRESENT);
    const events = attendance.pullDomainEvents();
    expect(events[0]?.name).toBe('AttendanceRecorded');
  });

  it('correct changes status, requires a reason, and emits AttendanceCorrected', () => {
    const attendance = record();
    attendance.pullDomainEvents();
    attendance.correct(AttendanceStatus.LATE, 'arrived at 9am', 'teacher-1', ISO);
    expect(attendance.status).toBe(AttendanceStatus.LATE);
    expect(attendance.version).toBe(2);
    expect(attendance.pullDomainEvents()[0]?.name).toBe('AttendanceCorrected');
    expect(() => attendance.correct(AttendanceStatus.ABSENT, '', 'teacher-1', ISO)).toThrow(
      InvalidStateException,
    );
  });
});

describe('CanRecordAttendance', () => {
  it('requires active enrollment, non-future date, and no prior record', () => {
    const spec = new CanRecordAttendance();
    expect(
      spec.isSatisfiedBy({ enrollmentActive: true, dateIsFuture: false, alreadyRecorded: false }),
    ).toBe(true);
    expect(
      spec.isSatisfiedBy({ enrollmentActive: true, dateIsFuture: true, alreadyRecorded: false }),
    ).toBe(false);
    expect(
      spec.isSatisfiedBy({ enrollmentActive: false, dateIsFuture: false, alreadyRecorded: false }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/attendance/attendance.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the attendance domain**

`packages/domain/src/attendance/events/attendance-events.ts`:

```ts
import type { DomainEvent } from '../../core';
import type { AttendanceStatus } from '@nemis-desktop/types';

export interface AttendanceRecordedEvent extends DomainEvent {
  readonly name: 'AttendanceRecorded';
  readonly studentId: string;
  readonly date: string;
  readonly status: AttendanceStatus;
}

export interface AttendanceCorrectedEvent extends DomainEvent {
  readonly name: 'AttendanceCorrected';
  readonly reason: string;
}
```

`packages/domain/src/attendance/entities/attendance.ts`:

```ts
import { AggregateRoot } from '../../core';
import { InvalidStateException } from '../../exceptions';
import type { AttendanceStatus } from '@nemis-desktop/types';
import type {
  AttendanceCorrectedEvent,
  AttendanceRecordedEvent,
} from '../events/attendance-events';

interface AttendanceState {
  studentId: string;
  classId: string;
  subjectId?: string;
  date: string;
  status: AttendanceStatus;
  recordedBy?: string;
}

export interface RecordAttendanceInput {
  id: string;
  studentId: string;
  classId: string;
  subjectId?: string;
  date: string;
  status: AttendanceStatus;
  recordedBy?: string;
  occurredAt: string;
}

export class Attendance extends AggregateRoot<string> {
  #state: AttendanceState;

  private constructor(
    id: string,
    state: AttendanceState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static record(input: RecordAttendanceInput): Attendance {
    const attendance = new Attendance(
      input.id,
      {
        studentId: input.studentId,
        classId: input.classId,
        subjectId: input.subjectId,
        date: input.date,
        status: input.status,
        recordedBy: input.recordedBy,
      },
      { version: 1, updatedAt: input.occurredAt, lastModifiedBy: input.recordedBy },
    );
    const event: AttendanceRecordedEvent = {
      name: 'AttendanceRecorded',
      aggregateId: attendance.id,
      occurredAt: input.occurredAt,
      studentId: input.studentId,
      date: input.date,
      status: input.status,
    };
    attendance.addEvent(event);
    return attendance;
  }

  get studentId(): string {
    return this.#state.studentId;
  }
  get classId(): string {
    return this.#state.classId;
  }
  get date(): string {
    return this.#state.date;
  }
  get status(): AttendanceStatus {
    return this.#state.status;
  }

  correct(status: AttendanceStatus, reason: string, by: string, at: string): void {
    if (reason.trim().length === 0) {
      throw new InvalidStateException('Correcting attendance requires a reason');
    }
    this.#state = { ...this.#state, status };
    this.touch(by, at);
    const event: AttendanceCorrectedEvent = {
      name: 'AttendanceCorrected',
      aggregateId: this.id,
      occurredAt: at,
      reason,
    };
    this.addEvent(event);
  }
}
```

`packages/domain/src/attendance/specifications/can-record-attendance.ts`:

```ts
import { Specification } from '../../core';

export interface AttendanceContext {
  enrollmentActive: boolean;
  dateIsFuture: boolean;
  alreadyRecorded: boolean;
}

export class CanRecordAttendance extends Specification<AttendanceContext> {
  isSatisfiedBy(candidate: AttendanceContext): boolean {
    return candidate.enrollmentActive && !candidate.dateIsFuture && !candidate.alreadyRecorded;
  }
}
```

`packages/domain/src/attendance/index.ts`:

```ts
export * from './entities/attendance';
export * from './events/attendance-events';
export * from './specifications/can-record-attendance';
```

- [ ] **Step 4: Re-export from the package barrel**

Modify `packages/domain/src/index.ts` (append):

```ts
export * from './attendance';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/attendance/attendance.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/attendance packages/domain/src/index.ts
git commit -m "feat(domain): add attendance domain (record/correct, can-record spec)"
```

---

### Task 14: Assessments domain — GradingPeriod, Assessment, Grade aggregate, GradeAudit, specs & events

**Files:**

- Create: `packages/domain/src/assessments/entities/grading-period.ts`
- Create: `packages/domain/src/assessments/entities/assessment.ts`
- Create: `packages/domain/src/assessments/entities/grade-audit.ts`
- Create: `packages/domain/src/assessments/entities/grade.ts`
- Create: `packages/domain/src/assessments/events/assessment-events.ts`
- Create: `packages/domain/src/assessments/specifications/can-publish-grade.ts`
- Create: `packages/domain/src/assessments/specifications/is-grade-entry-window-open.ts`
- Create: `packages/domain/src/assessments/assessments.test.ts`
- Create: `packages/domain/src/assessments/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `AggregateRoot`, `Entity`, `Specification`, `guard` from `../core`; `Marks` from `../value-objects`; `AssessmentType`, `GradeStatus`, `WindowStatus`, `PeriodType` from `@nemis-desktop/types`; exceptions.
- Produces:
  - `class GradingPeriod extends Entity<string>` (`name`, `periodType`, `sequence`, `maxMarks`, `passingMarks`).
  - `class Assessment extends AggregateRoot<string>` (`classId`, `subjectId`, `type`, `marks: Marks`, static `create`, emits `AssessmentCreated`).
  - `class GradeAudit extends Entity<string>` (`action`, `changedBy`, `changedAt`).
  - `class Grade extends AggregateRoot<string>` (`studentId`, `subjectId`, `marks: Marks`, `status`, `isPublished`, static `create`, `publish(by, at)`, `lock(by, at)`, emits `GradePublished`).
  - `interface AssessmentCreatedEvent`, `interface GradePublishedEvent`.
  - `class CanPublishGrade extends Specification<{ status: GradeStatus; windowOpen: boolean }>`
  - `class IsGradeEntryWindowOpen extends Specification<{ status: WindowStatus }>`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/assessments/assessments.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AssessmentType, GradeStatus, WindowStatus } from '@nemis-desktop/types';
import { Assessment } from './entities/assessment';
import { Grade } from './entities/grade';
import { CanPublishGrade } from './specifications/can-publish-grade';
import { IsGradeEntryWindowOpen } from './specifications/is-grade-entry-window-open';
import { InvalidStateException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

describe('Assessment', () => {
  it('creates with marks and emits AssessmentCreated', () => {
    const assessment = Assessment.create({
      id: 'as-1',
      classId: 'c-1',
      subjectId: 's-1',
      gradingPeriodId: 'gp-1',
      type: AssessmentType.TEST,
      totalMarks: 50,
      occurredAt: ISO,
    });
    expect(assessment.marks.total).toBe(50);
    expect(assessment.pullDomainEvents()[0]?.name).toBe('AssessmentCreated');
  });
});

describe('Grade', () => {
  it('publishes from a publishable status and emits GradePublished', () => {
    const grade = Grade.create({
      id: 'g-1',
      studentId: 'stu-1',
      subjectId: 's-1',
      obtained: 42,
      total: 50,
      status: GradeStatus.APPROVED,
      occurredAt: ISO,
    });
    grade.pullDomainEvents();
    grade.publish('teacher-1', ISO);
    expect(grade.isPublished).toBe(true);
    expect(grade.status).toBe(GradeStatus.PUBLISHED);
    expect(grade.pullDomainEvents()[0]?.name).toBe('GradePublished');
  });

  it('cannot publish a locked grade', () => {
    const grade = Grade.create({
      id: 'g-2',
      studentId: 'stu-1',
      subjectId: 's-1',
      obtained: 10,
      total: 50,
      status: GradeStatus.LOCKED,
      occurredAt: ISO,
    });
    expect(() => grade.publish('teacher-1', ISO)).toThrow(InvalidStateException);
  });
});

describe('grading specifications', () => {
  it('CanPublishGrade requires publishable status and an open window', () => {
    const spec = new CanPublishGrade();
    expect(spec.isSatisfiedBy({ status: GradeStatus.APPROVED, windowOpen: true })).toBe(true);
    expect(spec.isSatisfiedBy({ status: GradeStatus.DRAFT, windowOpen: true })).toBe(false);
    expect(spec.isSatisfiedBy({ status: GradeStatus.APPROVED, windowOpen: false })).toBe(false);
  });

  it('IsGradeEntryWindowOpen is satisfied only for OPEN', () => {
    const spec = new IsGradeEntryWindowOpen();
    expect(spec.isSatisfiedBy({ status: WindowStatus.OPEN })).toBe(true);
    expect(spec.isSatisfiedBy({ status: WindowStatus.CLOSED })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/assessments/assessments.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the assessments domain**

`packages/domain/src/assessments/entities/grading-period.ts`:

```ts
import { Entity } from '../../core';
import { guard } from '../../core';
import type { PeriodType } from '@nemis-desktop/types';

interface GradingPeriodProps {
  id: string;
  institutionId: string;
  name: string;
  periodType: PeriodType;
  sequence: number;
  maxMarks: number;
  passingMarks: number;
}

export class GradingPeriod extends Entity<string> {
  #props: GradingPeriodProps;

  private constructor(props: GradingPeriodProps) {
    super(props.id);
    this.#props = { ...props, name: guard.againstEmpty(props.name, 'name') };
  }

  static reconstitute(props: GradingPeriodProps): GradingPeriod {
    return new GradingPeriod(props);
  }

  get name(): string {
    return this.#props.name;
  }
  get periodType(): PeriodType {
    return this.#props.periodType;
  }
  get sequence(): number {
    return this.#props.sequence;
  }
  get maxMarks(): number {
    return this.#props.maxMarks;
  }
  get passingMarks(): number {
    return this.#props.passingMarks;
  }
}
```

`packages/domain/src/assessments/events/assessment-events.ts`:

```ts
import type { DomainEvent } from '../../core';

export interface AssessmentCreatedEvent extends DomainEvent {
  readonly name: 'AssessmentCreated';
  readonly classId: string;
  readonly subjectId: string;
}

export interface GradePublishedEvent extends DomainEvent {
  readonly name: 'GradePublished';
  readonly studentId: string;
  readonly subjectId: string;
}
```

`packages/domain/src/assessments/entities/assessment.ts`:

```ts
import { AggregateRoot } from '../../core';
import { Marks } from '../../value-objects';
import type { AssessmentType } from '@nemis-desktop/types';
import type { AssessmentCreatedEvent } from '../events/assessment-events';

interface AssessmentState {
  classId: string;
  subjectId: string;
  gradingPeriodId: string;
  type: AssessmentType;
  marks: Marks;
}

export interface CreateAssessmentInput {
  id: string;
  classId: string;
  subjectId: string;
  gradingPeriodId: string;
  type: AssessmentType;
  totalMarks: number;
  occurredAt: string;
}

export class Assessment extends AggregateRoot<string> {
  #state: AssessmentState;

  private constructor(
    id: string,
    state: AssessmentState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateAssessmentInput): Assessment {
    const assessment = new Assessment(
      input.id,
      {
        classId: input.classId,
        subjectId: input.subjectId,
        gradingPeriodId: input.gradingPeriodId,
        type: input.type,
        marks: Marks.create({ obtained: 0, total: input.totalMarks }),
      },
      { version: 1, updatedAt: input.occurredAt },
    );
    const event: AssessmentCreatedEvent = {
      name: 'AssessmentCreated',
      aggregateId: assessment.id,
      occurredAt: input.occurredAt,
      classId: input.classId,
      subjectId: input.subjectId,
    };
    assessment.addEvent(event);
    return assessment;
  }

  get type(): AssessmentType {
    return this.#state.type;
  }
  get marks(): Marks {
    return this.#state.marks;
  }
}
```

`packages/domain/src/assessments/entities/grade-audit.ts`:

```ts
import { Entity } from '../../core';
import type { GradeAuditAction } from '@nemis-desktop/types';

interface GradeAuditProps {
  id: string;
  gradeId: string;
  action: GradeAuditAction;
  changedBy: string;
  changedAt: string;
}

export class GradeAudit extends Entity<string> {
  #props: GradeAuditProps;

  private constructor(props: GradeAuditProps) {
    super(props.id);
    this.#props = props;
  }

  static reconstitute(props: GradeAuditProps): GradeAudit {
    return new GradeAudit(props);
  }

  get action(): GradeAuditAction {
    return this.#props.action;
  }
  get changedBy(): string {
    return this.#props.changedBy;
  }
  get changedAt(): string {
    return this.#props.changedAt;
  }
}
```

`packages/domain/src/assessments/entities/grade.ts`:

```ts
import { AggregateRoot } from '../../core';
import { Marks } from '../../value-objects';
import { InvalidStateException } from '../../exceptions';
import { GradeStatus } from '@nemis-desktop/types';
import type { GradePublishedEvent } from '../events/assessment-events';

interface GradeState {
  studentId: string;
  subjectId: string;
  marks: Marks;
  status: GradeStatus;
  isPublished: boolean;
}

export interface CreateGradeInput {
  id: string;
  studentId: string;
  subjectId: string;
  obtained: number;
  total: number;
  status: GradeStatus;
  occurredAt: string;
}

const PUBLISHABLE: ReadonlySet<GradeStatus> = new Set([
  GradeStatus.APPROVED,
  GradeStatus.SUBMITTED,
]);

export class Grade extends AggregateRoot<string> {
  #state: GradeState;

  private constructor(
    id: string,
    state: GradeState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static create(input: CreateGradeInput): Grade {
    return new Grade(
      input.id,
      {
        studentId: input.studentId,
        subjectId: input.subjectId,
        marks: Marks.create({ obtained: input.obtained, total: input.total }),
        status: input.status,
        isPublished: input.status === GradeStatus.PUBLISHED,
      },
      { version: 1, updatedAt: input.occurredAt },
    );
  }

  get studentId(): string {
    return this.#state.studentId;
  }
  get subjectId(): string {
    return this.#state.subjectId;
  }
  get marks(): Marks {
    return this.#state.marks;
  }
  get status(): GradeStatus {
    return this.#state.status;
  }
  get isPublished(): boolean {
    return this.#state.isPublished;
  }

  publish(by: string, at: string): void {
    if (!PUBLISHABLE.has(this.#state.status)) {
      throw new InvalidStateException(
        `Grade cannot be published from status ${this.#state.status}`,
      );
    }
    this.#state = { ...this.#state, status: GradeStatus.PUBLISHED, isPublished: true };
    this.touch(by, at);
    const event: GradePublishedEvent = {
      name: 'GradePublished',
      aggregateId: this.id,
      occurredAt: at,
      studentId: this.#state.studentId,
      subjectId: this.#state.subjectId,
    };
    this.addEvent(event);
  }

  lock(by: string, at: string): void {
    if (this.#state.status === GradeStatus.LOCKED) return;
    this.#state = { ...this.#state, status: GradeStatus.LOCKED };
    this.touch(by, at);
  }
}
```

`packages/domain/src/assessments/specifications/can-publish-grade.ts`:

```ts
import { Specification } from '../../core';
import { GradeStatus } from '@nemis-desktop/types';

export interface GradePublishContext {
  status: GradeStatus;
  windowOpen: boolean;
}

const PUBLISHABLE: ReadonlySet<GradeStatus> = new Set([
  GradeStatus.APPROVED,
  GradeStatus.SUBMITTED,
]);

export class CanPublishGrade extends Specification<GradePublishContext> {
  isSatisfiedBy(candidate: GradePublishContext): boolean {
    return candidate.windowOpen && PUBLISHABLE.has(candidate.status);
  }
}
```

`packages/domain/src/assessments/specifications/is-grade-entry-window-open.ts`:

```ts
import { Specification } from '../../core';
import { WindowStatus } from '@nemis-desktop/types';

export class IsGradeEntryWindowOpen extends Specification<{ status: WindowStatus }> {
  isSatisfiedBy(candidate: { status: WindowStatus }): boolean {
    return candidate.status === WindowStatus.OPEN;
  }
}
```

`packages/domain/src/assessments/index.ts`:

```ts
export * from './entities/grading-period';
export * from './entities/assessment';
export * from './entities/grade-audit';
export * from './entities/grade';
export * from './events/assessment-events';
export * from './specifications/can-publish-grade';
export * from './specifications/is-grade-entry-window-open';
```

- [ ] **Step 4: Re-export from the package barrel**

Modify `packages/domain/src/index.ts` (append):

```ts
export * from './assessments';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/src/assessments/assessments.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/assessments packages/domain/src/index.ts
git commit -m "feat(domain): add assessments domain (grading period, assessment, grade)"
```

---

### Task 15: Extension recipe + domain README

**Files:**

- Create: `packages/domain/src/_extension-template/README.md`
- Create: `packages/domain/src/_extension-template/example.template.md`
- Create: `packages/domain/README.md`

**Interfaces:**

- Consumes: nothing (documentation).
- Produces: developer docs. No runtime code, so no test.

- [ ] **Step 1: Write the extension recipe**

`packages/domain/src/_extension-template/README.md`:

```markdown
# Adding a new domain (extension recipe)

The six built domains (identity, institution, students, academics, attendance,
assessments) are the reference implementation. To add one of the remaining domains
(geography, staff, finance, communication, resources, reporting), follow this recipe.

1. **Create the folder** `packages/domain/src/<domain>/` with `entities/`,
   `value-objects/` (only if the domain needs new ones), `specifications/`,
   `events/`, and `index.ts`.
2. **Mirror any missing enums** into `@nemis-desktop/types/src/enums.ts` first
   (values verbatim from `schema.prisma`), then import them here.
3. **Model each entity** with a private constructor + static `create()` (new,
   enforces invariants, may emit a creation event) and `reconstitute()` (rehydrate
   from persistence, no event). Aggregate roots extend `AggregateRoot`; child
   entities extend `Entity`.
4. **Put behavior on the entity** (e.g. `payment.reverse(reason, by, at)`), never
   in a service. Mutations call `this.touch(by, at)` and, where meaningful,
   `this.addEvent(...)`.
5. **Reuse the cross-cutting value objects** (`Money`, `PersonName`, `DateRange`, …)
   before writing new ones. New domain-specific VOs live under the domain's
   `value-objects/`.
6. **Write specifications** for reusable business rules only — no workflows.
7. **Add tests** beside each source file (`*.test.ts`) covering happy path + each
   invariant/transition.
8. **Export** from the domain `index.ts`, then from `packages/domain/src/index.ts`.
9. **Verify**: `pnpm --filter @nemis-desktop/domain typecheck && pnpm test && pnpm lint`.
```

`packages/domain/src/_extension-template/example.template.md`:

```markdown
# Example skeleton: FeePayment (finance domain)

Copy and adapt. Uses the cross-cutting `Money` value object.

    // finance/entities/fee-payment.ts
    import { AggregateRoot } from '../../core';
    import { Money } from '../../value-objects';
    import { InvalidStateException } from '../../exceptions';
    import type { PaymentMethod } from '@nemis-desktop/types';

    export interface RecordFeePaymentInput {
      id: string;
      obligationId: string;
      studentId: string;
      amount: number;
      currency?: string;
      method: PaymentMethod;
      receiptNumber: string;
      occurredAt: string;
    }

    export class FeePayment extends AggregateRoot<string> {
      // ...state incl. Money.create({ amount, currency }), isReversed=false...
      static record(input: RecordFeePaymentInput): FeePayment { /* emit FeePaymentRecorded */ }
      reverse(reason: string, by: string, at: string): void {
        // guard: already reversed -> InvalidStateException; else flip + touch + event
      }
    }
```

- [ ] **Step 2: Write the domain package README**

`packages/domain/README.md`:

```markdown
# @nemis-desktop/domain

Pure-TypeScript domain layer for the NEMIS desktop client. Mirrors the production
business model (backend `@nemis/*` Prisma schema) with **zero infrastructure
dependencies**.

## Philosophy

Rich domain models: entities carry behavior and enforce their own invariants; value
objects are immutable and self-validating; specifications capture reusable business
rules; domain events are defined (not dispatched) and drained via
`pullDomainEvents()`. No anemic models, no business logic in UI/SQLite/repositories.

## Dependency rule

The only permitted dependency is `@nemis-desktop/types` (enums + contracts). Imports
of `electron`, `react`, `next`, `better-sqlite3`, `@nemis-desktop/shared`, or any
`database/`/`data/`/`ipc/` path are banned and enforced by ESLint
(`no-restricted-imports`). The package compiles standalone:
`pnpm --filter @nemis-desktop/domain typecheck`.

## Layout

- `core/` — kernel: `Entity`, `AggregateRoot`, `ValueObject`, `DomainEvent`,
  `Specification`, `guard`, branded `EntityId`.
- `exceptions/` — `DomainException` hierarchy.
- `value-objects/` — cross-cutting VOs (name, email, phone, money, marks, …).
- `<domain>/` — one folder per business domain (entities / value-objects /
  specifications / events).
- `_extension-template/` — recipe for adding the remaining domains.

## Built this phase (vertical slice)

identity, institution, students, academics, attendance, assessments. The remaining
six domains are discovery-complete (see the Phase 4 spec) and added via the recipe.

## Intentional divergences from the production schema

- **RefreshToken / ActivationToken** are excluded — authentication infrastructure,
  not business domain.
- **Feature-first layout** instead of the spec's flat technical-first folders (66
  entities make one flat folder unmaintainable).
- **Enums are re-declared** in `@nemis-desktop/types` (separate pnpm workspace can't
  import backend `@nemis/types`); backend remains the single source of truth.
- **Wide profile fields** (e.g. `Institution`'s ~50 infrastructure booleans) are
  carried as an opaque `profile` record rather than individually invariant-checked.
- **`deviceId`** is not modeled in the domain — it is sync-layer infrastructure.
  Concurrency metadata (`version`, `updatedAt`, `lastModifiedBy`) IS modeled on
  `AggregateRoot`.
```

- [ ] **Step 3: Verify docs render (no build step) and typecheck unaffected**

Run: `pnpm --filter @nemis-desktop/domain typecheck`
Expected: PASS (no code changed).

- [ ] **Step 4: Commit**

```bash
git add packages/domain/README.md packages/domain/src/_extension-template
git commit -m "docs(domain): add extension recipe and domain package README"
```

---

### Task 16: Full-workspace verification and conventions doc update

**Files:**

- Modify: `docs/conventions.md` (append a Domain Layer section)

**Interfaces:**

- Consumes: everything built.
- Produces: green typecheck + lint + tests across the workspace; a documented convention entry.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all domain, types, shared, and existing data-layer tests green.

- [ ] **Step 2: Run workspace typecheck**

Run: `pnpm typecheck`
Expected: PASS for every package (`-r`), including `@nemis-desktop/domain`.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS — including the domain import-guard rule (no violations).

- [ ] **Step 4: Prove the dependency guard actually fires (temporary check)**

Add a deliberately-illegal import to a scratch file to confirm the guard works, then remove it:

```bash
printf "import 'electron';\nexport {};\n" > packages/domain/src/_guard-check.ts
pnpm lint packages/domain/src/_guard-check.ts || echo "GUARD OK: lint rejected the illegal import"
rm packages/domain/src/_guard-check.ts
```

Expected: lint reports `no-restricted-imports` for `electron`; after `rm`, tree is clean. (`git status` shows no leftover file.)

- [ ] **Step 5: Append the conventions entry**

Add to the end of `docs/conventions.md`:

```markdown
## Domain Layer (`@nemis-desktop/domain`, Phase 4)

- Pure TypeScript business model. Only dependency: `@nemis-desktop/types`. No
  electron/react/next/sqlite/ipc/shared imports (ESLint-enforced).
- Feature-first folders: `core/` kernel, `exceptions/`, `value-objects/`, then one
  folder per domain (`identity/`, `institution/`, `students/`, `academics/`,
  `attendance/`, `assessments/`; more via `_extension-template/`).
- Entities: private constructor + static `create()` (emits events) / `reconstitute()`
  (no events). Behavior on the entity; mutations call `touch(by, at)`.
- Value objects: immutable (frozen), self-validating via static `create()`, throw
  `InvalidValueObjectException`.
- Canonical enums live in `@nemis-desktop/types` mirrored from backend `@nemis/types`
  (single source of truth). Keep values identical; see the Phase 4 spec for the
  drift-check recommendation.
```

- [ ] **Step 6: Commit**

```bash
git add docs/conventions.md
git commit -m "docs: record domain-layer conventions; verify full workspace green"
```

- [ ] **Step 7: Final verification summary**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all three succeed. Phase 4 slice complete.

---

## Self-Review

**1. Spec coverage:**

- Discovery Report / Mapping Matrix → produced in the spec doc (Phase 4 spec Parts A–B); this plan implements the code slice they specify. ✔
- Kernel (Entity/AggregateRoot/ValueObject/DomainEvent/Specification/exceptions) → Tasks 3–5. ✔
- Cross-cutting value objects → Tasks 6–8. ✔
- Slice domains (identity, institution, students, academics, attendance, assessments) → Tasks 9–14. ✔
- Enum mirror in `@nemis-desktop/types` → Task 2. ✔
- Extension recipe + docs → Task 15. ✔
- Dependency-rule enforcement (ESLint) → Task 1 + verified Task 16 Step 4. ✔
- Value Object / Specification / Event / Exception strategies → realized across Tasks 3–14. ✔
- Standalone compilation → `pnpm --filter @nemis-desktop/domain typecheck` in every code task. ✔

**2. Placeholder scan:** No TBD/TODO; every code step contains complete, compiling code; tests contain real assertions.

**3. Type consistency:** `AggregateMetadata` shape (`version`/`updatedAt`/`lastModifiedBy`) used identically across all aggregates; `touch(by, at)` signature consistent; static `create`/`reconstitute` naming consistent; `pullDomainEvents()` used the same everywhere; enum imports are value-imports (needed for `.APPROVED` comparisons) and type-imports where only the type is used — matches each usage. Event `name` string literals in tests match the event interfaces.

**Note on `noUncheckedIndexedAccess`:** tests use optional chaining on array index access (`events[0]?.name`) as required by the strict config.
