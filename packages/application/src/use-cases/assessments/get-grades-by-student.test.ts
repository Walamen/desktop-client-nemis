import { describe, expect, it } from 'vitest';
import { Grade } from '@nemis-desktop/domain';
import { GradeStatus } from '@nemis-desktop/types';
import { GetGradesByStudentUseCase } from './get-grades-by-student';
import { InMemoryGradeRepository } from '../../testing/assessments/in-memory-grade-repository';
import { RecordingLogger } from '../../testing';

describe('GetGradesByStudentUseCase', () => {
  it('returns all grades for a student', async () => {
    const grades = new InMemoryGradeRepository();
    grades.save(
      Grade.create({
        id: 'grd-1',
        studentId: 'stu-1',
        subjectId: 'sub-1',
        obtained: 80,
        total: 100,
        status: GradeStatus.SUBMITTED,
        occurredAt: '2026-07-18T00:00:00.000Z',
      }),
    );
    const useCase = new GetGradesByStudentUseCase({ grades, logger: new RecordingLogger() });
    const res = await useCase.execute({ studentId: 'stu-1' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.subjectId).toBe('sub-1');
  });
});
