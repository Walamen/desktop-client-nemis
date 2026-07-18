import type { Grade } from '@nemis-desktop/domain';
import type { IGradeRepository } from '../../interfaces/assessments/grade-repository';

export class InMemoryGradeRepository implements IGradeRepository {
  readonly store = new Map<string, Grade>();
  findById(id: string): Grade | null {
    return this.store.get(id) ?? null;
  }
  save(grade: Grade): void {
    this.store.set(grade.id, grade);
  }
  findByStudentId(studentId: string): Grade[] {
    return [...this.store.values()].filter((g) => g.studentId === studentId);
  }
}
