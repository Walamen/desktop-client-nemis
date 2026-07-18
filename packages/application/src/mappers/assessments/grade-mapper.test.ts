import { describe, expect, it } from 'vitest';
import { Grade } from '@nemis-desktop/domain';
import { GradeStatus } from '@nemis-desktop/types';
import { toGradeOutput } from './grade-mapper';

describe('grade mapper', () => {
  it('maps a Grade to GradeOutput', () => {
    const grade = Grade.create({
      id: 'grd-1',
      studentId: 'stu-1',
      subjectId: 'sub-1',
      obtained: 80,
      total: 100,
      status: GradeStatus.SUBMITTED,
      occurredAt: '2026-07-18T00:00:00.000Z',
    });
    expect(toGradeOutput(grade)).toEqual({
      id: 'grd-1',
      studentId: 'stu-1',
      subjectId: 'sub-1',
      obtained: 80,
      total: 100,
      status: GradeStatus.SUBMITTED,
      isPublished: false,
      version: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    });
  });
});
