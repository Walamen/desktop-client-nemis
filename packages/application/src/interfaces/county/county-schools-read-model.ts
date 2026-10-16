import type { CountySchoolDetail, CountySchoolListItem } from '@nemis-desktop/types';

/** County (CEO) Schools pages. "Own county" = institutions.countyId in the
 * synced counties row (all institutions when none has synced). */
export interface ICountySchoolsReadModel {
  /** institutions.service findAll: active, any type, by name; studentCount = ALL students. */
  listActiveSchools(): CountySchoolListItem[];
  /** institutions.service findOne: own county, any approval/active status, or null. */
  getSchool(id: string): CountySchoolDetail | null;
}
