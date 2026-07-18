import { ApplicationValidationException, type ValidationIssue } from '../exceptions';

/** Throws if any listed field is missing, null, or a blank string. */
export function requireFields<T>(input: T, fields: readonly (keyof T & string)[]): void {
  const record = input as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  for (const field of fields) {
    const value = record[field];
    const blank =
      value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);
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
