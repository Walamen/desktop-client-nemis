import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@nemis-desktop/shared';
import { IpcChannels, isSchoolModule, SystemRole, type IpcChannel } from '@nemis-desktop/types';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import {
  authorizeChannel,
  COUNTY_ADMIN_CHANNELS,
  GOVERNMENT_YEAR_ARCHIVE_CHANNELS,
  PUBLIC_CHANNELS,
  REPORT_CARD_CHANNELS,
  SCHOOL_ADMIN_CHANNELS,
  SCHOOL_STAFF_CHANNELS,
  TEACHER_ONLY_CHANNELS,
  type ChannelAccess,
} from './authorizeChannel';

function workspace(role?: string, modules?: string[]): WorkspaceManager {
  return {
    get active() {
      if (!role) throw new Error('locked');
      return { user: { role, modules } };
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

  it('lets only a school administrator start an academic year', () => {
    expect(() =>
      authorizeChannel(IpcChannels.ACADEMIC_YEAR_START, workspace(SystemRole.INSTITUTION_ADMIN)),
    ).not.toThrow();
    for (const role of [SystemRole.TEACHER, SystemRole.COUNTY_ADMIN, SystemRole.DEO, SystemRole.MINISTRY_ADMIN]) {
      expect(() => authorizeChannel(IpcChannels.ACADEMIC_YEAR_START, workspace(role))).toThrow(
        /school administrator/,
      );
    }
  });

  it('lets only a school administrator copy a year structure', () => {
    expect(() =>
      authorizeChannel(IpcChannels.ACADEMIC_YEAR_COPY_STRUCTURE, workspace(SystemRole.INSTITUTION_ADMIN)),
    ).not.toThrow();
    for (const role of [SystemRole.TEACHER, SystemRole.COUNTY_ADMIN, SystemRole.DEO, SystemRole.MINISTRY_ADMIN]) {
      expect(() => authorizeChannel(IpcChannels.ACADEMIC_YEAR_COPY_STRUCTURE, workspace(role))).toThrow(
        /school administrator/,
      );
    }
  });

  it('lets only a school administrator use the transfer record review channels', () => {
    for (const channel of [
      IpcChannels.TRANSFER_REVIEW,
      IpcChannels.TRANSFER_RECORD_PREVIEW,
      IpcChannels.TRANSFER_MATCHING_DRAFT_SAVE,
      IpcChannels.TRANSFER_MATCHING_DRAFT_CLEAR,
    ]) {
      expect(() => authorizeChannel(channel, workspace(SystemRole.INSTITUTION_ADMIN))).not.toThrow();
      for (const role of [SystemRole.TEACHER, SystemRole.COUNTY_ADMIN, SystemRole.DEO, SystemRole.MINISTRY_ADMIN]) {
        expect(() => authorizeChannel(channel, workspace(role))).toThrow(/school administrator/);
      }
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
      IpcChannels.COUNTY_REPORT_OPTIONS,
      IpcChannels.COUNTY_REPORT_SCHOOLS,
      IpcChannels.COUNTY_ENROLLMENT_REPORT,
      IpcChannels.COUNTY_ATTENDANCE_REPORT,
      IpcChannels.COUNTY_ACADEMIC_REPORT,
      IpcChannels.COUNTY_STAFF_REPORT,
      IpcChannels.COUNTY_MESSAGING_OVERVIEW,
      IpcChannels.COUNTY_MESSAGING_MESSAGES,
      IpcChannels.COUNTY_MESSAGING_START,
      IpcChannels.COUNTY_MESSAGING_SEND,
      IpcChannels.COUNTY_MESSAGING_MARK_READ,
      IpcChannels.COUNTY_NOTIFICATIONS_LIST,
      IpcChannels.COUNTY_NOTIFICATIONS_MARK_READ,
      IpcChannels.COUNTY_NOTIFICATIONS_MARK_ALL_READ,
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

  it('opens report cards to school administrators and teachers only', () => {
    for (const channel of [
      IpcChannels.REPORT_CARDS_LIST_FOR_STUDENT,
      IpcChannels.REPORT_CARDS_LIST_FOR_CLASS,
      IpcChannels.REPORT_CARD_GET_ISSUE,
      IpcChannels.REPORT_CARDS_LIST_ARCHIVED_YEARS,
    ]) {
      for (const role of [SystemRole.INSTITUTION_ADMIN, SystemRole.TEACHER]) {
        expect(() => authorizeChannel(channel, workspace(role))).not.toThrow();
      }
      for (const role of [SystemRole.COUNTY_ADMIN, SystemRole.DEO, SystemRole.MINISTRY_ADMIN]) {
        expect(() => authorizeChannel(channel, workspace(role))).toThrow(ForbiddenError);
        expect(() => authorizeChannel(channel, workspace(role))).toThrow(
          'Report cards are only available to school administrators and teachers.',
        );
      }
    }
  });

  it('opens year closures to district and county officers only', () => {
    for (const role of [SystemRole.DEO, SystemRole.COUNTY_ADMIN]) {
      expect(() => authorizeChannel(IpcChannels.YEAR_ARCHIVES_LIST, workspace(role))).not.toThrow();
    }
    for (const role of [SystemRole.INSTITUTION_ADMIN, SystemRole.TEACHER, SystemRole.MINISTRY_ADMIN]) {
      expect(() => authorizeChannel(IpcChannels.YEAR_ARCHIVES_LIST, workspace(role))).toThrow(ForbiddenError);
      expect(() => authorizeChannel(IpcChannels.YEAR_ARCHIVES_LIST, workspace(role))).toThrow(
        'Year closures are only available to district and county officers.',
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
    'registry:lookup-by-name',
    'registry:claim',
    'registry:request',
    'registry:bulk-claim',
    'transfer:create',
    'transfer:review',
    'transfer:cancel',
    'transfer:search-schools',
  ] as const)('%s is school-admin only', (channel) => {
    expect(() => authorizeChannel(channel, workspace(SystemRole.TEACHER))).toThrow(
      ForbiddenError,
    );
    expect(() =>
      authorizeChannel(channel, workspace(SystemRole.INSTITUTION_ADMIN)),
    ).not.toThrow();
  });
});

const BEFORE_CHANGE_CHANNELS: IpcChannel[] = [
    IpcChannels.ACADEMIC_CONTEXT_GET,
    IpcChannels.ACADEMIC_YEAR_COPY_STRUCTURE,
    IpcChannels.ACADEMIC_YEAR_CREATE,
    IpcChannels.ACADEMIC_YEAR_GET_CURRENT,
    IpcChannels.ACADEMIC_YEAR_LIST,
    IpcChannels.ACADEMIC_YEAR_START,
    IpcChannels.ACADEMIC_YEAR_UPDATE,
    IpcChannels.ATTENDANCE_LIST,
    IpcChannels.ATTENDANCE_RECORD,
    IpcChannels.CARRIED_GRADES_FOR_PERIOD,
    IpcChannels.CARRY_OVER_GET,
    IpcChannels.CARRY_OVER_LIST_LOCAL_PENDING,
    IpcChannels.CARRY_OVER_LIST_PENDING,
    IpcChannels.CARRY_OVER_SAVE,
    IpcChannels.CLASS_CREATE,
    IpcChannels.CLASS_GRADE_LEVEL_COUNTS,
    IpcChannels.CLASS_LIST,
    IpcChannels.CLASS_SET_ACTIVE,
    IpcChannels.CLASS_SUBJECT_ASSIGN,
    IpcChannels.CLASS_SUBJECT_LIST,
    IpcChannels.CLASS_SUBJECT_UNASSIGN,
    IpcChannels.CLASS_UPDATE,
    IpcChannels.CLOSE_FILL_CELLS,
    IpcChannels.CLOSE_GET_PROMOTION,
    IpcChannels.CLOSE_GET_READINESS,
    IpcChannels.CLOSE_PENDING_CHANGES_COUNT,
    IpcChannels.CLOSE_SAVE_PROMOTION,
    IpcChannels.CLOSE_YEAR,
    IpcChannels.CORRECT_GRADE,
    IpcChannels.CORRECT_OUTCOME,
    IpcChannels.CORRECT_REMARK,
    IpcChannels.DASHBOARD_GET_OVERVIEW,
    IpcChannels.REGISTRY_CLAIM,
    IpcChannels.REGISTRY_LOOKUP,
    IpcChannels.REGISTRY_LOOKUP_BY_NAME,
    IpcChannels.REGISTRY_REQUEST,
    IpcChannels.REOPEN_YEAR,
    IpcChannels.REPORT_CARDS_LIST_ARCHIVED_YEARS,
    IpcChannels.REPORT_CARDS_LIST_FOR_CLASS,
    IpcChannels.REPORT_CARDS_LIST_FOR_STUDENT,
    IpcChannels.REPORT_CARD_GET_ISSUE,
    IpcChannels.SCHOOL_GET_SUMMARY,
    IpcChannels.STUDENT_BULK_CLAIM,
    IpcChannels.STUDENT_CREATE,
    IpcChannels.STUDENT_CREATE_AND_ENROLL,
    IpcChannels.STUDENT_CREATE_GUARDIAN,
    IpcChannels.STUDENT_CREATE_SYNCED,
    IpcChannels.STUDENT_ENROLL,
    IpcChannels.STUDENT_GET,
    IpcChannels.STUDENT_GET_STATISTICS,
    IpcChannels.STUDENT_LIST,
    IpcChannels.STUDENT_LIST_ENROLLMENTS,
    IpcChannels.STUDENT_MOVE_CLASS,
    IpcChannels.STUDENT_SET_ACTIVE,
    IpcChannels.STUDENT_UPDATE,
    IpcChannels.SUBJECT_CREATE,
    IpcChannels.SUBJECT_LIST,
    IpcChannels.SUBJECT_SET_ACTIVE,
    IpcChannels.SUBJECT_UPDATE,
    IpcChannels.TEACHER_ASSIGN,
    IpcChannels.TEACHER_CREATE,
    IpcChannels.TEACHER_GET_PROFILE,
    IpcChannels.TEACHER_LIST,
    IpcChannels.TEACHER_LIST_ASSIGNMENTS,
    IpcChannels.TEACHER_REMOVE_ASSIGNMENT,
    IpcChannels.TEACHER_SET_ACTIVE,
    IpcChannels.TEACHER_UPDATE,
    IpcChannels.TEACHER_UPDATE_ASSIGNMENT,
    IpcChannels.TERM_CREATE,
    IpcChannels.TERM_DELETE,
    IpcChannels.TERM_GET_CURRENT,
    IpcChannels.TERM_LIST,
    IpcChannels.TERM_SET_CURRENT,
    IpcChannels.TERM_UPDATE,
    IpcChannels.TIMETABLE_CLASS,
    IpcChannels.TIMETABLE_CONFLICTS,
    IpcChannels.TIMETABLE_COPY,
    IpcChannels.TIMETABLE_CREATE,
    IpcChannels.TIMETABLE_DASHBOARD,
    IpcChannels.TIMETABLE_DELETE,
    IpcChannels.TIMETABLE_LIST,
    IpcChannels.TIMETABLE_PERIODS,
    IpcChannels.TIMETABLE_SUBJECT,
    IpcChannels.TIMETABLE_TEACHER,
    IpcChannels.TIMETABLE_UPDATE,
    IpcChannels.TRANSFER_CANCEL,
    IpcChannels.TRANSFER_CREATE,
    IpcChannels.TRANSFER_MATCHING_DRAFT_CLEAR,
    IpcChannels.TRANSFER_MATCHING_DRAFT_SAVE,
    IpcChannels.TRANSFER_RECORD_PREVIEW,
    IpcChannels.TRANSFER_REVIEW,
    IpcChannels.TRANSFER_SEARCH_SCHOOLS,
];

// Channels deliberately left open to every authenticated role, office staff
// included. A channel missing from every classified set and from this list
// fails the "every IPC channel is classified" test below.
const OPEN_TO_OFFICE_STAFF: IpcChannel[] = [
  // Generic school-admin records: the service enforces per-collection read
  // and write sets (readCollectionsFor / writeCollectionsFor), so the channel
  // itself is open.
  IpcChannels.SCHOOL_ADMIN_LIST,
  IpcChannels.SCHOOL_ADMIN_SAVE,
  IpcChannels.SCHOOL_ADMIN_DELETE,
  IpcChannels.SCHOOL_ADMIN_REVERSE_PAYMENT,
  // Sync: every role syncs its own workspace.
  IpcChannels.SYNC_GET_STATUS,
  IpcChannels.SYNC_LIST_CONFLICTS,
  IpcChannels.SYNC_LIST_PENDING,
  IpcChannels.SYNC_LIST_PENDING_RECORDS,
  IpcChannels.SYNC_RESOLVE_CONFLICT,
  IpcChannels.SYNC_RUN,
  // Identity, device, settings and system: cross-portal shell plumbing.
  IpcChannels.IDENTITY_GET_CURRENT_USER,
  IpcChannels.IDENTITY_HEADER_NOTIFICATIONS,
  IpcChannels.DEVICE_GET_INFO,
  IpcChannels.SETTINGS_GET,
  IpcChannels.SYSTEM_SAVE_FILE,
  // Institution list: scoped by the workspace snapshot, used by every portal.
  IpcChannels.INSTITUTION_LIST,
  // Messaging presence: every role that messages.
  IpcChannels.MESSAGING_ONLINE_USERS,
  // Used by the teacher portal and the school-admin dashboard's teacher widget.
  IpcChannels.TEACHER_GET_DASHBOARD,
  // Pure validation of a proposed timetable entry; reads no school data.
  IpcChannels.TIMETABLE_VALIDATE,
];

function isValidAccess(access: ChannelAccess): boolean {
  if (typeof access !== 'string') return access.length > 0 && access.every((m) => isSchoolModule(m));
  return access === 'BASE' || access === 'PRINCIPAL' || isSchoolModule(access);
}

function modulesOf(access: ChannelAccess): string[] {
  if (typeof access !== 'string') return [...access];
  return isSchoolModule(access) ? [access] : [];
}

const OFFICE = SystemRole.INSTITUTION_STAFF;
const ALL_MODULES = [
  'ACADEMIC_SETUP',
  'STUDENTS',
  'STAFF',
  'TEACHING',
  'FINANCE_PAYMENTS',
  'FINANCE_RULES',
  'REPORTS',
  'SCHOOL',
];
const PRINCIPAL_ONLY: IpcChannel[] = [
  IpcChannels.CLOSE_GET_READINESS,
  IpcChannels.CLOSE_FILL_CELLS,
  IpcChannels.CLOSE_GET_PROMOTION,
  IpcChannels.CLOSE_SAVE_PROMOTION,
  IpcChannels.CLOSE_YEAR,
  IpcChannels.CLOSE_PENDING_CHANGES_COUNT,
  IpcChannels.REOPEN_YEAR,
  IpcChannels.CORRECT_GRADE,
  IpcChannels.CORRECT_OUTCOME,
  IpcChannels.CORRECT_REMARK,
  IpcChannels.SCHOOL_USERS_LIST,
  IpcChannels.SCHOOL_USERS_CREATE,
  IpcChannels.SCHOOL_USERS_UPDATE,
  IpcChannels.SCHOOL_USERS_SET_ACTIVE,
];

describe('authorizeChannel for school office staff', () => {
  it('every IPC channel is classified or deliberately open', () => {
    const classified = new Set<IpcChannel>([
      ...PUBLIC_CHANNELS,
      ...SCHOOL_ADMIN_CHANNELS.keys(),
      ...SCHOOL_STAFF_CHANNELS.keys(),
      ...REPORT_CARD_CHANNELS,
      ...TEACHER_ONLY_CHANNELS,
      ...COUNTY_ADMIN_CHANNELS,
      ...GOVERNMENT_YEAR_ARCHIVE_CHANNELS,
      ...OPEN_TO_OFFICE_STAFF,
    ]);
    const unclassified = Object.values(IpcChannels).filter((channel) => !classified.has(channel));
    expect(unclassified).toEqual([]);
  });

  it('every school-admin and school-staff channel has a classification', () => {
    for (const map of [SCHOOL_ADMIN_CHANNELS, SCHOOL_STAFF_CHANNELS]) {
      for (const [channel, access] of map) {
        expect(isValidAccess(access), channel).toBe(true);
      }
    }
    const keys = [...SCHOOL_ADMIN_CHANNELS.keys(), ...SCHOOL_STAFF_CHANNELS.keys()];
    const expected = [
      ...BEFORE_CHANGE_CHANNELS,
      IpcChannels.SCHOOL_USERS_LIST,
      IpcChannels.SCHOOL_USERS_CREATE,
      IpcChannels.SCHOOL_USERS_UPDATE,
      IpcChannels.SCHOOL_USERS_SET_ACTIVE,
    ];
    expect(new Set(keys)).toEqual(new Set(expected));
  });

  it('principal-only channels refuse office staff even with every module', () => {
    for (const channel of PRINCIPAL_ONLY) {
      expect(() => authorizeChannel(channel, workspace(OFFICE, ALL_MODULES)), channel).toThrow(
        new ForbiddenError('This action is only available to the School Admin.'),
      );
      expect(() => authorizeChannel(channel, workspace(SystemRole.INSTITUTION_ADMIN)), channel).not.toThrow();
    }
  });

  it('office staff pass base channels with no modules', () => {
    for (const channel of [
      IpcChannels.DASHBOARD_GET_OVERVIEW,
      IpcChannels.STUDENT_LIST,
      IpcChannels.TIMETABLE_DASHBOARD,
    ]) {
      expect(() => authorizeChannel(channel, workspace(OFFICE, [])), channel).not.toThrow();
    }
  });

  it('a session saved without modules reads as no modules', () => {
    expect(() => authorizeChannel(IpcChannels.STUDENT_LIST, workspace(OFFICE, undefined))).not.toThrow();
    expect(() => authorizeChannel(IpcChannels.STUDENT_CREATE, workspace(OFFICE, undefined))).toThrow(
      'This account does not have access to Students & families.',
    );
  });

  it('office staff need the module', () => {
    expect(() => authorizeChannel(IpcChannels.STUDENT_CREATE, workspace(OFFICE, ['FINANCE_PAYMENTS']))).toThrow(
      new ForbiddenError('This account does not have access to Students & families.'),
    );
    expect(() => authorizeChannel(IpcChannels.STUDENT_CREATE, workspace(OFFICE, ['STUDENTS']))).not.toThrow();
    expect(() => authorizeChannel(IpcChannels.TEACHER_CREATE, workspace(OFFICE, ['STUDENTS']))).toThrow(
      'This account does not have access to Teachers & staff.',
    );
    expect(() => authorizeChannel(IpcChannels.TERM_CREATE, workspace(OFFICE, ['ACADEMIC_SETUP']))).not.toThrow();
    expect(() => authorizeChannel(IpcChannels.ATTENDANCE_RECORD, workspace(OFFICE, ['STUDENTS']))).toThrow(
      'This account does not have access to Teaching workflow.',
    );
    expect(() => authorizeChannel(IpcChannels.ATTENDANCE_RECORD, workspace(OFFICE, ['TEACHING']))).not.toThrow();
  });

  it('every module-classified channel passes with exactly its module', () => {
    for (const map of [SCHOOL_ADMIN_CHANNELS, SCHOOL_STAFF_CHANNELS]) {
      for (const [channel, access] of map) {
        const modules = modulesOf(access);
        if (modules.length === 0) continue;
        for (const module of modules) {
          expect(() => authorizeChannel(channel, workspace(OFFICE, [module])), channel).not.toThrow();
        }
        expect(() => authorizeChannel(channel, workspace(OFFICE, [])), channel).toThrow(ForbiddenError);
      }
    }
  });

  it('attendance list is open to TEACHING or REPORTS; recording stays TEACHING only', () => {
    expect(() => authorizeChannel(IpcChannels.ATTENDANCE_LIST, workspace(OFFICE, ['REPORTS']))).not.toThrow();
    expect(() => authorizeChannel(IpcChannels.ATTENDANCE_LIST, workspace(OFFICE, ['TEACHING']))).not.toThrow();
    expect(() => authorizeChannel(IpcChannels.ATTENDANCE_RECORD, workspace(OFFICE, ['REPORTS']))).toThrow(
      new ForbiddenError('This account does not have access to Teaching workflow.'),
    );
    expect(() => authorizeChannel(IpcChannels.ATTENDANCE_LIST, workspace(OFFICE, ['STUDENTS']))).toThrow(
      new ForbiddenError('This account does not have access to Teaching workflow or Reports.'),
    );
    expect(SCHOOL_STAFF_CHANNELS.get(IpcChannels.ATTENDANCE_RECORD)).toBe('TEACHING');
  });

  it('office staff with REPORTS read report cards; without it they are refused', () => {
    for (const channel of [
      IpcChannels.REPORT_CARDS_LIST_FOR_STUDENT,
      IpcChannels.REPORT_CARDS_LIST_FOR_CLASS,
      IpcChannels.REPORT_CARD_GET_ISSUE,
      IpcChannels.REPORT_CARDS_LIST_ARCHIVED_YEARS,
    ]) {
      expect(() => authorizeChannel(channel, workspace(OFFICE, ['REPORTS'])), channel).not.toThrow();
      expect(() => authorizeChannel(channel, workspace(OFFICE, ['STUDENTS'])), channel).toThrow(
        new ForbiddenError('This account does not have access to Reports.'),
      );
    }
  });

  it('office staff are refused teacher-only and county channels', () => {
    expect(() => authorizeChannel(IpcChannels.ASSIGNMENT_LIST, workspace(OFFICE, ALL_MODULES))).toThrow(ForbiddenError);
    expect(() => authorizeChannel(IpcChannels.COUNTY_LIST_USERS, workspace(OFFICE, ALL_MODULES))).toThrow(ForbiddenError);
    expect(() => authorizeChannel(IpcChannels.YEAR_ARCHIVES_LIST, workspace(OFFICE, ALL_MODULES))).toThrow(ForbiddenError);
  });

  it('admin and teacher behaviour is unchanged', () => {
    expect(() =>
      authorizeChannel(IpcChannels.SCHOOL_USERS_CREATE, workspace(SystemRole.INSTITUTION_ADMIN)),
    ).not.toThrow();
    expect(() => authorizeChannel(IpcChannels.STUDENT_CREATE, workspace(SystemRole.TEACHER))).toThrow(
      'This action requires a school administrator workspace.',
    );
    expect(() => authorizeChannel(IpcChannels.SCHOOL_USERS_LIST, workspace(SystemRole.TEACHER))).toThrow(
      'This action requires a school administrator workspace.',
    );
    expect(() => authorizeChannel(IpcChannels.ATTENDANCE_RECORD, workspace(SystemRole.TEACHER))).not.toThrow();
    expect(() => authorizeChannel(IpcChannels.REPORT_CARD_GET_ISSUE, workspace(SystemRole.TEACHER))).not.toThrow();
  });
});
