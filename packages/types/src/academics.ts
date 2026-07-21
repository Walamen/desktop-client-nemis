import type { AcademicYearStatus, GradeLevel } from './enums';
import type { AcademicYearResult } from './dashboard';

/** IPC wire shapes for the Academic Foundation module (Phase 9). Kept
 * structurally identical to the application-layer DTOs so main-process
 * handlers return DTOs directly and the renderer passes results straight to
 * the presentation layer. */

export interface AcademicYearListItemResult extends AcademicYearResult {
  status: AcademicYearStatus;
  termCount: number;
  classCount: number;
}

export interface CreateAcademicYearRequest {
  code: string;
  startDate: string;
  endDate: string;
  makeCurrent?: boolean;
}

export interface UpdateAcademicYearRequest {
  id: string;
  code?: string;
  startDate?: string;
  endDate?: string;
}

export interface SetAcademicYearStatusRequest {
  id: string;
  status: AcademicYearStatus;
}

export interface TermResult {
  id: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface CreateTermRequest {
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  makeCurrent?: boolean;
}

export interface UpdateTermRequest {
  id: string;
  name?: string;
  startDate?: string;
  endDate?: string;
}

export interface ClassResult {
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

export interface ClassListRequest {
  limit?: number;
  offset?: number;
  keyword?: string;
  academicYearId?: string;
  gradeLevel?: GradeLevel;
  includeInactive?: boolean;
  sort?: ClassSortKey;
}

export interface CreateClassRequest {
  academicYearId: string;
  name: string;
  section?: string;
  gradeLevel: GradeLevel;
  capacity?: number;
}

export interface UpdateClassRequest {
  id: string;
  name?: string;
  /** null clears the section; undefined leaves it unchanged. */
  section?: string | null;
  gradeLevel?: GradeLevel;
  /** null clears the capacity; undefined leaves it unchanged. */
  capacity?: number | null;
}

export interface SetActiveRequest {
  id: string;
  isActive: boolean;
}

export interface SubjectResult {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  classCount: number;
}

export type SubjectSortKey = 'name' | 'code' | 'updatedAt';

export interface SubjectListRequest {
  limit?: number;
  offset?: number;
  keyword?: string;
  includeInactive?: boolean;
  sort?: SubjectSortKey;
}

export interface CreateSubjectRequest {
  name: string;
  code: string;
  description?: string;
}

export interface UpdateSubjectRequest {
  id: string;
  name?: string;
  code?: string;
  /** null clears the description; undefined leaves it unchanged. */
  description?: string | null;
}

export interface ClassSubjectResult {
  classId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  assignedAt: string;
}

export interface ClassSubjectPairRequest {
  classId: string;
  subjectId: string;
}

export interface GradeLevelCountResult {
  gradeLevel: GradeLevel;
  classCount: number;
}

export interface PagedListResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface DeletedResult {
  id: string;
}
