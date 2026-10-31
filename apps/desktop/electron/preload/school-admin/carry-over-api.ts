import { IpcChannels } from '@nemis-desktop/types';
import type { CarryOverApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const carryOverApi: CarryOverApi = {
  listPending: () => invoke(IpcChannels.CARRY_OVER_LIST_PENDING),
  listLocalPending: () => invoke(IpcChannels.CARRY_OVER_LIST_LOCAL_PENDING),
  get: (id) => invoke(IpcChannels.CARRY_OVER_GET, id),
  save: (request) => invoke(IpcChannels.CARRY_OVER_SAVE, request),
};
