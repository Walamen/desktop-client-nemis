import type { Migration } from './types';
import { createPlatformTables } from './001-create-platform-tables';
import { createBusinessTables } from './002-create-business-tables';
import { createAcademicFoundationTables } from './003-create-academic-foundation-tables';
import { createStudentManagementTables } from './004-create-student-management-tables';
import { createTeacherManagementTables } from './005-create-teacher-management-tables';
import { createProvisioningMetadata } from './006-create-provisioning-metadata';
import { createTimetableManagementTables } from './007-create-timetable-management-tables';
import { removeLegacyLocalUser } from './008-remove-legacy-local-user';
import { addProvisioningScope } from './009-add-provisioning-scope';
import { createSyncOutbox } from './010-create-sync-outbox';
import { createSchoolAdminModules } from './011-create-school-admin-modules';
import { createTeacherLearningTables } from './012-create-teacher-learning-tables';

/**
 * Every migration, ascending by version. Append only — never edit or reorder
 * a shipped migration; MigrationService rejects drift at startup.
 */
export const migrations: readonly Migration[] = [
  createPlatformTables,
  createBusinessTables,
  createAcademicFoundationTables,
  createStudentManagementTables,
  createTeacherManagementTables,
  createProvisioningMetadata,
  createTimetableManagementTables,
  removeLegacyLocalUser,
  addProvisioningScope,
  createSyncOutbox,
  createSchoolAdminModules,
  createTeacherLearningTables,
];
