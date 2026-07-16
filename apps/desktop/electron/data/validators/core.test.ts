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

  it('isIsoDate rejects strict-ISO-but-non-UTC and non-ISO date formats', () => {
    expect(isIsoDate()('7/16/2026', 'f')).not.toBeNull();
    expect(isIsoDate()('July 16 2026', 'f')).not.toBeNull();
    expect(isIsoDate()('2026-07-16T10:00:00.000Z', 'f')).toBeNull();
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
