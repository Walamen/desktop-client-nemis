import { describe, expect, it } from 'vitest';
import {
  financeStatus,
  isFinanceFlagged,
  isFinanceListed,
  financeOutstanding,
  financeRate,
} from './finance-status';

// The server keeps the same table (Nemis
// apps/Server/src/common/district/finance-status.spec.ts).
describe('district finance status', () => {
  it.each([
    [0, 0, 'No Data'],
    [100, 80, 'On Track'],
    [100, 100, 'On Track'],
    [100, 79, 'At Risk'],
    [100, 50, 'At Risk'],
    [100, 49, 'Behind'],
    [100, 0, 'Behind'],
  ])('allocation %p at rate %p is %p', (allocation, rate, status) => {
    expect(financeStatus(allocation, rate)).toBe(status);
  });

  it.each([
    [100, 29, 71, true],
    [100, 30, 70, false],
    [100, 0, 100, true],
    [100, 20, 0, false],
  ])('allocation %p, rate %p, outstanding %p flagged %p', (allocation, rate, outstanding, flagged) => {
    expect(isFinanceFlagged(rate, outstanding)).toBe(flagged);
    expect(isFinanceListed(allocation, 0)).toBe(true);
  });

  it('lists a school that billed or collected anything', () => {
    expect(isFinanceListed(0, 0)).toBe(false);
    expect(isFinanceListed(0, 10)).toBe(true);
    expect(isFinanceListed(10, 0)).toBe(true);
  });

  it('never lets outstanding go negative, and rounds the rate', () => {
    expect(financeOutstanding(100, 150)).toBe(0);
    expect(financeOutstanding(100, 40)).toBe(60);
    expect(financeRate(2, 3)).toBe(67);
    expect(financeRate(5, 0)).toBe(0);
  });
});
