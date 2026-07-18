import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { Student } from '@nemis-desktop/domain';
import { ListStudentsUseCase } from './list-students';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { RecordingLogger } from '../../testing';

function seed(repo: InMemoryStudentRepository, n: number): void {
  for (let i = 1; i <= n; i += 1) {
    repo.save(
      Student.create({
        id: `stu-${i}`,
        institutionId: 'inst-1',
        firstName: `First${i}`,
        lastName: 'Last',
        admissionNumber: `ADM-${i}`,
        dateOfBirth: '2015-06-01',
        gender: Gender.MALE,
        occurredAt: '2026-07-18T00:00:00.000Z',
      }),
    );
  }
}

describe('ListStudentsUseCase', () => {
  it('returns a page of summaries with defaults (limit 25, offset 0)', async () => {
    const students = new InMemoryStudentRepository();
    seed(students, 3);
    const useCase = new ListStudentsUseCase({ students, logger: new RecordingLogger() });
    const res = await useCase.execute({});
    expect(res.data.total).toBe(3);
    expect(res.data.limit).toBe(25);
    expect(res.data.offset).toBe(0);
    expect(res.data.items).toHaveLength(3);
    expect(res.data.items[0]).toHaveProperty('fullName');
    expect(res.data.items[0]).not.toHaveProperty('dateOfBirth');
  });

  it('clamps limit to the 1..100 range', async () => {
    const students = new InMemoryStudentRepository();
    seed(students, 1);
    const useCase = new ListStudentsUseCase({ students, logger: new RecordingLogger() });
    const res = await useCase.execute({ limit: 5000 });
    expect(res.data.limit).toBe(100);
  });
});
