import { describe, expect, it } from 'vitest';
import {
  AttendanceStatus,
  EnrollmentStatus,
  Gender,
  GradeStatus,
  InstitutionLevel,
  SystemRole,
} from './enums';

describe('canonical enum mirror', () => {
  it('SystemRole matches backend values', () => {
    expect(SystemRole.TEACHER).toBe('TEACHER');
    expect(Object.values(SystemRole)).toContain('DEO');
    expect(Object.values(SystemRole)).toHaveLength(10);
  });

  it('AttendanceStatus includes the five recorded states', () => {
    expect(Object.values(AttendanceStatus)).toEqual([
      'PRESENT',
      'ABSENT',
      'LATE',
      'EXCUSED',
      'SICK',
    ]);
  });

  it('EnrollmentStatus / GradeStatus / Gender / InstitutionLevel expose expected members', () => {
    expect(EnrollmentStatus.ACTIVE).toBe('ACTIVE');
    expect(GradeStatus.PUBLISHED).toBe('PUBLISHED');
    expect(Gender.FEMALE).toBe('FEMALE');
    expect(InstitutionLevel.SECONDARY).toBe('SECONDARY');
  });
});
