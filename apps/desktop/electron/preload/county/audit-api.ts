import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyAuditApi: Pick<CountyApi, 'getAuditStats' | 'listAuditLogs' | 'getCountySettings'> = {
  getAuditStats: () => invoke(IpcChannels.COUNTY_AUDIT_STATS),
  listAuditLogs: (query) => invoke(IpcChannels.COUNTY_AUDIT_LIST, query),
  getCountySettings: () => invoke(IpcChannels.COUNTY_SETTINGS),
};
