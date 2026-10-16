import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyDistrictsApi: Pick<CountyApi, 'listDistricts' | 'getDistrict' | 'assignDeo' | 'removeDeo'> = {
  listDistricts: () => invoke(IpcChannels.COUNTY_LIST_DISTRICTS),
  getDistrict: (districtId) => invoke(IpcChannels.COUNTY_GET_DISTRICT, districtId),
  assignDeo: (request) => invoke(IpcChannels.COUNTY_ASSIGN_DEO, request),
  removeDeo: (request) => invoke(IpcChannels.COUNTY_REMOVE_DEO, request),
};
