/**
 * Canonical business enums mirrored from the production backend
 * (`@nemis/types` enums.ts / prisma schema). The backend is the single source of
 * truth; this file is a hand-synced copy because the desktop is a separate pnpm
 * workspace. Values MUST stay identical. See Phase 4 spec §A.4 / recommendation D.3.
 */

export const SystemRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MINISTRY_ADMIN: 'MINISTRY_ADMIN',
  COUNTY_ADMIN: 'COUNTY_ADMIN',
  DEO: 'DEO',
  INSTITUTION_ADMIN: 'INSTITUTION_ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  DATA_OFFICER: 'DATA_OFFICER',
  VIEWER: 'VIEWER',
  PARENT: 'PARENT',
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];

export const Status = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const InstitutionType = {
  SCHOOL: 'SCHOOL',
  TVET: 'TVET',
  UNIVERSITY: 'UNIVERSITY',
} as const;
export type InstitutionType = (typeof InstitutionType)[keyof typeof InstitutionType];

export const OwnershipType = {
  GOVERNMENT: 'GOVERNMENT',
  PRIVATE: 'PRIVATE',
  COMMUNITY: 'COMMUNITY',
  NGO: 'NGO',
  MISSION: 'MISSION',
} as const;
export type OwnershipType = (typeof OwnershipType)[keyof typeof OwnershipType];

export const AccessMode = {
  VEHICLE: 'VEHICLE',
  BIKE: 'BIKE',
  FOOT: 'FOOT',
} as const;
export type AccessMode = (typeof AccessMode)[keyof typeof AccessMode];

export const InstitutionLevel = {
  PRE_PRIMARY: 'PRE_PRIMARY',
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
  CERTIFICATE: 'CERTIFICATE',
  DIPLOMA: 'DIPLOMA',
  UNDERGRADUATE: 'UNDERGRADUATE',
  POSTGRADUATE: 'POSTGRADUATE',
} as const;
export type InstitutionLevel = (typeof InstitutionLevel)[keyof typeof InstitutionLevel];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const AcademicYearStatus = {
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type AcademicYearStatus = (typeof AcademicYearStatus)[keyof typeof AcademicYearStatus];

export const GradeLevel = {
  KG: 'KG',
  K1: 'K1',
  K2: 'K2',
  GRADE_1: 'GRADE_1',
  GRADE_2: 'GRADE_2',
  GRADE_3: 'GRADE_3',
  GRADE_4: 'GRADE_4',
  GRADE_5: 'GRADE_5',
  GRADE_6: 'GRADE_6',
  GRADE_7: 'GRADE_7',
  GRADE_8: 'GRADE_8',
  GRADE_9: 'GRADE_9',
  GRADE_10: 'GRADE_10',
  GRADE_11: 'GRADE_11',
  GRADE_12: 'GRADE_12',
} as const;
export type GradeLevel = (typeof GradeLevel)[keyof typeof GradeLevel];

// Maps each InstitutionLevel to the GradeLevel values it authorizes.
// Mirrored from @nemis/types INSTITUTION_LEVEL_GRADES — keep in sync.
export const INSTITUTION_LEVEL_GRADES: Record<string, GradeLevel[]> = {
  [InstitutionLevel.PRE_PRIMARY]: [GradeLevel.KG, GradeLevel.K1, GradeLevel.K2],
  [InstitutionLevel.PRIMARY]: [
    GradeLevel.GRADE_1,
    GradeLevel.GRADE_2,
    GradeLevel.GRADE_3,
    GradeLevel.GRADE_4,
    GradeLevel.GRADE_5,
    GradeLevel.GRADE_6,
  ],
  [InstitutionLevel.SECONDARY]: [
    GradeLevel.GRADE_7,
    GradeLevel.GRADE_8,
    GradeLevel.GRADE_9,
    GradeLevel.GRADE_10,
    GradeLevel.GRADE_11,
    GradeLevel.GRADE_12,
  ],
};

/**
 * Returns the grade levels allowed for the given institution levels.
 * If no levels are provided (school has none configured), returns ALL grades
 * as a safe fallback. Mirrored from @nemis/types getAllowedGradesForLevels.
 */
export function getAllowedGradesForLevels(institutionLevels: InstitutionLevel[]): GradeLevel[] {
  const known = institutionLevels.filter((l) => l in INSTITUTION_LEVEL_GRADES);
  if (known.length === 0) return Object.values(GradeLevel);
  return known.flatMap((l) => INSTITUTION_LEVEL_GRADES[l] ?? []);
}

export const EnrollmentStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  WITHDRAWN: 'WITHDRAWN',
  TRANSFERRED: 'TRANSFERRED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
  EXCUSED: 'EXCUSED',
  SICK: 'SICK',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const AssessmentType = {
  EXAM: 'EXAM',
  TEST: 'TEST',
  QUIZ: 'QUIZ',
  ASSIGNMENT: 'ASSIGNMENT',
  PROJECT: 'PROJECT',
  PRACTICAL: 'PRACTICAL',
} as const;
export type AssessmentType = (typeof AssessmentType)[keyof typeof AssessmentType];

export const GradeStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  LOCKED: 'LOCKED',
} as const;
export type GradeStatus = (typeof GradeStatus)[keyof typeof GradeStatus];

