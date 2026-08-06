import { describe, expect, it } from 'vitest';
import { AttendanceStatus, Gender } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { AttendanceViewModel } from './attendance-view-model';

async function build() {
  const { app } = createTestApplication();
  const student = await app.students.create({
    institutionId: 'inst-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    admissionNumber: 'ADM-001',
    dateOfBirth: '2015-06-01',
    gender: Gender.FEMALE,
  });
  const notifications = new NotificationStore();
  const vm = new AttendanceViewModel({ attendance: app.attendance, notifications });
  return { vm, notifications, studentId: student.data.id };
}

describe('AttendanceViewModel', () => {
  it('records attendance and loads formatted rows for class and date', async () => {
    const { vm, studentId } = await build();
    const outcome = await vm.recordAttendance({
      studentId,
      classId: 'cls-1',
      date: '2026-07-19',
      status: AttendanceStatus.PRESENT,
    });
    expect(outcome.ok).toBe(true);
    const records = vm.store.getState().records;
    expect(records.status).toBe('success');
    if (records.status === 'success') {
      expect(records.data[0]?.status).toEqual({ label: 'Present', badge: 'success' });
      expect(records.data[0]?.date).toBe('19 Jul 2026');
    }
    expect(vm.store.getState().classId).toBe('cls-1');
    expect(vm.store.getState().date).toBe('2026-07-19');
  });

  it('reports empty for a class/date with no records', async () => {
    const { vm } = await build();
    await vm.loadAttendance('cls-9', '2026-07-19');
    expect(vm.store.getState().records.status).toBe('empty');
  });

  it('scopes loadAttendance/recordAttendance to a subject when given', async () => {
    const { vm, studentId } = await build();
    await vm.recordAttendance({
      studentId,
      classId: 'cls-1',
      subjectId: 'subj-math',
      date: '2026-07-19',
      status: AttendanceStatus.LATE,
      remarks: 'Bus was late',
    });
    expect(vm.store.getState().subjectId).toBe('subj-math');
    const records = vm.store.getState().records;
    expect(records.status).toBe('success');
    if (records.status === 'success') {
      expect(records.data[0]?.subjectId).toBe('subj-math');
      expect(records.data[0]?.remarks).toBe('Bus was late');
    }

    // A different subject on the same class/date sees no records of its own.
    await vm.loadAttendance('cls-1', '2026-07-19', 'subj-science');
    expect(vm.store.getState().records.status).toBe('empty');
  });

  it('recording for an unknown student fails with an error notification', async () => {
    const { vm, notifications } = await build();
    const outcome = await vm.recordAttendance({
      studentId: 'missing',
      classId: 'cls-1',
      date: '2026-07-19',
      status: AttendanceStatus.ABSENT,
    });
    expect(outcome.ok).toBe(false);
    expect(notifications.store.getState().notifications[0]?.kind).toBe('error');
  });
});
