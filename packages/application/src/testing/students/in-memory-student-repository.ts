import type { Student } from '@nemis-desktop/domain';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { StudentPageFilter } from '../../interfaces/students/student-repository';

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
  existsByAdmissionNumber(institutionId: string, admissionNumber: string, excludeId?: string): boolean {
    for (const s of this.store.values()) {
      if (s.id !== excludeId && s.institutionId === institutionId && s.admissionNumber.value === admissionNumber) {
        return true;
      }
    }
    return false;
  }
  findPage(request: StudentPageFilter): { items: Student[]; total: number } {
    const all = [...this.store.values()].filter((s) => (!request.keyword || s.name.full.toLowerCase().includes(request.keyword.toLowerCase()) || s.admissionNumber.value.toLowerCase().includes(request.keyword.toLowerCase())) && (!request.gender || s.gender === request.gender) && (!request.gradeLevel || s.gradeLevel === request.gradeLevel) && (request.isActive === undefined || s.isActive === request.isActive));
    return { items: all.slice(request.offset, request.offset + request.limit), total: all.length };
  }
  findByClassId(_classId: string): Student[] {
    return [];
  }
  countAll(): number {
    return this.store.size;
  }
  countByGradeLevel(): { gradeLevel: import('@nemis-desktop/types').GradeLevel; studentCount: number }[] { const counts = new Map<import('@nemis-desktop/types').GradeLevel, number>(); for (const s of this.store.values()) if (s.gradeLevel) counts.set(s.gradeLevel, (counts.get(s.gradeLevel) ?? 0) + 1); return [...counts].map(([gradeLevel, studentCount]) => ({ gradeLevel, studentCount })); }
  findRecentlyUpdated(limit: number): Student[] { return [...this.store.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,limit); }
}
