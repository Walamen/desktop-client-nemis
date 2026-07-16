# Phase 3 Data Access Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Data Access Layer (repositories, base repository, query builder, mappers, validators, services, one proof-of-path IPC endpoint) so no application code ever talks to SQLite directly.

**Architecture:** A new `apps/desktop/electron/data/` directory (sibling of the Phase 2 `database/` platform) implements: Renderer → IPC → async Application Services → sync Repository interfaces → SQLite repository implementations → QueryBuilder → `DatabaseManager.connection`/`.transactions`. Repositories are synchronous (better-sqlite3 transactions cannot contain `await`); services are the async facade.

**Tech Stack:** TypeScript strict, better-sqlite3 (existing), Vitest, zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-16-phase-3-data-access-layer-design.md`

## Global Constraints

- Branch: `phase-3-data-access-layer` (already created off `main` at `0ddb094`).
- Zero new dependencies — hand-rolled query builder and validators.
- TypeScript strict; no `any`; named exports only; small focused files.
- Inside `electron/data/` and `electron/database/`, use **relative imports** (vitest has no path aliases). The `@app/*` alias is only for files under `electron/ipc/`, `electron/main/`, `electron/preload/`, `electron/windows/`, `electron/security/` (they are built by Vite, not imported by tests — exception: `security/validateIpc.ts` has no `@app` imports and IS tested).
- SQL values are **always parameterized**; identifiers validated. No SQL string concatenation of caller data, ever.
- IDs: `newId()` (UUID v4); timestamps: `nowIso()` (ISO-8601 UTC strings) — both from `electron/database/helpers/`.
- Repositories consume `DatabaseManager.connection` + `.transactions` only; never open a connection.
- **Before running any tests the first time:** run `pnpm rebuild:node` (swaps better-sqlite3 to Node ABI). Do NOT change the Electron 42.7.0 pin.
- Run all commands from the repo root `desktop-client-nemis/`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (use a second `-m`).
- After each task: code must be prettier-clean (`pnpm format` before committing if unsure).

---

### Task 1: Repository error taxonomy + error translation

**Files:**
- Create: `apps/desktop/electron/data/errors/repositoryErrors.ts`
- Create: `apps/desktop/electron/data/errors/translateError.ts`
- Test: `apps/desktop/electron/data/errors/translateError.test.ts`

**Interfaces:**
- Consumes: `DatabaseError` (`electron/database/errors/errors.ts`), `wrapSqliteError` (`electron/database/errors/wrapSqliteError.ts`).
- Produces: `RepositoryError` (base, `code: RepositoryErrorCode`, default `'REPO_UNKNOWN'`), `EntityNotFoundError` (`REPO_NOT_FOUND`), `DuplicateEntityError` (`REPO_DUPLICATE`), `TransactionFailureError` (`REPO_TRANSACTION`), `QueryError` (`REPO_QUERY`), `ValidationError` (`REPO_VALIDATION`, carries `issues: readonly ValidationIssue[]`), `ValidationIssue { field: string; message: string }`, `translateDatabaseError(error: unknown, context: string): RepositoryError`. All subclass constructors are `(message: string, options?: { cause?: unknown })` except `ValidationError(message, issues, options?)`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/errors/translateError.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ConstraintError, TransactionError } from '../../database/errors/errors';
import {
  DuplicateEntityError,
  EntityNotFoundError,
  RepositoryError,
  TransactionFailureError,
  ValidationError,
} from './repositoryErrors';
import { translateDatabaseError } from './translateError';

function sqliteError(code: string): Error {
  const error = new Error(`driver failure (${code})`);
  (error as Error & { code: string }).code = code;
  return error;
}

describe('repository error taxonomy', () => {
  it('sets name and code on every subclass', () => {
    const notFound = new EntityNotFoundError('Device not found: x');
    expect(notFound.code).toBe('REPO_NOT_FOUND');
    expect(notFound.name).toBe('EntityNotFoundError');
    expect(notFound).toBeInstanceOf(RepositoryError);
  });

  it('ValidationError carries its issues', () => {
    const error = new ValidationError('Device validation failed', [
      { field: 'deviceName', message: 'is required' },
    ]);
    expect(error.code).toBe('REPO_VALIDATION');
    expect(error.issues).toEqual([{ field: 'deviceName', message: 'is required' }]);
  });
});

describe('translateDatabaseError', () => {
  it('passes RepositoryError through unchanged', () => {
    const original = new EntityNotFoundError('Device not found: x');
    expect(translateDatabaseError(original, 'ctx')).toBe(original);
  });

  it('maps unique violations to DuplicateEntityError', () => {
    const result = translateDatabaseError(sqliteError('SQLITE_CONSTRAINT_UNIQUE'), 'AppSetting.setByKey');
    expect(result).toBeInstanceOf(DuplicateEntityError);
    expect(result.code).toBe('REPO_DUPLICATE');
  });

  it('maps primary-key violations to DuplicateEntityError', () => {
    const result = translateDatabaseError(sqliteError('SQLITE_CONSTRAINT_PRIMARYKEY'), 'Device.create');
    expect(result).toBeInstanceOf(DuplicateEntityError);
  });

  it('maps non-unique constraint failures to REPO_UNKNOWN, not duplicate', () => {
    const result = translateDatabaseError(sqliteError('SQLITE_CONSTRAINT_CHECK'), 'ctx');
    expect(result).toBeInstanceOf(RepositoryError);
    expect(result).not.toBeInstanceOf(DuplicateEntityError);
    expect(result.code).toBe('REPO_UNKNOWN');
  });

  it('detects unique violation on the cause chain of an already-wrapped ConstraintError', () => {
    const wrapped = new ConstraintError('ctx: database operation failed (SQLITE_CONSTRAINT_UNIQUE)', {
      cause: sqliteError('SQLITE_CONSTRAINT_UNIQUE'),
    });
    expect(translateDatabaseError(wrapped, 'ctx')).toBeInstanceOf(DuplicateEntityError);
  });

  it('maps TransactionError to TransactionFailureError', () => {
    const result = translateDatabaseError(new TransactionError('boom'), 'ctx');
    expect(result).toBeInstanceOf(TransactionFailureError);
    expect(result.code).toBe('REPO_TRANSACTION');
  });

  it('keeps the original error reachable via cause', () => {
    const original = sqliteError('SQLITE_BUSY');
    const result = translateDatabaseError(original, 'ctx');
    expect(result.code).toBe('REPO_UNKNOWN');
    let found = false;
    let current: unknown = result;
    while (current instanceof Error) {
      if (current === original) {
        found = true;
        break;
      }
      current = current.cause;
    }
    expect(found).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/errors/translateError.test.ts`
Expected: FAIL — cannot resolve `./repositoryErrors` / `./translateError`.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/electron/data/errors/repositoryErrors.ts`:

```ts
/**
 * Repository error taxonomy — the only error family that leaves the data
 * layer. Parallel to (not extending) the database-layer DatabaseError family:
 * driver and platform errors are translated at the repository boundary and
 * kept on `cause`.
 */
export type RepositoryErrorCode =
  | 'REPO_NOT_FOUND'
  | 'REPO_DUPLICATE'
  | 'REPO_VALIDATION'
  | 'REPO_TRANSACTION'
  | 'REPO_QUERY'
  | 'REPO_UNKNOWN';

