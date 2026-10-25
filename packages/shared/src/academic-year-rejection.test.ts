import { describe, expect, it } from 'vitest';
import { academicYearRejectionMessage, isAcademicYearRejection } from './academic-year-rejection';

describe('isAcademicYearRejection', () => {
  it('matches reasons starting with ACADEMIC_YEAR_', () => {
    expect(isAcademicYearRejection('ACADEMIC_YEAR_CLOSED: closed')).toBe(true);
    expect(isAcademicYearRejection('ACADEMIC_YEAR_NOT_STARTED: later')).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isAcademicYearRejection('A server record already exists')).toBe(false);
    expect(isAcademicYearRejection('see ACADEMIC_YEAR_CLOSED')).toBe(false);
    expect(isAcademicYearRejection(null)).toBe(false);
    expect(isAcademicYearRejection(undefined)).toBe(false);
  });
  it('extracts the message after ": "', () => {
    expect(academicYearRejectionMessage('ACADEMIC_YEAR_CLOSED: It is closed. Really: yes.')).toBe('It is closed. Really: yes.');
    expect(academicYearRejectionMessage('ACADEMIC_YEAR_CLOSED')).toBe('');
  });
});
