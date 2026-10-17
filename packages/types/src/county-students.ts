/** County (CEO) Students list and student detail
 * (docs/superpowers/specs/2026-10-17-county-students-design.md). */

export interface CountyStudentsQuery {
  search?: string;
  institutionId?: string;
  districtId?: string;
  gradeLevel?: string;
  performance?: string;
  status?: 'active' | 'inactive';
  page: number;
  limit: number;
}

/** portal-web's CountyStudent (counties.service getCountyStudents). */
export interface CountyStudentListItem {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  photoUrl: string | null;
  nemisId: string | null;
  isActive: boolean;
  gender: string;
  institution: { id: string; name: string; districtName: string | null; countyName: string | null };
  currentClass: { name: string; gradeLevel: string } | null;
  performanceLabel: string | null;
  avgPercentage: number | null;
}

/** Total = every student at the county's active schools = active + inactive. */
export interface CountyStudentStats {
  total: number;
  male: number;
  female: number;
  active: number;
  inactive: number;
}

export interface CountyStudentsResult {
  county: { id: string; name: string } | null;
  districts: Array<{ id: string; name: string }>;
  schools: Array<{ id: string; name: string }>;
  stats: CountyStudentStats;
  data: CountyStudentListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type YearOutcome = 'PROMOTED' | 'RETAINED' | 'GRADUATED';

/** One school year of a student's record (Academic record tab). */
export interface StudentYearRecord {
  academicYearId: string;
  academicYearName: string;
  academicYearStartDate: string | null;
  isCurrentYear: boolean;
  institutionId: string;
  institutionName: string;
  className: string | null;
  gradeLevel: string | null;
  /** Recorded outcome; null = "In progress" (current year) or "Not recorded". */
  outcome: YearOutcome | null;
  average: number | null;
  attendanceRate: number | null;
  /** A year at a school outside this county (from the online record). */
  otherCounty: boolean;
}

export interface StudentTransferRecord {
  id: string;
  date: string;
  fromInstitutionName: string;
  toInstitutionName: string;
  status: string;
  reason: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
}

export interface CountyStudentDetail {
  student: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    nemisId: string | null;
    nationalId: string | null;
    photoUrl: string | null;
    dateOfBirth: string;
    gender: string;
    gradeLevel: string | null;
    isActive: boolean;
    admissionDate: string | null;
    phoneNumber: string | null;
    email: string | null;
    address: string | null;
  };
  institution: { id: string; name: string; districtName: string | null; countyName: string | null };
  currentEnrollment: {
    className: string;
    gradeLevel: string | null;
    academicYearName: string | null;
    enrollmentDate: string | null;
    status: string;
  } | null;
  guardians: Array<{
    firstName: string;
    lastName: string;
    relationship: string | null;
    phoneNumber: string | null;
    email: string | null;
    isPrimary: boolean;
  }>;
  years: StudentYearRecord[];
  transfers: StudentTransferRecord[];
}

/** The server's GET /counties/:id/students/:studentId/academic-record body. */
export interface StudentAcademicRecord {
  years: Array<{
    academicYearId: string;
    academicYearName: string;
    academicYearStartDate: string;
    isCurrentYear: boolean;
    institutionId: string;
    institutionName: string;
    countyName: string | null;
    className: string | null;
    gradeLevel: string | null;
    outcome: YearOutcome | null;
    nextGradeLevel: string | null;
    average: number | null;
  }>;
  transfers: StudentTransferRecord[];
}

export type StudentAcademicRecordResult =
  | { status: 'ok'; record: StudentAcademicRecord }
  | { status: 'unavailable' };
