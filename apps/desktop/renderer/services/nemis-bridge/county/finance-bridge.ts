import type {
  CountyFeeCollectionsQuery,
  CountyFeeCollectionsResult,
  CountyFeeRulesQuery,
  CountyFeeRulesResult,
  CountyFinanceDashboard,
  CountySchoolFinanceRow,
} from '@nemis-desktop/types';
import { api } from '../api';

export const financeBridge = {
  getFinanceDashboard: (): Promise<CountyFinanceDashboard> => api().county.getFinanceDashboard(),
  listFinanceSchools: (): Promise<CountySchoolFinanceRow[]> => api().county.listFinanceSchools(),
  listFeeCollections: (query: CountyFeeCollectionsQuery): Promise<CountyFeeCollectionsResult> =>
    api().county.listFeeCollections(query),
  listFeeRules: (query: CountyFeeRulesQuery): Promise<CountyFeeRulesResult> => api().county.listFeeRules(query),
};
