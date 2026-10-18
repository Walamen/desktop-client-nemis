import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyGuardiansApi: Pick<CountyApi, 'listGuardians' | 'getGuardian'> = {
  listGuardians: (query) => invoke(IpcChannels.COUNTY_LIST_GUARDIANS, query),
  getGuardian: (guardianId) => invoke(IpcChannels.COUNTY_GET_GUARDIAN, guardianId),
};
