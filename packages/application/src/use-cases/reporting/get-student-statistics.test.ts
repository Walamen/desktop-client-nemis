import { describe, expect, it } from 'vitest';
import { Student } from '@nemis-desktop/domain';
import { Gender } from '@nemis-desktop/types';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { GetStudentStatisticsUseCase } from './get-student-statistics';

const logger = new RecordingLogger();

function student(id: string, gender: Gender, admissionDate: string): Student {
  return Student.create({
    id,
    institutionId: 'inst-1',
    firstName: 'A',
    lastName: 'B',
    admissionNumber: `ADM-${id}`,
    dateOfBirth: '2015-01-01',
    gender,
    admissionDate,
    occurredAt: '2026-07-20T00:00:00.000Z',
  });
}

describe('GetStudentStatisticsUseCase', () => {
  it('counts active students by gender and admissions within the last 3 months', async () => {
    const students = new InMemoryStudentRepository();
    students.save(student('s-1', Gender.MALE, '2026-07-01'));
    students.save(student('s-2', Gender.MALE, '2026-01-01'));
    students.save(student('s-3', Gender.FEMALE, '2026-07-10'));
    const inactive = student('s-4', Gender.FEMALE, '2026-07-15');
    inactive.deactivate('tester', '2026-07-20T00:00:00.000Z');
    students.save(inactive);

    const useCase = new GetStudentStatisticsUseCase({
      students,
      clock: new FixedClock('2026-07-20T00:00:00.000Z'),
      logger,
    });
    const res = await useCase.execute({});
    // cutoff = 2026-04-20: s-1 (07-01) and s-3 (07-10) qualify, s-2 (01-01) doesn't, s-4 is inactive.
    expect(res.data).toEqual({
      totalStudents: 3,
      maleStudents: 2,
      femaleStudents: 1,
      recentEnrollments: 2,
    });
  });

  it('returns zeros on an empty installation', async () => {
    const useCase = new GetStudentStatisticsUseCase({
      students: new InMemoryStudentRepository(),
      clock: new FixedClock('2026-07-20T00:00:00.000Z'),
      logger,
    });
    const res = await useCase.execute({});
    expect(res.data).toEqual({
      totalStudents: 0,
      maleStudents: 0,
      femaleStudents: 0,
      recentEnrollments: 0,
    });
  });
});
