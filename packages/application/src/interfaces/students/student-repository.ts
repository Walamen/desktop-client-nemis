import type { Student } from '@nemis-desktop/domain';
import type { EnrollmentStatus, Gender, GradeLevel } from '@nemis-desktop/types';

export interface StudentPageFilter {
  limit: number; offset: number; keyword?: string; gender?: Gender; gradeLevel?: GradeLevel;
  classId?: string; academicYearId?: string; enrollmentStatus?: EnrollmentStatus; isActive?: boolean;
  sort?: 'name' | 'admissionNumber' | 'updatedAt';
}

/** Persistence port for the Student aggregate. Speaks in domain entities; the
 * SQLite adapter (Phase 6) maps entities to rows. */
export interface IStudentRepository {
  findById(id: string): Student | null;
  save(student: Student): void;
  exists(id: string): boolean;
  existsByAdmissionNumber(institutionId: string, admissionNumber: string, excludeId?: string): boolean;
  findPage(request: StudentPageFilter): { items: Student[]; total: number };
  findByClassId(classId: string): Student[];
  /** Real COUNT(*) — total students in this installation. */
  countAll(): number;
  countByGradeLevel(): { gradeLevel: GradeLevel; studentCount: number }[];
  /** Active-student counts grouped by gender, for stat tiles. */
  countByGender(): { gender: Gender; studentCount: number }[];
  /** Active-student counts grouped by institution — the query that would
   * have silently mixed institutions together under the old "one device =
   * one institution" assumption. */
  countByInstitution(): { institutionId: string; studentCount: number }[];
  /** Active students with admissionDate on/after `sinceDate` (YYYY-MM-DD). */
  countRecentAdmissions(sinceDate: string): number;
  findRecentlyUpdated(limit: number): Student[];
}
