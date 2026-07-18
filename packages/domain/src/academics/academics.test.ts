import { describe, expect, it } from 'vitest';
import { EnrollmentStatus, GradeLevel } from '@nemis-desktop/types';
import { AcademicYear } from './entities/academic-year';
import { AcademicYearCode } from './value-objects/academic-year-code';
import { Class } from './entities/class';
import { Enrollment } from './entities/enrollment';
import { IsEnrollmentOpen } from './specifications/is-enrollment-open';
import { InvalidStateException, InvalidValueObjectException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

describe('AcademicYearCode', () => {
  it('accepts YYYY/YYYY and rejects malformed', () => {
    expect(AcademicYearCode.create('2025/2026').value).toBe('2025/2026');
    expect(() => AcademicYearCode.create('2025-2026')).toThrow(InvalidValueObjectException);
  });
});

describe('AcademicYear', () => {
  it('makeCurrent flips the flag and bumps version', () => {
    const year = AcademicYear.reconstitute({
      id: 'ay-1',
      institutionId: 'inst-1',
      code: '2025/2026',
      start: '2025-09-01',
      end: '2026-07-31',
      isCurrent: false,
      version: 1,
      updatedAt: ISO,
    });
    year.makeCurrent('admin', ISO);
    expect(year.isCurrent).toBe(true);
    expect(year.version).toBe(2);
  });
});

describe('Class', () => {
  it('exposes grade level and capacity', () => {
    const klass = Class.reconstitute({
      id: 'c-1',
      institutionId: 'inst-1',
      academicYearId: 'ay-1',
      name: 'JSS1-A',
      gradeLevel: GradeLevel.GRADE_7,
      capacity: 40,
      isActive: true,
      version: 1,
      updatedAt: ISO,
    });
    expect(klass.gradeLevel).toBe(GradeLevel.GRADE_7);
    expect(klass.capacity).toBe(40);
  });
});

describe('Enrollment', () => {
  it('creates ACTIVE and emits EnrollmentCreated; withdraw guards double-withdraw', () => {
    const enrollment = Enrollment.create({
      id: 'e-1',
      studentId: 'stu-1',
      classId: 'c-1',
      academicYearId: 'ay-1',
      termId: 't-1',
      occurredAt: ISO,
    });
    expect(enrollment.status).toBe(EnrollmentStatus.ACTIVE);
    expect(enrollment.pullDomainEvents()[0]?.name).toBe('EnrollmentCreated');

    enrollment.withdraw('admin', ISO);
    expect(enrollment.status).toBe(EnrollmentStatus.WITHDRAWN);
    expect(() => enrollment.withdraw('admin', ISO)).toThrow(InvalidStateException);
  });
});

describe('IsEnrollmentOpen', () => {
  it('requires both year and term current', () => {
    const spec = new IsEnrollmentOpen();
    expect(spec.isSatisfiedBy({ yearIsCurrent: true, termIsCurrent: true })).toBe(true);
    expect(spec.isSatisfiedBy({ yearIsCurrent: true, termIsCurrent: false })).toBe(false);
  });
});
