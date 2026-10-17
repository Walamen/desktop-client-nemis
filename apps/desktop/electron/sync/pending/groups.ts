import { humanizeEntityType } from '@nemis-desktop/shared';
import type { PendingGroupSummary, PendingItemState, PendingSource } from '@nemis-desktop/types';

export const PENDING_SOURCES: readonly PendingSource[] = ['outbox', 'assignments', 'grade_completions', 'fee_reversals', 'school_registrations'];

const LABELS: Readonly<Record<string, string>> = {
  'outbox:academic_years': 'Academic years',
  'outbox:terms': 'Terms',
  'outbox:classes': 'Classes',
  'outbox:subjects': 'Subjects',
  'outbox:class_subjects': 'Class subjects',
  'outbox:students': 'Students',
  'outbox:guardians': 'Guardians',
  'outbox:student_guardians': 'Guardian links',
  'outbox:enrollments': 'Enrollments',
  'outbox:attendance': 'Attendance',
  'outbox:staff': 'Staff',
  'outbox:subject_teachers': 'Subject teachers',
  'outbox:class_teachers': 'Class teachers',
  'outbox:class_subject_teachers': 'Class subject teachers',
  'outbox:timetable_entries': 'Timetable',
  'outbox:assessment_templates': 'Assessment templates',
  'outbox:assessments': 'Assessments',
  'outbox:grades': 'Grades',
  'outbox:grading_periods': 'Grading periods',
  'outbox:grade_entry_windows': 'Grade entry windows',
  'outbox:fee_rules': 'Fee rules',
  'outbox:fee_obligations': 'Fee obligations',
  'outbox:fee_payments': 'Fee payments',
  'assignments:assignments': 'Assignments',
  'assignments:assignment_submissions': 'Assignment grades',
  'grade_completions:grade_completions': 'End-of-year outcomes',
  'fee_reversals:fee_payment_reversals': 'Payment reversals',
  'school_registrations:school_registrations': 'New schools',
};

export function groupKeyOf(source: PendingSource, entityType: string): string {
  return `${source}:${entityType}`;
}

export function groupLabelOf(source: PendingSource, entityType: string): string {
  return LABELS[groupKeyOf(source, entityType)] ?? humanizeEntityType(entityType);
}

export function parseGroupKey(groupKey: string): { source: PendingSource; entityType: string } | null {
  const at = groupKey.indexOf(':');
  if (at <= 0) return null;
  const source = groupKey.slice(0, at) as PendingSource;
  const entityType = groupKey.slice(at + 1);
  return PENDING_SOURCES.includes(source) && entityType ? { source, entityType } : null;
}

export function buildGroup(
  source: PendingSource,
  entityType: string,
  byState: Partial<Record<PendingItemState, number>>,
  oldestAt: string,
): PendingGroupSummary {
  const full: Record<PendingItemState, number> = {
    sending: byState.sending ?? 0,
    waiting: byState.waiting ?? 0,
    retrying: byState.retrying ?? 0,
    held: byState.held ?? 0,
  };
  return {
    groupKey: groupKeyOf(source, entityType),
    source,
    label: groupLabelOf(source, entityType),
    total: full.sending + full.waiting + full.retrying + full.held,
    byState: full,
    oldestAt,
  };
}
