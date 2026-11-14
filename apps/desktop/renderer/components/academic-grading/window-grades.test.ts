import { describe, expect, it } from 'vitest';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { buildWindowGrades } from './window-grades';

function grade(over: SchoolAdminRecord = {}): SchoolAdminRecord {
  return {
    id: 'g1',
    studentId: 'st1',
    classId: 'c1',
    subjectId: 'sub1',
    gradingPeriodId: 'p1',
    assessmentId: null,
    marksObtained: 78.6,
    maxMarks: 100,
    percentage: 78.6,
    letterGrade: 'B',
    status: 'SUBMITTED',
    isPublished: false,
    ...over,
  };
}

function assessment(over: SchoolAdminRecord = {}): SchoolAdminRecord {
  return {
    id: 'a1',
    templateId: 't1',
    classId: 'c1',
    subjectId: 'sub1',
    gradingPeriodId: 'p1',
    name: 'Quiz 1',
    type: 'QUIZ',
    totalMarks: 20,
    weight: 20,
    date: '2026-02-01',
    ...over,
  };
}

describe('buildWindowGrades', () => {
  it('lists classes from grade rows and subjects from assessments and grades', () => {
    const view = buildWindowGrades(
      [grade(), grade({ id: 'g2', classId: 'c2', subjectId: 'sub2' })],
      [assessment({ classId: 'c1', subjectId: 'sub3' })],
    );
    expect(view.classIds).toEqual(['c1', 'c2']);
    expect(view.subjectIdsFor('c1')).toEqual(['sub3', 'sub1']);
    expect(view.subjectIdsFor('c2')).toEqual(['sub2']);
  });
  it('orders assessments by date then name and reads marks per assessment', () => {
    const view = buildWindowGrades(
      [grade({ id: 'g1', assessmentId: 'a2', marksObtained: 41, maxMarks: 50 }), grade({ id: 'g2', assessmentId: 'a1', marksObtained: 18, maxMarks: 20 })],
      [assessment({ id: 'a2', name: 'Project', totalMarks: 50, weight: 30, date: '2026-02-10' }), assessment({ id: 'a1', date: '2026-02-01' })],
    );
    expect(view.assessmentsFor('c1', 'sub1').map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(view.marksFor('st1', 'a1')).toBe(18);
    expect(view.marksFor('st1', 'a2')).toBe(41);
    expect(view.marksFor('st1', 'missing')).toBeNull();
  });
  it('takes the final only from the row with no assessmentId', () => {
    const view = buildWindowGrades(
      [grade({ id: 'g1', assessmentId: 'a1', marksObtained: 18, maxMarks: 20, percentage: null, letterGrade: null, status: 'DRAFT' }), grade({ id: 'g2' })],
      [assessment()],
    );
    expect(view.finalFor('st1', 'c1', 'sub1')).toEqual({ marksObtained: 78.6, maxMarks: 100, percentage: 78.6, letterGrade: 'B', status: 'SUBMITTED' });
  });
  it('returns null final and keeps marks for a student without a final row', () => {
    const view = buildWindowGrades([grade({ assessmentId: 'a1', marksObtained: 18 })], [assessment()]);
    expect(view.finalFor('st1', 'c1', 'sub1')).toBeNull();
    expect(view.marksFor('st1', 'a1')).toBe(18);
  });
  it('ignores a per-assessment row whose assessment is not in the period, but keeps its class and subject', () => {
    const view = buildWindowGrades([grade({ assessmentId: 'ghost', marksObtained: 5 })], []);
    expect(view.assessmentsFor('c1', 'sub1')).toEqual([]);
    expect(view.finalFor('st1', 'c1', 'sub1')).toBeNull();
    expect(view.marksFor('st1', 'ghost')).toBeNull();
    expect(view.classIds).toEqual(['c1']);
    expect(view.subjectIdsFor('c1')).toEqual(['sub1']);
  });
  it('keeps a null percentage so the page can fall back to marks/max', () => {
    const view = buildWindowGrades([grade({ percentage: null, letterGrade: null, marksObtained: 72, maxMarks: 100 })], []);
    expect(view.finalFor('st1', 'c1', 'sub1')).toMatchObject({ percentage: null, letterGrade: null, marksObtained: 72, maxMarks: 100 });
  });
  it('exam-type period: subject listed with zero assessment columns', () => {
    const view = buildWindowGrades([grade({ examScore: 72 })], []);
    expect(view.subjectIdsFor('c1')).toEqual(['sub1']);
    expect(view.assessmentsFor('c1', 'sub1')).toEqual([]);
  });
  it('summary counts finals only, SUBMITTED and PUBLISHED separately', () => {
    const view = buildWindowGrades(
      [
        grade({ id: 'f1' }),
        grade({ id: 'f2', studentId: 'st2', status: 'PUBLISHED' }),
        grade({ id: 'f3', studentId: 'st3', status: 'DRAFT' }),
        grade({ id: 'f4', studentId: 'st1', subjectId: 'sub2', status: 'SUBMITTED' }),
        grade({ id: 'x1', studentId: 'st9', assessmentId: 'a1', status: 'SUBMITTED' }),
        grade({ id: 'c2', studentId: 'st4', classId: 'c2', status: 'LOCKED' }),
      ],
      [assessment()],
    );
    expect(view.summary).toEqual({ classes: 2, studentsGraded: 4, finalsSubmitted: 2, finalsPublished: 1 });
  });
});
