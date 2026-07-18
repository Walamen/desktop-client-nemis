import { describe, expect, it } from 'vitest';
import { AssessmentType, GradeStatus, WindowStatus } from '@nemis-desktop/types';
import { Assessment } from './entities/assessment';
import { Grade } from './entities/grade';
import { CanPublishGrade } from './specifications/can-publish-grade';
import { IsGradeEntryWindowOpen } from './specifications/is-grade-entry-window-open';
import { InvalidStateException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

describe('Assessment', () => {
  it('creates with marks and emits AssessmentCreated', () => {
    const assessment = Assessment.create({
      id: 'as-1',
      classId: 'c-1',
      subjectId: 's-1',
      gradingPeriodId: 'gp-1',
      type: AssessmentType.TEST,
      totalMarks: 50,
      occurredAt: ISO,
    });
    expect(assessment.marks.total).toBe(50);
    expect(assessment.pullDomainEvents()[0]?.name).toBe('AssessmentCreated');
  });
});

describe('Grade', () => {
  it('publishes from a publishable status and emits GradePublished', () => {
    const grade = Grade.create({
      id: 'g-1',
      studentId: 'stu-1',
      subjectId: 's-1',
      obtained: 42,
      total: 50,
      status: GradeStatus.APPROVED,
      occurredAt: ISO,
    });
    grade.pullDomainEvents();
    grade.publish('teacher-1', ISO);
    expect(grade.isPublished).toBe(true);
    expect(grade.status).toBe(GradeStatus.PUBLISHED);
    expect(grade.pullDomainEvents()[0]?.name).toBe('GradePublished');
  });

  it('cannot publish a locked grade', () => {
    const grade = Grade.create({
      id: 'g-2',
      studentId: 'stu-1',
      subjectId: 's-1',
      obtained: 10,
      total: 50,
      status: GradeStatus.LOCKED,
      occurredAt: ISO,
    });
    expect(() => grade.publish('teacher-1', ISO)).toThrow(InvalidStateException);
  });
});

describe('grading specifications', () => {
  it('CanPublishGrade requires publishable status and an open window', () => {
    const spec = new CanPublishGrade();
    expect(spec.isSatisfiedBy({ status: GradeStatus.APPROVED, windowOpen: true })).toBe(true);
    expect(spec.isSatisfiedBy({ status: GradeStatus.DRAFT, windowOpen: true })).toBe(false);
    expect(spec.isSatisfiedBy({ status: GradeStatus.APPROVED, windowOpen: false })).toBe(false);
  });

  it('IsGradeEntryWindowOpen is satisfied only for OPEN', () => {
    const spec = new IsGradeEntryWindowOpen();
    expect(spec.isSatisfiedBy({ status: WindowStatus.OPEN })).toBe(true);
    expect(spec.isSatisfiedBy({ status: WindowStatus.CLOSED })).toBe(false);
  });
});
