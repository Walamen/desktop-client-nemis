import type { SchoolPerformanceStatus } from '@nemis-desktop/types';

/** Students & Enrollment attendance colour: 90 and up green, 75 and up
 * orange, below red; no data grey. portal-web lib/deo-dashboard.ts keeps the
 * same rules. */
export function attendanceColor(rate: number | null): string {
  if (rate === null) return 'text-gray-400';
  if (rate >= 90) return 'text-green-600';
  if (rate >= 75) return 'text-orange-600';
  return 'text-red-600';
}

/** The Level chip: purple for a primary-only school, indigo otherwise. */
export function levelChipClass(label: string): string {
  return label === 'Primary' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700';
}

const PERFORMANCE_CHIP: Record<SchoolPerformanceStatus, string> = {
  Good: 'bg-green-100 text-green-700',
  Warning: 'bg-amber-100 text-amber-700',
  Critical: 'bg-red-100 text-red-700',
  'No Data': 'bg-gray-100 text-gray-600',
};

export function performanceChipClass(status: SchoolPerformanceStatus): string {
  return PERFORMANCE_CHIP[status];
}

/** Dropout alert count: pupils actually below 80% attendance. */
export function atRiskLabel(count: number): string {
  if (count === 0) return 'No pupil below 80%';
  return `${count} ${count === 1 ? 'pupil' : 'pupils'} at risk`;
}
