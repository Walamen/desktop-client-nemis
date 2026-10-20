import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyFinanceApi: Pick<
  CountyApi,
  'getFinanceDashboard' | 'listFinanceSchools' | 'listFeeCollections' | 'listFeeRules'
> = {
  getFinanceDashboard: () => invoke(IpcChannels.COUNTY_FINANCE_DASHBOARD),
  listFinanceSchools: () => invoke(IpcChannels.COUNTY_FINANCE_SCHOOLS),
  listFeeCollections: (query) => invoke(IpcChannels.COUNTY_FINANCE_PAYMENTS, query),
  listFeeRules: (query) => invoke(IpcChannels.COUNTY_FINANCE_FEE_RULES, query),
};
