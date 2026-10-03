import { describe, expect, it } from 'vitest';
import type { CohortRow } from '@nemis-desktop/types';
import {
  buildDecisions,
  defaultNextGrade,
  draftFromRow,
  nameStudentIds,
  nextGradeOptions,
  offeredGrades,
} from './outcomes-logic';

const row = (over: Partial<CohortRow>): CohortRow => ({
  studentId: 's1', firstName: 'Ama', lastName: 'Kollie', nemisId: null, outcome: null,
  nextGradeLevel: null, notes: null, syncState: null, syncError: null, ...over,
});

describe('defaultNextGrade', () => {
  it('is the following grade for Promoted', () => {
    expect(defaultNextGrade('PROMOTED', 'GRADE_7')).toBe('GRADE_8');
    expect(defaultNextGrade('PROMOTED', 'K2')).toBe('GRADE_1');
  });
  it('is empty for Promoted from the last grade', () => {
    expect(defaultNextGrade('PROMOTED', 'GRADE_12')).toBe('');
  });
  it('is the same grade for Retained', () => {
    expect(defaultNextGrade('RETAINED', 'GRADE_7')).toBe('GRADE_7');
  });
  it('is empty for Graduated', () => {
    expect(defaultNextGrade('GRADUATED', 'GRADE_12')).toBe('');
  });
});

describe('offeredGrades', () => {
  it('lists the grades with at least one class, in grade order', () => {
    expect(
      offeredGrades([
        { gradeLevel: 'GRADE_8', classCount: 1 },
        { gradeLevel: 'GRADE_7', classCount: 2 },
        { gradeLevel: 'GRADE_9', classCount: 0 },
      ]),
    ).toEqual(['GRADE_7', 'GRADE_8']);
  });
  it('falls back to every grade when the school has no grade data', () => {
    expect(offeredGrades([])).toHaveLength(15);
    expect(offeredGrades(null)).toHaveLength(15);
  });
});

describe('nextGradeOptions', () => {
  it('keeps a chosen grade the school does not offer, in grade order', () => {
    expect(nextGradeOptions(['GRADE_6', 'GRADE_8'], 'GRADE_7')).toEqual(['GRADE_6', 'GRADE_7', 'GRADE_8']);
    expect(nextGradeOptions(['GRADE_6'], '')).toEqual(['GRADE_6']);
  });
});

describe('nameStudentIds', () => {
  it('replaces every cohort student id in the message with that student’s name', () => {
    const rows = [row({}), row({ studentId: 's2-long', firstName: 'Bendu', lastName: 'Sirleaf' })];
    expect(nameStudentIds('Already stamped in that academic year: s2-long, s1', rows)).toBe(
      'Already stamped in that academic year: Bendu Sirleaf, Ama Kollie',
    );
  });
  it('leaves unknown ids alone', () => {
    expect(nameStudentIds('Bad: zz9', [row({})])).toBe('Bad: zz9');
  });
});

describe('buildDecisions', () => {
  it('sends every decided row, omits blank notes, and gives Graduated no next grade', () => {
    const rows = [row({}), row({ studentId: 's2' }), row({ studentId: 's3' }), row({ studentId: 's4' })];
    const result = buildDecisions(rows, {
      s1: { outcome: 'PROMOTED', nextGradeLevel: 'GRADE_8', notes: '  ' },
      s2: { outcome: 'GRADUATED', nextGradeLevel: 'GRADE_8', notes: 'Well done' },
      s3: { outcome: '', nextGradeLevel: '', notes: '' },
    });
    expect(result).toEqual({
      ok: true,
      decisions: [
        { studentId: 's1', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_8' },
        { studentId: 's2', outcome: 'GRADUATED', notes: 'Well done' },
      ],
    });
  });
  it('refuses a Promoted or Retained row with no next grade, naming the student', () => {
    expect(buildDecisions([row({})], { s1: { outcome: 'RETAINED', nextGradeLevel: '', notes: '' } })).toEqual({
      ok: false,
      error: 'Choose a next grade for Ama Kollie.',
    });
  });
});

describe('draftFromRow', () => {
  it('copies the recorded decision', () => {
    expect(draftFromRow(row({ outcome: 'RETAINED', nextGradeLevel: 'GRADE_7', notes: 'x' }))).toEqual({
      outcome: 'RETAINED', nextGradeLevel: 'GRADE_7', notes: 'x',
    });
    expect(draftFromRow(row({}))).toEqual({ outcome: '', nextGradeLevel: '', notes: '' });
  });
});
