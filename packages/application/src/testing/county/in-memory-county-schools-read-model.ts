import type { CountySchoolDetail, CountySchoolListItem } from '@nemis-desktop/types';
import type { ICountySchoolsReadModel } from '../../interfaces/county/county-schools-read-model';

/** Settable canned rows. */
export class InMemoryCountySchoolsReadModel implements ICountySchoolsReadModel {
  schools: CountySchoolListItem[] = [];
  schoolById = new Map<string, CountySchoolDetail>();

  listActiveSchools(): CountySchoolListItem[] {
    return this.schools;
  }
  getSchool(id: string): CountySchoolDetail | null {
    return this.schoolById.get(id) ?? null;
  }
}