export interface RepositoryErrorOptions {
  cause?: unknown;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(
    message: string,
    code: RepositoryErrorCode = 'REPO_UNKNOWN',
    options?: RepositoryErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class EntityNotFoundError extends RepositoryError {
  constructor(message: string, options?: RepositoryErrorOptions) {
    super(message, 'REPO_NOT_FOUND', options);
  }
}

export class DuplicateEntityError extends RepositoryError {
  constructor(message: string, options?: RepositoryErrorOptions) {
    super(message, 'REPO_DUPLICATE', options);
  }
}

export class TransactionFailureError extends RepositoryError {
  constructor(message: string, options?: RepositoryErrorOptions) {
    super(message, 'REPO_TRANSACTION', options);
  }
}

export class QueryError extends RepositoryError {
  constructor(message: string, options?: RepositoryErrorOptions) {
    super(message, 'REPO_QUERY', options);
  }
}

export class ValidationError extends RepositoryError {
  readonly issues: readonly ValidationIssue[];

  constructor(
    message: string,
    issues: readonly ValidationIssue[],
    options?: RepositoryErrorOptions,
  ) {
    super(message, 'REPO_VALIDATION', options);
    this.issues = issues;
  }
}
```

Create `apps/desktop/electron/data/errors/translateError.ts`:

```ts
import { DatabaseError } from '../../database/errors/errors';
import { wrapSqliteError } from '../../database/errors/wrapSqliteError';
import {
  DuplicateEntityError,
  RepositoryError,
  TransactionFailureError,
} from './repositoryErrors';

const UNIQUE_VIOLATION_CODES = new Set(['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY']);

function hasUniqueViolationInChain(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string' && UNIQUE_VIOLATION_CODES.has(code)) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/**
 * Converts anything thrown below the repository boundary into the
 * RepositoryError taxonomy. RepositoryErrors pass through unchanged;
 * everything else is normalized through the database taxonomy first and kept
 * on `cause` — raw driver errors never leave the data layer.
 */
export function translateDatabaseError(error: unknown, context: string): RepositoryError {
  if (error instanceof RepositoryError) {
    return error;
  }
  const wrapped = error instanceof DatabaseError ? error : wrapSqliteError(error, context);
  if (wrapped.code === 'DB_CONSTRAINT' && hasUniqueViolationInChain(error)) {
    return new DuplicateEntityError(`${context}: entity already exists`, { cause: wrapped });
  }
  if (wrapped.code === 'DB_TRANSACTION') {
    return new TransactionFailureError(`${context}: transaction failed`, { cause: wrapped });
  }
  return new RepositoryError(`${context}: data access failed (${wrapped.code})`, 'REPO_UNKNOWN', {
    cause: wrapped,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/errors/translateError.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data/errors
git commit -m "feat(data): repository error taxonomy and database-error translation" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Validation core

**Files:**
- Create: `apps/desktop/electron/data/validators/core.ts`
- Test: `apps/desktop/electron/data/validators/core.test.ts`

**Interfaces:**
- Consumes: `ValidationError`, `ValidationIssue` from `../errors/repositoryErrors` (Task 1).
- Produces: `ValidationRule = (value: unknown, field: string) => ValidationIssue | null`; rule factories `required()`, `isString()`, `minLength(n)`, `maxLength(n)`, `oneOf(allowed: readonly string[])`, `isIsoDate()`, `isNonNegativeInt()`, `isJsonSerializable()`; `ValidationSchema<T> = { readonly [K in keyof T]-?: readonly ValidationRule[] }`; `createValidator<T extends object>(entityName: string, schema: ValidationSchema<T>): (input: T) => void` (throws `ValidationError`).
- Convention: every rule except `required()` passes `null`/`undefined` — optional fields are only checked when present.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/validators/core.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors/repositoryErrors';
import {
  createValidator,
  isIsoDate,
  isJsonSerializable,
  isNonNegativeInt,
  isString,
  maxLength,
  minLength,
  oneOf,
  required,
} from './core';

describe('validation rules', () => {
  it('required rejects null, undefined, and empty string', () => {
    const rule = required();
    expect(rule(null, 'f')).toEqual({ field: 'f', message: 'is required' });
    expect(rule(undefined, 'f')).not.toBeNull();
    expect(rule('', 'f')).not.toBeNull();
    expect(rule('x', 'f')).toBeNull();
    expect(rule(0, 'f')).toBeNull();
  });

  it('optional rules pass absent values', () => {
    expect(isString()(undefined, 'f')).toBeNull();
    expect(maxLength(3)(null, 'f')).toBeNull();
    expect(oneOf(['a'])(undefined, 'f')).toBeNull();
    expect(isIsoDate()(null, 'f')).toBeNull();
    expect(isNonNegativeInt()(undefined, 'f')).toBeNull();
  });

  it('isString rejects non-strings', () => {
    expect(isString()(42, 'f')).toEqual({ field: 'f', message: 'must be a string' });
    expect(isString()('ok', 'f')).toBeNull();
  });

  it('minLength and maxLength bound string length', () => {
    expect(minLength(2)('a', 'f')).not.toBeNull();
    expect(minLength(2)('ab', 'f')).toBeNull();
    expect(maxLength(2)('abc', 'f')).not.toBeNull();
    expect(maxLength(2)('ab', 'f')).toBeNull();
  });

  it('oneOf allows only listed values', () => {
    const rule = oneOf(['pending', 'failed']);
    expect(rule('pending', 'f')).toBeNull();
    expect(rule('nope', 'f')).toEqual({
      field: 'f',
      message: 'must be one of: pending, failed',
    });
  });

  it('isIsoDate accepts ISO-8601 strings and rejects garbage', () => {
    expect(isIsoDate()('2026-07-16T00:00:00.000Z', 'f')).toBeNull();
    expect(isIsoDate()('not-a-date', 'f')).not.toBeNull();
    expect(isIsoDate()(1234, 'f')).not.toBeNull();
  });

  it('isNonNegativeInt accepts 0 and positives, rejects negatives and floats', () => {
    expect(isNonNegativeInt()(0, 'f')).toBeNull();
    expect(isNonNegativeInt()(5, 'f')).toBeNull();
    expect(isNonNegativeInt()(-1, 'f')).not.toBeNull();
    expect(isNonNegativeInt()(1.5, 'f')).not.toBeNull();
    expect(isNonNegativeInt()('5', 'f')).not.toBeNull();
  });

  it('isJsonSerializable rejects circular structures and bare functions', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(isJsonSerializable()(circular, 'f')).not.toBeNull();
    expect(isJsonSerializable()(() => 'x', 'f')).not.toBeNull();
    expect(isJsonSerializable()({ a: 1 }, 'f')).toBeNull();
    expect(isJsonSerializable()(null, 'f')).toBeNull();
  });
});

describe('createValidator', () => {
  interface Sample {
    name: string;
    kind?: string;
  }
  const validate = createValidator<Sample>('Sample', {
    name: [required(), isString(), maxLength(5)],
    kind: [isString(), oneOf(['a', 'b'])],
  });

  it('passes valid input', () => {
    expect(() => validate({ name: 'ok' })).not.toThrow();
    expect(() => validate({ name: 'ok', kind: 'a' })).not.toThrow();
  });

  it('collects one issue per failing field and throws ValidationError', () => {
    try {
      validate({ name: '', kind: 'zzz' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const issues = (error as ValidationError).issues;
      expect(issues).toHaveLength(2);
      expect(issues.map((i) => i.field).sort()).toEqual(['kind', 'name']);
    }
  });

  it('stops at the first failing rule per field', () => {
    try {
      validate({ name: undefined as unknown as string });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ValidationError).issues).toHaveLength(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/validators/core.test.ts`
Expected: FAIL — cannot resolve `./core`.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/electron/data/validators/core.ts`:

```ts
import { ValidationError, type ValidationIssue } from '../errors/repositoryErrors';

/**
 * Persistence-level validation only — no UI rules, no business rules.
 * Every rule except required() passes null/undefined: optional fields are
 * validated only when present.
 */
export type ValidationRule = (value: unknown, field: string) => ValidationIssue | null;

function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}

export function required(): ValidationRule {
  return (value, field) =>
    value === null || value === undefined || value === ''
      ? { field, message: 'is required' }
      : null;
}

export function isString(): ValidationRule {
  return (value, field) =>
    isAbsent(value) || typeof value === 'string' ? null : { field, message: 'must be a string' };
}

export function minLength(min: number): ValidationRule {
  return (value, field) =>
    isAbsent(value) || typeof value !== 'string' || value.length >= min
      ? null
      : { field, message: `must be at least ${min} characters` };
}

export function maxLength(max: number): ValidationRule {
  return (value, field) =>
    isAbsent(value) || typeof value !== 'string' || value.length <= max
      ? null
      : { field, message: `must be at most ${max} characters` };
}

export function oneOf(allowed: readonly string[]): ValidationRule {
  return (value, field) =>
    isAbsent(value) || (typeof value === 'string' && allowed.includes(value))
      ? null
      : { field, message: `must be one of: ${allowed.join(', ')}` };
}

export function isIsoDate(): ValidationRule {
  return (value, field) =>
    isAbsent(value) || (typeof value === 'string' && !Number.isNaN(Date.parse(value)))
      ? null
      : { field, message: 'must be an ISO-8601 date string' };
}

export function isNonNegativeInt(): ValidationRule {
  return (value, field) =>
    isAbsent(value) || (typeof value === 'number' && Number.isInteger(value) && value >= 0)
      ? null
      : { field, message: 'must be a non-negative integer' };
}

export function isJsonSerializable(): ValidationRule {
  return (value, field) => {
    if (value === undefined) {
      return null;
    }
    try {
      return JSON.stringify(value) === undefined
        ? { field, message: 'must be JSON-serializable' }
        : null;
    } catch {
      return { field, message: 'must be JSON-serializable' };
    }
  };
}

export type ValidationSchema<T> = { readonly [K in keyof T]-?: readonly ValidationRule[] };

/** Returns a validate function that throws ValidationError listing every failing field. */
export function createValidator<T extends object>(
  entityName: string,
  schema: ValidationSchema<T>,
): (input: T) => void {
  return (input) => {
    const issues: ValidationIssue[] = [];
    for (const key of Object.keys(schema) as (keyof T & string)[]) {
      for (const rule of schema[key]) {
        const issue = rule((input as Record<string, unknown>)[key], key);
        if (issue) {
          issues.push(issue);
          break; // first failure per field is enough
        }
      }
    }
    if (issues.length > 0) {
      throw new ValidationError(
        `${entityName} validation failed: ${issues.map((i) => `${i.field} ${i.message}`).join('; ')}`,
        issues,
      );
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/validators/core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data/validators
git commit -m "feat(data): composable persistence validation core" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Query builder — identifiers and predicates

**Files:**
- Create: `apps/desktop/electron/data/queries/identifiers.ts`
- Create: `apps/desktop/electron/data/queries/predicates.ts`
- Test: `apps/desktop/electron/data/queries/predicates.test.ts`

**Interfaces:**
- Consumes: `QueryError` from `../errors/repositoryErrors` (Task 1).
- Produces: `assertIdentifier(name: string): string`; `SqlValue = string | number | null`; `Predicate` (discriminated union); predicate factories `eq/neq/gt/gte/lt/lte(column, value)`, `like(column, pattern)`, `inList(column, values)`, `isNull(column)`, `isNotNull(column)`, `and(...predicates)`, `or(...predicates)`; `SqlFragment { sql: string; params: SqlValue[] }`; `renderPredicate(predicate: Predicate): SqlFragment`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/queries/predicates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { QueryError } from '../errors/repositoryErrors';
import { assertIdentifier } from './identifiers';
import {
  and,
  eq,
  gt,
  inList,
  isNotNull,
  isNull,
  like,
  lt,
  neq,
  or,
  renderPredicate,
} from './predicates';

describe('assertIdentifier', () => {
  it('accepts plain identifiers', () => {
    expect(assertIdentifier('createdAt')).toBe('createdAt');
    expect(assertIdentifier('sync_queue')).toBe('sync_queue');
    expect(assertIdentifier('_x1')).toBe('_x1');
  });

  it('rejects anything that is not a bare identifier', () => {
    for (const bad of ['id; DROP TABLE devices', 'a b', 'a-b', '1a', '', 'a"b', "a'b", 'a.b']) {
      expect(() => assertIdentifier(bad), bad).toThrow(QueryError);
    }
  });
});

describe('renderPredicate', () => {
  it('renders comparisons with parameterized values', () => {
    expect(renderPredicate(eq('status', 'pending'))).toEqual({
      sql: 'status = ?',
      params: ['pending'],
    });
    expect(renderPredicate(neq('retryCount', 0))).toEqual({
      sql: 'retryCount != ?',
      params: [0],
    });
    expect(renderPredicate(gt('createdAt', '2026-01-01'))).toEqual({
      sql: 'createdAt > ?',
      params: ['2026-01-01'],
    });
    expect(renderPredicate(lt('createdAt', '2026-02-01'))).toEqual({
      sql: 'createdAt < ?',
      params: ['2026-02-01'],
    });
  });

  it('renders LIKE with a parameterized pattern', () => {
    expect(renderPredicate(like('event', 'sync.%'))).toEqual({
      sql: 'event LIKE ?',
      params: ['sync.%'],
    });
  });

  it('renders IN with one placeholder per value', () => {
    expect(renderPredicate(inList('id', ['a', 'b', 'c']))).toEqual({
      sql: 'id IN (?, ?, ?)',
      params: ['a', 'b', 'c'],
    });
  });

  it('renders an empty IN as a match-nothing predicate', () => {
    expect(renderPredicate(inList('id', []))).toEqual({ sql: '1 = 0', params: [] });
  });

  it('renders IS NULL / IS NOT NULL without params', () => {
    expect(renderPredicate(isNull('lastSyncAt'))).toEqual({ sql: 'lastSyncAt IS NULL', params: [] });
    expect(renderPredicate(isNotNull('payload'))).toEqual({
      sql: 'payload IS NOT NULL',
      params: [],
    });
  });

  it('renders AND/OR groups with parentheses and ordered params', () => {
    const predicate = and(eq('status', 'pending'), or(gt('retryCount', 3), isNull('payload')));
    expect(renderPredicate(predicate)).toEqual({
      sql: '(status = ? AND (retryCount > ? OR payload IS NULL))',
      params: ['pending', 3],
    });
  });

  it('rejects empty groups', () => {
    expect(() => renderPredicate(and())).toThrow(QueryError);
  });

  it('rejects malicious column names in every predicate kind', () => {
    expect(() => renderPredicate(eq('id; DROP TABLE x', 1))).toThrow(QueryError);
    expect(() => renderPredicate(inList('a b', [1]))).toThrow(QueryError);
    expect(() => renderPredicate(isNull('a"b'))).toThrow(QueryError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/queries/predicates.test.ts`
Expected: FAIL — cannot resolve `./identifiers` / `./predicates`.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/electron/data/queries/identifiers.ts`:

```ts
import { QueryError } from '../errors/repositoryErrors';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * SQL identifiers (table/column names) cannot be parameterized — the only
 * defense is refusing anything that is not a bare identifier.
 */
export function assertIdentifier(name: string): string {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new QueryError(`Invalid SQL identifier: "${name}"`);
  }
  return name;
}
```

Create `apps/desktop/electron/data/queries/predicates.ts`:

```ts
import { QueryError } from '../errors/repositoryErrors';
import { assertIdentifier } from './identifiers';

/** The only value types the platform stores. Use isNull() for NULL checks — `eq(col, null)` never matches in SQL. */
export type SqlValue = string | number | null;

type CompareOp = '=' | '!=' | '>' | '>=' | '<' | '<=';

export type Predicate =
  | { readonly kind: 'compare'; readonly column: string; readonly op: CompareOp; readonly value: SqlValue }
  | { readonly kind: 'like'; readonly column: string; readonly pattern: string }
  | { readonly kind: 'in'; readonly column: string; readonly values: readonly SqlValue[] }
  | { readonly kind: 'null'; readonly column: string; readonly negated: boolean }
  | { readonly kind: 'group'; readonly join: 'AND' | 'OR'; readonly predicates: readonly Predicate[] };

function compare(column: string, op: CompareOp, value: SqlValue): Predicate {
  return { kind: 'compare', column, op, value };
}

export function eq(column: string, value: SqlValue): Predicate {
  return compare(column, '=', value);
}

export function neq(column: string, value: SqlValue): Predicate {
  return compare(column, '!=', value);
}

export function gt(column: string, value: SqlValue): Predicate {
  return compare(column, '>', value);
}

export function gte(column: string, value: SqlValue): Predicate {
  return compare(column, '>=', value);
}

export function lt(column: string, value: SqlValue): Predicate {
  return compare(column, '<', value);
}

export function lte(column: string, value: SqlValue): Predicate {
  return compare(column, '<=', value);
}

export function like(column: string, pattern: string): Predicate {
  return { kind: 'like', column, pattern };
}

export function inList(column: string, values: readonly SqlValue[]): Predicate {
  return { kind: 'in', column, values };
}

export function isNull(column: string): Predicate {
  return { kind: 'null', column, negated: false };
}

export function isNotNull(column: string): Predicate {
  return { kind: 'null', column, negated: true };
}

export function and(...predicates: Predicate[]): Predicate {
  return { kind: 'group', join: 'AND', predicates };
}

export function or(...predicates: Predicate[]): Predicate {
  return { kind: 'group', join: 'OR', predicates };
}

export interface SqlFragment {
  sql: string;
  params: SqlValue[];
}

export function renderPredicate(predicate: Predicate): SqlFragment {
  switch (predicate.kind) {
    case 'compare':
      return {
        sql: `${assertIdentifier(predicate.column)} ${predicate.op} ?`,
        params: [predicate.value],
      };
    case 'like':
      return { sql: `${assertIdentifier(predicate.column)} LIKE ?`, params: [predicate.pattern] };
    case 'in': {
      if (predicate.values.length === 0) {
        // Empty IN () is a SQL syntax error; match nothing, deterministically.
        return { sql: '1 = 0', params: [] };
      }
      const placeholders = predicate.values.map(() => '?').join(', ');
      return {
        sql: `${assertIdentifier(predicate.column)} IN (${placeholders})`,
        params: [...predicate.values],
      };
    }
    case 'null':
      return {
        sql: `${assertIdentifier(predicate.column)} IS ${predicate.negated ? 'NOT NULL' : 'NULL'}`,
        params: [],
      };
    case 'group': {
      if (predicate.predicates.length === 0) {
        throw new QueryError('Predicate groups must contain at least one predicate');
      }
      const parts = predicate.predicates.map(renderPredicate);
      return {
        sql: `(${parts.map((part) => part.sql).join(` ${predicate.join} `)})`,
        params: parts.flatMap((part) => part.params),
      };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/queries/predicates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data/queries
git commit -m "feat(data): query predicates with identifier validation and parameterized rendering" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Query builder — statement builders

**Files:**
- Create: `apps/desktop/electron/data/queries/builders.ts`
- Test: `apps/desktop/electron/data/queries/builders.test.ts`

**Interfaces:**
- Consumes: `assertIdentifier` (Task 3), `renderPredicate`, `Predicate`, `SqlValue` (Task 3), `QueryError` (Task 1), `TableName` from `../../database/schema/tableNames`.
- Produces: `BuiltQuery { sql: string; params: SqlValue[] }`; `SortDirection = 'asc' | 'desc'`; factories `select(table: TableName): SelectBuilder`, `insertInto(table): InsertBuilder`, `updateTable(table): UpdateBuilder`, `deleteFrom(table): DeleteBuilder`, `countFrom(table): CountBuilder`. SelectBuilder: `.columns(...cols)`, `.where(p)` (multiple calls AND), `.orderBy(column, direction = 'asc')` (chainable, multi), `.limit(n)`, `.offset(n)`, `.build()`. InsertBuilder: `.values(row: Record<string, SqlValue>)`, `.build()`. UpdateBuilder: `.set(changes)`, `.where(p)`, `.build()` (throws QueryError without WHERE or empty SET). DeleteBuilder: `.where(p)`, `.build()` (throws without WHERE). CountBuilder: `.where(p)`, `.build()` → `SELECT COUNT(*) AS count …`. LIMIT/OFFSET are parameterized (`LIMIT ?` / `OFFSET ?`; OFFSET without LIMIT emits literal `LIMIT -1`) so SQL text stays stable for statement caching.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/queries/builders.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { QueryError } from '../errors/repositoryErrors';
import { countFrom, deleteFrom, insertInto, select, updateTable } from './builders';
import { and, eq, lt } from './predicates';

describe('select', () => {
  it('builds SELECT * with no clauses', () => {
    expect(select('devices').build()).toEqual({ sql: 'SELECT * FROM devices', params: [] });
  });

  it('builds a full query with where, order, limit, and offset', () => {
    const built = select('sync_queue')
      .columns('id', 'status')
      .where(eq('status', 'pending'))
      .orderBy('createdAt')
      .orderBy('id', 'desc')
      .limit(50)
      .offset(100)
      .build();
    expect(built.sql).toBe(
      'SELECT id, status FROM sync_queue WHERE status = ? ORDER BY createdAt ASC, id DESC LIMIT ? OFFSET ?',
    );
    expect(built.params).toEqual(['pending', 50, 100]);
  });

  it('ANDs multiple where() calls', () => {
    const built = select('audit_log')
      .where(eq('category', 'sync'))
      .where(lt('createdAt', '2026-01-01'))
      .build();
    expect(built.sql).toBe('SELECT * FROM audit_log WHERE category = ? AND createdAt < ?');
    expect(built.params).toEqual(['sync', '2026-01-01']);
  });

  it('emits LIMIT -1 when only offset is set', () => {
    const built = select('devices').offset(10).build();
    expect(built.sql).toBe('SELECT * FROM devices LIMIT -1 OFFSET ?');
    expect(built.params).toEqual([10]);
  });

  it('rejects negative and non-integer limit/offset', () => {
    expect(() => select('devices').limit(-1)).toThrow(QueryError);
    expect(() => select('devices').offset(1.5)).toThrow(QueryError);
  });

  it('rejects malicious column and table names', () => {
    expect(() => select('devices').columns('id; DROP TABLE x')).toThrow(QueryError);
    expect(() => select('devices').orderBy('a b')).toThrow(QueryError);
  });
});

describe('insertInto', () => {
  it('builds a parameterized INSERT', () => {
    const built = insertInto('devices')
      .values({ id: 'd1', deviceName: 'lab', platform: 'win32' })
      .build();
    expect(built.sql).toBe('INSERT INTO devices (id, deviceName, platform) VALUES (?, ?, ?)');
    expect(built.params).toEqual(['d1', 'lab', 'win32']);
  });

  it('rejects an empty row', () => {
    expect(() => insertInto('devices').values({}).build()).toThrow(QueryError);
    expect(() => insertInto('devices').build()).toThrow(QueryError);
  });
});

describe('updateTable', () => {
  it('builds a parameterized UPDATE with WHERE', () => {
    const built = updateTable('devices')
      .set({ deviceName: 'renamed', updatedAt: 't1' })
      .where(eq('id', 'd1'))
      .build();
    expect(built.sql).toBe('UPDATE devices SET deviceName = ?, updatedAt = ? WHERE id = ?');
    expect(built.params).toEqual(['renamed', 't1', 'd1']);
  });

  it('refuses to build without WHERE (no accidental full-table updates)', () => {
    expect(() => updateTable('devices').set({ deviceName: 'x' }).build()).toThrow(QueryError);
  });

  it('refuses to build with an empty SET', () => {
    expect(() => updateTable('devices').where(eq('id', 'd1')).build()).toThrow(QueryError);
  });
});

describe('deleteFrom', () => {
  it('builds a parameterized DELETE with WHERE', () => {
    const built = deleteFrom('sync_queue')
      .where(and(eq('status', 'completed'), lt('createdAt', 't0')))
      .build();
    expect(built.sql).toBe('DELETE FROM sync_queue WHERE (status = ? AND createdAt < ?)');
    expect(built.params).toEqual(['completed', 't0']);
  });

  it('refuses to build without WHERE (no accidental full-table deletes)', () => {
    expect(() => deleteFrom('sync_queue').build()).toThrow(QueryError);
  });
});

describe('countFrom', () => {
  it('builds COUNT with and without WHERE', () => {
    expect(countFrom('devices').build()).toEqual({
      sql: 'SELECT COUNT(*) AS count FROM devices',
      params: [],
    });
    const built = countFrom('sync_queue').where(eq('status', 'pending')).build();
    expect(built.sql).toBe('SELECT COUNT(*) AS count FROM sync_queue WHERE status = ?');
    expect(built.params).toEqual(['pending']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/queries/builders.test.ts`
Expected: FAIL — cannot resolve `./builders`.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/electron/data/queries/builders.ts`:

```ts
import type { TableName } from '../../database/schema/tableNames';
import { QueryError } from '../errors/repositoryErrors';
import { assertIdentifier } from './identifiers';
import { renderPredicate, type Predicate, type SqlValue } from './predicates';

export interface BuiltQuery {
  sql: string;
  params: SqlValue[];
}

export type SortDirection = 'asc' | 'desc';

function assertNonNegativeInt(value: number, clause: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new QueryError(`${clause} must be a non-negative integer, got ${value}`);
  }
  return value;
}

function renderWhere(predicates: readonly Predicate[], params: SqlValue[]): string {
  if (predicates.length === 0) {
    return '';
  }
  const parts = predicates.map(renderPredicate);
  for (const part of parts) {
    params.push(...part.params);
  }
  return ` WHERE ${parts.map((part) => part.sql).join(' AND ')}`;
}

export class SelectBuilder {
  readonly #table: string;
  #columns: readonly string[] | null = null;
  readonly #predicates: Predicate[] = [];
  readonly #order: { column: string; direction: SortDirection }[] = [];
  #limit: number | null = null;
  #offset: number | null = null;

  constructor(table: TableName) {
    this.#table = assertIdentifier(table);
  }

  columns(...columns: string[]): this {
    this.#columns = columns.map(assertIdentifier);
    return this;
  }

  where(predicate: Predicate): this {
    this.#predicates.push(predicate);
    return this;
  }

  orderBy(column: string, direction: SortDirection = 'asc'): this {
    this.#order.push({ column: assertIdentifier(column), direction });
    return this;
  }

  limit(count: number): this {
    this.#limit = assertNonNegativeInt(count, 'LIMIT');
    return this;
  }

  offset(count: number): this {
    this.#offset = assertNonNegativeInt(count, 'OFFSET');
    return this;
  }

  build(): BuiltQuery {
    const params: SqlValue[] = [];
    let sql = `SELECT ${this.#columns ? this.#columns.join(', ') : '*'} FROM ${this.#table}`;
    sql += renderWhere(this.#predicates, params);
    if (this.#order.length > 0) {
      const order = this.#order
        .map((entry) => `${entry.column} ${entry.direction.toUpperCase()}`)
        .join(', ');
      sql += ` ORDER BY ${order}`;
    }
    // LIMIT/OFFSET are parameterized so the SQL text (statement-cache key)
    // stays stable across page sizes. SQLite needs LIMIT before OFFSET;
    // LIMIT -1 means "no limit".
    if (this.#limit !== null) {
      sql += ' LIMIT ?';
      params.push(this.#limit);
    } else if (this.#offset !== null) {
      sql += ' LIMIT -1';
    }
    if (this.#offset !== null) {
      sql += ' OFFSET ?';
      params.push(this.#offset);
    }
    return { sql, params };
  }
}

export class InsertBuilder {
  readonly #table: string;
  #row: Record<string, SqlValue> | null = null;

  constructor(table: TableName) {
    this.#table = assertIdentifier(table);
  }

  values(row: Record<string, SqlValue>): this {
    this.#row = row;
    return this;
  }

  build(): BuiltQuery {
    if (this.#row === null || Object.keys(this.#row).length === 0) {
      throw new QueryError('INSERT requires at least one column');
    }
    const row = this.#row;
    const columns = Object.keys(row).map(assertIdentifier);
    return {
      sql: `INSERT INTO ${this.#table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      params: columns.map((column) => row[column]),
    };
  }
}

export class UpdateBuilder {
  readonly #table: string;
  #changes: Record<string, SqlValue> | null = null;
  readonly #predicates: Predicate[] = [];

  constructor(table: TableName) {
    this.#table = assertIdentifier(table);
  }

  set(changes: Record<string, SqlValue>): this {
    this.#changes = changes;
    return this;
  }

  where(predicate: Predicate): this {
    this.#predicates.push(predicate);
    return this;
  }

  build(): BuiltQuery {
    if (this.#changes === null || Object.keys(this.#changes).length === 0) {
      throw new QueryError('UPDATE requires at least one SET column');
    }
    if (this.#predicates.length === 0) {
      throw new QueryError('UPDATE requires a WHERE clause — full-table updates are not allowed');
    }
    const changes = this.#changes;
    const columns = Object.keys(changes).map(assertIdentifier);
    const params: SqlValue[] = columns.map((column) => changes[column]);
    let sql = `UPDATE ${this.#table} SET ${columns.map((column) => `${column} = ?`).join(', ')}`;
    sql += renderWhere(this.#predicates, params);
    return { sql, params };
  }
}

export class DeleteBuilder {
  readonly #table: string;
  readonly #predicates: Predicate[] = [];

  constructor(table: TableName) {
    this.#table = assertIdentifier(table);
  }

  where(predicate: Predicate): this {
    this.#predicates.push(predicate);
    return this;
  }

  build(): BuiltQuery {
    if (this.#predicates.length === 0) {
      throw new QueryError('DELETE requires a WHERE clause — full-table deletes are not allowed');
    }
    const params: SqlValue[] = [];
    const sql = `DELETE FROM ${this.#table}${renderWhere(this.#predicates, params)}`;
    return { sql, params };
  }
}

export class CountBuilder {
  readonly #table: string;
  readonly #predicates: Predicate[] = [];

  constructor(table: TableName) {
    this.#table = assertIdentifier(table);
  }

  where(predicate: Predicate): this {
    this.#predicates.push(predicate);
    return this;
  }

  build(): BuiltQuery {
    const params: SqlValue[] = [];
    const sql = `SELECT COUNT(*) AS count FROM ${this.#table}${renderWhere(this.#predicates, params)}`;
    return { sql, params };
  }
}

export function select(table: TableName): SelectBuilder {
  return new SelectBuilder(table);
}

export function insertInto(table: TableName): InsertBuilder {
  return new InsertBuilder(table);
}

export function updateTable(table: TableName): UpdateBuilder {
  return new UpdateBuilder(table);
}

export function deleteFrom(table: TableName): DeleteBuilder {
  return new DeleteBuilder(table);
}

export function countFrom(table: TableName): CountBuilder {
  return new CountBuilder(table);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/queries/builders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data/queries
git commit -m "feat(data): fluent SELECT/INSERT/UPDATE/DELETE/COUNT builders" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Models, DTOs, JSON helpers, and mappers

**Files:**
- Create: `apps/desktop/electron/data/models/platform.ts`
- Create: `apps/desktop/electron/data/dto/platform.ts`
- Create: `apps/desktop/electron/data/dto/query.ts`
- Create: `apps/desktop/electron/data/mappers/RowMapper.ts`
- Create: `apps/desktop/electron/data/mappers/json.ts`
- Create: `apps/desktop/electron/data/mappers/platformMappers.ts`
- Test: `apps/desktop/electron/data/mappers/platformMappers.test.ts`

**Interfaces:**
- Consumes: `RepositoryError` (Task 1), `SortDirection` (Task 4).
- Produces:
  - Models (`models/platform.ts`): `Device`, `AppSetting`, `SyncMetadata`, `SyncQueueItem`, `SyncError`, `AuditLogEntry`; const arrays + literal types `SYNC_STATUSES`/`SyncStatus`, `SYNC_OPERATION_TYPES`/`SyncOperationType`, `SYNC_QUEUE_STATUSES`/`SyncQueueStatus`, `AUDIT_CATEGORIES`/`AuditCategory`. All timestamps are ISO-8601 `string`s.
  - DTOs (`dto/platform.ts`): `CreateDeviceInput`, `UpdateDeviceInput`, `SetSettingInput`, `UpdateSyncMetadataInput`, `EnqueueSyncOperationInput`, `RecordSyncErrorInput`, `AppendAuditEntryInput`.
  - Query DTOs (`dto/query.ts`): `SortSpec { column: string; direction: SortDirection }`, `PageRequest { limit: number; offset: number }`, `QueryOptions { orderBy?; page? }`, `PageOptions { orderBy?; page: PageRequest }`, `Page<T> { items: T[]; total: number; limit: number; offset: number }`.
  - Mappers: `RowMapper<TRow, TModel> { toModel(row: TRow): TModel }`; `parseJsonColumn(text: string | null, context: string): unknown`; `serializeJsonColumn(value: unknown, context: string): string | null`; row types `DeviceRow`, `AppSettingRow`, `SyncMetadataRow`, `SyncQueueRow`, `SyncErrorRow`, `AuditLogRow`; mapper objects `deviceMapper`, `appSettingMapper`, `syncMetadataMapper`, `syncQueueMapper`, `syncErrorMapper`, `auditLogMapper`.
  - **Row shapes MUST be `type` aliases, not `interface`s** — Task 6's `BaseRepository<TRow extends Record<string, SqlValue>, …>` constraint requires an implicit index signature, which TypeScript gives to type aliases but not to interfaces.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/mappers/platformMappers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RepositoryError } from '../errors/repositoryErrors';
import { parseJsonColumn, serializeJsonColumn } from './json';
import {
  appSettingMapper,
  auditLogMapper,
  deviceMapper,
  syncQueueMapper,
} from './platformMappers';

describe('json column helpers', () => {
  it('parses stored JSON and passes NULL through', () => {
    expect(parseJsonColumn('{"a":1}', 'ctx')).toEqual({ a: 1 });
    expect(parseJsonColumn('null', 'ctx')).toBeNull();
    expect(parseJsonColumn(null, 'ctx')).toBeNull();
  });

  it('reports corrupt stored JSON as a repository error', () => {
    expect(() => parseJsonColumn('{nope', 'audit_log.details')).toThrow(RepositoryError);
  });

  it('serializes values and maps undefined to NULL', () => {
    expect(serializeJsonColumn({ a: 1 }, 'ctx')).toBe('{"a":1}');
    expect(serializeJsonColumn(null, 'ctx')).toBe('null');
    expect(serializeJsonColumn(undefined, 'ctx')).toBeNull();
  });

  it('rejects non-serializable values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => serializeJsonColumn(circular, 'ctx')).toThrow(RepositoryError);
  });
});

describe('platform mappers', () => {
  it('deviceMapper copies the row verbatim', () => {
    const row = {
      id: 'd1',
      deviceName: 'lab-01',
      platform: 'win32',
      osVersion: '10.0.19045',
      appVersion: '1.0.0',
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    };
    expect(deviceMapper.toModel(row)).toEqual(row);
  });

  it('appSettingMapper parses the JSON value column', () => {
    const model = appSettingMapper.toModel({
      id: 's1',
      key: 'theme',
      value: '"system"',
      createdAt: 't0',
      updatedAt: 't0',
    });
    expect(model.value).toBe('system');
  });

  it('syncQueueMapper parses payload and narrows enums', () => {
    const model = syncQueueMapper.toModel({
      id: 'q1',
      entityType: 'student',
      entityId: 'e1',
      operationType: 'create',
      payload: '{"name":"Ada"}',
      retryCount: 0,
      status: 'pending',
      createdAt: 't0',
      updatedAt: 't0',
    });
    expect(model.payload).toEqual({ name: 'Ada' });
    expect(model.status).toBe('pending');
  });

  it('auditLogMapper passes NULL details through as null', () => {
    const model = auditLogMapper.toModel({
      id: 'a1',
      category: 'database',
      event: 'database.started',
      details: null,
      createdAt: 't0',
    });
    expect(model.details).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/mappers/platformMappers.test.ts`
Expected: FAIL — cannot resolve `./json` / `./platformMappers`.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/electron/data/models/platform.ts`:

```ts
/**
 * Domain models for the Phase 2 platform tables. Timestamps are ISO-8601 UTC
 * strings (project convention — serializable across IPC as-is). Raw SQLite
 * rows never leave the data layer; these models are what callers see.
 */

export const SYNC_STATUSES = ['never', 'idle', 'syncing', 'failed'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_OPERATION_TYPES = ['create', 'update', 'delete'] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

export const SYNC_QUEUE_STATUSES = ['pending', 'in_flight', 'completed', 'failed'] as const;
export type SyncQueueStatus = (typeof SYNC_QUEUE_STATUSES)[number];

export const AUDIT_CATEGORIES = ['application', 'database', 'sync', 'security'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export interface Device {
  id: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSetting {
  id: string;
  key: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SyncMetadata {
  id: 'singleton';
  lastSyncAt: string | null;
  schemaVersion: number;
  databaseVersion: number;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueItem {
  id: string;
  entityType: string;
  entityId: string;
  operationType: SyncOperationType;
  payload: unknown;
  retryCount: number;
  status: SyncQueueStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SyncError {
  id: string;
  operationId: string | null;
  message: string;
  stack: string | null;
  retryCount: number;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  category: AuditCategory;
  event: string;
  details: unknown;
  createdAt: string;
}
```

Create `apps/desktop/electron/data/dto/platform.ts`:

```ts
import type { AuditCategory, SyncOperationType, SyncStatus } from '../models/platform';

/**
 * Repository input shapes. IDs and createdAt/updatedAt are generated inside
 * repositories — never accepted from callers.
 */

export interface CreateDeviceInput {
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
}

export interface UpdateDeviceInput {
  deviceName?: string;
  osVersion?: string;
  appVersion?: string;
}

export interface SetSettingInput {
  key: string;
  value: unknown;
}

export interface UpdateSyncMetadataInput {
  lastSyncAt?: string | null;
  syncStatus?: SyncStatus;
  schemaVersion?: number;
  databaseVersion?: number;
}

export interface EnqueueSyncOperationInput {
  entityType: string;
  entityId: string;
  operationType: SyncOperationType;
  payload?: unknown;
}

export interface RecordSyncErrorInput {
  operationId: string | null;
  message: string;
  stack?: string | null;
  retryCount?: number;
}

export interface AppendAuditEntryInput {
  category: AuditCategory;
  event: string;
  details?: unknown;
}
```

Create `apps/desktop/electron/data/dto/query.ts`:

```ts
import type { SortDirection } from '../queries/builders';

export interface SortSpec {
  column: string;
  direction: SortDirection;
}

export interface PageRequest {
  limit: number;
  offset: number;
}

export interface QueryOptions {
  orderBy?: readonly SortSpec[];
  page?: PageRequest;
}

/** Like QueryOptions, but a page is mandatory (used by findPage). */
export interface PageOptions {
  orderBy?: readonly SortSpec[];
  page: PageRequest;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
```

Create `apps/desktop/electron/data/mappers/RowMapper.ts`:

```ts
/** Converts raw SQLite rows into domain models. Pure — no I/O, no state. */
export interface RowMapper<TRow, TModel> {
  toModel(row: TRow): TModel;
}
```

Create `apps/desktop/electron/data/mappers/json.ts`:

```ts
import { RepositoryError } from '../errors/repositoryErrors';

/** Parses a JSON TEXT column; corrupt content is a data-integrity failure, not a caller error. */
export function parseJsonColumn(text: string | null, context: string): unknown {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new RepositoryError(`${context}: stored JSON is corrupt`, 'REPO_UNKNOWN', {
      cause: error,
    });
  }
}

/** undefined → NULL; everything else JSON-serialized (null stores as the string 'null'). */
export function serializeJsonColumn(value: unknown, context: string): string | null {
  if (value === undefined) {
    return null;
  }
  try {
    const text = JSON.stringify(value);
    if (text === undefined) {
      throw new Error('value has no JSON representation');
    }
    return text;
  } catch (error) {
    throw new RepositoryError(`${context}: value is not JSON-serializable`, 'REPO_UNKNOWN', {
      cause: error,
    });
  }
}
```

Create `apps/desktop/electron/data/mappers/platformMappers.ts`:

```ts
import type {
  AppSetting,
  AuditCategory,
  AuditLogEntry,
  Device,
  SyncError,
  SyncMetadata,
  SyncOperationType,
  SyncQueueItem,
  SyncQueueStatus,
  SyncStatus,
} from '../models/platform';
import { parseJsonColumn } from './json';
import type { RowMapper } from './RowMapper';

// Enum-typed columns are narrowed with `as` — the schema's CHECK constraints
// guarantee the stored values; the cast records that guarantee for TypeScript.
//
// Row shapes are `type` aliases (NOT interfaces) on purpose: BaseRepository's
// `TRow extends Record<string, SqlValue>` constraint needs the implicit index
// signature that TypeScript gives type aliases but not interfaces.

export type DeviceRow = {
  id: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
};

export const deviceMapper: RowMapper<DeviceRow, Device> = {
  toModel: (row) => ({ ...row }),
};

export type AppSettingRow = {
  id: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

export const appSettingMapper: RowMapper<AppSettingRow, AppSetting> = {
  toModel: (row) => ({
    id: row.id,
    key: row.key,
    value: parseJsonColumn(row.value, `app_settings.value (${row.key})`),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }),
};

export type SyncMetadataRow = {
  id: string;
  lastSyncAt: string | null;
  schemaVersion: number;
  databaseVersion: number;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
};

export const syncMetadataMapper: RowMapper<SyncMetadataRow, SyncMetadata> = {
  toModel: (row) => ({
    id: 'singleton',
    lastSyncAt: row.lastSyncAt,
    schemaVersion: row.schemaVersion,
    databaseVersion: row.databaseVersion,
    syncStatus: row.syncStatus as SyncStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }),
};

export type SyncQueueRow = {
  id: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: string | null;
  retryCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export const syncQueueMapper: RowMapper<SyncQueueRow, SyncQueueItem> = {
  toModel: (row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    operationType: row.operationType as SyncOperationType,
    payload: parseJsonColumn(row.payload, `sync_queue.payload (${row.id})`),
    retryCount: row.retryCount,
    status: row.status as SyncQueueStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }),
};

export type SyncErrorRow = {
  id: string;
  operationId: string | null;
  message: string;
  stack: string | null;
  retryCount: number;
  createdAt: string;
};

export const syncErrorMapper: RowMapper<SyncErrorRow, SyncError> = {
  toModel: (row) => ({ ...row }),
};

export type AuditLogRow = {
  id: string;
  category: string;
  event: string;
  details: string | null;
  createdAt: string;
};

export const auditLogMapper: RowMapper<AuditLogRow, AuditLogEntry> = {
  toModel: (row) => ({
    id: row.id,
    category: row.category as AuditCategory,
    event: row.event,
    details: parseJsonColumn(row.details, `audit_log.details (${row.id})`),
    createdAt: row.createdAt,
  }),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/mappers/platformMappers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data/models apps/desktop/electron/data/dto apps/desktop/electron/data/mappers
git commit -m "feat(data): domain models, DTOs, and row mappers for platform tables" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: RepositoryContext, StatementCache, BaseRepository, test harness

**Files:**
- Create: `apps/desktop/electron/data/repositories/base/RepositoryContext.ts`
- Create: `apps/desktop/electron/data/repositories/base/StatementCache.ts`
- Create: `apps/desktop/electron/data/repositories/base/BaseRepository.ts`
- Create: `apps/desktop/electron/data/testing/createTestContext.ts`
- Test: `apps/desktop/electron/data/repositories/base/BaseRepository.test.ts`

**Interfaces:**
- Consumes: `DatabaseManager`, `DatabaseLogger` (`../../../database/DatabaseManager`), `TransactionManager` (`../../../database/transaction/TransactionManager`), `TableName`, query builders (Task 4), predicates (Task 3), mappers (Task 5), errors (Task 1), `createTestDatabase` + `MigrationService` + `migrations` registry (database layer, for the test harness).
- Produces:
  - `RepositoryContext { readonly connection: SqliteDatabase; readonly transactions: TransactionManager; readonly log: DatabaseLogger }`; `createRepositoryContext(manager: DatabaseManager, log: DatabaseLogger): RepositoryContext` (live getters over the manager).
  - `StatementCache` with `get(sql: string): Statement`.
  - `SqlRow = Record<string, SqlValue>`; `BaseRepositoryConfig<TRow, TModel> { table: TableName; entityName: string; columns: readonly string[]; mapper: RowMapper<TRow, TModel>; defaultOrderBy?: readonly SortSpec[] }`.
  - `BaseRepository<TRow extends SqlRow, TModel>` — public: `findById(id): TModel | null`, `findByIdOrThrow(id): TModel`, `findAll(options?: QueryOptions): TModel[]`, `findPage(options: PageOptions): Page<TModel>`, `exists(id): boolean`, `count(where?: Predicate): number`, `deleteById(id): boolean`, `executeTransaction<T>(work: () => T): T`. Protected: `query<T>(operation: string, fn: () => T): T` (error-translation + logging wrapper), `validate<T>(validator: (input: T) => void, input: T): void` (logs warn on ValidationError), `insertRow(row: TRow): TModel`, `insertManyRows(rows: readonly TRow[]): TModel[]` (IMMEDIATE transaction), `updateById(id: string, changes: Partial<TRow>): TModel` (skips `undefined` values; throws EntityNotFoundError on 0 changes), `selectWhere(operation: string, where: Predicate, options?: QueryOptions): TModel[]`, plus `statements` and `context`.
  - Default ordering when none is given: `createdAt ASC, id ASC`.
  - Test harness: `createTestContext(): { context: RepositoryContext; cleanup(): void }` — temp-file DB with all migrations applied (NOT seeded; tests seed what they need).

- [ ] **Step 1: Write the test harness**

Create `apps/desktop/electron/data/testing/createTestContext.ts`:

```ts
import type { DatabaseLogger } from '../../database/DatabaseManager';
import { migrations } from '../../database/migrations/registry';
import { MigrationService } from '../../database/services/MigrationService';
import { createTestDatabase } from '../../database/testing/createTestDatabase';
import { TransactionManager } from '../../database/transaction/TransactionManager';
import type { RepositoryContext } from '../repositories/base/RepositoryContext';

export interface TestContext {
  context: RepositoryContext;
  cleanup(): void;
}

const silentLog: DatabaseLogger = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * Real temp-file SQLite with every migration applied — repositories are
 * tested against the production schema. Metadata is NOT seeded; tests seed
 * exactly what they need.
 */
export function createTestContext(): TestContext {
  const test = createTestDatabase();
  new MigrationService(test.db.raw, migrations).migrateToLatest();
  return {
    context: {
      connection: test.db.raw,
      transactions: new TransactionManager(test.db.raw),
      log: silentLog,
    },
    cleanup: () => test.cleanup(),
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/desktop/electron/data/repositories/base/BaseRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../database/schema/tableNames';
import { eq } from '../../queries/predicates';
import {
  DuplicateEntityError,
  EntityNotFoundError,
  QueryError,
} from '../../errors/repositoryErrors';
import { deviceMapper, type DeviceRow } from '../../mappers/platformMappers';
import type { Device } from '../../models/platform';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { BaseRepository } from './BaseRepository';
import type { RepositoryContext } from './RepositoryContext';

const DEVICE_COLUMNS = [
  'id',
  'deviceName',
  'platform',
  'osVersion',
  'appVersion',
  'createdAt',
  'updatedAt',
] as const;

/** Test-only subclass exposing the protected machinery. */
class DeviceTestRepository extends BaseRepository<DeviceRow, Device> {
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.devices,
      entityName: 'Device',
      columns: DEVICE_COLUMNS,
      mapper: deviceMapper,
    });
  }

  createRaw(row: DeviceRow): Device {
    return this.insertRow(row);
  }

  createManyRaw(rows: DeviceRow[]): Device[] {
    return this.insertManyRows(rows);
  }

  updateRaw(id: string, changes: Partial<DeviceRow>): Device {
    return this.updateById(id, changes);
  }
}

function deviceRow(id: string, createdAt: string): DeviceRow {
  return {
    id,
    deviceName: `device-${id}`,
    platform: 'win32',
    osVersion: '10.0',
    appVersion: '1.0.0',
    createdAt,
    updatedAt: createdAt,
  };
}

describe('BaseRepository', () => {
  let test: TestContext;
  let repo: DeviceTestRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new DeviceTestRepository(test.context);
  });

  afterEach(() => {
    test.cleanup();
  });

  it('insertRow + findById round-trips a model', () => {
    const created = repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
    expect(created.deviceName).toBe('device-d1');
    expect(repo.findById('d1')).toEqual(created);
  });

  it('findById returns null and findByIdOrThrow throws for missing rows', () => {
    expect(repo.findById('missing')).toBeNull();
    expect(() => repo.findByIdOrThrow('missing')).toThrow(EntityNotFoundError);
  });

  it('duplicate primary keys become DuplicateEntityError', () => {
    repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
    expect(() => repo.createRaw(deviceRow('d1', '2026-01-02T00:00:00.000Z'))).toThrow(
      DuplicateEntityError,
    );
  });

  it('findAll applies default deterministic ordering (createdAt, id)', () => {
    repo.createRaw(deviceRow('b', '2026-01-02T00:00:00.000Z'));
    repo.createRaw(deviceRow('a', '2026-01-01T00:00:00.000Z'));
    repo.createRaw(deviceRow('c', '2026-01-01T00:00:00.000Z'));
    expect(repo.findAll().map((d) => d.id)).toEqual(['a', 'c', 'b']);
  });

  it('findAll honors custom ordering and paging', () => {
    repo.createRaw(deviceRow('a', '2026-01-01T00:00:00.000Z'));
    repo.createRaw(deviceRow('b', '2026-01-02T00:00:00.000Z'));
    repo.createRaw(deviceRow('c', '2026-01-03T00:00:00.000Z'));
    const items = repo.findAll({
      orderBy: [{ column: 'createdAt', direction: 'desc' }],
      page: { limit: 2, offset: 1 },
    });
    expect(items.map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('rejects ordering by a column outside the whitelist', () => {
    expect(() => repo.findAll({ orderBy: [{ column: 'platform2', direction: 'asc' }] })).toThrow(
      QueryError,
    );
  });

  it('findPage returns items plus total', () => {
    repo.createRaw(deviceRow('a', '2026-01-01T00:00:00.000Z'));
    repo.createRaw(deviceRow('b', '2026-01-02T00:00:00.000Z'));
    repo.createRaw(deviceRow('c', '2026-01-03T00:00:00.000Z'));
    const page = repo.findPage({ page: { limit: 2, offset: 0 } });
    expect(page.items.map((d) => d.id)).toEqual(['a', 'b']);
    expect(page.total).toBe(3);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(0);
  });

  it('exists and count reflect stored rows', () => {
    repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
    expect(repo.exists('d1')).toBe(true);
    expect(repo.exists('nope')).toBe(false);
    expect(repo.count()).toBe(1);
    expect(repo.count(eq('id', 'nope'))).toBe(0);
  });

  it('updateById updates only defined fields and bumps nothing else', () => {
    repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
    const updated = repo.updateRaw('d1', {
      deviceName: 'renamed',
      osVersion: undefined,
      updatedAt: '2026-01-05T00:00:00.000Z',
    });
    expect(updated.deviceName).toBe('renamed');
    expect(updated.osVersion).toBe('10.0');
    expect(updated.updatedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('updateById throws EntityNotFoundError for a missing row', () => {
    expect(() => repo.updateRaw('missing', { deviceName: 'x' })).toThrow(EntityNotFoundError);
  });

  it('deleteById reports whether a row was removed', () => {
    repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
    expect(repo.deleteById('d1')).toBe(true);
    expect(repo.deleteById('d1')).toBe(false);
  });

  it('insertManyRows is atomic — one bad row rolls back the batch', () => {
    const rows = [
      deviceRow('a', '2026-01-01T00:00:00.000Z'),
      deviceRow('a', '2026-01-02T00:00:00.000Z'), // duplicate id
    ];
    expect(() => repo.createManyRaw(rows)).toThrow(DuplicateEntityError);
    expect(repo.count()).toBe(0);
  });

  it('executeTransaction rolls back on throw', () => {
    expect(() =>
      repo.executeTransaction(() => {
        repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
        throw new Error('abort');
      }),
    ).toThrow('abort');
    expect(repo.count()).toBe(0);
  });

  it('nested executeTransaction becomes a SAVEPOINT and composes', () => {
    repo.executeTransaction(() => {
      repo.createRaw(deviceRow('outer', '2026-01-01T00:00:00.000Z'));
      expect(() =>
        repo.executeTransaction(() => {
          repo.createRaw(deviceRow('inner', '2026-01-02T00:00:00.000Z'));
          throw new Error('inner abort');
        }),
      ).toThrow('inner abort');
    });
    expect(repo.exists('outer')).toBe(true);
    expect(repo.exists('inner')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/base/BaseRepository.test.ts`
Expected: FAIL — cannot resolve `./BaseRepository` / `./RepositoryContext`.

- [ ] **Step 4: Write the implementation**

Create `apps/desktop/electron/data/repositories/base/RepositoryContext.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { DatabaseLogger, DatabaseManager } from '../../../database/DatabaseManager';
import type { TransactionManager } from '../../../database/transaction/TransactionManager';

/** The narrow view of the database platform repositories are allowed to touch. */
export interface RepositoryContext {
  readonly connection: SqliteDatabase;
  readonly transactions: TransactionManager;
  readonly log: DatabaseLogger;
}

/**
 * The only sanctioned wiring: repositories consume DatabaseManager.connection
 * and .transactions — they never construct a Database or open a connection.
 * Live getters keep the manager's ready-state checks in the path.
 */
export function createRepositoryContext(
  manager: DatabaseManager,
  log: DatabaseLogger,
): RepositoryContext {
  return {
    get connection(): SqliteDatabase {
      return manager.connection;
    },
    get transactions(): TransactionManager {
      return manager.transactions;
    },
    log,
  };
}
```

Create `apps/desktop/electron/data/repositories/base/StatementCache.ts`:

```ts
import type { Database as SqliteDatabase, Statement } from 'better-sqlite3';

/** Prepared-statement reuse, keyed by exact SQL text. One cache per repository. */
export class StatementCache {
  readonly #db: SqliteDatabase;
  readonly #statements = new Map<string, Statement>();

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  get(sql: string): Statement {
    const cached = this.#statements.get(sql);
    if (cached) {
      return cached;
    }
    const statement = this.#db.prepare(sql);
    this.#statements.set(sql, statement);
    return statement;
  }
}
```

Create `apps/desktop/electron/data/repositories/base/BaseRepository.ts`:

```ts
import type { TableName } from '../../../database/schema/tableNames';
import type { Page, PageOptions, QueryOptions, SortSpec } from '../../dto/query';
import {
  EntityNotFoundError,
  QueryError,
  ValidationError,
} from '../../errors/repositoryErrors';
import { translateDatabaseError } from '../../errors/translateError';
import type { RowMapper } from '../../mappers/RowMapper';
import {
  countFrom,
  deleteFrom,
  insertInto,
  select,
  updateTable,
  type BuiltQuery,
} from '../../queries/builders';
import { eq, type Predicate, type SqlValue } from '../../queries/predicates';
import type { RepositoryContext } from './RepositoryContext';
import { StatementCache } from './StatementCache';

export type SqlRow = Record<string, SqlValue>;

export interface BaseRepositoryConfig<TRow extends SqlRow, TModel> {
  table: TableName;
  entityName: string;
  /** Column whitelist — sort columns are validated against it. */
  columns: readonly string[];
  mapper: RowMapper<TRow, TModel>;
  /** Deterministic default ordering for findAll/findPage. */
  defaultOrderBy?: readonly SortSpec[];
}

const DEFAULT_ORDER: readonly SortSpec[] = [
  { column: 'createdAt', direction: 'asc' },
  { column: 'id', direction: 'asc' },
];

/**
 * Shared machinery behind every SQLite repository. Concrete repositories
 * extend it with entity-specific methods; the entity's *interface* (not this
 * class) is the contract and declares only the operations that make sense.
 * All SQL flows through the query builders; all failures are translated into
 * the RepositoryError taxonomy before leaving the class.
 */
export abstract class BaseRepository<TRow extends SqlRow, TModel> {
  protected readonly context: RepositoryContext;
  protected readonly statements: StatementCache;
  readonly #config: BaseRepositoryConfig<TRow, TModel>;

  protected constructor(context: RepositoryContext, config: BaseRepositoryConfig<TRow, TModel>) {
    this.context = context;
    this.statements = new StatementCache(context.connection);
    this.#config = config;
  }

  findById(id: string): TModel | null {
    return this.query('findById', () => {
      const built = select(this.#config.table).where(eq('id', id)).limit(1).build();
      const row = this.statements.get(built.sql).get(...built.params) as TRow | undefined;
      return row ? this.#config.mapper.toModel(row) : null;
    });
  }

  findByIdOrThrow(id: string): TModel {
    const model = this.findById(id);
    if (model === null) {
      throw new EntityNotFoundError(`${this.#config.entityName} not found: ${id}`);
    }
    return model;
  }

  findAll(options?: QueryOptions): TModel[] {
    return this.query('findAll', () => this.#runList(this.#buildList(options)));
  }

  findPage(options: PageOptions): Page<TModel> {
    return this.query('findPage', () => {
      const items = this.#runList(this.#buildList(options));
      return {
        items,
        total: this.count(),
        limit: options.page.limit,
        offset: options.page.offset,
      };
    });
  }

  exists(id: string): boolean {
    return this.query('exists', () => {
      const built = select(this.#config.table).columns('id').where(eq('id', id)).limit(1).build();
      return this.statements.get(built.sql).get(...built.params) !== undefined;
    });
  }

  count(where?: Predicate): number {
    return this.query('count', () => {
      const builder = countFrom(this.#config.table);
      if (where) {
        builder.where(where);
      }
      const built = builder.build();
      const row = this.statements.get(built.sql).get(...built.params) as { count: number };
      return row.count;
    });
  }

  deleteById(id: string): boolean {
    return this.query('deleteById', () => {
      const built = deleteFrom(this.#config.table).where(eq('id', id)).build();
      return this.statements.get(built.sql).run(...built.params).changes > 0;
    });
  }

  /** Callback-scoped transaction; nested calls become SAVEPOINTs (Phase 2 guarantee). */
  executeTransaction<T>(work: () => T): T {
    try {
      return this.context.transactions.run(work);
    } catch (error) {
      throw translateDatabaseError(error, `${this.#config.entityName}.transaction`);
    }
  }

  /** Error-translation + logging boundary — every public operation runs inside it. */
  protected query<T>(operation: string, fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      const translated = translateDatabaseError(
        error,
        `${this.#config.entityName}.${operation}`,
      );
      if (translated !== error) {
        this.context.log.error(`${this.#config.entityName}.${operation} failed`, translated);
      }
      throw translated;
    }
  }

  /** Runs a DTO validator, logging failures at warn (spec: log validation failures). */
  protected validate<T>(validator: (input: T) => void, input: T): void {
    try {
      validator(input);
    } catch (error) {
      if (error instanceof ValidationError) {
        this.context.log.warn(error.message);
      }
      throw error;
    }
  }

  protected insertRow(row: TRow): TModel {
    return this.query('create', () => {
      const built = insertInto(this.#config.table).values(row).build();
      this.statements.get(built.sql).run(...built.params);
      return this.#config.mapper.toModel(row);
    });
  }

  protected insertManyRows(rows: readonly TRow[]): TModel[] {
    if (rows.length === 0) {
      return [];
    }
    try {
      // IMMEDIATE: a known write batch takes the write lock up front.
      return this.context.transactions.runImmediate(() =>
        rows.map((row) => this.insertRow(row)),
      );
    } catch (error) {
      throw translateDatabaseError(error, `${this.#config.entityName}.createMany`);
    }
  }

  protected updateById(id: string, changes: Partial<TRow>): TModel {
    return this.query('update', () => {
      const defined: SqlRow = {};
      for (const [key, value] of Object.entries(changes)) {
        if (value !== undefined) {
          defined[key] = value as SqlValue;
        }
      }
      if (Object.keys(defined).length === 0) {
        throw new QueryError(`${this.#config.entityName}.update: no fields to update`);
      }
      const built = updateTable(this.#config.table).set(defined).where(eq('id', id)).build();
      const result = this.statements.get(built.sql).run(...built.params);
      if (result.changes === 0) {
        throw new EntityNotFoundError(`${this.#config.entityName} not found: ${id}`);
      }
      return this.findByIdOrThrow(id);
    });
  }

  /** Entity-specific finder support: WHERE + the shared ordering/paging rules. */
  protected selectWhere(operation: string, where: Predicate, options?: QueryOptions): TModel[] {
    return this.query(operation, () => this.#runList(this.#buildList(options, where)));
  }

  #buildList(options?: QueryOptions, where?: Predicate): BuiltQuery {
    const builder = select(this.#config.table);
    if (where) {
      builder.where(where);
    }
    const orderBy = options?.orderBy ?? this.#config.defaultOrderBy ?? DEFAULT_ORDER;
    for (const sort of orderBy) {
      if (!this.#config.columns.includes(sort.column)) {
        throw new QueryError(
          `${this.#config.entityName}: cannot sort by unknown column "${sort.column}"`,
        );
      }
      builder.orderBy(sort.column, sort.direction);
    }
    if (options?.page) {
      builder.limit(options.page.limit).offset(options.page.offset);
    }
    return builder.build();
  }

  #runList(built: BuiltQuery): TModel[] {
    const rows = this.statements.get(built.sql).all(...built.params) as TRow[];
    return rows.map((row) => this.#config.mapper.toModel(row));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/base/BaseRepository.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/data/repositories apps/desktop/electron/data/testing
git commit -m "feat(data): BaseRepository with statement cache, repository context, and test harness" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Device repository

**Files:**
- Create: `apps/desktop/electron/data/validators/platform.ts`
- Create: `apps/desktop/electron/data/repositories/interfaces/IDeviceRepository.ts`
- Create: `apps/desktop/electron/data/repositories/sqlite/SqliteDeviceRepository.ts`
- Test: `apps/desktop/electron/data/repositories/sqlite/SqliteDeviceRepository.test.ts`

**Interfaces:**
- Consumes: `BaseRepository`, `RepositoryContext` (Task 6), `deviceMapper`/`DeviceRow` (Task 5), `CreateDeviceInput`/`UpdateDeviceInput` (Task 5), validation core (Task 2), `newId`/`nowIso` (`../../../database/helpers/`), `TableNames`.
- Produces: `IDeviceRepository { findById(id): Device | null; findByIdOrThrow(id): Device; findAll(options?): Device[]; create(input: CreateDeviceInput): Device; update(id: string, input: UpdateDeviceInput): Device; exists(id): boolean; count(): number }`; `SqliteDeviceRepository extends BaseRepository<DeviceRow, Device> implements IDeviceRepository` with `constructor(context: RepositoryContext)`; validators `validateCreateDevice`, `validateUpdateDevice` in `validators/platform.ts` (this task creates the file; later tasks append to it). Note: no `delete` — the device row is this installation's identity.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/repositories/sqlite/SqliteDeviceRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntityNotFoundError, ValidationError } from '../../errors/repositoryErrors';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { SqliteDeviceRepository } from './SqliteDeviceRepository';

describe('SqliteDeviceRepository', () => {
  let test: TestContext;
  let repo: SqliteDeviceRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteDeviceRepository(test.context);
  });

  afterEach(() => {
    test.cleanup();
  });

  const input = {
    deviceName: 'school-lab-01',
    platform: 'win32',
    osVersion: '10.0.19045',
    appVersion: '1.0.0',
  };

  it('create generates id and timestamps and round-trips', () => {
    const device = repo.create(input);
    expect(device.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(device.createdAt).toBe(device.updatedAt);
    expect(repo.findById(device.id)).toEqual(device);
    expect(repo.count()).toBe(1);
  });

  it('create rejects invalid input before touching SQL', () => {
    expect(() => repo.create({ ...input, deviceName: '' })).toThrow(ValidationError);
    expect(repo.count()).toBe(0);
  });

  it('update changes only provided fields and bumps updatedAt', () => {
    const device = repo.create(input);
    const updated = repo.update(device.id, { appVersion: '1.1.0' });
    expect(updated.appVersion).toBe('1.1.0');
    expect(updated.deviceName).toBe('school-lab-01');
    expect(updated.createdAt).toBe(device.createdAt);
  });

  it('update of a missing device throws EntityNotFoundError', () => {
    expect(() => repo.update('missing', { appVersion: '2.0.0' })).toThrow(EntityNotFoundError);
  });

  it('update rejects invalid field values', () => {
    const device = repo.create(input);
    expect(() => repo.update(device.id, { deviceName: 'x'.repeat(201) })).toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/sqlite/SqliteDeviceRepository.test.ts`
Expected: FAIL — cannot resolve `./SqliteDeviceRepository`.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/electron/data/validators/platform.ts`:

```ts
import type { CreateDeviceInput, UpdateDeviceInput } from '../dto/platform';
import { createValidator, isString, maxLength, required } from './core';

/** Persistence validators for the platform entities — one per repository input DTO. */

export const validateCreateDevice = createValidator<CreateDeviceInput>('Device', {
  deviceName: [required(), isString(), maxLength(200)],
  platform: [required(), isString(), maxLength(50)],
  osVersion: [required(), isString(), maxLength(100)],
  appVersion: [required(), isString(), maxLength(50)],
});

export const validateUpdateDevice = createValidator<UpdateDeviceInput>('Device', {
  deviceName: [isString(), maxLength(200)],
  osVersion: [isString(), maxLength(100)],
  appVersion: [isString(), maxLength(50)],
});
```

Create `apps/desktop/electron/data/repositories/interfaces/IDeviceRepository.ts`:

```ts
import type { CreateDeviceInput, UpdateDeviceInput } from '../../dto/platform';
import type { QueryOptions } from '../../dto/query';
import type { Device } from '../../models/platform';

/**
 * This installation's device identity (single row today; the table stays
 * general). No delete — destroying the device row would orphan the sync
 * queue and metadata.
 */
export interface IDeviceRepository {
  findById(id: string): Device | null;
  findByIdOrThrow(id: string): Device;
  findAll(options?: QueryOptions): Device[];
  create(input: CreateDeviceInput): Device;
  update(id: string, input: UpdateDeviceInput): Device;
  exists(id: string): boolean;
  count(): number;
}
```

Create `apps/desktop/electron/data/repositories/sqlite/SqliteDeviceRepository.ts`:

```ts
import { newId } from '../../../database/helpers/ids';
import { nowIso } from '../../../database/helpers/time';
import { TableNames } from '../../../database/schema/tableNames';
import type { CreateDeviceInput, UpdateDeviceInput } from '../../dto/platform';
import { deviceMapper, type DeviceRow } from '../../mappers/platformMappers';
import type { Device } from '../../models/platform';
import { validateCreateDevice, validateUpdateDevice } from '../../validators/platform';
import { BaseRepository } from '../base/BaseRepository';
import type { RepositoryContext } from '../base/RepositoryContext';
import type { IDeviceRepository } from '../interfaces/IDeviceRepository';

const DEVICE_COLUMNS = [
  'id',
  'deviceName',
  'platform',
  'osVersion',
  'appVersion',
  'createdAt',
  'updatedAt',
] as const;

export class SqliteDeviceRepository
  extends BaseRepository<DeviceRow, Device>
  implements IDeviceRepository
{
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.devices,
      entityName: 'Device',
      columns: DEVICE_COLUMNS,
      mapper: deviceMapper,
    });
  }

  create(input: CreateDeviceInput): Device {
    this.validate(validateCreateDevice, input);
    const now = nowIso();
    return this.insertRow({
      id: newId(),
      deviceName: input.deviceName,
      platform: input.platform,
      osVersion: input.osVersion,
      appVersion: input.appVersion,
      createdAt: now,
      updatedAt: now,
    });
  }

  update(id: string, input: UpdateDeviceInput): Device {
    this.validate(validateUpdateDevice, input);
    return this.updateById(id, {
      deviceName: input.deviceName,
      osVersion: input.osVersion,
      appVersion: input.appVersion,
      updatedAt: nowIso(),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/sqlite/SqliteDeviceRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data
git commit -m "feat(data): device repository with interface and persistence validation" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: AppSettings repository

**Files:**
- Create: `apps/desktop/electron/data/repositories/interfaces/IAppSettingsRepository.ts`
- Create: `apps/desktop/electron/data/repositories/sqlite/SqliteAppSettingsRepository.ts`
- Modify: `apps/desktop/electron/data/validators/platform.ts` (append settings validator)
- Test: `apps/desktop/electron/data/repositories/sqlite/SqliteAppSettingsRepository.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6 modules; `SetSettingInput` (Task 5); `isJsonSerializable` (Task 2); `serializeJsonColumn` (Task 5); `select`/`deleteFrom` builders; `eq` predicate.
- Produces: `IAppSettingsRepository { getByKey(key: string): AppSetting | null; setByKey(key: string, value: unknown): AppSetting; getAll(): AppSetting[]; deleteByKey(key: string): boolean }`; `SqliteAppSettingsRepository` implementing it; `validateSetSetting` appended to `validators/platform.ts`.
- `setByKey` is an upsert implemented as a transactional read-then-write (the query builder deliberately has no UPSERT support).

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/repositories/sqlite/SqliteAppSettingsRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../../errors/repositoryErrors';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { SqliteAppSettingsRepository } from './SqliteAppSettingsRepository';

describe('SqliteAppSettingsRepository', () => {
  let test: TestContext;
  let repo: SqliteAppSettingsRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteAppSettingsRepository(test.context);
  });

  afterEach(() => {
    test.cleanup();
  });

  it('setByKey inserts a new setting and getByKey round-trips the value', () => {
    const setting = repo.setByKey('theme', 'dark');
    expect(setting.key).toBe('theme');
    expect(setting.value).toBe('dark');
    expect(repo.getByKey('theme')?.value).toBe('dark');
  });

  it('setByKey updates an existing setting in place (same id, same key)', () => {
    const first = repo.setByKey('theme', 'dark');
    const second = repo.setByKey('theme', 'light');
    expect(second.id).toBe(first.id);
    expect(second.value).toBe('light');
    expect(repo.getAll()).toHaveLength(1);
  });

  it('stores structured values and null', () => {
    repo.setByKey('sync', { intervalMinutes: 15, enabled: true });
    expect(repo.getByKey('sync')?.value).toEqual({ intervalMinutes: 15, enabled: true });
    repo.setByKey('flag', null);
    expect(repo.getByKey('flag')?.value).toBeNull();
  });

  it('getByKey returns null for a missing key', () => {
    expect(repo.getByKey('missing')).toBeNull();
  });

  it('getAll returns settings ordered by key', () => {
    repo.setByKey('b', 1);
    repo.setByKey('a', 2);
    expect(repo.getAll().map((s) => s.key)).toEqual(['a', 'b']);
  });

  it('deleteByKey reports whether a setting was removed', () => {
    repo.setByKey('theme', 'dark');
    expect(repo.deleteByKey('theme')).toBe(true);
    expect(repo.deleteByKey('theme')).toBe(false);
  });

  it('rejects invalid keys and non-serializable values', () => {
    expect(() => repo.setByKey('', 'x')).toThrow(ValidationError);
    expect(() => repo.setByKey('k'.repeat(129), 'x')).toThrow(ValidationError);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => repo.setByKey('bad', circular)).toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/sqlite/SqliteAppSettingsRepository.test.ts`
Expected: FAIL — cannot resolve `./SqliteAppSettingsRepository`.

- [ ] **Step 3: Write the implementation**

Append to `apps/desktop/electron/data/validators/platform.ts` — extend the imports and add:

```ts
import type { CreateDeviceInput, SetSettingInput, UpdateDeviceInput } from '../dto/platform';
import { createValidator, isJsonSerializable, isString, maxLength, required } from './core';
```

```ts
export const validateSetSetting = createValidator<SetSettingInput>('AppSetting', {
  key: [required(), isString(), maxLength(128)],
  value: [isJsonSerializable()],
});
```

Create `apps/desktop/electron/data/repositories/interfaces/IAppSettingsRepository.ts`:

```ts
import type { AppSetting } from '../../models/platform';

/** Key-addressed application settings; values are JSON-serializable. */
export interface IAppSettingsRepository {
  getByKey(key: string): AppSetting | null;
  setByKey(key: string, value: unknown): AppSetting;
  getAll(): AppSetting[];
  deleteByKey(key: string): boolean;
}
```

Create `apps/desktop/electron/data/repositories/sqlite/SqliteAppSettingsRepository.ts`:

```ts
import { newId } from '../../../database/helpers/ids';
import { nowIso } from '../../../database/helpers/time';
import { TableNames } from '../../../database/schema/tableNames';
import { serializeJsonColumn } from '../../mappers/json';
import { appSettingMapper, type AppSettingRow } from '../../mappers/platformMappers';
import type { AppSetting } from '../../models/platform';
import { deleteFrom, select } from '../../queries/builders';
import { eq } from '../../queries/predicates';
import { validateSetSetting } from '../../validators/platform';
import { BaseRepository } from '../base/BaseRepository';
import type { RepositoryContext } from '../base/RepositoryContext';
import type { IAppSettingsRepository } from '../interfaces/IAppSettingsRepository';

const APP_SETTING_COLUMNS = ['id', 'key', 'value', 'createdAt', 'updatedAt'] as const;

export class SqliteAppSettingsRepository
  extends BaseRepository<AppSettingRow, AppSetting>
  implements IAppSettingsRepository
{
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.appSettings,
      entityName: 'AppSetting',
      columns: APP_SETTING_COLUMNS,
      mapper: appSettingMapper,
    });
  }

  getByKey(key: string): AppSetting | null {
    return this.query('getByKey', () => {
      const row = this.#rowByKey(key);
      return row ? appSettingMapper.toModel(row) : null;
    });
  }

  /** Upsert as transactional read-then-write (the builder deliberately has no UPSERT). */
  setByKey(key: string, value: unknown): AppSetting {
    this.validate(validateSetSetting, { key, value });
    const serialized = serializeJsonColumn(value, `app_settings.value (${key})`) ?? 'null';
    return this.executeTransaction(() => {
      const existing = this.#rowByKey(key);
      const now = nowIso();
      if (existing) {
        return this.updateById(existing.id, { value: serialized, updatedAt: now });
      }
      return this.insertRow({ id: newId(), key, value: serialized, createdAt: now, updatedAt: now });
    });
  }

  getAll(): AppSetting[] {
    return this.findAll({ orderBy: [{ column: 'key', direction: 'asc' }] });
  }

  deleteByKey(key: string): boolean {
    return this.query('deleteByKey', () => {
      const built = deleteFrom(TableNames.appSettings).where(eq('key', key)).build();
      return this.statements.get(built.sql).run(...built.params).changes > 0;
    });
  }

  #rowByKey(key: string): AppSettingRow | undefined {
    const built = select(TableNames.appSettings).where(eq('key', key)).limit(1).build();
    return this.statements.get(built.sql).get(...built.params) as AppSettingRow | undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/sqlite/SqliteAppSettingsRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data
git commit -m "feat(data): app-settings repository with upsert-by-key semantics" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: SyncMetadata repository

**Files:**
- Create: `apps/desktop/electron/data/repositories/interfaces/ISyncMetadataRepository.ts`
- Create: `apps/desktop/electron/data/repositories/sqlite/SqliteSyncMetadataRepository.ts`
- Modify: `apps/desktop/electron/data/validators/platform.ts` (append metadata validator)
- Test: `apps/desktop/electron/data/repositories/sqlite/SqliteSyncMetadataRepository.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6 modules; `UpdateSyncMetadataInput` (Task 5); `SYNC_STATUSES` (Task 5); `initializeMetadata` from `../../../database/seed/initializeMetadata` (test seeding only).
- Produces: `ISyncMetadataRepository { get(): SyncMetadata; update(input: UpdateSyncMetadataInput): SyncMetadata }` — singleton row seeded by the platform; no create/delete. `SqliteSyncMetadataRepository`, `validateUpdateSyncMetadata`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/repositories/sqlite/SqliteSyncMetadataRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeMetadata } from '../../../database/seed/initializeMetadata';
import { EntityNotFoundError, ValidationError } from '../../errors/repositoryErrors';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { SqliteSyncMetadataRepository } from './SqliteSyncMetadataRepository';

const TEST_DEVICE = {
  deviceName: 'test-device',
  platform: 'win32',
  osVersion: '10.0',
  appVersion: '1.0.0',
};

describe('SqliteSyncMetadataRepository', () => {
  let test: TestContext;
  let repo: SqliteSyncMetadataRepository;

  beforeEach(() => {
    test = createTestContext();
    initializeMetadata(test.context.connection, TEST_DEVICE, 1);
    repo = new SqliteSyncMetadataRepository(test.context);
  });

  afterEach(() => {
    test.cleanup();
  });

  it('get returns the platform-seeded singleton', () => {
    const metadata = repo.get();
    expect(metadata.id).toBe('singleton');
    expect(metadata.syncStatus).toBe('never');
    expect(metadata.lastSyncAt).toBeNull();
  });

  it('update patches only the provided fields', () => {
    const updated = repo.update({
      syncStatus: 'idle',
      lastSyncAt: '2026-07-16T10:00:00.000Z',
    });
    expect(updated.syncStatus).toBe('idle');
    expect(updated.lastSyncAt).toBe('2026-07-16T10:00:00.000Z');
    expect(updated.schemaVersion).toBe(repo.get().schemaVersion);
  });

  it('update can clear lastSyncAt back to null', () => {
    repo.update({ lastSyncAt: '2026-07-16T10:00:00.000Z' });
    expect(repo.update({ lastSyncAt: null }).lastSyncAt).toBeNull();
  });

  it('rejects an invalid syncStatus and bad timestamps', () => {
    expect(() => repo.update({ syncStatus: 'broken' as never })).toThrow(ValidationError);
    expect(() => repo.update({ lastSyncAt: 'not-a-date' })).toThrow(ValidationError);
  });

  it('get throws EntityNotFoundError when the singleton is missing (integrity failure)', () => {
    test.context.connection.prepare('DELETE FROM sync_metadata').run();
    expect(() => repo.get()).toThrow(EntityNotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/sqlite/SqliteSyncMetadataRepository.test.ts`
Expected: FAIL — cannot resolve `./SqliteSyncMetadataRepository`.

- [ ] **Step 3: Write the implementation**

Append to `apps/desktop/electron/data/validators/platform.ts` — extend imports and add:

```ts
import type {
  CreateDeviceInput,
  SetSettingInput,
  UpdateDeviceInput,
  UpdateSyncMetadataInput,
} from '../dto/platform';
import { SYNC_STATUSES } from '../models/platform';
import {
  createValidator,
  isIsoDate,
  isJsonSerializable,
  isNonNegativeInt,
  isString,
  maxLength,
  oneOf,
  required,
} from './core';
```

```ts
export const validateUpdateSyncMetadata = createValidator<UpdateSyncMetadataInput>(
  'SyncMetadata',
  {
    lastSyncAt: [isIsoDate()],
    syncStatus: [isString(), oneOf(SYNC_STATUSES)],
    schemaVersion: [isNonNegativeInt()],
    databaseVersion: [isNonNegativeInt()],
  },
);
```

Create `apps/desktop/electron/data/repositories/interfaces/ISyncMetadataRepository.ts`:

```ts
import type { UpdateSyncMetadataInput } from '../../dto/platform';
import type { SyncMetadata } from '../../models/platform';

/**
 * The sync_metadata singleton. Seeded by the platform on startup — the
 * repository can read and patch it, never create or delete it. A missing
 * singleton is an integrity failure (EntityNotFoundError).
 */
export interface ISyncMetadataRepository {
  get(): SyncMetadata;
  update(input: UpdateSyncMetadataInput): SyncMetadata;
}
```

Create `apps/desktop/electron/data/repositories/sqlite/SqliteSyncMetadataRepository.ts`:

```ts
import { nowIso } from '../../../database/helpers/time';
import { TableNames } from '../../../database/schema/tableNames';
import type { UpdateSyncMetadataInput } from '../../dto/platform';
import { syncMetadataMapper, type SyncMetadataRow } from '../../mappers/platformMappers';
import type { SyncMetadata } from '../../models/platform';
import { validateUpdateSyncMetadata } from '../../validators/platform';
import { BaseRepository } from '../base/BaseRepository';
import type { RepositoryContext } from '../base/RepositoryContext';
import type { ISyncMetadataRepository } from '../interfaces/ISyncMetadataRepository';

const SYNC_METADATA_COLUMNS = [
  'id',
  'lastSyncAt',
  'schemaVersion',
  'databaseVersion',
  'syncStatus',
  'createdAt',
  'updatedAt',
] as const;

const SINGLETON_ID = 'singleton';

export class SqliteSyncMetadataRepository
  extends BaseRepository<SyncMetadataRow, SyncMetadata>
  implements ISyncMetadataRepository
{
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.syncMetadata,
      entityName: 'SyncMetadata',
      columns: SYNC_METADATA_COLUMNS,
      mapper: syncMetadataMapper,
    });
  }

  get(): SyncMetadata {
    return this.findByIdOrThrow(SINGLETON_ID);
  }

  update(input: UpdateSyncMetadataInput): SyncMetadata {
    this.validate(validateUpdateSyncMetadata, input);
    return this.updateById(SINGLETON_ID, {
      lastSyncAt: input.lastSyncAt,
      syncStatus: input.syncStatus,
      schemaVersion: input.schemaVersion,
      databaseVersion: input.databaseVersion,
      updatedAt: nowIso(),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/sqlite/SqliteSyncMetadataRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data
git commit -m "feat(data): sync-metadata singleton repository" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: SyncQueue repository (owns sync_errors)

**Files:**
- Create: `apps/desktop/electron/data/repositories/interfaces/ISyncQueueRepository.ts`
- Create: `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts`
- Modify: `apps/desktop/electron/data/validators/platform.ts` (append queue + error validators)
- Test: `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6 modules; `EnqueueSyncOperationInput`, `RecordSyncErrorInput` (Task 5); `SYNC_OPERATION_TYPES`, `SYNC_QUEUE_STATUSES` (Task 5); `and`, `eq`, `lt`, `inList` predicates; `insertInto`, `select`, `deleteFrom` builders; `serializeJsonColumn`, `syncErrorMapper`, `SyncErrorRow`.
- Produces: `ISyncQueueRepository { enqueue(input): SyncQueueItem; enqueueMany(inputs): SyncQueueItem[]; findById(id): SyncQueueItem | null; nextBatch(limit: number): SyncQueueItem[]; markInFlight(ids: string[]): number; markCompleted(ids: string[]): number; markFailed(id: string): SyncQueueItem; countByStatus(status: SyncQueueStatus): number; purgeCompleted(olderThan: string): number; recordError(input: RecordSyncErrorInput): SyncError; errorsForOperation(operationId: string): SyncError[] }`; `SqliteSyncQueueRepository`; validators `validateEnqueue`, `validateRecordSyncError`, `validatePurge`.
- `sync_errors` belongs to this repository (queue aggregate) — a dedicated repository can be split out in the sync phase.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../errors/repositoryErrors';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { SqliteSyncQueueRepository } from './SqliteSyncQueueRepository';

describe('SqliteSyncQueueRepository', () => {
  let test: TestContext;
  let repo: SqliteSyncQueueRepository;

  // Fake timers: createdAt values come from nowIso(); advancing 1ms between
  // inserts makes creation-order assertions deterministic (two real inserts
  // can otherwise share a millisecond, leaving order to random UUID tiebreak).
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00.000Z'));
    test = createTestContext();
    repo = new SqliteSyncQueueRepository(test.context);
  });

  afterEach(() => {
    vi.useRealTimers();
    test.cleanup();
  });

  const tick = () => vi.advanceTimersByTime(1);

  const op = (entityId: string) => ({
    entityType: 'student',
    entityId,
    operationType: 'create' as const,
    payload: { name: `payload-${entityId}` },
  });

  it('enqueue creates a pending item with payload round-trip', () => {
    const item = repo.enqueue(op('e1'));
    expect(item.status).toBe('pending');
    expect(item.retryCount).toBe(0);
    expect(item.payload).toEqual({ name: 'payload-e1' });
    expect(repo.findById(item.id)).toEqual(item);
  });

  it('enqueue validates input', () => {
    expect(() => repo.enqueue({ ...op('e1'), entityType: '' })).toThrow(ValidationError);
    expect(() => repo.enqueue({ ...op('e1'), operationType: 'upsert' as never })).toThrow(
      ValidationError,
    );
  });

  it('enqueueMany is atomic and preserves order', () => {
    const items = repo.enqueueMany([op('e1'), op('e2'), op('e3')]);
    expect(items).toHaveLength(3);
    expect(repo.countByStatus('pending')).toBe(3);
  });

  it('nextBatch returns oldest pending first, bounded by limit', () => {
    const first = repo.enqueue(op('e1'));
    tick();
    const second = repo.enqueue(op('e2'));
    tick();
    repo.enqueue(op('e3'));
    repo.markCompleted([first.id]);
    const batch = repo.nextBatch(1);
    expect(batch).toHaveLength(1);
    expect(batch[0].id).toBe(second.id);
  });

  it('markInFlight and markCompleted update status and report counts', () => {
    const a = repo.enqueue(op('e1'));
    const b = repo.enqueue(op('e2'));
    expect(repo.markInFlight([a.id, b.id])).toBe(2);
    expect(repo.countByStatus('in_flight')).toBe(2);
    expect(repo.markCompleted([a.id])).toBe(1);
    expect(repo.countByStatus('completed')).toBe(1);
    expect(repo.markCompleted([])).toBe(0);
  });

  it('markFailed sets failed status and increments retryCount', () => {
    const item = repo.enqueue(op('e1'));
    expect(repo.markFailed(item.id).retryCount).toBe(1);
    expect(repo.markFailed(item.id).retryCount).toBe(2);
    expect(repo.countByStatus('failed')).toBe(1);
  });

  it('purgeCompleted removes only old completed items', () => {
    const a = repo.enqueue(op('e1'));
    repo.enqueue(op('e2'));
    repo.markCompleted([a.id]);
    expect(repo.purgeCompleted('9999-01-01T00:00:00.000Z')).toBe(1);
    expect(repo.countByStatus('pending')).toBe(1);
    expect(() => repo.purgeCompleted('not-a-date')).toThrow(ValidationError);
  });

  it('recordError and errorsForOperation link errors to a queue operation', () => {
    const item = repo.enqueue(op('e1'));
    tick();
    repo.recordError({ operationId: item.id, message: 'network timeout', retryCount: 1 });
    tick();
    repo.recordError({ operationId: item.id, message: 'server 500', stack: 'at sync()' });
    const errors = repo.errorsForOperation(item.id);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.message)).toEqual(['network timeout', 'server 500']);
    expect(errors[1].stack).toBe('at sync()');
  });

  it('recordError validates input', () => {
    expect(() => repo.recordError({ operationId: null, message: '' })).toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.test.ts`
Expected: FAIL — cannot resolve `./SqliteSyncQueueRepository`.

- [ ] **Step 3: Write the implementation**

Append to `apps/desktop/electron/data/validators/platform.ts` — extend imports and add:

```ts
import type {
  CreateDeviceInput,
  EnqueueSyncOperationInput,
  RecordSyncErrorInput,
  SetSettingInput,
  UpdateDeviceInput,
  UpdateSyncMetadataInput,
} from '../dto/platform';
import { SYNC_OPERATION_TYPES, SYNC_STATUSES } from '../models/platform';
```

```ts
export const validateEnqueue = createValidator<EnqueueSyncOperationInput>('SyncQueueItem', {
  entityType: [required(), isString(), maxLength(100)],
  entityId: [required(), isString(), maxLength(128)],
  operationType: [required(), isString(), oneOf(SYNC_OPERATION_TYPES)],
  payload: [isJsonSerializable()],
});

export const validateRecordSyncError = createValidator<RecordSyncErrorInput>('SyncError', {
  operationId: [isString(), maxLength(128)],
  message: [required(), isString(), maxLength(2000)],
  stack: [isString(), maxLength(10000)],
  retryCount: [isNonNegativeInt()],
});

export const validatePurge = createValidator<{ olderThan: string }>('SyncQueue.purge', {
  olderThan: [required(), isIsoDate()],
});
```

Create `apps/desktop/electron/data/repositories/interfaces/ISyncQueueRepository.ts`:

```ts
import type { EnqueueSyncOperationInput, RecordSyncErrorInput } from '../../dto/platform';
import type { SyncError, SyncQueueItem, SyncQueueStatus } from '../../models/platform';

/**
 * Offline-first outbox. Owns sync_errors too — errors only exist in the
 * context of a queue operation (the aggregate); a dedicated error repository
 * can be split out when the sync worker phase needs one.
 */
export interface ISyncQueueRepository {
  enqueue(input: EnqueueSyncOperationInput): SyncQueueItem;
  enqueueMany(inputs: readonly EnqueueSyncOperationInput[]): SyncQueueItem[];
  findById(id: string): SyncQueueItem | null;
  /** Oldest pending first — matches idx_sync_queue_status_createdAt. */
  nextBatch(limit: number): SyncQueueItem[];
  markInFlight(ids: readonly string[]): number;
  markCompleted(ids: readonly string[]): number;
  /** Sets status 'failed' and increments retryCount. */
  markFailed(id: string): SyncQueueItem;
  countByStatus(status: SyncQueueStatus): number;
  /** Deletes completed items older than the given ISO timestamp; returns the count. */
  purgeCompleted(olderThan: string): number;
  recordError(input: RecordSyncErrorInput): SyncError;
  errorsForOperation(operationId: string): SyncError[];
}
```

Create `apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.ts`:

```ts
import { newId } from '../../../database/helpers/ids';
import { nowIso } from '../../../database/helpers/time';
import { TableNames } from '../../../database/schema/tableNames';
import type { EnqueueSyncOperationInput, RecordSyncErrorInput } from '../../dto/platform';
import { serializeJsonColumn } from '../../mappers/json';
import {
  syncErrorMapper,
  syncQueueMapper,
  type SyncErrorRow,
  type SyncQueueRow,
} from '../../mappers/platformMappers';
import type { SyncError, SyncQueueItem, SyncQueueStatus } from '../../models/platform';
import { deleteFrom, insertInto, select, updateTable } from '../../queries/builders';
import { and, eq, inList, lt } from '../../queries/predicates';
import {
  validateEnqueue,
  validatePurge,
  validateRecordSyncError,
} from '../../validators/platform';
import { BaseRepository } from '../base/BaseRepository';
import type { RepositoryContext } from '../base/RepositoryContext';
import type { ISyncQueueRepository } from '../interfaces/ISyncQueueRepository';

const SYNC_QUEUE_COLUMNS = [
  'id',
  'entityType',
  'entityId',
  'operationType',
  'payload',
  'retryCount',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export class SqliteSyncQueueRepository
  extends BaseRepository<SyncQueueRow, SyncQueueItem>
  implements ISyncQueueRepository
{
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.syncQueue,
      entityName: 'SyncQueueItem',
      columns: SYNC_QUEUE_COLUMNS,
      mapper: syncQueueMapper,
    });
  }

  enqueue(input: EnqueueSyncOperationInput): SyncQueueItem {
    this.validate(validateEnqueue, input);
    const now = nowIso();
    return this.insertRow({
      id: newId(),
      entityType: input.entityType,
      entityId: input.entityId,
      operationType: input.operationType,
      payload: serializeJsonColumn(input.payload, 'sync_queue.payload'),
      retryCount: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }

  enqueueMany(inputs: readonly EnqueueSyncOperationInput[]): SyncQueueItem[] {
    for (const input of inputs) {
      this.validate(validateEnqueue, input);
    }
    if (inputs.length === 0) {
      return [];
    }
    return this.query('enqueueMany', () =>
      // IMMEDIATE: a known write batch takes the write lock up front.
      this.context.transactions.runImmediate(() => inputs.map((input) => this.enqueue(input))),
    );
  }

  nextBatch(limit: number): SyncQueueItem[] {
    return this.selectWhere('nextBatch', eq('status', 'pending'), {
      orderBy: [
        { column: 'createdAt', direction: 'asc' },
        { column: 'id', direction: 'asc' },
      ],
      page: { limit, offset: 0 },
    });
  }

  markInFlight(ids: readonly string[]): number {
    return this.#setStatus(ids, 'in_flight', 'markInFlight');
  }

  markCompleted(ids: readonly string[]): number {
    return this.#setStatus(ids, 'completed', 'markCompleted');
  }

  markFailed(id: string): SyncQueueItem {
    return this.executeTransaction(() => {
      const current = this.findByIdOrThrow(id);
      return this.updateById(id, {
        status: 'failed',
        retryCount: current.retryCount + 1,
        updatedAt: nowIso(),
      });
    });
  }

  countByStatus(status: SyncQueueStatus): number {
    return this.count(eq('status', status));
  }

  purgeCompleted(olderThan: string): number {
    this.validate(validatePurge, { olderThan });
    return this.query('purgeCompleted', () => {
      const built = deleteFrom(TableNames.syncQueue)
        .where(and(eq('status', 'completed'), lt('createdAt', olderThan)))
        .build();
      return this.statements.get(built.sql).run(...built.params).changes;
    });
  }

  recordError(input: RecordSyncErrorInput): SyncError {
    this.validate(validateRecordSyncError, input);
    return this.query('recordError', () => {
      const row: SyncErrorRow = {
        id: newId(),
        operationId: input.operationId,
        message: input.message,
        stack: input.stack ?? null,
        retryCount: input.retryCount ?? 0,
        createdAt: nowIso(),
      };
      const built = insertInto(TableNames.syncErrors)
        .values({ ...row })
        .build();
      this.statements.get(built.sql).run(...built.params);
      return syncErrorMapper.toModel(row);
    });
  }

  errorsForOperation(operationId: string): SyncError[] {
    return this.query('errorsForOperation', () => {
      const built = select(TableNames.syncErrors)
        .where(eq('operationId', operationId))
        .orderBy('createdAt')
        .orderBy('id')
        .build();
      const rows = this.statements.get(built.sql).all(...built.params) as SyncErrorRow[];
      return rows.map((row) => syncErrorMapper.toModel(row));
    });
  }

  #setStatus(ids: readonly string[], status: SyncQueueStatus, operation: string): number {
    if (ids.length === 0) {
      return 0;
    }
    return this.query(operation, () => {
      const built = updateTable(TableNames.syncQueue)
        .set({ status, updatedAt: nowIso() })
        .where(inList('id', ids))
        .build();
      return this.statements.get(built.sql).run(...built.params).changes;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/sqlite/SqliteSyncQueueRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data
git commit -m "feat(data): sync-queue repository with batch status transitions and error records" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: AuditLog repository

**Files:**
- Create: `apps/desktop/electron/data/repositories/interfaces/IAuditLogRepository.ts`
- Create: `apps/desktop/electron/data/repositories/sqlite/SqliteAuditLogRepository.ts`
- Modify: `apps/desktop/electron/data/validators/platform.ts` (append audit validator)
- Test: `apps/desktop/electron/data/repositories/sqlite/SqliteAuditLogRepository.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6 modules; `AppendAuditEntryInput`, `AUDIT_CATEGORIES` (Task 5); `and`, `eq`, `gte`, `lte`, `lt` predicates.
- Produces: `IAuditLogRepository { append(input: AppendAuditEntryInput): AuditLogEntry; findByCategory(category: AuditCategory, options?: QueryOptions): AuditLogEntry[]; findInRange(fromIso: string, toIso: string, options?: QueryOptions): AuditLogEntry[]; findPage(options: PageOptions): Page<AuditLogEntry>; count(): number; prune(olderThan: string): number }` — append-only: the interface exposes no update/delete. `SqliteAuditLogRepository`, `validateAppendAudit`, `validateAuditPrune`.
- Note: `audit_log` has no `updatedAt` column; the base default ordering (`createdAt, id`) still applies.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/repositories/sqlite/SqliteAuditLogRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../errors/repositoryErrors';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { SqliteAuditLogRepository } from './SqliteAuditLogRepository';

describe('SqliteAuditLogRepository', () => {
  let test: TestContext;
  let repo: SqliteAuditLogRepository;

  // Fake timers: see SqliteSyncQueueRepository.test.ts — 1ms ticks make
  // createdAt-ordered assertions deterministic.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00.000Z'));
    test = createTestContext();
    repo = new SqliteAuditLogRepository(test.context);
  });

  afterEach(() => {
    vi.useRealTimers();
    test.cleanup();
  });

  const tick = () => vi.advanceTimersByTime(1);

  it('append stores an entry with details and generates id/createdAt', () => {
    const entry = repo.append({
      category: 'security',
      event: 'permission.denied',
      details: { channel: 'settings:get' },
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.details).toEqual({ channel: 'settings:get' });
    expect(repo.count()).toBe(1);
  });

  it('append validates category and event', () => {
    expect(() => repo.append({ category: 'nope' as never, event: 'x' })).toThrow(ValidationError);
    expect(() => repo.append({ category: 'sync', event: '' })).toThrow(ValidationError);
  });

  it('findByCategory filters and supports paging', () => {
    repo.append({ category: 'sync', event: 'sync.started' });
    tick();
    repo.append({ category: 'database', event: 'database.started' });
    tick();
    repo.append({ category: 'sync', event: 'sync.finished' });
    const syncEntries = repo.findByCategory('sync');
    expect(syncEntries.map((e) => e.event)).toEqual(['sync.started', 'sync.finished']);
    expect(repo.findByCategory('sync', { page: { limit: 1, offset: 1 } })).toHaveLength(1);
  });

  it('findInRange bounds by createdAt inclusively', () => {
    const entry = repo.append({ category: 'application', event: 'app.started' });
    expect(repo.findInRange(entry.createdAt, entry.createdAt)).toHaveLength(1);
    expect(repo.findInRange('2000-01-01T00:00:00.000Z', '2000-12-31T00:00:00.000Z')).toHaveLength(0);
  });

  it('findPage returns a page with total', () => {
    repo.append({ category: 'sync', event: 'a' });
    repo.append({ category: 'sync', event: 'b' });
    const page = repo.findPage({ page: { limit: 1, offset: 0 } });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  it('prune deletes entries older than the cutoff and validates the cutoff', () => {
    repo.append({ category: 'sync', event: 'old' });
    expect(repo.prune('9999-01-01T00:00:00.000Z')).toBe(1);
    expect(repo.count()).toBe(0);
    expect(() => repo.prune('garbage')).toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/sqlite/SqliteAuditLogRepository.test.ts`
Expected: FAIL — cannot resolve `./SqliteAuditLogRepository`.

- [ ] **Step 3: Write the implementation**

Append to `apps/desktop/electron/data/validators/platform.ts` — extend imports (`AppendAuditEntryInput` from dto, `AUDIT_CATEGORIES` from models) and add:

```ts
export const validateAppendAudit = createValidator<AppendAuditEntryInput>('AuditLogEntry', {
  category: [required(), isString(), oneOf(AUDIT_CATEGORIES)],
  event: [required(), isString(), maxLength(200)],
  details: [isJsonSerializable()],
});

export const validateAuditPrune = createValidator<{ olderThan: string }>('AuditLog.prune', {
  olderThan: [required(), isIsoDate()],
});
```

Create `apps/desktop/electron/data/repositories/interfaces/IAuditLogRepository.ts`:

```ts
import type { AppendAuditEntryInput } from '../../dto/platform';
import type { Page, PageOptions, QueryOptions } from '../../dto/query';
import type { AuditCategory, AuditLogEntry } from '../../models/platform';

/** Append-only by contract: no update/delete is exposed; prune is the only removal. */
export interface IAuditLogRepository {
  append(input: AppendAuditEntryInput): AuditLogEntry;
  findByCategory(category: AuditCategory, options?: QueryOptions): AuditLogEntry[];
  findInRange(fromIso: string, toIso: string, options?: QueryOptions): AuditLogEntry[];
  findPage(options: PageOptions): Page<AuditLogEntry>;
  count(): number;
  /** Retention housekeeping: deletes entries older than the ISO cutoff. */
  prune(olderThan: string): number;
}
```

Create `apps/desktop/electron/data/repositories/sqlite/SqliteAuditLogRepository.ts`:

```ts
import { newId } from '../../../database/helpers/ids';
import { nowIso } from '../../../database/helpers/time';
import { TableNames } from '../../../database/schema/tableNames';
import type { AppendAuditEntryInput } from '../../dto/platform';
import type { QueryOptions } from '../../dto/query';
import { serializeJsonColumn } from '../../mappers/json';
import { auditLogMapper, type AuditLogRow } from '../../mappers/platformMappers';
import type { AuditCategory, AuditLogEntry } from '../../models/platform';
import { deleteFrom } from '../../queries/builders';
import { and, eq, gte, lt, lte } from '../../queries/predicates';
import { validateAppendAudit, validateAuditPrune } from '../../validators/platform';
import { BaseRepository } from '../base/BaseRepository';
import type { RepositoryContext } from '../base/RepositoryContext';
import type { IAuditLogRepository } from '../interfaces/IAuditLogRepository';

const AUDIT_LOG_COLUMNS = ['id', 'category', 'event', 'details', 'createdAt'] as const;

export class SqliteAuditLogRepository
  extends BaseRepository<AuditLogRow, AuditLogEntry>
  implements IAuditLogRepository
{
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.auditLog,
      entityName: 'AuditLogEntry',
      columns: AUDIT_LOG_COLUMNS,
      mapper: auditLogMapper,
    });
  }

  append(input: AppendAuditEntryInput): AuditLogEntry {
    this.validate(validateAppendAudit, input);
    return this.insertRow({
      id: newId(),
      category: input.category,
      event: input.event,
      details: serializeJsonColumn(input.details, 'audit_log.details'),
      createdAt: nowIso(),
    });
  }

  findByCategory(category: AuditCategory, options?: QueryOptions): AuditLogEntry[] {
    return this.selectWhere('findByCategory', eq('category', category), options);
  }

  findInRange(fromIso: string, toIso: string, options?: QueryOptions): AuditLogEntry[] {
    return this.selectWhere(
      'findInRange',
      and(gte('createdAt', fromIso), lte('createdAt', toIso)),
      options,
    );
  }

  prune(olderThan: string): number {
    this.validate(validateAuditPrune, { olderThan });
    return this.query('prune', () => {
      const built = deleteFrom(TableNames.auditLog).where(lt('createdAt', olderThan)).build();
      return this.statements.get(built.sql).run(...built.params).changes;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/repositories/sqlite/SqliteAuditLogRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full data-layer suite**

Run: `pnpm exec vitest run apps/desktop/electron/data`
Expected: PASS — all data-layer tests green together.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/data
git commit -m "feat(data): append-only audit-log repository with range queries and pruning" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Application services

**Files:**
- Create: `apps/desktop/electron/data/services/TransactionRunner.ts`
- Create: `apps/desktop/electron/data/services/DeviceService.ts`
- Create: `apps/desktop/electron/data/services/AppSettingsService.ts`
- Create: `apps/desktop/electron/data/services/SyncMetadataService.ts`
- Create: `apps/desktop/electron/data/services/SyncQueueService.ts`
- Create: `apps/desktop/electron/data/services/AuditLogService.ts`
- Test: `apps/desktop/electron/data/services/AppSettingsService.test.ts`
- Test: `apps/desktop/electron/data/services/SyncQueueService.test.ts`

**Interfaces:**
- Consumes: repository interfaces (Tasks 7–11), models/DTOs (Task 5).
- Produces:
  - `TransactionRunner { run<T>(work: () => T): T; runImmediate<T>(work: () => T): T }` — the minimal transaction surface services need; `TransactionManager` satisfies it structurally.
  - `DeviceService { list(): Promise<Device[]>; get(id: string): Promise<Device | null> }`
  - `AppSettingsService { get(key: string): Promise<unknown>; getAll(): Promise<AppSetting[]>; set(key: string, value: unknown): Promise<AppSetting>; remove(key: string): Promise<boolean> }` — `set` writes the setting AND an audit entry in one transaction (the cross-repo transaction demonstration).
  - `SyncMetadataService { get(): Promise<SyncMetadata>; update(input: UpdateSyncMetadataInput): Promise<SyncMetadata> }`
  - `SyncQueueService { enqueue(input): Promise<SyncQueueItem>; nextBatch(limit: number): Promise<SyncQueueItem[]>; complete(ids: string[]): Promise<number>; fail(id: string, error: { message: string; stack?: string }): Promise<SyncQueueItem>; countByStatus(status): Promise<number> }` — `fail` marks failed and records the sync error in one transaction.
  - `AuditLogService { append(input): Promise<AuditLogEntry>; findByCategory(category, options?): Promise<AuditLogEntry[]>; page(options): Promise<Page<AuditLogEntry>>; prune(olderThan: string): Promise<number> }`
- Services are thin async facades: methods return `Promise.resolve(...)` around synchronous repository calls (no `async` keyword — nothing is awaited). The async boundary is where IPC and the future sync worker attach.

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/electron/data/services/AppSettingsService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AppendAuditEntryInput } from '../dto/platform';
import type { AppSetting, AuditLogEntry } from '../models/platform';
import type { IAppSettingsRepository } from '../repositories/interfaces/IAppSettingsRepository';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';
import { AppSettingsService } from './AppSettingsService';
import type { TransactionRunner } from './TransactionRunner';

/** Hand-built mocks over the repository interfaces — no database. */
function makeSetting(key: string, value: unknown): AppSetting {
  return { id: `id-${key}`, key, value, createdAt: 't0', updatedAt: 't0' };
}

function makeMocks() {
  const store = new Map<string, AppSetting>();
  const audits: AppendAuditEntryInput[] = [];
  const settingsRepo: IAppSettingsRepository = {
    getByKey: (key) => store.get(key) ?? null,
    setByKey: (key, value) => {
      const setting = makeSetting(key, value);
      store.set(key, setting);
      return setting;
    },
    getAll: () => [...store.values()],
    deleteByKey: (key) => store.delete(key),
  };
  const auditRepo: IAuditLogRepository = {
    append: (input) => {
      audits.push(input);
      return { id: 'a1', category: input.category, event: input.event, details: null, createdAt: 't0' } satisfies AuditLogEntry;
    },
    findByCategory: () => [],
    findInRange: () => [],
    findPage: () => ({ items: [], total: 0, limit: 0, offset: 0 }),
    count: () => audits.length,
    prune: () => 0,
  };
  const transactions: TransactionRunner = {
    run: (work) => work(),
    runImmediate: (work) => work(),
  };
  return { settingsRepo, auditRepo, transactions, audits };
}

describe('AppSettingsService', () => {
  it('get returns the stored value or null', async () => {
    const { settingsRepo, auditRepo, transactions } = makeMocks();
    const service = new AppSettingsService({ appSettings: settingsRepo, auditLog: auditRepo, transactions });
    await expect(service.get('missing')).resolves.toBeNull();
    settingsRepo.setByKey('theme', 'dark');
    await expect(service.get('theme')).resolves.toBe('dark');
  });

  it('set writes the setting and an audit entry together', async () => {
    const { settingsRepo, auditRepo, transactions, audits } = makeMocks();
    const service = new AppSettingsService({ appSettings: settingsRepo, auditLog: auditRepo, transactions });
    const setting = await service.set('theme', 'dark');
    expect(setting.value).toBe('dark');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ category: 'application', event: 'setting.updated' });
    expect(audits[0].details).toEqual({ key: 'theme' }); // never the value — may be sensitive
  });

  it('remove reports whether a setting existed', async () => {
    const { settingsRepo, auditRepo, transactions } = makeMocks();
    const service = new AppSettingsService({ appSettings: settingsRepo, auditLog: auditRepo, transactions });
    settingsRepo.setByKey('theme', 'dark');
    await expect(service.remove('theme')).resolves.toBe(true);
    await expect(service.remove('theme')).resolves.toBe(false);
  });
});
```

Create `apps/desktop/electron/data/services/SyncQueueService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RecordSyncErrorInput } from '../dto/platform';
import type { SyncError, SyncQueueItem } from '../models/platform';
import type { ISyncQueueRepository } from '../repositories/interfaces/ISyncQueueRepository';
import { SyncQueueService } from './SyncQueueService';
import type { TransactionRunner } from './TransactionRunner';

function makeItem(id: string, retryCount = 0): SyncQueueItem {
  return {
    id,
    entityType: 'student',
    entityId: 'e1',
    operationType: 'create',
    payload: null,
    retryCount,
    status: 'pending',
    createdAt: 't0',
    updatedAt: 't0',
  };
}

describe('SyncQueueService', () => {
  it('fail marks the item failed and records the error in one transaction', async () => {
    const recorded: RecordSyncErrorInput[] = [];
    let inTransaction = false;
    let failedInTransaction = false;
    const repo = {
      markFailed: (id: string) => {
        failedInTransaction = inTransaction;
        return { ...makeItem(id, 1), status: 'failed' as const };
      },
      recordError: (input: RecordSyncErrorInput) => {
        recorded.push(input);
        return {
          id: 'err1',
          operationId: input.operationId,
          message: input.message,
          stack: input.stack ?? null,
          retryCount: input.retryCount ?? 0,
          createdAt: 't0',
        } satisfies SyncError;
      },
    } as Partial<ISyncQueueRepository> as ISyncQueueRepository;
    const transactions: TransactionRunner = {
      run: (work) => {
        inTransaction = true;
        try {
          return work();
        } finally {
          inTransaction = false;
        }
      },
      runImmediate: (work) => work(),
    };
    const service = new SyncQueueService({ syncQueue: repo, transactions });

    const item = await service.fail('q1', { message: 'network timeout', stack: 'at sync()' });

    expect(item.status).toBe('failed');
    expect(failedInTransaction).toBe(true);
    expect(recorded).toEqual([
      { operationId: 'q1', message: 'network timeout', stack: 'at sync()', retryCount: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run apps/desktop/electron/data/services`
Expected: FAIL — cannot resolve the service modules.

- [ ] **Step 3: Write the implementations**

Create `apps/desktop/electron/data/services/TransactionRunner.ts`:

```ts
/**
 * The minimal transaction surface services depend on. The platform's
 * TransactionManager satisfies it structurally; tests substitute a
 * pass-through.
 */
export interface TransactionRunner {
  run<T>(work: () => T): T;
  runImmediate<T>(work: () => T): T;
}
```

Create `apps/desktop/electron/data/services/DeviceService.ts`:

```ts
import type { Device } from '../models/platform';
import type { IDeviceRepository } from '../repositories/interfaces/IDeviceRepository';

export interface DeviceServiceDeps {
  devices: IDeviceRepository;
}

/** Async facade over the device repository — the surface IPC and sync call. */
export class DeviceService {
  readonly #deps: DeviceServiceDeps;

  constructor(deps: DeviceServiceDeps) {
    this.#deps = deps;
  }

  list(): Promise<Device[]> {
    return Promise.resolve(this.#deps.devices.findAll());
  }

  get(id: string): Promise<Device | null> {
    return Promise.resolve(this.#deps.devices.findById(id));
  }
}
```

Create `apps/desktop/electron/data/services/AppSettingsService.ts`:

```ts
import type { AppSetting } from '../models/platform';
import type { IAppSettingsRepository } from '../repositories/interfaces/IAppSettingsRepository';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';
import type { TransactionRunner } from './TransactionRunner';

export interface AppSettingsServiceDeps {
  appSettings: IAppSettingsRepository;
  auditLog: IAuditLogRepository;
  transactions: TransactionRunner;
}

export class AppSettingsService {
  readonly #deps: AppSettingsServiceDeps;

  constructor(deps: AppSettingsServiceDeps) {
    this.#deps = deps;
  }

  /** The stored value, or null when the key does not exist. */
  get(key: string): Promise<unknown> {
    return Promise.resolve(this.#deps.appSettings.getByKey(key)?.value ?? null);
  }

  getAll(): Promise<AppSetting[]> {
    return Promise.resolve(this.#deps.appSettings.getAll());
  }

  /** Writes the setting and its audit entry atomically (cross-repo transaction). */
  set(key: string, value: unknown): Promise<AppSetting> {
    return Promise.resolve(
      this.#deps.transactions.run(() => {
        const setting = this.#deps.appSettings.setByKey(key, value);
        // Audit the key only — setting values may be sensitive.
        this.#deps.auditLog.append({
          category: 'application',
          event: 'setting.updated',
          details: { key },
        });
        return setting;
      }),
    );
  }

  remove(key: string): Promise<boolean> {
    return Promise.resolve(this.#deps.appSettings.deleteByKey(key));
  }
}
```

Create `apps/desktop/electron/data/services/SyncMetadataService.ts`:

```ts
import type { UpdateSyncMetadataInput } from '../dto/platform';
import type { SyncMetadata } from '../models/platform';
import type { ISyncMetadataRepository } from '../repositories/interfaces/ISyncMetadataRepository';

export interface SyncMetadataServiceDeps {
  syncMetadata: ISyncMetadataRepository;
}

export class SyncMetadataService {
  readonly #deps: SyncMetadataServiceDeps;

  constructor(deps: SyncMetadataServiceDeps) {
    this.#deps = deps;
  }

  get(): Promise<SyncMetadata> {
    return Promise.resolve(this.#deps.syncMetadata.get());
  }

  update(input: UpdateSyncMetadataInput): Promise<SyncMetadata> {
    return Promise.resolve(this.#deps.syncMetadata.update(input));
  }
}
```

Create `apps/desktop/electron/data/services/SyncQueueService.ts`:

```ts
import type { EnqueueSyncOperationInput } from '../dto/platform';
import type { SyncQueueItem, SyncQueueStatus } from '../models/platform';
import type { ISyncQueueRepository } from '../repositories/interfaces/ISyncQueueRepository';
import type { TransactionRunner } from './TransactionRunner';

export interface SyncQueueServiceDeps {
  syncQueue: ISyncQueueRepository;
  transactions: TransactionRunner;
}

export class SyncQueueService {
  readonly #deps: SyncQueueServiceDeps;

  constructor(deps: SyncQueueServiceDeps) {
    this.#deps = deps;
  }

  enqueue(input: EnqueueSyncOperationInput): Promise<SyncQueueItem> {
    return Promise.resolve(this.#deps.syncQueue.enqueue(input));
  }

  nextBatch(limit: number): Promise<SyncQueueItem[]> {
    return Promise.resolve(this.#deps.syncQueue.nextBatch(limit));
  }

  complete(ids: string[]): Promise<number> {
    return Promise.resolve(this.#deps.syncQueue.markCompleted(ids));
  }

  /** Marks the operation failed and records its error atomically. */
  fail(id: string, error: { message: string; stack?: string }): Promise<SyncQueueItem> {
    return Promise.resolve(
      this.#deps.transactions.run(() => {
        const item = this.#deps.syncQueue.markFailed(id);
        this.#deps.syncQueue.recordError({
          operationId: id,
          message: error.message,
          stack: error.stack ?? null,
          retryCount: item.retryCount,
        });
        return item;
      }),
    );
  }

  countByStatus(status: SyncQueueStatus): Promise<number> {
    return Promise.resolve(this.#deps.syncQueue.countByStatus(status));
  }
}
```

Create `apps/desktop/electron/data/services/AuditLogService.ts`:

```ts
import type { AppendAuditEntryInput } from '../dto/platform';
import type { Page, PageOptions, QueryOptions } from '../dto/query';
import type { AuditCategory, AuditLogEntry } from '../models/platform';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';

export interface AuditLogServiceDeps {
  auditLog: IAuditLogRepository;
}

export class AuditLogService {
  readonly #deps: AuditLogServiceDeps;

  constructor(deps: AuditLogServiceDeps) {
    this.#deps = deps;
  }

  append(input: AppendAuditEntryInput): Promise<AuditLogEntry> {
    return Promise.resolve(this.#deps.auditLog.append(input));
  }

  findByCategory(category: AuditCategory, options?: QueryOptions): Promise<AuditLogEntry[]> {
    return Promise.resolve(this.#deps.auditLog.findByCategory(category, options));
  }

  page(options: PageOptions): Promise<Page<AuditLogEntry>> {
    return Promise.resolve(this.#deps.auditLog.findPage(options));
  }

  prune(olderThan: string): Promise<number> {
    return Promise.resolve(this.#deps.auditLog.prune(olderThan));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/desktop/electron/data/services`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data/services
git commit -m "feat(data): async application services over the sync repositories" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Data layer factory

**Files:**
- Create: `apps/desktop/electron/data/factories/createDataLayer.ts`
- Test: `apps/desktop/electron/data/factories/createDataLayer.test.ts`

**Interfaces:**
- Consumes: `DatabaseManager`/`DatabaseLogger`, `createRepositoryContext` (Task 6), all SQLite repositories (Tasks 7–11), all services (Task 12).
- Produces:

```ts
interface DataLayer {
  repositories: {
    devices: IDeviceRepository;
    appSettings: IAppSettingsRepository;
    syncMetadata: ISyncMetadataRepository;
    syncQueue: ISyncQueueRepository;
    auditLog: IAuditLogRepository;
  };
  services: {
    device: DeviceService;
    appSettings: AppSettingsService;
    syncMetadata: SyncMetadataService;
    syncQueue: SyncQueueService;
    auditLog: AuditLogService;
  };
}
createDataLayer(manager: DatabaseManager, log: DatabaseLogger): DataLayer
```

Called once from `main.ts` after `manager.initialize()`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/data/factories/createDataLayer.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../../database/DatabaseManager';
import { createDataLayer, type DataLayer } from './createDataLayer';

const TEST_DEVICE = {
  deviceName: 'factory-test',
  platform: 'win32',
  osVersion: '10.0',
  appVersion: '1.0.0',
};

describe('createDataLayer', () => {
  let directory: string;
  let manager: DatabaseManager;
  let dataLayer: DataLayer;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-datalayer-test-'));
    manager = new DatabaseManager({ userDataDir: directory, device: TEST_DEVICE });
    manager.initialize();
    dataLayer = createDataLayer(manager, { info: () => {}, warn: () => {}, error: () => {} });
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('wires repositories against the real platform database', () => {
    // The platform seed created the device row and the sync_metadata singleton.
    expect(dataLayer.repositories.devices.count()).toBe(1);
    expect(dataLayer.repositories.syncMetadata.get().syncStatus).toBe('never');
  });

  it('end-to-end: settings service round-trip writes setting + audit atomically', async () => {
    await dataLayer.services.appSettings.set('sync.interval', 15);
    await expect(dataLayer.services.appSettings.get('sync.interval')).resolves.toBe(15);
    const audits = dataLayer.repositories.auditLog.findByCategory('application');
    expect(audits.some((entry) => entry.event === 'setting.updated')).toBe(true);
  });

  it('end-to-end: queue service fail() records the linked sync error', async () => {
    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'student',
      entityId: 'e1',
      operationType: 'create',
      payload: { name: 'Ada' },
    });
    await dataLayer.services.syncQueue.fail(item.id, { message: 'offline' });
    const errors = dataLayer.repositories.syncQueue.errorsForOperation(item.id);
    expect(errors).toHaveLength(1);
    expect(errors[0].retryCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/data/factories/createDataLayer.test.ts`
Expected: FAIL — cannot resolve `./createDataLayer`.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/electron/data/factories/createDataLayer.ts`:

```ts
import type { DatabaseLogger, DatabaseManager } from '../../database/DatabaseManager';
import { createRepositoryContext } from '../repositories/base/RepositoryContext';
import type { IAppSettingsRepository } from '../repositories/interfaces/IAppSettingsRepository';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';
import type { IDeviceRepository } from '../repositories/interfaces/IDeviceRepository';
import type { ISyncMetadataRepository } from '../repositories/interfaces/ISyncMetadataRepository';
import type { ISyncQueueRepository } from '../repositories/interfaces/ISyncQueueRepository';
import { SqliteAppSettingsRepository } from '../repositories/sqlite/SqliteAppSettingsRepository';
import { SqliteAuditLogRepository } from '../repositories/sqlite/SqliteAuditLogRepository';
import { SqliteDeviceRepository } from '../repositories/sqlite/SqliteDeviceRepository';
import { SqliteSyncMetadataRepository } from '../repositories/sqlite/SqliteSyncMetadataRepository';
import { SqliteSyncQueueRepository } from '../repositories/sqlite/SqliteSyncQueueRepository';
import { AppSettingsService } from '../services/AppSettingsService';
import { AuditLogService } from '../services/AuditLogService';
import { DeviceService } from '../services/DeviceService';
import { SyncMetadataService } from '../services/SyncMetadataService';
import { SyncQueueService } from '../services/SyncQueueService';

export interface DataLayer {
  repositories: {
    devices: IDeviceRepository;
    appSettings: IAppSettingsRepository;
    syncMetadata: ISyncMetadataRepository;
    syncQueue: ISyncQueueRepository;
    auditLog: IAuditLogRepository;
  };
  services: {
    device: DeviceService;
    appSettings: AppSettingsService;
    syncMetadata: SyncMetadataService;
    syncQueue: SyncQueueService;
    auditLog: AuditLogService;
  };
}

/**
 * Composition root of the data layer. Called once from main.ts after
 * DatabaseManager.initialize(); everything downstream receives interfaces,
 * never concrete SQLite classes.
 */
export function createDataLayer(manager: DatabaseManager, log: DatabaseLogger): DataLayer {
  const context = createRepositoryContext(manager, log);

  const devices = new SqliteDeviceRepository(context);
  const appSettings = new SqliteAppSettingsRepository(context);
  const syncMetadata = new SqliteSyncMetadataRepository(context);
  const syncQueue = new SqliteSyncQueueRepository(context);
  const auditLog = new SqliteAuditLogRepository(context);

  return {
    repositories: { devices, appSettings, syncMetadata, syncQueue, auditLog },
    services: {
      device: new DeviceService({ devices }),
      appSettings: new AppSettingsService({
        appSettings,
        auditLog,
        transactions: context.transactions,
      }),
      syncMetadata: new SyncMetadataService({ syncMetadata }),
      syncQueue: new SyncQueueService({ syncQueue, transactions: context.transactions }),
      auditLog: new AuditLogService({ auditLog }),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/desktop/electron/data/factories/createDataLayer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data/factories
git commit -m "feat(data): createDataLayer composition root wiring repositories and services" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Phase 2 debt — wrap remaining raw driver errors in the taxonomy

**Files:**
- Modify: `apps/desktop/electron/database/services/MigrationService.ts`
- Modify: `apps/desktop/electron/database/seed/initializeMetadata.ts`
- Test: `apps/desktop/electron/database/services/MigrationService.test.ts` (append)
- Test: `apps/desktop/electron/database/seed/initializeMetadata.test.ts` (append)

**Why:** the Phase 2 report (§10) flagged that `MigrationService`'s history-table creation / `currentVersion()` / `appliedMigrations()` and all of `initializeMetadata`'s prepares run outside the `DatabaseError` taxonomy — a raw driver error there would be misclassified by `main.ts`'s `instanceof DatabaseError` check. Close it before Phase 3 exposes DB data over IPC.

**Interfaces:**
- Consumes: existing `wrapSqliteError(error, context)` and `MigrationError` from the database layer.
- Produces: no signature changes — same public API, failures now typed.

- [ ] **Step 1: Write the failing tests**

Append to `apps/desktop/electron/database/services/MigrationService.test.ts` (inside the existing top-level `describe`, using the existing test helpers/imports of that file; add `DatabaseError` to the imports from `../errors/errors`):

```ts
  it('wraps raw driver failures from history access in the DatabaseError taxonomy', () => {
    const test = createTestDatabase();
    const service = new MigrationService(test.db.raw, migrations);
    test.db.close();
    try {
      expect(() => service.migrateToLatest()).toThrow(DatabaseError);
      expect(() => service.currentVersion()).toThrow(DatabaseError);
      expect(() => service.appliedMigrations()).toThrow(DatabaseError);
    } finally {
      fs.rmSync(path.dirname(test.filePath), { recursive: true, force: true });
    }
  });
```

(If the existing file's helpers differ — e.g. it already has a `createTestDatabase()` + cleanup pattern — follow that file's local idiom; the assertion that a closed database throws `DatabaseError` (not a raw `TypeError`) is what matters.)

Append to `apps/desktop/electron/database/seed/initializeMetadata.test.ts` (same rule — follow the file's local setup idiom; add `DatabaseError` import):

```ts
  it('wraps raw driver failures in the DatabaseError taxonomy', () => {
    const test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
    test.db.close();
    expect(() =>
      initializeMetadata(test.db.raw, TEST_DEVICE, 1),
    ).toThrow(DatabaseError);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run apps/desktop/electron/database/services/MigrationService.test.ts apps/desktop/electron/database/seed/initializeMetadata.test.ts`
Expected: the two new tests FAIL — a closed better-sqlite3 connection throws a raw `TypeError: The database connection is not open`, which is not a `DatabaseError`.

- [ ] **Step 3: Implement the wrapping**

In `apps/desktop/electron/database/services/MigrationService.ts`:

1. Add to the imports: `import { wrapSqliteError } from '../errors/wrapSqliteError';`
2. In `migrateToLatest()`, replace the line `this.#db.exec(CREATE_HISTORY_TABLE);` with:

```ts
    this.#ensureHistoryTable();
```

3. In `rollbackLast()`, replace its `this.#db.exec(CREATE_HISTORY_TABLE);` line the same way.
4. Replace the bodies of `appliedMigrations()` and `currentVersion()`:

```ts
  appliedMigrations(): AppliedMigration[] {
    try {
      return this.#db
        .prepare(
          `SELECT version, name, appliedAt, durationMs
           FROM ${TableNames.schemaMigrations} ORDER BY version`,
        )
        .all() as AppliedMigration[];
    } catch (error) {
      throw wrapSqliteError(error, 'migration history read');
    }
  }

  currentVersion(): number {
    try {
      const row = this.#db
        .prepare(`SELECT MAX(version) AS version FROM ${TableNames.schemaMigrations}`)
        .get() as { version: number | null };
      return row.version ?? 0;
    } catch (error) {
      throw wrapSqliteError(error, 'migration version read');
    }
  }
```

5. Add the private method:

```ts
  #ensureHistoryTable(): void {
    try {
      this.#db.exec(CREATE_HISTORY_TABLE);
    } catch (error) {
      throw wrapSqliteError(error, 'migration history setup');
    }
  }
```

In `apps/desktop/electron/database/seed/initializeMetadata.ts`:

1. Add to the imports: `import { wrapSqliteError } from '../errors/wrapSqliteError';`
2. Wrap the function body's transaction invocation. The existing body is `return db.transaction((): MetadataInitResult => { ... })();` — change it to:

```ts
  try {
    return db.transaction((): MetadataInitResult => {
      // ... existing body unchanged ...
    })();
  } catch (error) {
    throw wrapSqliteError(error, 'metadata initialization');
  }
```

- [ ] **Step 4: Run the full database suite to verify**

Run: `pnpm exec vitest run apps/desktop/electron/database`
Expected: PASS — the two new tests pass and no existing test regresses.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/database
git commit -m "fix(db): wrap migration-history and metadata-seed driver errors in the taxonomy" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Proof-of-path IPC endpoint — settings:get

**Files:**
- Modify: `packages/types/src/ipc.ts`
- Modify: `packages/types/src/api.ts`
- Modify: `apps/desktop/electron/security/validateIpc.ts`
- Create: `apps/desktop/electron/security/validateIpc.test.ts`
- Create: `apps/desktop/electron/ipc/handlers/settings.ts`
- Modify: `apps/desktop/electron/ipc/registrar.ts`
- Modify: `apps/desktop/electron/preload/preload.ts`
- Modify: `apps/desktop/electron/main/main.ts`

**Interfaces:**
- Consumes: `IpcContract`/`IpcChannels` pattern, `IpcHandle` (registrar), `IPCError` (`@nemis-desktop/shared`), `AppSettingsService.get(key)` (Task 12), `createDataLayer`/`DataLayer` (Task 13).
- Produces: channel `'settings:get': { args: [key: string]; result: unknown }`; `IpcChannels.SETTINGS_GET`; compile-time channel-exhaustiveness assertion; `assertSettingKeyArg(args: readonly unknown[]): void`; `registerSettingsHandlers(handle: IpcHandle, settings: AppSettingsService): void`; `registerIpcHandlers(services: DataLayer['services'])` (signature change); `window.nemis.settings.get(key)` in the preload; `main.ts` builds the data layer after `databaseManager.initialize()`.
- This is the Phase 1.5 first-parameterized-endpoint checklist: shape-validating validator ✓, arity comment at the registrar cast ✓, IpcChannels exhaustiveness assertion ✓.

- [ ] **Step 1: Write the failing validator test**

Create `apps/desktop/electron/security/validateIpc.test.ts` (relative import — this file must not use `@app/*`):

```ts
import { describe, expect, it } from 'vitest';
import { assertNoArgs, assertSettingKeyArg } from './validateIpc';

describe('assertNoArgs', () => {
  it('passes empty args and rejects extras', () => {
    expect(() => assertNoArgs([])).not.toThrow();
    expect(() => assertNoArgs(['x'])).toThrow();
  });
});

describe('assertSettingKeyArg', () => {
  it('accepts exactly one bounded non-empty string', () => {
    expect(() => assertSettingKeyArg(['theme'])).not.toThrow();
  });

  it('rejects wrong arity', () => {
    expect(() => assertSettingKeyArg([])).toThrow();
    expect(() => assertSettingKeyArg(['a', 'b'])).toThrow();
  });

  it('rejects non-strings, empty, and oversized keys', () => {
    expect(() => assertSettingKeyArg([42])).toThrow();
    expect(() => assertSettingKeyArg([null])).toThrow();
    expect(() => assertSettingKeyArg([{ key: 'theme' }])).toThrow();
    expect(() => assertSettingKeyArg([''])).toThrow();
    expect(() => assertSettingKeyArg(['k'.repeat(129)])).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/desktop/electron/security/validateIpc.test.ts`
Expected: FAIL — `assertSettingKeyArg` is not exported.

- [ ] **Step 3: Implement the full IPC slice**

Replace the contents of `packages/types/src/ipc.ts` with:

```ts
/**
 * Single source of truth for every IPC endpoint's request/response types.
 * Add an endpoint by adding an entry here first — the main-process
 * registrar and the preload bridge are both keyed off this map.
 * Channel naming convention: `domain:action`.
 */
export interface IpcContract {
  'system:get-version': { args: []; result: string };
  'settings:get': { args: [key: string]; result: unknown };
}

export type IpcChannel = keyof IpcContract;

export const IpcChannels = {
  SYSTEM_GET_VERSION: 'system:get-version',
  SETTINGS_GET: 'settings:get',
} as const satisfies Record<string, IpcChannel>;

// Compile-time exhaustiveness: adding a channel to IpcContract without
// listing it in IpcChannels makes this constant a type error.
type RegisteredChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
export const IPC_CHANNELS_EXHAUSTIVE: Exclude<IpcChannel, RegisteredChannel> extends never
  ? true
  : never = true;

export interface IpcErrorPayload {
  code: string;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorPayload };
```

Replace the contents of `packages/types/src/api.ts` with:

```ts
export interface SystemApi {
  getVersion(): Promise<string>;
}

export interface SettingsApi {
  /** The stored value for the key, or null when it does not exist. */
  get(key: string): Promise<unknown>;
}

export interface NemisApi {
  system: SystemApi;
  settings: SettingsApi;
}
```

Append to `apps/desktop/electron/security/validateIpc.ts`:

```ts
const MAX_SETTING_KEY_LENGTH = 128;

/** Exactly one bounded, non-empty string argument: an app-settings key. */
export function assertSettingKeyArg(args: readonly unknown[]): void {
  if (args.length !== 1) {
    throw new IPCError(`Expected exactly 1 argument, received ${args.length}.`);
  }
  const [key] = args;
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_SETTING_KEY_LENGTH) {
    throw new IPCError(`Expected a non-empty string key (max ${MAX_SETTING_KEY_LENGTH} characters).`);
  }
}
```

Create `apps/desktop/electron/ipc/handlers/settings.ts`:

```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertSettingKeyArg } from '@app/security/validateIpc';
import type { AppSettingsService } from '@app/data/services/AppSettingsService';

export function registerSettingsHandlers(handle: IpcHandle, settings: AppSettingsService): void {
  // arity: assertSettingKeyArg guarantees exactly one string arg — matches args: [key: string].
  handle(IpcChannels.SETTINGS_GET, assertSettingKeyArg, (key) => settings.get(key));
}
```

Modify `apps/desktop/electron/ipc/registrar.ts`:

1. Add imports:

```ts
import type { DataLayer } from '@app/data/factories/createDataLayer';
import { registerSettingsHandlers } from '@app/ipc/handlers/settings';
```

2. Replace `registerIpcHandlers`:

```ts
export function registerIpcHandlers(services: DataLayer['services']): void {
  registerSystemHandlers(handle);
  registerSettingsHandlers(handle, services.appSettings);
}
```

3. In `handle()`, add the arity comment directly above the cast line (`return { ok: true, data: await handler(...(args as IpcContract[C]['args'])) };`):

```ts
      // arity: the cast below is safe only because `validate` has already
      // enforced this channel's exact argument count and shapes.
```

Modify `apps/desktop/electron/preload/preload.ts` — replace the `nemisApi` object:

```ts
const nemisApi: NemisApi = {
  system: {
    getVersion: () => invoke(IpcChannels.SYSTEM_GET_VERSION),
  },
  settings: {
    get: (key: string) => invoke(IpcChannels.SETTINGS_GET, key),
  },
};
```

Modify `apps/desktop/electron/main/main.ts`:

1. Add the import:

```ts
import { createDataLayer } from '@app/data/factories/createDataLayer';
```

2. In the `whenReady().then(() => { ... })` block, the `log` object currently passed inline to `new DatabaseManager({...})` must be extracted so the data layer shares it. Replace:

```ts
      databaseManager = new DatabaseManager({
        userDataDir: app.getPath('userData'),
        device: {
          deviceName: os.hostname(),
          platform: process.platform,
          osVersion: os.release(),
          appVersion: app.getVersion(),
        },
        log: {
          info: (message) => logger.info(message),
          warn: (message) => logger.warn(message),
          error: (message, error) => logger.error(message, error),
        },
      });
      databaseManager.initialize();
```

with:

```ts
      const databaseLog = {
        info: (message: string) => logger.info(message),
        warn: (message: string) => logger.warn(message),
        error: (message: string, error?: unknown) => logger.error(message, error),
      };
      databaseManager = new DatabaseManager({
        userDataDir: app.getPath('userData'),
        device: {
          deviceName: os.hostname(),
          platform: process.platform,
          osVersion: os.release(),
          appVersion: app.getVersion(),
        },
        log: databaseLog,
      });
      databaseManager.initialize();
      const dataLayer = createDataLayer(databaseManager, databaseLog);
```

3. Replace `registerIpcHandlers();` with:

```ts
      registerIpcHandlers(dataLayer.services);
```

- [ ] **Step 4: Run the tests and the type gate**

Run: `pnpm exec vitest run apps/desktop/electron/security/validateIpc.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS — this proves the contract entry, exhaustiveness assertion, handler, preload, and main wiring all line up. (No build step is needed: `@nemis-desktop/types` and `@nemis-desktop/shared` export TypeScript source directly via their package `exports`, which both tsc and vitest resolve as-is.)

- [ ] **Step 5: Commit**

```bash
git add packages/types/src apps/desktop/electron/security apps/desktop/electron/ipc apps/desktop/electron/preload apps/desktop/electron/main
git commit -m "feat(ipc): settings:get proof-of-path endpoint through the data layer" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: Documentation + full acceptance gate

**Files:**
- Create: `docs/data-access.md`
- Modify: `docs/database.md` (one-line pointer)

**Interfaces:**
- Consumes: everything above.
- Produces: the phase's documentation and a fully green gate.

- [ ] **Step 1: Write `docs/data-access.md`**

Create `docs/data-access.md` with this content (adjust only if implementation details drifted during execution):

```markdown
# Data Access Layer

Phase 3 architecture reference. Spec: `docs/superpowers/specs/2026-07-16-phase-3-data-access-layer-design.md`.

## Data flow

    Renderer
      ↓ window.nemis.* (preload bridge)
    IPC handler          — validates shape/arity, wraps IpcResult
      ↓
    Application Service  — async facade, cross-repo transactions   (data/services)
      ↓
    Repository Interface — sync contract, what mocks implement     (data/repositories/interfaces)
      ↓
    SQLite Repository    — validate → build SQL → prepare → map    (data/repositories/sqlite)
      ↓
    Database platform    — DatabaseManager.connection/.transactions (electron/database)
      ↓
    SQLite

Repositories are the ONLY database gateway. The renderer never knows where
data comes from; the future sync worker calls the same services.

## Why sync repositories, async services

better-sqlite3 is synchronous and its transactions cannot contain `await` —
an async callback breaks atomicity. Repositories therefore expose synchronous
methods that compose inside `TransactionManager` callbacks with real
SAVEPOINT nesting; services expose Promise-returning methods, putting the
async boundary exactly where the process boundary is (IPC, sync worker).

## Folder map (apps/desktop/electron/data/)

| Folder | Responsibility |
|---|---|
| `repositories/interfaces` | Pure contracts (`IDeviceRepository`, …) — declare only operations that make sense per entity |
| `repositories/base` | `BaseRepository` (shared machinery), `StatementCache`, `RepositoryContext` |
| `repositories/sqlite` | Concrete implementations, one per entity |
| `services` | Async facades; own cross-repository transactions |
| `queries` | Query builders — the only place SQL text is produced |
| `mappers` | Row → model conversion; JSON columns parsed here and only here |
| `models` | Domain models (ISO-string timestamps, IPC-serializable) |
| `dto` | Input shapes + `QueryOptions`/`Page<T>` |
| `validators` | Persistence validation (core rules + per-entity schemas) |
| `factories` | `createDataLayer` — the composition root, called once from main.ts |
| `errors` | `RepositoryError` taxonomy + `translateDatabaseError` |
| `testing` | `createTestContext` — real temp-file DB with migrations applied |

## Strategies

- **Mapping:** raw rows never leave `repositories/sqlite`. Mappers are pure;
  JSON TEXT columns (`app_settings.value`, `sync_queue.payload`,
  `audit_log.details`) are parsed/serialized exactly there.
- **Validation:** persistence-level only, before any SQL; failures throw
  `ValidationError` with per-field issues. No business or UI rules.
- **Transactions:** callback-scoped via `TransactionManager`; nested calls
  become SAVEPOINTs; batch writes use IMMEDIATE mode; rollback is automatic
  on throw. Services orchestrate cross-repo transactions (see
  `AppSettingsService.set`, `SyncQueueService.fail`).
- **Errors:** repositories translate everything into the `RepositoryError`
  taxonomy (`REPO_NOT_FOUND`, `REPO_DUPLICATE`, `REPO_VALIDATION`,
  `REPO_TRANSACTION`, `REPO_QUERY`, `REPO_UNKNOWN`); raw driver errors stay
  on `cause` and never cross IPC.
- **Performance:** every statement is prepared once per repository via
  `StatementCache` (LIMIT/OFFSET are parameterized so SQL text stays stable);
  batch operations run in a single transaction.

## Adding a new entity (extension checklist)

1. Migration for the table (`database/migrations/`), name in `TableNames`.
2. Model in `data/models/`, input DTOs in `data/dto/`.
3. Row interface + mapper in `data/mappers/`.
4. Validators in `data/validators/`.
5. Interface in `repositories/interfaces/` — only the operations the entity
   really supports (e.g. audit log exposes no update/delete).
6. SQLite repository in `repositories/sqlite/` extending `BaseRepository`.
7. Service in `data/services/` if IPC/sync needs it.
8. Wire both in `factories/createDataLayer.ts`.
9. Tests: repository against `createTestContext()`, service against interface
   mocks.
10. IPC (if exposed): `IpcContract` entry + `IpcChannels` constant, shape
    validator in `security/validateIpc.ts`, handler, preload method — the
    exhaustiveness assertion in `packages/types/src/ipc.ts` will not compile
    until the channel is listed.

## Deliberate limits (revisit when needed)

- No JOINs in the query builder — platform tables don't need them.
- No UPSERT in the builder — `setByKey` uses a transactional read-then-write.
- `sync_errors` is owned by `SyncQueueRepository` (queue aggregate).
- SQLCipher not yet enabled — decide before business data lands.
```

Append to `docs/database.md`, at the end of its introduction/overview section:

```markdown
> Phase 3 added the Data Access Layer on top of this platform — see
> `docs/data-access.md`. Application code must go through repositories;
> only the data layer touches `DatabaseManager.connection` directly.
```

- [ ] **Step 2: Run the full acceptance gate**

```bash
pnpm rebuild:node
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

Expected: all PASS. If `format:check` fails, run `pnpm format` and re-check.

- [ ] **Step 3: Production build**

```bash
pnpm rebuild:electron
pnpm make
```

Expected: `pnpm make` completes and produces the Squirrel installer under `apps/desktop/out/`. (Reminder from Phase 2: Forge's native rebuild is skipped by config; the packaged app carries the prebuilt ABI-146 binary via the `packageAfterCopy` hook.)

After `make`, run `pnpm rebuild:node` again if more test runs are planned.

- [ ] **Step 4: Commit**

```bash
git add docs/data-access.md docs/database.md
git commit -m "docs: data access layer architecture, strategies, and extension guide" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Acceptance criteria (from the spec)

- Renderer never accesses SQLite directly; repositories are the only gateway. ✓ by construction (Tasks 6–13, 15)
- BaseRepository reusable (Task 6); QueryBuilder (Tasks 3–4); mappers (Task 5); validators (Tasks 2, 7–11). 
- Transactions: single, nested SAVEPOINT, automatic rollback, batch (Tasks 6, 10, 12 tests).
- All tests pass; TypeScript strict passes; ESLint passes; production build succeeds (Task 16).

## Execution notes

- Tasks 1–5 are independent of the database file and each other except as
  listed in their Interfaces blocks; execute in order anyway — later tasks
  import earlier modules.
- Tasks 7–11 all depend on Task 6; Task 12 depends on 7–11; Task 13 on 12;
  Task 15 on 13 and 14.
- If any test fails against expectations, STOP and debug rather than
  adjusting the assertion — the expected values in this plan were derived
  from the real Phase 2 schema and code.



