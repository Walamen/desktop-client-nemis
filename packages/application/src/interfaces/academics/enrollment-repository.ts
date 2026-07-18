import type { Enrollment } from '@nemis-desktop/domain';

export interface IEnrollmentRepository {
  findById(id: string): Enrollment | null;
  save(enrollment: Enrollment): void;
  hasActiveEnrollment(studentId: string, classId: string): boolean;
  findByClassId(classId: string): Enrollment[];
}
