import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { ValidationError } from '../../errors';
import { selectSelectedStudent, selectStudentRows } from '../../selectors/students-selectors';
import { NotificationStore } from '../../stores/notification-store';
import { SessionStore } from '../../stores/session-store';
import { createTestApplication } from '../../testing/create-test-application';
import { StudentsViewModel } from './students-view-model';

const dto = {
  institutionId: 'inst-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  admissionNumber: 'ADM-001',
  dateOfBirth: '2015-06-01',
  gender: Gender.FEMALE,
} as const;

function build() {
  const { app, ports } = createTestApplication();
  const notifications = new NotificationStore();
  const session = new SessionStore();
  const vm = new StudentsViewModel({ students: app.students, notifications, session });
  return { app, ports, notifications, session, vm };
}

describe('StudentsViewModel', () => {
  it('loads a page of students with formatted rows and total count', async () => {
    const { app, vm } = build();
    await app.students.create(dto);
    await app.students.create({ ...dto, firstName: 'Grace', admissionNumber: 'ADM-002' });
    await vm.loadStudents();
    const state = vm.store.getState();
    expect(state.list.status).toBe('success');
    expect(state.pagination.totalCount).toBe(2);
    const rows = selectStudentRows(state);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status.label).toBe('Active');
    expect(rows[0]?.gradeLevel).toBe('—'); // no gradeLevel in dto
  });

  it('reports empty when no students exist', async () => {
    const { vm } = build();
    await vm.loadStudents();
    expect(vm.store.getState().list.status).toBe('empty');
  });

  it('filters rows by keyword via the selector', async () => {
    const { app, vm } = build();
    await app.students.create(dto);
    await app.students.create({ ...dto, firstName: 'Grace', admissionNumber: 'ADM-002' });
    await vm.loadStudents();
    vm.setKeyword('grace');
    const rows = selectStudentRows(vm.store.getState());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fullName).toBe('Grace Lovelace');
  });

  it('createStudent succeeds, notifies, and refreshes the list', async () => {
    const { vm, notifications } = build();
    const outcome = await vm.createStudent(dto);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.data.fullName).toBe('Ada Lovelace');
    expect(vm.store.getState().submission).toBe('submitted');
    expect(vm.store.getState().list.status).toBe('success');
    expect(notifications.store.getState().notifications[0]?.kind).toBe('success');
  });

  it('createStudent with a missing required field fails with ValidationError', async () => {
    const { vm, notifications } = build();
    const outcome = await vm.createStudent({
      ...dto,
      firstName: undefined as unknown as string,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBeInstanceOf(ValidationError);
    expect(vm.store.getState().submission).toBe('failed');
    expect(notifications.store.getState().notifications[0]?.kind).toBe('error');
  });

  it('selectStudent stores the selection and loads formatted details', async () => {
    const { app, vm, session } = build();
    const created = await app.students.create(dto);
    await vm.loadStudents();
    await vm.selectStudent(created.data.id);
    expect(session.store.getState().selectedStudentId).toBe(created.data.id);
    const details = vm.store.getState().details;
    expect(details.status).toBe('success');
    if (details.status === 'success') {
      expect(details.data.dateOfBirth).toBe('01 Jun 2015');
      expect(details.data.gender).toBe('Female');
      expect(details.data.guardianCount).toBe(0);
    }
    expect(selectSelectedStudent(session.store.getState(), vm.store.getState())?.id).toBe(
      created.data.id,
    );
    await vm.selectStudent(null);
    expect(vm.store.getState().details.status).toBe('idle');
  });

  it('deactivateStudent updates the open details and list row status', async () => {
    const { app, vm } = build();
    const created = await app.students.create(dto);
    await vm.loadStudents();
    await vm.selectStudent(created.data.id); // open this student's details
    const outcome = await vm.deactivateStudent({ studentId: created.data.id, actorId: 'usr-1' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.data.status.label).toBe('Inactive');
    const details = vm.store.getState().details;
    expect(details.status).toBe('success');
    if (details.status === 'success') expect(details.data.status.label).toBe('Inactive');
    const rows = selectStudentRows(vm.store.getState());
    expect(rows[0]?.status.label).toBe('Inactive');
  });

  it('deactivateStudent does not clobber details for a different open student', async () => {
    const { app, vm } = build();
    const a = await app.students.create(dto);
    const b = await app.students.create({ ...dto, firstName: 'Grace', admissionNumber: 'ADM-002' });
    await vm.selectStudent(a.data.id); // details shows A
    await vm.deactivateStudent({ studentId: b.data.id, actorId: 'usr-1' });
    const details = vm.store.getState().details;
    expect(details.status).toBe('success');
    if (details.status === 'success') {
      expect(details.data.id).toBe(a.data.id);
      expect(details.data.status.label).toBe('Active'); // A untouched
    }
  });

  it('linkGuardian surfaces a business failure as an error notification', async () => {
    const { app, vm, notifications } = build();
    const created = await app.students.create(dto);
    const outcome = await vm.linkGuardian({
      studentId: created.data.id,
      guardianId: 'missing-guardian',
      isPrimary: true,
      actorId: 'usr-1',
    });
    expect(outcome.ok).toBe(false);
    expect(notifications.store.getState().notifications[0]?.kind).toBe('error');
    expect(vm.store.getState().submission).toBe('failed');
  });
});
