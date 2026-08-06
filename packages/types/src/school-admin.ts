export const SCHOOL_ADMIN_COLLECTIONS = [
  'institutions',
  'students',
  'staff',
  'staff_directory',
  'institution_admin',
  'assessment_templates',
  'assessments',
  'classes',
  'subjects',
  'timetable_entries',
  'guardians',
  'student_guardians',
  'student_transfers',
  'institution_grading_configs',
  'grading_periods',
  'grade_entry_windows',
  'grade_entry_window_classes',
  'grades',
  'fee_rules',
  'fee_obligations',
  'fee_payments',
  'announcements',
  'conversations',
  'messages',
  'user_notifications',
  'reports',
  'alerts',
  'class_resources',
] as const;
// NOTE: 'assignments' / 'assignment_submissions' intentionally NOT here —
// they moved to a dedicated typed vertical (assignment:* IPC channels,
// packages/types/src/assignments.ts) instead of the generic passthrough.

export type SchoolAdminCollection = (typeof SCHOOL_ADMIN_COLLECTIONS)[number];
export type SchoolAdminRecord = Record<string, string | number | boolean | null>;

export interface SchoolAdminListRequest {
  collection: SchoolAdminCollection;
  limit?: number;
  offset?: number;
}

export interface SchoolAdminListResult {
  items: SchoolAdminRecord[];
  total: number;
}

export interface SchoolAdminSaveRequest {
  collection: SchoolAdminCollection;
  record: SchoolAdminRecord;
}

export interface SchoolAdminDeleteRequest {
  collection: SchoolAdminCollection;
  id: string;
}
