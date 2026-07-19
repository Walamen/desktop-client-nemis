import type { GradeLevel } from '@nemis-desktop/types';

export function formatFullName(firstName: string, lastName: string, middleName?: string): string {
  return [firstName, middleName, lastName].filter(Boolean).join(' ');
}

/** 'UNDER_REVIEW' → 'Under review'. */
export function humanizeEnum(value: string): string {
  const words = value.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatGradeLevel(gradeLevel?: GradeLevel): string {
  if (!gradeLevel) return '—';
  return gradeLevel.startsWith('GRADE_')
    ? `Grade ${gradeLevel.slice('GRADE_'.length)}`
    : gradeLevel;
}
