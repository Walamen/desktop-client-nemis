import type {
  CountyDeoUser,
  CountyDistrictInstitution,
  CountyDistrictListItem,
  CountyDistrictOfficer,
} from '@nemis-desktop/types';

/** Raw rows for the County (CEO) District pages, read from this device's
 * synced database. "This county's own" districts are those whose countyId is
 * the synced county row (all districts when none has synced). */
export interface ICountyDistrictsReadModel {
  /** Active districts of this county (own county only), by name. */
  listActiveDistricts(): CountyDistrictListItem[];
  /** Own-county district (active or not), or null. */
  getDistrict(id: string): { id: string; name: string; code: string | null; isActive: boolean } | null;
  /** Active institutions of the district (any type), by name; metadata = profile minus `levels`. */
  listDistrictInstitutions(districtId: string): CountyDistrictInstitution[];
  getDistrictCounts(districtId: string): { schools: number; students: number; teachers: number; deos: number };
  /** Active DEO assignments of the district, oldest assignment row first. */
  listDistrictOfficers(districtId: string): CountyDistrictOfficer[];
  /** users.service getUsersByCounty(role DEO, includeInactive): newest first. */
  listCountyDeoUsers(): CountyDeoUser[];
}
