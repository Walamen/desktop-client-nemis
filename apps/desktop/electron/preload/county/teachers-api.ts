import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyTeachersApi: Pick<CountyApi, 'listTeachers' | 'getTeacher'> = {
  listTeachers: (query) => invoke(IpcChannels.COUNTY_LIST_TEACHERS, query),
  getTeacher: (teacherId) => invoke(IpcChannels.COUNTY_GET_TEACHER, teacherId),
};
