import { describe, expect, it } from 'vitest';
import { AcademicYear, Class, Term } from '@nemis-desktop/domain';
import { Gender, GradeLevel } from '@nemis-desktop/types';
import { CreateAndEnrollStudentUseCase } from './create-and-enroll-student';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { InMemoryGuardianRepository } from '../../testing/students/in-memory-guardian-repository';
import { InMemoryEnrollmentRepository } from '../../testing/academics/in-memory-enrollment-repository';
import { InMemoryClassRepository } from '../../testing/academics/in-memory-class-repository';
import { InMemoryAcademicYearRepository } from '../../testing/academics/in-memory-academic-year-repository';
import { InMemoryTermRepository } from '../../testing/academics/in-memory-term-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';

const at = '2026-10-02T00:00:00.000Z';

function build() {
  const students = new InMemoryStudentRepository();
  const guardians = new InMemoryGuardianRepository();
  const enrollments = new InMemoryEnrollmentRepository();
  const classes = new InMemoryClassRepository();
  const academicYears = new InMemoryAcademicYearRepository();
  const terms = new InMemoryTermRepository();
  academicYears.store.set(
    'y1',
    AcademicYear.reconstitute({
      id: 'y1', institutionId: 'inst-1', code: '2026/2027', start: '2026-09-01', end: '2027-07-31',
      isCurrent: true, version: 1, updatedAt: at,
    }),
  );
  terms.store.set(
    't1',
    Term.reconstitute({
      id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, start: '2026-09-01', end: '2026-12-19',
      isCurrent: true, version: 1, updatedAt: at,
    }),
  );
  classes.store.set(
    'c1',
    Class.reconstitute({
      id: 'c1', institutionId: 'inst-1', academicYearId: 'y1', name: 'JSS1-A',
      gradeLevel: GradeLevel.GRADE_7, isActive: true, version: 1, updatedAt: at,
    }),
  );
  const uow = new PassthroughUnitOfWork();
  const useCase = new CreateAndEnrollStudentUseCase({
    students, guardians, enrollments, classes, academicYears, terms,
    unitOfWork: uow,
    clock: new FixedClock(at),
    ids: new SequentialIdGenerator('id'),
    events: new CollectingEventPublisher(),
    logger: new RecordingLogger(),
  });
  return { useCase, uow, students, guardians, enrollments };
}

const valid = {
  institutionId: 'inst-1', firstName: 'Ada', lastName: 'Toe', dateOfBirth: '2015-01-01',
  gender: Gender.FEMALE, gradeLevel: GradeLevel.GRADE_7,
  academicYearId: 'y1', termId: 't1', classId: 'c1', assertedNoNemisId: true,
  guardians: [{ firstName: 'Mary', lastName: 'Toe', relationship: 'Mother', phoneNumber: '0770000000', isPrimary: true }],
};

describe('CreateAndEnrollStudentUseCase', () => {
  it('creates student, guardian link and enrolment in ONE unit of work', async () => {
    const { useCase, uow, students, guardians, enrollments } = build();
    const res = await useCase.execute(valid);
    expect(uow.runCount).toBe(1);
    const student = students.store.get(res.data.id)!;
    expect(student.assertedNoNemisId).toBe(true);
    expect(student.guardians).toHaveLength(1);
    expect(guardians.store.size).toBe(1);
    expect([...enrollments.store.values()]).toMatchObject([
      { studentId: res.data.id, classId: 'c1', termId: 't1', academicYearId: 'y1' },
    ]);
    expect(res.data.nemisId).toMatch(/^\d{12}$/);
  });

  it('rejects a class of a different grade before writing anything', async () => {
    const { useCase, uow, students } = build();
    await expect(useCase.execute({ ...valid, gradeLevel: GradeLevel.GRADE_8 })).rejects.toThrow(
      'The selected class is for a different grade.',
    );
    expect(uow.runCount).toBe(0);
    expect(students.store.size).toBe(0);
  });

  it('requires class, term, year and grade', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ ...valid, classId: '' })).rejects.toThrow();
    await expect(useCase.execute({ ...valid, termId: '' })).rejects.toThrow();
    await expect(useCase.execute({ ...valid, academicYearId: '' })).rejects.toThrow();
  });

  it('skips guardian drafts with no name or phone', async () => {
    const { useCase, guardians } = build();
    await useCase.execute({
      ...valid,
      guardians: [{ firstName: '', lastName: '', relationship: '', phoneNumber: '', isPrimary: false }],
    });
    expect(guardians.store.size).toBe(0);
  });
});
