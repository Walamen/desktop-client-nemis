/** IPC wire shapes for the County (CEO) Schools list and School detail pages
 * (docs/superpowers/specs/2026-10-16-county-schools-design.md). Kept
 * structurally identical to the application-layer DTOs, which alias them. */

/** The server's per-school `details` object (all optional: absent on older servers). */
export interface CountySchoolDetails {
  establishedYear?: number | null;
  registrationDate?: string | null;
  accessMode?: string | null;
  isBoarding?: boolean;
  isUrban?: boolean;
  numBuildings?: number | null;
  numClassrooms?: number | null;
  numBathrooms?: number | null;
  waecCode?: string | null;
  principalName?: string | null;
  photoUrl?: string | null;
  hasLibrary?: boolean;
  hasComputerLab?: boolean;
  hasSportsField?: boolean;
  hasKitchen?: boolean;
  hasCafeteria?: boolean;
  hasElectricity?: boolean;
  hasSafeWater?: boolean;
  hasWaterAccess?: boolean;
  hasTextbooks?: boolean;
  hasWash?: boolean;
  hasPTA?: boolean;
  hasAuditorium?: boolean;
  hasClinic?: boolean;
}

export interface CountySchoolListItem {
  id: string;
  name: string;
  code: string;
  type: string;
  isActive: boolean;
  districtName: string | null;
  levels: string[];
  studentCount: number;
  photoUrl: string | null;
}

export interface CountySchoolPrincipal {
  firstName: string;
  lastName: string;
  email: string | null;
  photoUrl: string | null;
}

export interface CountySchoolDetail {
  id: string;
  name: string;
  code: string;
  type: string;
  ownership: string;
  approvalStatus: string;
  isActive: boolean;
  street: string | null;
  communityTown: string | null;
  contactPhone: string | null;
  contactPersonPhone: string | null;
  emisCode: string | null;
  officialSchoolCode: string | null;
  metadata: Record<string, unknown> | null;
  levels: string[];
  details: CountySchoolDetails | null;
  districtName: string | null;
  countyName: string | null;
  studentCount: number;
  staffCount: number;
  principal: CountySchoolPrincipal | null;
}

export interface CountySchoolsResult {
  county: { id: string; name: string } | null;
  districtCount: number;
  schools: CountySchoolListItem[];
}

export type CountySchoolDetailResult = CountySchoolDetail;
