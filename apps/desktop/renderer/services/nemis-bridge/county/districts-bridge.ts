import type {
  CountyAssignDeoRequest,
  CountyDistrictDetailResult,
  CountyDistrictsResult,
  CountyRemoveDeoRequest,
  OnlineCommandResult,
} from '@nemis-desktop/types';
import { api } from '../api';

export const districtsBridge = {
  listDistricts: (): Promise<CountyDistrictsResult> => api().county.listDistricts(),
  getDistrict: (districtId: string): Promise<CountyDistrictDetailResult | null> =>
    api().county.getDistrict(districtId),
  assignDeo: (request: CountyAssignDeoRequest): Promise<OnlineCommandResult<null>> =>
    api().county.assignDeo(request),
  removeDeo: (request: CountyRemoveDeoRequest): Promise<OnlineCommandResult<null>> =>
    api().county.removeDeo(request),
};
