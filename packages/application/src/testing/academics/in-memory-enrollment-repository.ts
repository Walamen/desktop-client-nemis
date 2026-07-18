import { EnrollmentStatus } from '@nemis-desktop/types';
import type { Enrollment } from '@nemis-desktop/domain';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';

export class InMemoryEnrollmentRepository implements IEnrollmentRepository {
  readonly store = new Map<string, Enrollment>();
  findById(id: string): Enrollment | null {
    return this.store.get(id) ?? null;
  }
  save(enrollment: Enrollment): void {
    this.store.set(enrollment.id, enrollment);
  }
  hasActiveEnrollment(studentId: string, classId: string): boolean {
    for (const e of this.store.values()) {
      if (
        e.studentId === studentId &&
        e.classId === classId &&
        e.status === EnrollmentStatus.ACTIVE
      ) {
        return true;
      }
    }
    return false;
  }
  findByClassId(classId: string): Enrollment[] {
    return [...this.store.values()].filter((e) => e.classId === classId);
  }
}
