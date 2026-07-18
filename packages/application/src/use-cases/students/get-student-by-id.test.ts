import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { Student } from '@nemis-desktop/domain';
import { GetStudentByIdUseCase } from './get-student-by-id';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { RecordingLogger } from '../../testing';

function build() {
  const students = new InMemoryStudentRepository();
  const useCase = new GetStudentByIdUseCase({ students, logger: new RecordingLogger() });
  return { students, useCase };
}

describe('GetStudentByIdUseCase', () => {
  it('returns the mapped student when found', async () => {
    const { students, useCase } = build();
    students.save(
      Student.create({
        id: 'stu-1',
        institutionId: 'inst-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        admissionNumber: 'ADM-001',
        dateOfBirth: '2015-06-01',
        gender: Gender.FEMALE,
        occurredAt: '2026-07-18T00:00:00.000Z',
      }),
    );
    const res = await useCase.execute({ studentId: 'stu-1' });
    expect(res.data?.id).toBe('stu-1');
  });

  it('returns null data when not found', async () => {
    const { useCase } = build();
    const res = await useCase.execute({ studentId: 'missing' });
    expect(res.data).toBeNull();
  });
});
