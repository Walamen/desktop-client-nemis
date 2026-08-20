import type { GradeLevel, SystemRole } from '@nemis-desktop/types';

export function formatFullName(firstName: string, lastName: string, middleName?: string): string {
  return [firstName, middleName, lastName].filter(Boolean).join(' ');
}

/** 'UNDER_REVIEW' → 'Under review'. */
export function humanizeEnum(value: string): string {
  const words = value.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Friendly job-title overrides for roles where the humanized enum reads as
 * jargon to end users. Roles not listed here fall back to humanizeEnum. */
const ROLE_LABEL_OVERRIDES: Partial<Record<SystemRole, string>> = {
  INSTITUTION_ADMIN: 'Principal',
};

/** SystemRole → display label, e.g. 'INSTITUTION_ADMIN' → 'Principal',
 * 'DEO' → 'Deo' (via humanizeEnum fallback). */
export function humanizeRole(role: SystemRole): string {
  return ROLE_LABEL_OVERRIDES[role] ?? humanizeEnum(role);
}

export function formatGradeLevel(gradeLevel?: GradeLevel): string {
  if (!gradeLevel) return '—';
  return gradeLevel.startsWith('GRADE_')
    ? `Grade ${gradeLevel.slice('GRADE_'.length)}`
    : gradeLevel;
}
