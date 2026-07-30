import type { ApplicationLayer, TeacherApplicationService } from '@nemis-desktop/application';
import { group } from './core';
import { sharedIpc } from './shared';
import { schoolAdminIpc } from './school-admin';
import { teacherIpc, teacherAssessments } from './teacher';
import './county';
import './deo';
import './ministry-portal';

/** The renderer's ApplicationLayer-shaped facade over the validated IPC
 * bridge, composed from per-portal files (the same split as
 * services/nemis-bridge/ and lib/presentation/hooks/):
 *   lib/ipc/shared.ts       — identity, infra, attendance
 *   lib/ipc/school-admin.ts — reporting, institution, academics, students,
 *                             timetables, staff-directory (teachers, minus dashboard)
 *   lib/ipc/teacher.ts      — teachers.dashboard, assessments (stub)
 *   lib/ipc/county.ts, deo.ts, ministry-portal.ts — placeholders, no
 *                             ApplicationLayer keys of their own yet
 * The `teachers` service is the one key genuinely owned by two portals: its
 * admin methods (school-admin.ts) and its `dashboard` method (teacher.ts) are
 * merged into a single group here, since ApplicationLayer only has one
 * `teachers` slot. Later modules continue to fail explicitly
 * (NotImplementedPresentationError) until their own IPC endpoints exist. */
export function createIpcApplicationLayer(): ApplicationLayer {
  const facade = {
    ...sharedIpc,
    reporting: schoolAdminIpc.reporting,
    institution: schoolAdminIpc.institution,
    academics: schoolAdminIpc.academics,
    students: schoolAdminIpc.students,
    timetables: schoolAdminIpc.timetables,
    teachers: group<TeacherApplicationService>('teachers', {
      ...schoolAdminIpc.teachersAdmin,
      ...teacherIpc,
    }),
    assessments: group('assessments', teacherAssessments),
  };
  // Private class fields prevent structural typing; this cast is intentional.
  return facade as unknown as ApplicationLayer;
}
