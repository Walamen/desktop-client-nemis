import {
  IpcChannels,
  type CountyStudentsQuery,
  type StudentAcademicRecord,
  type StudentAcademicRecordResult,
} from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { logger } from '@app/services/logger';
import { assertCountyStudentsQueryArgs, assertSingleIdArg } from '@app/security/validateIpc';

export interface CountyStudentRecordDeps {
  gateway: { getStudentAcademicRecord(countyId: string, studentId: string): Promise<StudentAcademicRecord> };
  isOnline: () => boolean;
  /** The signed-in County Admin's county (workspace scope id). */
  countyId: () => string;
}

/** County Students list and detail read from this device; the national
 * record is an online read whose every failure is just "unavailable". */
export function registerCountyStudentHandlers(
  handle: IpcHandle,
  app: ApplicationLayer,
  deps: CountyStudentRecordDeps,
): void {
  handle(IpcChannels.COUNTY_LIST_STUDENTS, assertCountyStudentsQueryArgs, async (query: CountyStudentsQuery) =>
    (await app.county.listStudents(query)).data,
  );
  handle(IpcChannels.COUNTY_GET_STUDENT, assertSingleIdArg, async (studentId: string) =>
    (await app.county.getStudent(studentId)).data,
  );
  handle(
    IpcChannels.COUNTY_GET_STUDENT_RECORD,
    assertSingleIdArg,
    async (studentId: string): Promise<StudentAcademicRecordResult> => {
      if (!deps.isOnline()) return { status: 'unavailable' };
      try {
        return { status: 'ok', record: await deps.gateway.getStudentAcademicRecord(deps.countyId(), studentId) };
      } catch (error) {
        logger.warn(`County student record unavailable for ${studentId}`, error);
        return { status: 'unavailable' };
      }
    },
  );
}
