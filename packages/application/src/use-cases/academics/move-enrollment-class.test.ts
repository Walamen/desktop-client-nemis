import { describe, expect, it } from 'vitest';
import { Class, Enrollment } from '@nemis-desktop/domain';
import { EnrollmentStatus, GradeLevel } from '@nemis-desktop/types';
import { FixedClock } from '../../testing/fixed-clock';
import { InMemoryClassRepository } from '../../testing/academics/in-memory-class-repository';
import { InMemoryEnrollmentRepository } from '../../testing/academics/in-memory-enrollment-repository';
import { PassthroughUnitOfWork } from '../../testing/passthrough-unit-of-work';
import { RecordingLogger } from '../../testing/recording-logger';
import { MoveEnrollmentClassUseCase } from './move-enrollment-class';

function build() {
  const enrollments = new InMemoryEnrollmentRepository();
  const classes = new InMemoryClassRepository();
  enrollments.store.set(
    'enr-1',
    Enrollment.reconstitute({
      id: 'enr-1',
      studentId: 'stu-1',
      classId: 'class-a',
      academicYearId: 'year-1',
      termId: 'term-1',
      enrollmentDate: '2026-09-01',
      occurredAt: '2026-09-01T00:00:00.000Z',
      status: EnrollmentStatus.ACTIVE,
      version: 1,
      updatedAt: '2026-09-01T00:00:00.000Z',
    }),
  );
  for (const [id, year, active, gradeLevel] of [
    ['class-a', 'year-1', true, GradeLevel.GRADE_1],
    ['class-b', 'year-1', true, GradeLevel.GRADE_1],
    ['class-old', 'year-0', true, GradeLevel.GRADE_1],
    ['class-off', 'year-1', false, GradeLevel.GRADE_1],
    ['class-grade-2', 'year-1', true, GradeLevel.GRADE_2],
  ] as const) {
    classes.store.set(
      id,
      Class.reconstitute({
        id,
        institutionId: 'school-1',
        academicYearId: year,
        name: id,
        gradeLevel,
        isActive: active,
        version: 1,
        updatedAt: '2026-09-01T00:00:00.000Z',
      }),
    );
  }
  return {
    enrollments,
    useCase: new MoveEnrollmentClassUseCase({
      enrollments,
      classes,
      unitOfWork: new PassthroughUnitOfWork(),
      clock: new FixedClock('2026-09-02T00:00:00.000Z'),
      logger: new RecordingLogger(),
    }),
  };
}

describe('MoveEnrollmentClassUseCase', () => {
  it('moves an active enrollment within its academic year', async () => {
    const { enrollments, useCase } = build();
    const result = await useCase.execute({
      enrollmentId: 'enr-1',
      targetClassId: 'class-b',
      actorId: 'admin',
    });
    expect(result.data.classId).toBe('class-b');
    expect(result.data.version).toBe(2);
    expect(enrollments.findById('enr-1')?.classId).toBe('class-b');
  });

  it.each(['class-old', 'class-off', 'class-a', 'class-grade-2'])(
    'rejects invalid target class %s',
    async (targetClassId) => {
      const { useCase } = build();
      await expect(useCase.execute({ enrollmentId: 'enr-1', targetClassId })).rejects.toThrow();
    },
  );
});
