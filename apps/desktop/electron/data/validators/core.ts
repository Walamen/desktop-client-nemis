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
    isAbsent(value) ||
    (typeof value === 'string' &&
      !Number.isNaN(Date.parse(value)) &&
      value === new Date(value).toISOString())
      ? null
      : { field, message: 'must be an ISO-8601 UTC date string' };
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
