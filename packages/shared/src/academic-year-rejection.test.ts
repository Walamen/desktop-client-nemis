import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_YEAR_MESSAGES,
  academicYearRejectionHeading,
  academicYearRejectionMessage,
  academicYearTokenOf,
  isAcademicYearRejection,
} from './academic-year-rejection';

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

describe('academicYearRejectionHeading', () => {
  it('names each violation token', () => {
    expect(academicYearRejectionHeading('ACADEMIC_YEAR_CLOSED: x')).toBe('Rejected — academic year closed');
    expect(academicYearRejectionHeading('ACADEMIC_YEAR_NOT_STARTED: x')).toBe('Rejected — academic year not started');
    expect(academicYearRejectionHeading('ACADEMIC_YEAR_ALREADY_ACTIVE: x')).toBe(
      'Rejected — another academic year is active',
    );
    expect(academicYearRejectionHeading('ACADEMIC_YEAR_NOT_DELETABLE: x')).toBe(
      'Rejected — academic year cannot be deleted',
    );
  });
  it('falls back to the closed heading for an unknown ACADEMIC_YEAR_ token', () => {
    expect(academicYearRejectionHeading('ACADEMIC_YEAR_SOMETHING_NEW: x')).toBe('Rejected — academic year closed');
  });
});

describe('academicYearTokenOf', () => {
  it('prefers the server errorCode when it is a violation token', () => {
    expect(academicYearTokenOf('ACADEMIC_YEAR_NOT_STARTED', 'whatever')).toBe('ACADEMIC_YEAR_NOT_STARTED');
  });
  it('recognises the exact friendly message when the code is generic', () => {
    expect(academicYearTokenOf('CONFLICT', ACADEMIC_YEAR_MESSAGES.ACADEMIC_YEAR_CLOSED)).toBe('ACADEMIC_YEAR_CLOSED');
  });
  it('returns undefined for anything else', () => {
    expect(academicYearTokenOf('CONFLICT', 'Something else.')).toBeUndefined();
    expect(academicYearTokenOf(undefined, undefined)).toBeUndefined();
  });
});

describe('carried-cell rejections (Stage 5)', () => {
  it('classifies them with the year rejections, with their own heading and copy', () => {
    const reason = `TRANSFER_CARRIED_CELL: ${ACADEMIC_YEAR_MESSAGES.TRANSFER_CARRIED_CELL}`;
    expect(isAcademicYearRejection(reason)).toBe(true);
    expect(isAcademicYearRejection('TRANSFER_MATCH_PENDING: x')).toBe(true);
    expect(isAcademicYearRejection('TRANSFER_SOMETHING_ELSE: x')).toBe(false);
    expect(academicYearRejectionHeading(reason)).toBe('Rejected — mark carried from another school');
    expect(academicYearRejectionHeading('TRANSFER_MATCH_PENDING: x')).toBe('Rejected — prior record not matched yet');
    expect(ACADEMIC_YEAR_MESSAGES.TRANSFER_CARRIED_CELL).toBe(
      "This mark was carried from the student's previous school and cannot be changed here.",
    );
    expect(ACADEMIC_YEAR_MESSAGES.TRANSFER_MATCH_PENDING).toBe(
      "Match this student's prior record before entering marks for periods before they joined.",
    );
  });
});
