/** County Finance display rules, shared by the rate text, bars and badges.
 * Kept identical to portal-web's county/finance/finance-display.ts.
 * One rule everywhere: 70+ on track, 40–69 at risk, below 40 below target. */
export type RateStatus = 'below' | 'on-track' | 'at-risk';

export function rateStatus(rate: number): RateStatus {
  if (rate >= 70) return 'on-track';
  if (rate >= 40) return 'at-risk';
  return 'below';
}

export function rateColor(rate: number): 'text-active' | 'text-pending' | 'text-error' {
  const status = rateStatus(rate);
  return status === 'on-track' ? 'text-active' : status === 'at-risk' ? 'text-pending' : 'text-error';
}

export function rateBarColor(rate: number): 'bg-active' | 'bg-pending' | 'bg-error' {
  const status = rateStatus(rate);
  return status === 'on-track' ? 'bg-active' : status === 'at-risk' ? 'bg-pending' : 'bg-error';
}

/** The figures cover each school's current academic year; one shared name
 * shows as is, otherwise a generic label. */
export function academicYearLabel(name: string | null): string {
  return name ?? 'Current academic year';
}

/** District filter options from the always-loaded dashboard. */
export function districtOptions(rows: { districtId: string; districtName: string }[]): [string, string][] {
  return Array.from(new Map(rows.map((r) => [r.districtId, r.districtName])).entries()).sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
}

export const OWNERSHIP_LABELS: Record<string, string> = {
  GOVERNMENT: 'Government',
  PRIVATE: 'Private',
  NGO: 'NGO',
  COMMUNITY: 'Community',
  MISSION: 'Mission',
};

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  MOBILE_MONEY: 'Mobile Money',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

export const LEVEL_LABELS: Record<string, string> = {
  KG: 'KG',
  K1: 'K1',
  K2: 'K2',
  GRADE_1: 'G1',
  GRADE_2: 'G2',
  GRADE_3: 'G3',
  GRADE_4: 'G4',
  GRADE_5: 'G5',
  GRADE_6: 'G6',
  GRADE_7: 'G7',
  GRADE_8: 'G8',
  GRADE_9: 'G9',
  GRADE_10: 'G10',
  GRADE_11: 'G11',
  GRADE_12: 'G12',
};

/** portal-web's formatDate (@nemis/utils): "March 5, 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
