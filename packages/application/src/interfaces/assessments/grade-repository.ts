import type { Grade } from '@nemis-desktop/domain';

export interface IGradeRepository {
  findById(id: string): Grade | null;
  save(grade: Grade): void;
  findByStudentId(studentId: string): Grade[];
}