export const GradeAuditAction = {
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  PUBLISHED: 'PUBLISHED',
  UNPUBLISHED: 'UNPUBLISHED',
  LOCKED: 'LOCKED',
  UNLOCKED: 'UNLOCKED',
  ADMIN_OVERRIDE: 'ADMIN_OVERRIDE',
  DELETED: 'DELETED',
} as const;
export type GradeAuditAction = (typeof GradeAuditAction)[keyof typeof GradeAuditAction];

export const PeriodType = {
  REGULAR_PERIOD: 'REGULAR_PERIOD',
  MIDTERM_EXAM: 'MIDTERM_EXAM',
  FINAL_EXAM: 'FINAL_EXAM',
} as const;
export type PeriodType = (typeof PeriodType)[keyof typeof PeriodType];

export const WindowStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PUBLISHED: 'PUBLISHED',
} as const;
export type WindowStatus = (typeof WindowStatus)[keyof typeof WindowStatus];

export const StaffPosition = {
  PRINCIPAL: 'PRINCIPAL',
  VICE_PRINCIPAL: 'VICE_PRINCIPAL',
  HEAD_OF_DEPARTMENT: 'HEAD_OF_DEPARTMENT',
  TEACHER: 'TEACHER',
  ASSISTANT_TEACHER: 'ASSISTANT_TEACHER',
  LIBRARIAN: 'LIBRARIAN',
  COUNSELOR: 'COUNSELOR',
  ADMINISTRATIVE_STAFF: 'ADMINISTRATIVE_STAFF',
  SUPPORT_STAFF: 'SUPPORT_STAFF',
} as const;
export type StaffPosition = (typeof StaffPosition)[keyof typeof StaffPosition];

export const EmploymentType = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACT',
  TEMPORARY: 'TEMPORARY',
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

export const DayOfWeek = {
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY',
  SATURDAY: 'SATURDAY',
  SUNDAY: 'SUNDAY',
} as const;
export type DayOfWeek = (typeof DayOfWeek)[keyof typeof DayOfWeek];

export const AssignmentType = {
  HOMEWORK: 'HOMEWORK',
  PROJECT: 'PROJECT',
  QUIZ: 'QUIZ',
  TEST: 'TEST',
  EXAM: 'EXAM',
  PRESENTATION: 'PRESENTATION',
} as const;
export type AssignmentType = (typeof AssignmentType)[keyof typeof AssignmentType];

export const AssignmentStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export const SubmissionStatus = {
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  GRADED: 'GRADED',
  LATE: 'LATE',
} as const;
export type SubmissionStatus = (typeof SubmissionStatus)[keyof typeof SubmissionStatus];
