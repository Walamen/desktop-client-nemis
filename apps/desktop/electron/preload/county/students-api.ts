import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyStudentsApi: Pick<CountyApi, 'listStudents' | 'getStudent' | 'getStudentRecord'> = {
  listStudents: (query) => invoke(IpcChannels.COUNTY_LIST_STUDENTS, query),
  getStudent: (studentId) => invoke(IpcChannels.COUNTY_GET_STUDENT, studentId),
  getStudentRecord: (studentId) => invoke(IpcChannels.COUNTY_GET_STUDENT_RECORD, studentId),
};
