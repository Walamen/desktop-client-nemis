import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import type { StudentSyncStatusService } from '@app/data/services/StudentSyncStatusService';
import {
  assertSingleIdArg,
  assertListStudentsArgs,
  assertCreateStudentArgs,
  assertCreateAndEnrollStudentArgs,
  assertUpdateStudentArgs,
  assertSetStudentActiveArgs,
  assertCreateGuardianArgs,
  assertEnrollStudentArgs,
  assertMoveEnrollmentClassArgs,
  assertNoArgs,
} from '@app/security/validateIpc';
export function registerStudentHandlers(
  handle: IpcHandle,
  app: ApplicationLayer,
  syncStatus: StudentSyncStatusService,
): void {
  handle(
    IpcChannels.STUDENT_LIST,
    assertListStudentsArgs,
    async (r) => (await app.students.list(r)).data,
  );
  handle(
    IpcChannels.STUDENT_GET,
    assertSingleIdArg,
    async (id) => (await app.students.getById({ studentId: id })).data,
  );
  handle(
    IpcChannels.STUDENT_CREATE,
    assertCreateStudentArgs,
    async (r) => (await app.students.create(r)).data,
  );
  handle(
    IpcChannels.STUDENT_CREATE_AND_ENROLL,
    assertCreateAndEnrollStudentArgs,
    async (r) => (await app.students.createAndEnroll(r)).data,
  );
  handle(
    IpcChannels.STUDENT_UPDATE,
    assertUpdateStudentArgs,
    async (r) => (await app.students.update(r)).data,
  );
  handle(
    IpcChannels.STUDENT_SET_ACTIVE,
    assertSetStudentActiveArgs,
    async (r) => (await app.students.setActive(r)).data,
  );
  handle(
    IpcChannels.STUDENT_CREATE_GUARDIAN,
    assertCreateGuardianArgs,
    async (r) => (await app.students.createGuardian(r)).data,
  );
  handle(
    IpcChannels.STUDENT_ENROLL,
    assertEnrollStudentArgs,
    async (r) => (await app.academics.enroll(r)).data,
  );
  handle(
    IpcChannels.STUDENT_MOVE_CLASS,
    assertMoveEnrollmentClassArgs,
    async (r) => (await app.academics.moveEnrollmentClass(r)).data,
  );
  handle(
    IpcChannels.STUDENT_LIST_ENROLLMENTS,
    assertSingleIdArg,
    async (id) => (await app.students.listEnrollments(id)).data,
  );
  handle(
    IpcChannels.STUDENT_GET_STATISTICS,
    assertNoArgs,
    async () => (await app.reporting.getStudentStatistics()).data,
  );
  // Read-only: has the student's local create synced yet (gates the sign-in note).
  handle(IpcChannels.STUDENT_CREATE_SYNCED, assertSingleIdArg, (id) =>
    syncStatus.isCreateSynced(id),
  );
}
