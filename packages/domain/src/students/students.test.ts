import { describe, expect, it } from 'vitest';
import { Gender, GradeLevel } from '@nemis-desktop/types';
import { Student } from './entities/student';
import { StudentGuardian } from './entities/student-guardian';
import { AdmissionNumber } from './value-objects/admission-number';
import { BusinessRuleViolationException, InvalidValueObjectException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

function newStudent(): Student {
  return Student.create({
    id: 'stu-1',
    institutionId: 'inst-1',
    firstName: 'Musu',
    lastName: 'Toe',
    admissionNumber: 'ADM-2026-001',
    dateOfBirth: '2012-03-04',
    gender: Gender.FEMALE,
    gradeLevel: GradeLevel.GRADE_7,
    occurredAt: ISO,
  });
}

describe('AdmissionNumber', () => {
  it('trims and rejects empty', () => {
    expect(AdmissionNumber.create(' ADM-1 ').value).toBe('ADM-1');
    expect(() => AdmissionNumber.create('')).toThrow(InvalidValueObjectException);
  });
});

describe('Student', () => {
  it('creates and emits StudentCreated with admission number', () => {
    const student = newStudent();
    expect(student.admissionNumber.value).toBe('ADM-2026-001');
    const events = student.pullDomainEvents();
    expect(events[0]?.name).toBe('StudentCreated');
  });

  it('adds a guardian and enforces a single primary', () => {
    const student = newStudent();
    student.addGuardian(
      StudentGuardian.reconstitute({ id: 'sg-1', guardianId: 'g-1', isPrimary: true }),
      'admin',
      ISO,
    );
    expect(student.guardians).toHaveLength(1);
    expect(() =>
      student.addGuardian(
        StudentGuardian.reconstitute({ id: 'sg-2', guardianId: 'g-2', isPrimary: true }),
        'admin',
        ISO,
      ),
    ).toThrow(BusinessRuleViolationException);
  });

  it('reconstitutes from persisted state without emitting events', () => {
    const guardianLink = StudentGuardian.reconstitute({
      id: 'sg-1',
      guardianId: 'g-1',
      isPrimary: true,
    });
    const student = Student.reconstitute({
      id: 'stu-1',
      institutionId: 'inst-1',
      firstName: 'Musu',
      lastName: 'Toe',
      admissionNumber: 'ADM-2026-001',
      dateOfBirth: '2012-03-04',
      gender: Gender.FEMALE,
      gradeLevel: GradeLevel.GRADE_7,
      isActive: true,
      guardians: [guardianLink],
      version: 3,
      updatedAt: ISO,
    });
    expect(student.version).toBe(3);
    expect(student.guardians).toHaveLength(1);
    expect(student.pullDomainEvents()).toHaveLength(0);
  });
});
