import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countySchoolsApi: Pick<CountyApi, 'listSchools' | 'getSchool'> = {
  listSchools: () => invoke(IpcChannels.COUNTY_LIST_SCHOOLS),
  getSchool: (schoolId) => invoke(IpcChannels.COUNTY_GET_SCHOOL, schoolId),
};
