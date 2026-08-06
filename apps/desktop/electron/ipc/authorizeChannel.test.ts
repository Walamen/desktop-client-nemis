import { describe, expect, it } from 'vitest';
import { IpcChannels, SystemRole } from '@nemis-desktop/types';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { authorizeChannel } from './authorizeChannel';

function workspace(role?: string): WorkspaceManager {
  return {
    get active() {
      if (!role) throw new Error('locked');
      return { user: { role } };
    },
  } as unknown as WorkspaceManager;
}

describe('authorizeChannel', () => {
  it('allows authentication while no workspace is open', () => {
    expect(() => authorizeChannel(IpcChannels.AUTH_LOGIN, workspace())).not.toThrow();
  });

  it('requires an unlocked workspace for protected reads', () => {
    expect(() => authorizeChannel(IpcChannels.STUDENT_LIST, workspace())).toThrow(/Sign in/);
  });

  it('blocks teacher and regional roles from school-management mutations', () => {
    for (const role of [
      SystemRole.TEACHER,
      SystemRole.COUNTY_ADMIN,
      SystemRole.DEO,
      SystemRole.MINISTRY_ADMIN,
    ]) {
      expect(() => authorizeChannel(IpcChannels.STUDENT_CREATE, workspace(role))).toThrow(
        /school administrator/,
      );
    }
  });

  it('allows teacher attendance but blocks unrelated roles', () => {
    expect(() =>
      authorizeChannel(IpcChannels.ATTENDANCE_RECORD, workspace(SystemRole.TEACHER)),
    ).not.toThrow();
    expect(() =>
      authorizeChannel(IpcChannels.ATTENDANCE_RECORD, workspace(SystemRole.DEO)),
    ).toThrow(/Attendance/);
  });

  it('allows a teacher to load their class list and roster for attendance', () => {
    expect(() =>
      authorizeChannel(IpcChannels.CLASS_LIST, workspace(SystemRole.TEACHER)),
    ).not.toThrow();
    expect(() =>
      authorizeChannel(IpcChannels.STUDENT_LIST, workspace(SystemRole.TEACHER)),
    ).not.toThrow();
  });

  it('blocks non-staff roles from the class list and roster', () => {
    expect(() => authorizeChannel(IpcChannels.CLASS_LIST, workspace(SystemRole.DEO))).toThrow(
      /Attendance/,
    );
    expect(() => authorizeChannel(IpcChannels.STUDENT_LIST, workspace(SystemRole.DEO))).toThrow(
      /Attendance/,
    );
  });

  it('blocks teachers from institution-wide school-admin reads', () => {
    for (const channel of [
      IpcChannels.DASHBOARD_GET_OVERVIEW,
      IpcChannels.TEACHER_LIST,
      IpcChannels.TIMETABLE_LIST,
      IpcChannels.STUDENT_GET_STATISTICS,
    ]) {
      expect(() => authorizeChannel(channel, workspace(SystemRole.TEACHER))).toThrow(
        /school administrator/,
      );
    }
  });

  it('allows school admins to read institution-wide data', () => {
    for (const channel of [
      IpcChannels.DASHBOARD_GET_OVERVIEW,
      IpcChannels.TEACHER_LIST,
      IpcChannels.TIMETABLE_LIST,
      IpcChannels.STUDENT_GET_STATISTICS,
    ]) {
      expect(() =>
        authorizeChannel(channel, workspace(SystemRole.INSTITUTION_ADMIN)),
      ).not.toThrow();
    }
  });

  it('allows a teacher to load their own timetable and the school period schedule', () => {
    expect(() =>
      authorizeChannel(IpcChannels.TIMETABLE_TEACHER, workspace(SystemRole.TEACHER)),
    ).not.toThrow();
    expect(() =>
      authorizeChannel(IpcChannels.TIMETABLE_PERIODS, workspace(SystemRole.TEACHER)),
    ).not.toThrow();
    expect(() =>
      authorizeChannel(IpcChannels.TIMETABLE_TEACHER, workspace(SystemRole.DEO)),
    ).toThrow(/Attendance/);
  });

  it('allows a teacher to load the current academic year and term list for the gradebook', () => {
    expect(() =>
      authorizeChannel(IpcChannels.ACADEMIC_YEAR_GET_CURRENT, workspace(SystemRole.TEACHER)),
    ).not.toThrow();
    expect(() =>
      authorizeChannel(IpcChannels.TERM_LIST, workspace(SystemRole.TEACHER)),
    ).not.toThrow();
    expect(() =>
      authorizeChannel(IpcChannels.ACADEMIC_YEAR_GET_CURRENT, workspace(SystemRole.DEO)),
    ).toThrow(/Attendance/);
    expect(() =>
      authorizeChannel(IpcChannels.TERM_LIST, workspace(SystemRole.DEO)),
    ).toThrow(/Attendance/);
  });

  it('leaves cross-portal channels open to any authenticated role, including TEACHER_GET_DASHBOARD', () => {
    for (const channel of [
      IpcChannels.IDENTITY_GET_CURRENT_USER,
      IpcChannels.DEVICE_GET_INFO,
      IpcChannels.SETTINGS_GET,
      IpcChannels.TEACHER_GET_DASHBOARD,
    ]) {
      expect(() => authorizeChannel(channel, workspace(SystemRole.TEACHER))).not.toThrow();
      expect(() => authorizeChannel(channel, workspace(SystemRole.DEO))).not.toThrow();
    }
  });

  it('allows only TEACHER on assignment channels — not even the school admin', () => {
    expect(() =>
      authorizeChannel(IpcChannels.ASSIGNMENT_LIST, workspace(SystemRole.TEACHER)),
    ).not.toThrow();
    expect(() =>
      authorizeChannel(IpcChannels.ASSIGNMENT_CREATE, workspace(SystemRole.INSTITUTION_ADMIN)),
    ).toThrow(/teachers/);
    expect(() =>
      authorizeChannel(IpcChannels.ASSIGNMENT_GRADE_SUBMISSION, workspace(SystemRole.DEO)),
    ).toThrow(/teachers/);
  });
});
