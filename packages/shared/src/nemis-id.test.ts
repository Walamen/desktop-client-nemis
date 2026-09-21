import { describe, expect, it } from 'vitest';
import {
  generateNemisId,
  isValidNemisId,
  normalizeNemisId,
  formatNemisId,
  luhnCheckDigit,
} from './nemis-id';
import {
  VALID_NEMIS_IDS,
  INVALID_NEMIS_IDS,
  NORMALIZE_CASES,
  FORMAT_CASES,
} from './nemis-id.fixtures';

describe('nemis-id', () => {
  it.each([...VALID_NEMIS_IDS])('accepts valid id %s', (id) => {
    expect(isValidNemisId(id)).toBe(true);
  });

  it.each([...INVALID_NEMIS_IDS])('rejects invalid id %p', (id) => {
    expect(isValidNemisId(id)).toBe(false);
  });

  it('computes the documented check digit', () => {
    expect(luhnCheckDigit('48291573604')).toBe(5);
    expect(luhnCheckDigit('00000000000')).toBe(0);
    expect(luhnCheckDigit('99999999999')).toBe(1);
  });

  it.each([...NORMALIZE_CASES])('normalizes %p to canonical form', (raw) => {
    expect(normalizeNemisId(raw)).toBe('482915736045');
  });

  it('returns null when normalizing something invalid', () => {
    expect(normalizeNemisId('4829-1573-6042')).toBeNull();
  });

  it.each([...FORMAT_CASES])('formats $raw as $formatted', ({ raw, formatted }) => {
    expect(formatNemisId(raw)).toBe(formatted);
  });

  it('generates 10k unique, valid ids', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const id = generateNemisId();
      expect(isValidNemisId(id)).toBe(true);
      seen.add(id);
    }
    expect(seen.size).toBe(10_000);
  });
});
