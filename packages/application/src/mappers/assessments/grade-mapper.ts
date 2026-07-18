import type { Grade } from '@nemis-desktop/domain';
import type { GradeOutput } from '../../dto/assessments/assessments-dto';

export function toGradeOutput(grade: Grade): GradeOutput {
  return {
    id: grade.id,
    studentId: grade.studentId,
    subjectId: grade.subjectId,
    obtained: grade.marks.obtained,
    total: grade.marks.total,
    status: grade.status,
    isPublished: grade.isPublished,
    version: grade.version,
    updatedAt: grade.updatedAt,
  };
}
