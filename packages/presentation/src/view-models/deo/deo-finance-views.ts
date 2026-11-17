import type { DeoFinanceStatus } from '@nemis-desktop/types';

/** DEO Finance display helpers; the web keeps the same in portal-web lib/deo-finance.ts. */

export const FINANCE_FILTERS = ['ALL', 'On Track', 'At Risk', 'Behind', 'No Data'] as const;
export type FinanceFilter = (typeof FINANCE_FILTERS)[number];

const ON_TRACK_RATE = 80;
const FLAG_RATE = 30;

export function financeStatusCounts(schools: readonly { status: DeoFinanceStatus }[]): Record<FinanceFilter, number> {
  const counts: Record<FinanceFilter, number> = { ALL: schools.length, 'On Track': 0, 'At Risk': 0, Behind: 0, 'No Data': 0 };
  for (const school of schools) counts[school.status] += 1;
  return counts;
}

export function filterFinanceSchools<T extends { status: DeoFinanceStatus }>(schools: readonly T[], filter: FinanceFilter): T[] {
  return filter === 'ALL' ? [...schools] : schools.filter((school) => school.status === filter);
}

/** The Flagged-tab rate bar: On Track green, flagged red, amber between. */
export function flaggedRateBarClass(rate: number): 'bg-active' | 'bg-pending' | 'bg-error' {
  if (rate >= ON_TRACK_RATE) return 'bg-active';
  if (rate >= FLAG_RATE) return 'bg-pending';
  return 'bg-error';
}

const lrd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'LRD', maximumFractionDigits: 0 });
const compactLrd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'LRD',
  notation: 'compact',
  maximumFractionDigits: 0,
});

export function formatLrd(value: number): string {
  return lrd.format(value);
}

export function formatCompactLrd(value: number): string {
  return compactLrd.format(value);
}

export function lastPaymentLabel(iso: string | null): string {
  if (!iso) return 'No payment yet';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

export function formatAuditTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function auditEntityLabel(entityType: string, entityId: string | null): string {
  return entityId ? `${entityType} #${entityId.slice(0, 8)}` : entityType;
}
