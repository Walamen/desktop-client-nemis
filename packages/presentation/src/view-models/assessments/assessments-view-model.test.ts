import { describe, expect, it } from 'vitest';
import { AssessmentType, GradeStatus } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { AssessmentsViewModel } from './assessments-view-model';

function build() {
  const { app } = createTestApplication();
  const notifications = new NotificationStore();
  const vm = new AssessmentsViewModel({ assessments: app.assessments, notifications });
  return { vm, notifications };
}

const gradeDto = {
  studentId: 'stu-1',
  subjectId: 'sub-1',
  obtained: 45,
  total: 100,
  status: GradeStatus.SUBMITTED,
} as const;

describe('AssessmentsViewModel', () => {
  it('records a grade and loads formatted rows for the student', async () => {
    const { vm } = build();
    const outcome = await vm.recordGrade(gradeDto);
    expect(outcome.ok).toBe(true);
    const grades = vm.store.getState().grades;
    expect(grades.status).toBe('success');
    if (grades.status === 'success') {
      expect(grades.data[0]?.marks).toBe('45 / 100');
      expect(grades.data[0]?.percent).toBe('45%');
      expect(grades.data[0]?.status.label).toBe('Submitted');
    }
    expect(vm.store.getState().studentId).toBe('stu-1');
  });

  it('publishes a submitted grade and refreshes the rows', async () => {
    const { vm } = build();
    const recorded = await vm.recordGrade(gradeDto);
    if (!recorded.ok) throw new Error('record failed');
    const outcome = await vm.publishGrade({ gradeId: recorded.data.id, actorId: 'usr-1' });
    expect(outcome.ok).toBe(true);
    const grades = vm.store.getState().grades;
    if (grades.status === 'success') {
      expect(grades.data[0]?.status).toEqual({ label: 'Published', badge: 'success' });
    } else {
      throw new Error(`expected success, got ${grades.status}`);
    }
  });

  it('publishing a draft grade fails with an error notification', async () => {
    const { vm, notifications } = build();
    const recorded = await vm.recordGrade({ ...gradeDto, status: GradeStatus.DRAFT });
    if (!recorded.ok) throw new Error('record failed');
    const outcome = await vm.publishGrade({ gradeId: recorded.data.id, actorId: 'usr-1' });
    expect(outcome.ok).toBe(false);
    const kinds = notifications.store.getState().notifications.map((n) => n.kind);
    expect(kinds).toContain('error');
  });

  it('creates an assessment and exposes it as lastAssessment', async () => {
    const { vm } = build();
    const outcome = await vm.createAssessment({
      classId: 'cls-1',
      subjectId: 'sub-1',
      gradingPeriodId: 'gp-1',
      type: AssessmentType.EXAM,
      totalMarks: 100,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.data.typeLabel).toBe('Exam');
    const last = vm.store.getState().lastAssessment;
    expect(last.status).toBe('success');
  });

  it('reports empty when the student has no grades', async () => {
    const { vm } = build();
    await vm.loadGrades('stu-none');
    expect(vm.store.getState().grades.status).toBe('empty');
  });
});
