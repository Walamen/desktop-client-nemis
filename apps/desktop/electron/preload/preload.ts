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
  },
};

contextBridge.exposeInMainWorld('nemis', nemisApi);
