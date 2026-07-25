/** Canonical platform table names — single source of truth for services/tests. */
export const TableNames = {
  schemaMigrations: 'schema_migrations',
  devices: 'devices',
  appSettings: 'app_settings',
  syncMetadata: 'sync_metadata',
  syncQueue: 'sync_queue',
  syncErrors: 'sync_errors',
  auditLog: 'audit_log',
  // Business tables (Phase 8). Created empty; populated by sync/import in later phases.
  institutions: 'institutions',
  users: 'users',
  userOrganizations: 'user_organizations',
  academicYears: 'academic_years',
  classes: 'classes',
  students: 'students',
  attendance: 'attendance',
  // Academic Foundation (Phase 9).
  terms: 'terms',
  subjects: 'subjects',
  classSubjects: 'class_subjects',
  // Student Management (Phase 10).
  guardians: 'guardians',
  studentGuardians: 'student_guardians',
  enrollments: 'enrollments',
  // Teacher Management (Phase 11).
  staff: 'staff',
  subjectTeachers: 'subject_teachers',
  classTeachers: 'class_teachers',
  classSubjectTeachers: 'class_subject_teachers',
  provisioningMetadata: 'provisioning_metadata',
} as const;

export type TableName = (typeof TableNames)[keyof typeof TableNames];
