import type { Student } from '@nemis-desktop/domain';
import type { PageRequest } from '../../core/pagination';

/** Persistence port for the Student aggregate. Speaks in domain entities; the
 * SQLite adapter (Phase 6) maps entities to rows. */
export interface IStudentRepository {
  findById(id: string): Student | null;
  save(student: Student): void;
  exists(id: string): boolean;
  existsByAdmissionNumber(institutionId: string, admissionNumber: string): boolean;
  findPage(request: PageRequest): { items: Student[]; total: number };
  findByClassId(classId: string): Student[];
}
