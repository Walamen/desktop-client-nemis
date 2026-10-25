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
  existsByNemisId(nemisId: string, excludeId?: string): boolean {
    for (const s of this.store.values()) {
      if (s.id !== excludeId && s.nemisId?.value === nemisId) {
        return true;
      }
    }
    return false;
  }
  findPage(request: StudentPageFilter): { items: Student[]; total: number } {
    const all = [...this.store.values()].filter((s) => (!request.keyword || s.name.full.toLowerCase().includes(request.keyword.toLowerCase()) || (s.nemisId?.value.toLowerCase().includes(request.keyword.toLowerCase()) ?? false)) && (!request.gender || s.gender === request.gender) && (!request.gradeLevel || s.gradeLevel === request.gradeLevel) && (request.isActive === undefined || s.isActive === request.isActive));
    return { items: all.slice(request.offset, request.offset + request.limit), total: all.length };
  }
  findByClassId(_classId: string): Student[] {
    return [];
  }
  /** Enrolments in the active academic year, standing in for the enrollments/classes join. */
  readonly activeYearEnrollments: { studentId: string; gradeLevel: import('@nemis-desktop/types').GradeLevel; enrolledAt: string }[] = [];
  countEnrolledInActiveYear(): number {
    return new Set(this.activeYearEnrollments.map((e) => e.studentId)).size;
  }
  countByGradeLevelInActiveYear(): { gradeLevel: import('@nemis-desktop/types').GradeLevel; studentCount: number }[] {
    const byGrade = new Map<import('@nemis-desktop/types').GradeLevel, Set<string>>();
    for (const e of this.activeYearEnrollments) byGrade.set(e.gradeLevel, (byGrade.get(e.gradeLevel) ?? new Set()).add(e.studentId));
    return [...byGrade].map(([gradeLevel, ids]) => ({ gradeLevel, studentCount: ids.size }));
  }
  findRecentlyEnrolledInActiveYear(limit: number): Student[] {
    const latest = new Map<string, string>();
    for (const e of this.activeYearEnrollments) if (!latest.has(e.studentId) || e.enrolledAt > (latest.get(e.studentId) ?? '')) latest.set(e.studentId, e.enrolledAt);
    return [...latest].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => this.store.get(id)).filter((s): s is Student => s !== undefined).slice(0, limit);
  }
  countAll(): number {
    return this.store.size;
  }
  countByGradeLevel(): { gradeLevel: import('@nemis-desktop/types').GradeLevel; studentCount: number }[] { const counts = new Map<import('@nemis-desktop/types').GradeLevel, number>(); for (const s of this.store.values()) if (s.gradeLevel) counts.set(s.gradeLevel, (counts.get(s.gradeLevel) ?? 0) + 1); return [...counts].map(([gradeLevel, studentCount]) => ({ gradeLevel, studentCount })); }
  countByGender(): { gender: import('@nemis-desktop/types').Gender; studentCount: number }[] { const counts = new Map<import('@nemis-desktop/types').Gender, number>(); for (const s of this.store.values()) { if (!s.isActive) continue; counts.set(s.gender, (counts.get(s.gender) ?? 0) + 1); } return [...counts].map(([gender, studentCount]) => ({ gender, studentCount })); }
  countByInstitution(): { institutionId: string; studentCount: number }[] { const counts = new Map<string, number>(); for (const s of this.store.values()) { if (!s.isActive) continue; counts.set(s.institutionId, (counts.get(s.institutionId) ?? 0) + 1); } return [...counts].map(([institutionId, studentCount]) => ({ institutionId, studentCount })); }
  countRecentAdmissions(sinceDate: string): number { let n = 0; for (const s of this.store.values()) { if (s.isActive && s.admissionDate && s.admissionDate >= sinceDate) n += 1; } return n; }
  findRecentlyUpdated(limit: number): Student[] { return [...this.store.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,limit); }
}
