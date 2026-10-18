/** County (CEO) Teachers list and teacher profile
 * (docs/superpowers/specs/2026-10-18-county-teachers-design.md). Teachers are
 * teaching staff only: TEACHER and ASSISTANT_TEACHER. */

export interface CountyTeachersQuery {
  search?: string;
  /** A school level: PRIMARY, SECONDARY, CERTIFICATE, DIPLOMA. */
  category?: string;
  /** A subject name from `CountyTeacherStats.subjects`. */
  subject?: string;
  status?: 'active' | 'inactive';
  page?: number;
  limit?: number;
}

export interface CountyTeacherInstitution {
  id: string;
  name: string;
  level: string | null;
  districtName: string | null;
  countyName: string | null;
}

export interface CountyTeacherListItem {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  photoUrl: string | null;
  employeeNumber: string;
  position: string;
  isActive: boolean;
  gender: string;
  institution: CountyTeacherInstitution;
  /** The subject assigned earliest, by either kind of assignment. */
  primarySubject: string | null;
}

/** Over teaching staff at the county's active schools. total = active + inactive;
 * unassigned = active with no class at their school this academic year. */
export interface CountyTeacherStats {
  total: number;
  active: number;
  inactive: number;
  unassigned: number;
  /** Subject names actually taught, grouped by case and spaces, sorted. */
  subjects: string[];
}

export interface CountyTeachersResult {
  county: { id: string; name: string } | null;
  stats: CountyTeacherStats;
  data: CountyTeacherListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CountyTeacherDetail extends CountyTeacherListItem {
  phoneNumber: string | null;
  email: string | null;
  employmentType: string | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  address: string | null;
  dateOfJoining: string | null;
  dateOfLeaving: string | null;
  /** Already reduced: array strings, or an object's `summary`. */
  qualifications: string[];
  /** Class-teacher rows of every year, as the web shows them. */
  classAssignments: Array<{
    id: string;
    isClassTeacher: boolean;
    class: { id: string; name: string; gradeLevel: string };
  }>;
  /** One per subject (id = subject id), from both kinds of assignment. */
  subjectAssignments: Array<{ id: string; subject: { id: string; name: string; code: string | null } }>;
}
