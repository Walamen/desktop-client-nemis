import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertSingleIdArg,
  assertListStudentsArgs,
  assertCreateStudentArgs,
  assertUpdateStudentArgs,
  assertSetStudentActiveArgs,
  assertCreateGuardianArgs,
  assertEnrollStudentArgs,
  assertMoveEnrollmentClassArgs,
  assertNoArgs,
} from '@app/security/validateIpc';
export function registerStudentHandlers(handle: IpcHandle, app: ApplicationLayer): void {
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
}
