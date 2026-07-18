import { describe, expect, it } from 'vitest';
import { Student } from '@nemis-desktop/domain';
import { Gender, GradeLevel } from '@nemis-desktop/types';
import { toStudentOutput, toStudentSummary } from './student-mapper';

function makeStudent(): Student {
  return Student.create({
    id: 'stu-1',
    institutionId: 'inst-1',
    firstName: 'Ada',
    middleName: 'M',
    lastName: 'Lovelace',
    admissionNumber: 'ADM-001',
    dateOfBirth: '2015-06-01',
    gender: Gender.FEMALE,
    gradeLevel: GradeLevel.GRADE_1,
    occurredAt: '2026-07-18T00:00:00.000Z',
  });
}

describe('student mapper', () => {
  it('maps a Student entity to StudentOutput without exposing the entity', () => {
    const out = toStudentOutput(makeStudent());
    expect(out).toMatchObject({
      id: 'stu-1',
      institutionId: 'inst-1',
      firstName: 'Ada',
      middleName: 'M',
      lastName: 'Lovelace',
      fullName: 'Ada M Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
      gradeLevel: GradeLevel.GRADE_1,
      isActive: true,
      version: 1,
      guardians: [],
    });
  });

  it('maps a Student to a compact summary', () => {
    expect(toStudentSummary(makeStudent())).toEqual({
      id: 'stu-1',
      fullName: 'Ada M Lovelace',
      admissionNumber: 'ADM-001',
      gradeLevel: GradeLevel.GRADE_1,
      isActive: true,
    });
  });
});
