/** County (CEO) offline school registration: a school saved on this device
 * that waits there until it is sent to the server's POST /institutions
 * (docs/superpowers/specs/2026-10-17-county-school-registration-design.md). */

export type SchoolRegistrationSyncState = 'pending' | 'synced' | 'rejected';
export type SchoolRegistrationSource = 'form' | 'bulk';

export interface SchoolRegistrationAdmin {
  email: string;
  firstName: string;
  lastName: string;
}

/** Exactly the POST /institutions body portal-web builds (create submitSchool / bulk handleSubmit). */
export interface SchoolRegistrationPayload {
  name: string;
  code: string;
  type: 'SCHOOL';
  levels: string[];
  ownership: string;
  countyId: string;
  districtId: string;
  isActive: true;
  admins: SchoolRegistrationAdmin[];
  address?: string;
  communityTown?: string;
  emisCode?: string;
  waecCode?: string;
  isBoarding?: boolean;
  isUrban?: boolean;
  contactPhone?: string;
  establishedYear?: number;
  accessMode?: string;
  principalName?: string;
  contactPersonPhone?: string;
  numBuildings?: number;
  numClassrooms?: number;
  numChairs?: number;
  numBenches?: number;
  numDesks?: number;
  numTables?: number;
  numBathrooms?: number;
  hasWaterAccess?: boolean;
  waterSource?: string;
  hasMoeSupport?: boolean;
  partnerOrganization?: string;
  hasPTA?: boolean;
  hasLibrary?: boolean;
  hasKitchen?: boolean;
  hasCafeteria?: boolean;
  hasSportsField?: boolean;
  hasSportsActivities?: boolean;
  hasAuditorium?: boolean;
  hasElectricity?: boolean;
  hasComputerLab?: boolean;
  hasClinic?: boolean;
  hasSafeWater?: boolean;
  hasWash?: boolean;
  hasTextbooks?: boolean;
  hasCurriculum?: boolean;
  isSpacious?: boolean;
  isVentilated?: boolean;
  isWellLighted?: boolean;
  metadata?: Record<string, unknown>;
}

/** What a page submits: the device fills in the code and the county. */
export type SchoolRegistrationInput = Omit<SchoolRegistrationPayload, 'code' | 'countyId'>;

export interface PrincipalLogin {
  email: string;
  password: string;
}

export interface SchoolRegistration {
  id: string;
  countyId: string;
  source: SchoolRegistrationSource;
  payload: SchoolRegistrationPayload;
  syncState: SchoolRegistrationSyncState;
  syncError: string | null;
  principalLogin: PrincipalLogin | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
}

export interface SchoolRegistrationContext {
  county: { id: string; name: string; code: string | null } | null;
  /** Active districts of the county, by name. */
  districts: Array<{ id: string; name: string }>;
}

export interface SchoolCodeClash {
  index: number;
  code: string;
  existingName: string;
}

export interface RegisterSchoolsRequest {
  source: SchoolRegistrationSource;
  schools: SchoolRegistrationInput[];
}

export interface ResubmitSchoolRegistrationRequest {
  id: string;
  school: SchoolRegistrationInput;
}

/** Business outcomes travel as data: a thrown business error loses its text over IPC. */
export type RegisterSchoolsResult =
  | { status: 'saved'; ids: string[] }
  | { status: 'code-clash'; clashes: SchoolCodeClash[] }
  | { status: 'no-county' }
  | { status: 'not-found' };

export interface CountySchoolRegistrationInfo {
  syncState: SchoolRegistrationSyncState;
  syncError: string | null;
  source: SchoolRegistrationSource;
  principalLogin: PrincipalLogin | null;
}
