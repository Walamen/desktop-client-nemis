import type {
  CountyDeoUser,
  CountyDistrictInstitution,
  CountyDistrictListItem,
  CountyDistrictOfficer,
} from '@nemis-desktop/types';
import type { ICountyDistrictsReadModel } from '../../interfaces/county/county-districts-read-model';

/** Settable canned rows keyed by district id. */
export class InMemoryCountyDistrictsReadModel implements ICountyDistrictsReadModel {
  districts: CountyDistrictListItem[] = [];
  districtById = new Map<string, { id: string; name: string; code: string | null; isActive: boolean }>();
  institutionsByDistrict = new Map<string, CountyDistrictInstitution[]>();
  countsByDistrict = new Map<string, { schools: number; students: number; teachers: number; deos: number }>();
  officersByDistrict = new Map<string, CountyDistrictOfficer[]>();
  deoUsers: CountyDeoUser[] = [];

  listActiveDistricts(): CountyDistrictListItem[] {
    return this.districts;
  }
  getDistrict(id: string) {
    return this.districtById.get(id) ?? null;
  }
  listDistrictInstitutions(districtId: string): CountyDistrictInstitution[] {
    return this.institutionsByDistrict.get(districtId) ?? [];
  }
  getDistrictCounts(districtId: string) {
    return this.countsByDistrict.get(districtId) ?? { schools: 0, students: 0, teachers: 0, deos: 0 };
  }
  listDistrictOfficers(districtId: string): CountyDistrictOfficer[] {
    return this.officersByDistrict.get(districtId) ?? [];
  }
  listCountyDeoUsers(): CountyDeoUser[] {
    return this.deoUsers;
  }
}
