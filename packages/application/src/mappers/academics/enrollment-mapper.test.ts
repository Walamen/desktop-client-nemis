import { describe, expect, it } from 'vitest';
import { Enrollment } from '@nemis-desktop/domain';
import { EnrollmentStatus } from '@nemis-desktop/types';
import { toEnrollmentOutput } from './enrollment-mapper';

describe('enrollment mapper', () => {
  it('maps an Enrollment to EnrollmentOutput', () => {
    const e = Enrollment.create({
      id: 'enr-1',
      studentId: 'stu-1',
      classId: 'cls-1',
      academicYearId: 'ay-1',
      termId: 'term-1',
      occurredAt: '2026-07-18T00:00:00.000Z',
    });
    expect(toEnrollmentOutput(e)).toEqual({
      id: 'enr-1',
      studentId: 'stu-1',
      classId: 'cls-1',
      status: EnrollmentStatus.ACTIVE,
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    });
  });
});
