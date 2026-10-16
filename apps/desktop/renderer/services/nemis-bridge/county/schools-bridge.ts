import type { CountySchoolDetailResult, CountySchoolsResult } from '@nemis-desktop/types';
import { api } from '../api';

export const schoolsBridge = {
  listSchools: (): Promise<CountySchoolsResult> => api().county.listSchools(),
  getSchool: (schoolId: string): Promise<CountySchoolDetailResult | null> => api().county.getSchool(schoolId),
};
