import { describe, expect, it } from 'vitest';
import { Enrollment } from '@nemis-desktop/domain';
import { GetClassRosterUseCase } from './get-class-roster';
import { InMemoryEnrollmentRepository } from '../../testing/academics/in-memory-enrollment-repository';
import { RecordingLogger } from '../../testing';

describe('GetClassRosterUseCase', () => {
  it('returns all enrollments for the class', async () => {
    const enrollments = new InMemoryEnrollmentRepository();
    enrollments.save(
      Enrollment.create({
        id: 'enr-1',
        studentId: 'stu-1',
        classId: 'cls-1',
        academicYearId: 'ay-1',
        termId: 'term-1',
        occurredAt: '2026-07-18T00:00:00.000Z',
      }),
    );
    const useCase = new GetClassRosterUseCase({ enrollments, logger: new RecordingLogger() });
    const res = await useCase.execute({ classId: 'cls-1' });
    expect(res.data.classId).toBe('cls-1');
    expect(res.data.enrollments).toHaveLength(1);
    expect(res.data.enrollments[0]?.studentId).toBe('stu-1');
  });
});
