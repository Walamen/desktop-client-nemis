import { IpcChannels } from '@nemis-desktop/types';
import type { TermApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const termApi: TermApi = {
  list: (academicYearId) => invoke(IpcChannels.TERM_LIST, academicYearId),
  getCurrent: () => invoke(IpcChannels.TERM_GET_CURRENT),
  create: (request) => invoke(IpcChannels.TERM_CREATE, request),
  update: (request) => invoke(IpcChannels.TERM_UPDATE, request),
  setCurrent: (id) => invoke(IpcChannels.TERM_SET_CURRENT, id),
  delete: (id) => invoke(IpcChannels.TERM_DELETE, id),
};
