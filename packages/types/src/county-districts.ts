/** IPC wire shapes for the County (CEO) District pages
 * (docs/superpowers/specs/2026-10-16-county-districts-design.md). Kept
 * structurally identical to the application-layer DTOs, which alias them. */
export interface CountyDeoSummary {
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  photoUrl: string | null;
}

export interface CountyDistrictListItem {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  activeSchoolCount: number;
  activeDeoCount: number;
  firstDeo: CountyDeoSummary | null;
}

export interface CountyDeoUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  photoUrl: string | null;
  districtId: string | null;
}

export interface CountyDistrictOfficer {
  userId: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  photoUrl: string | null;
}

export interface CountyDistrictsResult {
  county: { id: string; name: string } | null;
  districts: CountyDistrictListItem[];
  deoUsers: CountyDeoUser[];
  officersByDistrict: Record<string, CountyDistrictOfficer[]>;
}

export interface CountyDistrictInstitution {
  id: string;
  name: string;
  code: string;
  type: string;
  emisCode: string | null;
  officialSchoolCode: string | null;
  street: string | null;
  communityTown: string | null;
  ownership: string;
  contactPhone: string | null;
  contactPersonPhone: string | null;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
}

export interface CountyDistrictStats {
  totalSchools: number;
  totalStudents: number;
  totalTeachers: number;
  deoCount: number;
  studentTeacherRatio: number;
}

export interface CountyDistrictDetailResult {
  county: { id: string; name: string } | null;
  district: { id: string; name: string; code: string | null; isActive: boolean };
  officers: CountyDistrictOfficer[];
  /** Active institutions of the district, any type, by name. */
  institutions: CountyDistrictInstitution[];
  stats: CountyDistrictStats;
}

export interface CountyAssignDeoRequest {
  districtId: string;
  userId: string;
  replaceExisting: boolean;
}

export interface CountyRemoveDeoRequest {
  districtId: string;
  userId: string;
}
