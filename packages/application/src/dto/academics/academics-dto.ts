import type { EnrollmentStatus, GradeLevel } from '@nemis-desktop/types';

export interface EnrollStudentDto {
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  actorId?: string;
  enrollmentDate?: string;
}

export interface WithdrawEnrollmentDto {
  enrollmentId: string;
  actorId: string;
}

export interface MoveEnrollmentClassDto {
  enrollmentId: string;
  targetClassId: string;
  actorId?: string;
}

export interface GetClassRosterDto {
  classId: string;
}

export interface EnrollmentOutput {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  enrollmentDate: string;
  status: EnrollmentStatus;
  version: number;
  updatedAt: string;
}

export interface ClassRosterOutput {
  classId: string;
  enrollments: EnrollmentOutput[];
}

// --- Terms ---------------------------------------------------------------

export interface TermOutput {
  id: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface ListTermsDto {
  academicYearId: string;
}

export interface CreateTermDto {
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  makeCurrent?: boolean;
  actorId?: string;
}

export interface UpdateTermDto {
  id: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  actorId?: string;
}

export interface SetCurrentTermDto {
  id: string;
  actorId?: string;
}

export interface DeleteTermDto {
  id: string;
}

// --- Classes ---------------------------------------------------------------

export interface ClassOutput {
  id: string;
  academicYearId: string;
  name: string;
  section?: string;
  gradeLevel: GradeLevel;
  capacity?: number;
  isActive: boolean;
  subjectCount: number;
}

export type ClassSortKey = 'name' | 'gradeLevel' | 'updatedAt';

export interface ListClassesDto {
  limit?: number;
  offset?: number;
  keyword?: string;
  academicYearId?: string;
  gradeLevel?: GradeLevel;
  includeInactive?: boolean;
  sort?: ClassSortKey;
}

export interface CreateClassDto {
  academicYearId: string;
  name: string;
  section?: string;
  gradeLevel: GradeLevel;
  capacity?: number;
  actorId?: string;
}

export interface UpdateClassDto {
  id: string;
  name?: string;
  section?: string | null;
  gradeLevel?: GradeLevel;
  capacity?: number | null;
  actorId?: string;
}

export interface SetClassActiveDto {
  id: string;
  isActive: boolean;
  actorId?: string;
}

export interface GradeLevelCountOutput {
  gradeLevel: GradeLevel;
  classCount: number;
}

// --- Subjects ---------------------------------------------------------------

export interface SubjectOutput {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  classCount: number;
}

export type SubjectSortKey = 'name' | 'code' | 'updatedAt';

export interface ListSubjectsDto {
  limit?: number;
  offset?: number;
  keyword?: string;
  includeInactive?: boolean;
  sort?: SubjectSortKey;
}

export interface CreateSubjectDto {
  name: string;
  code: string;
  description?: string;
  actorId?: string;
}

export interface UpdateSubjectDto {
  id: string;
  name?: string;
  code?: string;
  description?: string | null;
  actorId?: string;
}

export interface SetSubjectActiveDto {
  id: string;
  isActive: boolean;
  actorId?: string;
}

// --- Class ↔ Subject assignment ---------------------------------------------

export interface ClassSubjectOutput {
  classId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  assignedAt: string;
}

export interface ClassSubjectPairDto {
  classId: string;
  subjectId: string;
}

export interface DeletedOutput {
  id: string;
}
