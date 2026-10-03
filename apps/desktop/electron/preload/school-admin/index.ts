export * from './dashboard-api';
export * from './school-api';
export * from './academic-year-api';
export * from './term-api';
export * from './classes-api';
export * from './subject-api';
export * from './student-api';
export * from './teacher-directory-api';
export * from './timetable-api';
export * from './registry-api';
export * from './transfer-api';
export * from './grade-completion-api';

import { dashboardApi } from './dashboard-api';
import { schoolApi } from './school-api';
import { academicYearApi } from './academic-year-api';
import { termApi } from './term-api';
import { classesApi } from './classes-api';
import { subjectApi } from './subject-api';
import { studentApi } from './student-api';
import { timetableApi } from './timetable-api';
import { registryApi } from './registry-api';
import { transferApi } from './transfer-api';
import { gradeCompletionApi } from './grade-completion-api';

/** The NemisApi slice the Institution Admin (school admin) portal owns.
 * `teacherDirectoryApi` (staff-directory management, exported above) is
 * merged into the shared `teacher` key by preload.ts, alongside the
 * teacher-owned dashboard method from electron/preload/teacher/. */
export const schoolAdminApi = {
  dashboard: dashboardApi,
  school: schoolApi,
  academicYear: academicYearApi,
  term: termApi,
  classes: classesApi,
  subject: subjectApi,
  student: studentApi,
  timetable: timetableApi,
  registry: registryApi,
  transfer: transferApi,
  gradeCompletion: gradeCompletionApi,
};
