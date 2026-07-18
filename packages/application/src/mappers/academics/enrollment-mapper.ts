import type { Enrollment } from '@nemis-desktop/domain';
import type { EnrollmentOutput } from '../../dto/academics/academics-dto';

export function toEnrollmentOutput(enrollment: Enrollment): EnrollmentOutput {
  return {
    id: enrollment.id,
    studentId: enrollment.studentId,
    classId: enrollment.classId,
    status: enrollment.status,
    version: enrollment.version,
    updatedAt: enrollment.updatedAt,
  };
}
