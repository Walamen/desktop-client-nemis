import { describe, expect, it } from 'vitest';
import { hasRealDisagreement, unwrapLocalPayload, valuesEqual } from './index';

describe('unwrapLocalPayload', () => {
  it('unwraps a create envelope to its record', () => {
    expect(unwrapLocalPayload({ record: { id: 's1', firstName: 'Ada' } })).toEqual({
      edited: { id: 's1', firstName: 'Ada' },
      original: null,
    });
  });

  it('unwraps an update envelope to its record and base', () => {
    expect(unwrapLocalPayload({ base: { firstName: 'Ada' }, record: { firstName: 'Grace' } })).toEqual({
      edited: { firstName: 'Grace' },
      original: { firstName: 'Ada' },
    });
  });

  it('unwraps a delete envelope (no record) to just its base', () => {
    expect(unwrapLocalPayload({ base: { firstName: 'Ada' } })).toEqual({
      edited: null,
      original: { firstName: 'Ada' },
    });
  });

  it('treats a bare (non-enveloped) payload as the edited value itself', () => {
    expect(unwrapLocalPayload({ firstName: 'Ada' })).toEqual({ edited: { firstName: 'Ada' }, original: null });
  });
});

describe('valuesEqual', () => {
  it('treats empty string and null as equal', () => {
    expect(valuesEqual('', null)).toBe(true);
  });

  it('treats a date-only string and its ISO datetime form as equal', () => {
    expect(valuesEqual('2026-08-17', '2026-08-17T00:00:00.000Z')).toBe(true);
  });

  it("treats SQLite's 0/1 and real booleans as equal", () => {
    expect(valuesEqual(1, true)).toBe(true);
    expect(valuesEqual(0, false)).toBe(true);
  });

  it('does not treat other numbers as boolean-equivalent', () => {
    expect(valuesEqual(2, true)).toBe(false);
  });

  it('reports genuinely different values as unequal', () => {
    expect(valuesEqual('Ada', 'Grace')).toBe(false);
  });

  it('treats JSON text and the list or object it encodes as equal (SQLite text vs server JSON)', () => {
    expect(valuesEqual('["TEACHER"]', ['TEACHER'])).toBe(true);
    expect(valuesEqual(['TEACHER'], '["TEACHER"]')).toBe(true);
    expect(valuesEqual('{"a":1}', { a: 1 })).toBe(true);
  });

  it('still reports different lists as unequal when one side is JSON text', () => {
    expect(valuesEqual('["A"]', ['B'])).toBe(false);
  });

  it('ignores object key order (Postgres jsonb reorders keys), at any depth', () => {
    expect(valuesEqual('{"b":1,"a":2}', { a: 2, b: 1 })).toBe(true);
    expect(valuesEqual({ a: 2, b: 1 }, '{"b":1,"a":2}')).toBe(true);
    expect(valuesEqual({ b: 1, a: 2 }, { a: 2, b: 1 })).toBe(true);
    expect(valuesEqual('[{"max":100,"grade":"A"}]', [{ grade: 'A', max: 100 }])).toBe(true);
    expect(valuesEqual('{"b":1,"a":2}', { a: 2, b: 3 })).toBe(false);
    expect(valuesEqual('{"a":1}', { a: 1, b: 2 })).toBe(false);
  });

  it('keeps list order significant', () => {
    expect(valuesEqual('["A","B"]', ['B', 'A'])).toBe(false);
    expect(valuesEqual(['A', 'B'], ['B', 'A'])).toBe(false);
  });

  it('falls back to the existing rules when the text is not JSON', () => {
    expect(valuesEqual('[TEACHER', ['TEACHER'])).toBe(false);
  });
});

describe('hasRealDisagreement', () => {
  it('returns false when the only differences are sync metadata and server-assigned fields (a create-offline-then-sync false positive)', () => {
    const local = { id: 's1', firstName: 'Ada', lastName: 'Learner', nemisId: '123456789015', status: null };
    const remote = {
      id: 's1',
      firstName: 'Ada',
      lastName: 'Learner',
      nemisId: '123456789015',
      status: 'ACTIVE',
      createdAt: '2026-08-17T09:00:00.000Z',
      updatedAt: '2026-08-17T09:00:00.000Z',
      version: 1,
    };
    expect(hasRealDisagreement(local, remote)).toBe(false);
  });

  it('returns true when a real field genuinely disagrees', () => {
    const local = { id: 's1', firstName: 'Ada', lastName: 'Learner' };
    const remote = { id: 's1', firstName: 'Adaeze', lastName: 'Learner' };
    expect(hasRealDisagreement(local, remote)).toBe(true);
  });

  it('returns false for a grade window that differs only in how allowedRoles is represented', () => {
    const local = { id: 'w1', name: 'Term 1', status: 'OPEN', allowedRoles: '["TEACHER"]' };
    const remote = {
      id: 'w1',
      name: 'Term 1',
      status: 'OPEN',
      allowedRoles: ['TEACHER'],
      updatedAt: '2026-11-05T10:00:00.000Z',
    };
    expect(hasRealDisagreement(local, remote)).toBe(false);
  });

  it('returns null (cannot tell) when either side is not a plain record', () => {
    expect(hasRealDisagreement(null, { id: 's1' })).toBeNull();
    expect(hasRealDisagreement({ id: 's1' }, null)).toBeNull();
  });
});
