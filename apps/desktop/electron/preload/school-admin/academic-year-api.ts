import { IpcChannels } from '@nemis-desktop/types';
import type { AcademicYearApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const academicYearApi: AcademicYearApi = {
  getCurrent: () => invoke(IpcChannels.ACADEMIC_YEAR_GET_CURRENT),
  list: () => invoke(IpcChannels.ACADEMIC_YEAR_LIST),
  create: (request) => invoke(IpcChannels.ACADEMIC_YEAR_CREATE, request),
  update: (request) => invoke(IpcChannels.ACADEMIC_YEAR_UPDATE, request),
  setCurrent: (id) => invoke(IpcChannels.ACADEMIC_YEAR_SET_CURRENT, id),
  setStatus: (request) => invoke(IpcChannels.ACADEMIC_YEAR_SET_STATUS, request),
};
