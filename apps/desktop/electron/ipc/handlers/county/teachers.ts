import { IpcChannels, type CountyTeachersQuery } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertCountyTeachersQueryArgs, assertSingleIdArg } from '@app/security/validateIpc';

/** County Teachers list and teacher profile, read from this device. */
export function registerCountyTeacherHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_LIST_TEACHERS, assertCountyTeachersQueryArgs, async (query: CountyTeachersQuery) =>
    (await app.county.listTeachers(query)).data,
  );
  handle(IpcChannels.COUNTY_GET_TEACHER, assertSingleIdArg, async (teacherId: string) =>
    (await app.county.getTeacher(teacherId)).data,
  );
}
