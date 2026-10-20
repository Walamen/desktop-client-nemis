import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@nemis-desktop/shared';
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

  it('allows every county channel only for a county administrator', () => {
    const channels = [
      IpcChannels.COUNTY_GET_DASHBOARD,
      IpcChannels.COUNTY_LIST_DISTRICTS,
      IpcChannels.COUNTY_GET_DISTRICT,
      IpcChannels.COUNTY_ASSIGN_DEO,
      IpcChannels.COUNTY_REMOVE_DEO,
      IpcChannels.COUNTY_LIST_SCHOOLS,
      IpcChannels.COUNTY_GET_SCHOOL,
      IpcChannels.COUNTY_GET_REGISTRATION_CONTEXT,
      IpcChannels.COUNTY_REGISTER_SCHOOLS,
      IpcChannels.COUNTY_RESUBMIT_SCHOOL_REGISTRATION,
      IpcChannels.COUNTY_DISCARD_SCHOOL_REGISTRATION,
      IpcChannels.COUNTY_GET_SCHOOL_REGISTRATIONS,
      IpcChannels.COUNTY_SETTLE_SCHOOL_REGISTRATIONS,
      IpcChannels.COUNTY_LIST_STUDENTS,
      IpcChannels.COUNTY_GET_STUDENT,
      IpcChannels.COUNTY_GET_STUDENT_RECORD,
      IpcChannels.COUNTY_LIST_GUARDIANS,
      IpcChannels.COUNTY_GET_GUARDIAN,
      IpcChannels.COUNTY_LIST_TEACHERS,
      IpcChannels.COUNTY_GET_TEACHER,
      IpcChannels.COUNTY_FINANCE_DASHBOARD,
      IpcChannels.COUNTY_FINANCE_SCHOOLS,
      IpcChannels.COUNTY_FINANCE_PAYMENTS,
      IpcChannels.COUNTY_FINANCE_FEE_RULES,
      IpcChannels.COUNTY_LIST_USERS,
      IpcChannels.COUNTY_GET_USER_OPTIONS,
      IpcChannels.COUNTY_SET_USER_ACTIVE,
      IpcChannels.COUNTY_ASSIGN_USER,
      IpcChannels.COUNTY_GET_ACTIVATION_LINK,
      IpcChannels.COUNTY_CREATE_USER,
      IpcChannels.COUNTY_BULK_CREATE_USERS,
    ];
    for (const channel of channels) {
      expect(() => authorizeChannel(channel, workspace(SystemRole.COUNTY_ADMIN))).not.toThrow();
      for (const role of [
        SystemRole.INSTITUTION_ADMIN,
        SystemRole.TEACHER,
        SystemRole.DEO,
        SystemRole.MINISTRY_ADMIN,
      ]) {
        expect(() => authorizeChannel(channel, workspace(role))).toThrow(/county administrator/);
      }
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
      IpcChannels.STUDENT_CREATE_SYNCED,
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
      IpcChannels.STUDENT_CREATE_SYNCED,
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

  it.each([
    'registry:lookup',
    'registry:claim',
    'registry:request',
    'registry:bulk-claim',
    'transfer:create',
    'transfer:review',
    'transfer:cancel',
    'transfer:search-schools',
    'grade-completion:cohort',
    'grade-completion:save',
    'grade-completion:discard',
    'grade-completion:guidance',
  ] as const)('%s is school-admin only', (channel) => {
    expect(() => authorizeChannel(channel, workspace(SystemRole.TEACHER))).toThrow(
      ForbiddenError,
    );
    expect(() =>
      authorizeChannel(channel, workspace(SystemRole.INSTITUTION_ADMIN)),
    ).not.toThrow();
  });
});
