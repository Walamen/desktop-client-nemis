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
