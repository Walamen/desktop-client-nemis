import { describe, expect, it } from 'vitest';
import { AssignmentStatus, AssignmentType } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { AssignmentsViewModel } from './assignments-view-model';

function build() {
  const { app, ports } = createTestApplication();
  const notifications = new NotificationStore();
  const vm = new AssignmentsViewModel({ assignments: app.assignments, notifications });
  return { vm, notifications, ports };
}

const createDto = {
  classId: 'cls-1',
  teacherId: 'staff-1',
  title: 'Chapter 5 Homework',
  type: AssignmentType.HOMEWORK,
  status: AssignmentStatus.DRAFT,
  dueDate: '2026-08-10',
};

describe('AssignmentsViewModel', () => {
  it('creates an assignment and loads the (formatted) list', async () => {
    const { vm } = build();
    const outcome = await vm.createAssignment(createDto);
    expect(outcome.ok).toBe(true);
    const list = vm.store.getState().list;
    expect(list.status).toBe('success');
    if (list.status === 'success') {
      expect(list.data[0]?.title).toBe('Chapter 5 Homework');
      expect(list.data[0]?.status).toEqual({ label: 'Draft', badge: 'neutral' });
      expect(list.data[0]?.dueDate).toBe('10 Aug 2026');
    }
  });

  it('loadAssignments only returns the requesting teacher\'s assignments', async () => {
    const { vm } = build();
    await vm.createAssignment(createDto);
    await vm.createAssignment({ ...createDto, teacherId: 'staff-2' });
    await vm.loadAssignments('staff-1');
    const list = vm.store.getState().list;
    expect(list.status === 'success' && list.data).toHaveLength(1);
  });

  it('setFilters scopes the next loadAssignments call', async () => {
    const { vm } = build();
    await vm.createAssignment(createDto);
    await vm.createAssignment({ ...createDto, classId: 'cls-2' });
    vm.setFilters({ classId: 'cls-2' });
    await vm.loadAssignments('staff-1');
    const list = vm.store.getState().list;
    expect(list.status === 'success' && list.data).toHaveLength(1);
    expect(list.status === 'success' && list.data[0]?.classId).toBe('cls-2');
  });

  it('loadAssignment populates the detail view', async () => {
    const { vm } = build();
    const created = await vm.createAssignment(createDto);
    await vm.loadAssignment(created.ok ? created.data.id : '', 'staff-1');
    const detail = vm.store.getState().detail;
    expect(detail.status).toBe('success');
    if (detail.status === 'success') expect(detail.data.title).toBe('Chapter 5 Homework');
  });

  it('updateAssignment applies a partial patch and refreshes the list', async () => {
    const { vm } = build();
    const created = await vm.createAssignment(createDto);
    const id = created.ok ? created.data.id : '';
    const outcome = await vm.updateAssignment({ id, teacherId: 'staff-1', status: AssignmentStatus.ACTIVE });
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.data.status.label).toBe('Active');
    const detail = vm.store.getState().detail;
    expect(detail.status === 'success' && detail.data.status.label).toBe('Active');
  });

  it('deleteAssignment removes it from the list', async () => {
    const { vm, ports } = build();
    const created = await vm.createAssignment(createDto);
    const id = created.ok ? created.data.id : '';
    await vm.deleteAssignment({ id, teacherId: 'staff-1' });
    expect(ports.assignments.findById(id)).toBeNull();
  });

  it('gradeSubmission grades a synthesized PENDING row and refreshes the submissions list', async () => {
    const { vm, ports } = build();
    const created = await vm.createAssignment(createDto);
    const assignmentId = created.ok ? created.data.id : '';
    ports.assignmentSubmissions.enrolledStudentsByAssignment.set(assignmentId, [
      { studentId: 'stu-1', studentName: 'Ada Lovelace', admissionNumber: 'ADM-001' },
    ]);

    await vm.loadSubmissions(assignmentId, 'staff-1');
    const before = vm.store.getState().submissions;
    expect(before.status === 'success' && before.data[0]?.status.label).toBe('Pending');

    const graded = await vm.gradeSubmission({
      assignmentId,
      studentId: 'stu-1',
      teacherId: 'staff-1',
      grade: 92,
      feedback: 'Excellent',
    });
    expect(graded.ok).toBe(true);
    const after = vm.store.getState().submissions;
    expect(after.status === 'success' && after.data[0]?.status.label).toBe('Graded');
    expect(after.status === 'success' && after.data[0]?.grade).toBe(92);
  });

  it('rejects grading another teacher\'s assignment with an error notification', async () => {
    const { vm, notifications } = build();
    const created = await vm.createAssignment(createDto);
    const assignmentId = created.ok ? created.data.id : '';
    const outcome = await vm.gradeSubmission({
      assignmentId,
      studentId: 'stu-1',
      teacherId: 'someone-else',
      grade: 50,
    });
    expect(outcome.ok).toBe(false);
    expect(notifications.store.getState().notifications.at(-1)?.kind).toBe('error');
  });
});
