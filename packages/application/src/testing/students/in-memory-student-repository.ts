import type { Student } from '@nemis-desktop/domain';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { PageRequest } from '../../core/pagination';

/** Map-backed IStudentRepository for use-case tests. */
export class InMemoryStudentRepository implements IStudentRepository {
  readonly store = new Map<string, Student>();

  findById(id: string): Student | null {
    return this.store.get(id) ?? null;
  }
  save(student: Student): void {
    this.store.set(student.id, student);
  }
  exists(id: string): boolean {
    return this.store.has(id);
  }
  existsByAdmissionNumber(institutionId: string, admissionNumber: string): boolean {
    for (const s of this.store.values()) {
      if (s.institutionId === institutionId && s.admissionNumber.value === admissionNumber) {
        return true;
      }
    }
    return false;
  }
  findPage(request: PageRequest): { items: Student[]; total: number } {
    const all = [...this.store.values()];
    return { items: all.slice(request.offset, request.offset + request.limit), total: all.length };
  }
  findByClassId(_classId: string): Student[] {
    return [];
  }
  countAll(): number {
    return this.store.size;
  }
}
