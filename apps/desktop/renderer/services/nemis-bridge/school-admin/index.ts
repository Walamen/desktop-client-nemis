export * from './institution-bridge';
export * from './reporting-bridge';
export * from './academic-year-bridge';
export * from './term-bridge';
export * from './class-bridge';
export * from './subject-bridge';
export * from './student-bridge';
export * from './teacher-directory-bridge';
export * from './timetable-bridge';

import { institutionBridge } from './institution-bridge';
import { reportingBridge } from './reporting-bridge';
import { academicYearBridge } from './academic-year-bridge';
import { termBridge } from './term-bridge';
import { classBridge } from './class-bridge';
import { subjectBridge } from './subject-bridge';
import { studentBridge } from './student-bridge';
import { teacherDirectoryBridge } from './teacher-directory-bridge';
import { timetableBridge } from './timetable-bridge';

/** Everything the Institution Admin (school admin) portal owns: school
 * profile, academic foundation (years/terms/classes/subjects), students,
 * staff directory, and timetable authoring. Add new admin endpoints as a new
 * file here, then spread it into schoolAdminBridge below. */
export const schoolAdminBridge = {
  ...institutionBridge,
  ...reportingBridge,
  ...academicYearBridge,
  ...termBridge,
  ...classBridge,
  ...subjectBridge,
  ...studentBridge,
  ...teacherDirectoryBridge,
  ...timetableBridge,
};
