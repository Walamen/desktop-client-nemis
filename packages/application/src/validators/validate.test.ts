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
