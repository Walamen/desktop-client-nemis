import { sharedBridge } from '@/services/nemis-bridge/shared';
import type { SchoolAdminRecord } from '@nemis-desktop/types';

export interface GradeScaleItem {
  letter: string;
  description: string;
  min: number;
  max: number;
  gradePoint: number;
}

export function parseGradeScale(value: SchoolAdminRecord[string] | undefined): GradeScaleItem[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as GradeScaleItem[]) : [];
  } catch {
    return [];
  }
}

export function stringifyGradeScale(scale: GradeScaleItem[]): string {
  return JSON.stringify(scale);
}

/** Mirrors portal-web's academic-grading/windows STATUS_CHIP / STATUS_RAIL —
 * same shared design tokens (active/pending/secondary) exist in desktop's
 * Tailwind config. */
export const WINDOW_STATUS_CHIP: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  OPEN: 'bg-active/10 text-active',
  CLOSED: 'bg-pending/10 text-pending',
  PUBLISHED: 'bg-secondary-50 text-secondary-700',
};

export const WINDOW_STATUS_RAIL: Record<string, string> = {
  DRAFT: 'border-l-slate-300',
  OPEN: 'border-l-active',
  CLOSED: 'border-l-pending',
  PUBLISHED: 'border-l-secondary',
};

/** Mirrors portal-web's windows/[id]/grades STATUS_STYLE. */
export const GRADE_STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-pending/10 text-pending',
  APPROVED: 'bg-active/10 text-active',
  PUBLISHED: 'bg-secondary-50 text-secondary-700',
  LOCKED: 'bg-slate-200 text-slate-700',
};

export const PERIOD_STATUS_BADGE: Record<string, string> = {
  Active: 'bg-green-100 text-green-700',
  Completed: 'bg-gray-100 text-gray-700',
  Upcoming: 'bg-blue-100 text-blue-700',
};

export function periodStatus(startDate: string, endDate: string): 'Active' | 'Completed' | 'Upcoming' {
  const now = Date.now();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isFinite(start) && now < start) return 'Upcoming';
  if (Number.isFinite(end) && now > end) return 'Completed';
  return 'Active';
}

export function formatDateShort(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function pctTone(pct: SchoolAdminRecord[string] | undefined): string {
  const value = typeof pct === 'number' ? pct : null;
  if (value === null) return 'text-slate-400';
  if (value >= 70) return 'text-active font-semibold';
  if (value >= 50) return 'text-pending font-semibold';
  return 'text-error font-semibold';
}

/** The generic offline collection API has no server-side filter beyond
 * collection + pagination, so lookups that need to scope by a foreign key
 * (term, grading period) page through the capped result set and filter
 * client-side — the same approach already used for "unassigned students" in
 * classes/shared.tsx and for fee obligations in SchoolAdminModulePages.tsx. */
export async function listPeriodsForTerm(termId: string): Promise<SchoolAdminRecord[]> {
  const result = await sharedBridge.listSchoolAdminRecords({ collection: 'grading_periods', limit: 250 });
  return result.items.filter((item) => item.termId === termId);
}

export async function listAllWindows(): Promise<SchoolAdminRecord[]> {
  const result = await sharedBridge.listSchoolAdminRecords({ collection: 'grade_entry_windows', limit: 250 });
  return result.items;
}

export async function listGradesForPeriod(gradingPeriodId: string): Promise<SchoolAdminRecord[]> {
  const result = await sharedBridge.listSchoolAdminRecords({ collection: 'grades', limit: 250 });
  return result.items.filter((item) => item.gradingPeriodId === gradingPeriodId);
}

export async function getGradingConfig(): Promise<SchoolAdminRecord | null> {
  const result = await sharedBridge.listSchoolAdminRecords({ collection: 'institution_grading_configs', limit: 1 });
  return result.items[0] ?? null;
}
