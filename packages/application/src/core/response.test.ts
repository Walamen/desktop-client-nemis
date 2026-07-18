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
