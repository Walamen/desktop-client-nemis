/** County (CEO) Parents & Guardians list and profile
 * (docs/superpowers/specs/2026-10-18-county-parents-design.md). */

export interface CountyGuardiansQuery {
  search?: string;
  /** One of the web's relationship labels; matched ignoring case and surrounding spaces. */
  relationship?: string;
  districtId?: string;
  page: number;
  limit: number;
}

/** portal-web's GuardianWithStudents as the list uses it (guardians.service findByCounty). */
export interface CountyGuardianListItem {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email: string | null;
  photoUrl: string | null;
  /** Links to this county's students (any status). */
  studentsCount: number;
  /** Distinct district names of those students' schools, sorted. */
  districts: string[];
}

/** guardians.service getStatsByCounty, plus the web's client-side Children Covered. */
export interface CountyGuardianStats {
  total: number;
  primaryGuardians: number;
  childrenCovered: number;
}

export interface CountyGuardiansResult {
  county: { id: string; name: string } | null;
  districts: Array<{ id: string; name: string }>;
  stats: CountyGuardianStats;
  data: CountyGuardianListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CountyGuardianChild {
  id: string;
  firstName: string;
  lastName: string;
  nemisId: string | null;
  photoUrl: string | null;
  isActive: boolean;
  /** This guardian is the child's primary guardian. */
  isPrimary: boolean;
  institution: { id: string; name: string; districtName: string | null };
}

export interface CountyGuardianDetail {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email: string | null;
  address: string | null;
  occupation: string | null;
  isEmergencyContact: boolean;
  photoUrl: string | null;
  studentsCount: number;
  districts: string[];
  /** Send Message's school (its admin is selected on Messages); null disables the button. */
  messageInstitutionId: string | null;
  children: CountyGuardianChild[];
}
