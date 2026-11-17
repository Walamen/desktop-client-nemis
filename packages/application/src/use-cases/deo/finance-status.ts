/** District finance rules (docs/superpowers/specs/2026-11-17-deo-finance-design.md).
 * The server keeps the same rules in Nemis
 * apps/Server/src/common/district/finance-status.ts; the web's Flagged tab
 * uses the flag rule in portal-web lib/deo-finance.ts. */

export type FinanceStatus = 'On Track' | 'At Risk' | 'Behind' | 'No Data';

/** At or above this collection rate (%) a school is On Track. */
export const FINANCE_ON_TRACK_RATE = 80;
/** At or above this rate (%) and below On Track, a school is At Risk. */
export const FINANCE_AT_RISK_RATE = 50;
/** Below this rate (%), with money still owed, a school is flagged. */
export const FINANCE_FLAG_RATE = 30;

export function financeRate(collected: number, allocation: number): number {
  return allocation > 0 ? Math.round((collected / allocation) * 100) : 0;
}

export function financeOutstanding(allocation: number, collected: number): number {
  return Math.max(allocation - collected, 0);
}

export function financeStatus(allocation: number, rate: number): FinanceStatus {
  if (allocation === 0) return 'No Data';
  if (rate >= FINANCE_ON_TRACK_RATE) return 'On Track';
  if (rate >= FINANCE_AT_RISK_RATE) return 'At Risk';
  return 'Behind';
}

/** Flagged Activity lists a school that billed or collected anything. */
export function isFinanceListed(allocation: number, collected: number): boolean {
  return allocation > 0 || collected > 0;
}

export function isFinanceFlagged(rate: number, outstanding: number): boolean {
  return rate < FINANCE_FLAG_RATE && outstanding > 0;
}
