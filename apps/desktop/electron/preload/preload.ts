import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcChannel, IpcContract, IpcResult, NemisApi } from '@nemis-desktop/types';

async function invoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcContract[C]['args']
): Promise<IpcContract[C]['result']> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<
    IpcContract[C]['result']
  >;
  if (!result.ok) {
    throw new Error(`[${result.error.code}] ${result.error.message}`);
  }
  return result.data;
}

const nemisApi: NemisApi = {
  auth: {
    getStatus: () => invoke(IpcChannels.AUTH_GET_STATUS),
    login: (request) => invoke(IpcChannels.AUTH_LOGIN, request),
    logout: () => invoke(IpcChannels.AUTH_LOGOUT),
  },
  provisioning: {
    start: () => invoke(IpcChannels.PROVISIONING_START),
  },
  sync: {
    run: () => invoke(IpcChannels.SYNC_RUN),
    getStatus: () => invoke(IpcChannels.SYNC_GET_STATUS),
    listConflicts: () => invoke(IpcChannels.SYNC_LIST_CONFLICTS),
    resolveConflict: (request) => invoke(IpcChannels.SYNC_RESOLVE_CONFLICT, request),
  },
  system: {
    getVersion: () => invoke(IpcChannels.SYSTEM_GET_VERSION),
  },
  settings: {
    get: (key: string) => invoke(IpcChannels.SETTINGS_GET, key),
  },
  dashboard: {
    getOverview: () => invoke(IpcChannels.DASHBOARD_GET_OVERVIEW),
  },
  school: {
    getSummary: () => invoke(IpcChannels.SCHOOL_GET_SUMMARY),
  },
  academicYear: {
    getCurrent: () => invoke(IpcChannels.ACADEMIC_YEAR_GET_CURRENT),
    list: () => invoke(IpcChannels.ACADEMIC_YEAR_LIST),
    create: (request) => invoke(IpcChannels.ACADEMIC_YEAR_CREATE, request),
    update: (request) => invoke(IpcChannels.ACADEMIC_YEAR_UPDATE, request),
    setCurrent: (id) => invoke(IpcChannels.ACADEMIC_YEAR_SET_CURRENT, id),
    setStatus: (request) => invoke(IpcChannels.ACADEMIC_YEAR_SET_STATUS, request),
  },
  term: {
    list: (academicYearId) => invoke(IpcChannels.TERM_LIST, academicYearId),
    getCurrent: () => invoke(IpcChannels.TERM_GET_CURRENT),
    create: (request) => invoke(IpcChannels.TERM_CREATE, request),
    update: (request) => invoke(IpcChannels.TERM_UPDATE, request),
    setCurrent: (id) => invoke(IpcChannels.TERM_SET_CURRENT, id),
    delete: (id) => invoke(IpcChannels.TERM_DELETE, id),
  },
  classes: {
    list: (request) => invoke(IpcChannels.CLASS_LIST, request),
    create: (request) => invoke(IpcChannels.CLASS_CREATE, request),
    update: (request) => invoke(IpcChannels.CLASS_UPDATE, request),
    setActive: (request) => invoke(IpcChannels.CLASS_SET_ACTIVE, request),
    gradeLevelCounts: () => invoke(IpcChannels.CLASS_GRADE_LEVEL_COUNTS),
    listSubjects: (classId) => invoke(IpcChannels.CLASS_SUBJECT_LIST, classId),
    assignSubject: (request) => invoke(IpcChannels.CLASS_SUBJECT_ASSIGN, request),
    unassignSubject: (request) => invoke(IpcChannels.CLASS_SUBJECT_UNASSIGN, request),
  },
  subject: {
    list: (request) => invoke(IpcChannels.SUBJECT_LIST, request),
    create: (request) => invoke(IpcChannels.SUBJECT_CREATE, request),
    update: (request) => invoke(IpcChannels.SUBJECT_UPDATE, request),
    setActive: (request) => invoke(IpcChannels.SUBJECT_SET_ACTIVE, request),
  },
  identity: {
    getCurrentUser: () => invoke(IpcChannels.IDENTITY_GET_CURRENT_USER),
  },
  device: {
    getInfo: () => invoke(IpcChannels.DEVICE_GET_INFO),
  },
  student: {
    list: (request) => invoke(IpcChannels.STUDENT_LIST, request), get: (id) => invoke(IpcChannels.STUDENT_GET,id),
    create: (request) => invoke(IpcChannels.STUDENT_CREATE,request), update: (request) => invoke(IpcChannels.STUDENT_UPDATE,request),
    setActive: (request) => invoke(IpcChannels.STUDENT_SET_ACTIVE,request), createGuardian: (request) => invoke(IpcChannels.STUDENT_CREATE_GUARDIAN,request),
    enroll: (request) => invoke(IpcChannels.STUDENT_ENROLL,request),
    moveClass: (request) => invoke(IpcChannels.STUDENT_MOVE_CLASS, request),
    listEnrollments: (id) => invoke(IpcChannels.STUDENT_LIST_ENROLLMENTS,id),
    getStatistics: () => invoke(IpcChannels.STUDENT_GET_STATISTICS),
  },
  teacher: {
    list: (request) => invoke(IpcChannels.TEACHER_LIST, request),
    getProfile: (id) => invoke(IpcChannels.TEACHER_GET_PROFILE, id),
    create: (request) => invoke(IpcChannels.TEACHER_CREATE, request),
    update: (request) => invoke(IpcChannels.TEACHER_UPDATE, request),
    setActive: (request) => invoke(IpcChannels.TEACHER_SET_ACTIVE, request),
    listAssignments: (id) => invoke(IpcChannels.TEACHER_LIST_ASSIGNMENTS, id),
    assign: (request) => invoke(IpcChannels.TEACHER_ASSIGN, request),
    updateAssignment: (request) => invoke(IpcChannels.TEACHER_UPDATE_ASSIGNMENT, request),
    removeAssignment: (request) => invoke(IpcChannels.TEACHER_REMOVE_ASSIGNMENT, request),
    getDashboard: () => invoke(IpcChannels.TEACHER_GET_DASHBOARD),
  },
  timetable: {
    list: (request) => invoke(IpcChannels.TIMETABLE_LIST, request),
    getClassSchedule: (id) => invoke(IpcChannels.TIMETABLE_CLASS, id),
    getTeacherSchedule: (id) => invoke(IpcChannels.TIMETABLE_TEACHER, id),
    getSubjectSchedule: (id) => invoke(IpcChannels.TIMETABLE_SUBJECT, id),
    create: (request) => invoke(IpcChannels.TIMETABLE_CREATE, request),
    update: (request) => invoke(IpcChannels.TIMETABLE_UPDATE, request),
    delete: (id) => invoke(IpcChannels.TIMETABLE_DELETE, id),
    copy: (request) => invoke(IpcChannels.TIMETABLE_COPY, request),
    validate: (request) => invoke(IpcChannels.TIMETABLE_VALIDATE, request),
    detectConflicts: (request) => invoke(IpcChannels.TIMETABLE_CONFLICTS, request),
    periods: (classId) => invoke(IpcChannels.TIMETABLE_PERIODS, classId),
    dashboard: (dayOfWeek) => invoke(IpcChannels.TIMETABLE_DASHBOARD, dayOfWeek),
  },
  attendance: {
    list: (request) => invoke(IpcChannels.ATTENDANCE_LIST, request),
    record: (request) => invoke(IpcChannels.ATTENDANCE_RECORD, request),
  },
  schoolAdmin: {
    list: (request) => invoke(IpcChannels.SCHOOL_ADMIN_LIST, request),
    save: (request) => invoke(IpcChannels.SCHOOL_ADMIN_SAVE, request),
    delete: (request) => invoke(IpcChannels.SCHOOL_ADMIN_DELETE, request),
  },
};

contextBridge.exposeInMainWorld('nemis', nemisApi);
