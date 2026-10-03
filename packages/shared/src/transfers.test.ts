import { describe, expect, it } from 'vitest';
import { isLapsed } from './transfers';

const NOW = Date.parse('2026-10-03T12:00:00.000Z');
const base = { status: 'PENDING', initiatedBy: 'RECEIVING_SCHOOL', lapsesAt: '2026-10-03T11:59:59.999Z' };

describe('isLapsed', () => {
  it('is lapsed past the deadline', () => {
    expect(isLapsed(base, NOW)).toBe(true);
  });
  it('is not lapsed exactly at the deadline', () => {
    expect(isLapsed({ ...base, lapsesAt: '2026-10-03T12:00:00.000Z' }, NOW)).toBe(false);
  });
  it('is not lapsed for origin-initiated', () => {
    expect(isLapsed({ ...base, initiatedBy: 'ORIGIN_SCHOOL' }, NOW)).toBe(false);
    expect(isLapsed({ ...base, initiatedBy: null }, NOW)).toBe(false);
  });
  it('is not lapsed without lapsesAt', () => {
    expect(isLapsed({ ...base, lapsesAt: null }, NOW)).toBe(false);
  });
  it('is not lapsed once decided', () => {
    for (const status of ['APPROVED', 'REJECTED', 'CANCELLED']) {
      expect(isLapsed({ ...base, status }, NOW)).toBe(false);
    }
  });
  it('is not lapsed for an unparseable date', () => {
    expect(isLapsed({ ...base, lapsesAt: 'not-a-date' }, NOW)).toBe(false);
  });
});
