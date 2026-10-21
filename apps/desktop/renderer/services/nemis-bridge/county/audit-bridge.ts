import type { CountyAuditPage, CountyAuditQuery, CountyAuditStats, CountySettings } from '@nemis-desktop/types';
import { api } from '../api';

export const auditBridge = {
  getAuditStats: (): Promise<CountyAuditStats> => api().county.getAuditStats(),
  listAuditLogs: (query: CountyAuditQuery): Promise<CountyAuditPage> => api().county.listAuditLogs(query),
  getCountySettings: (): Promise<CountySettings> => api().county.getCountySettings(),
};
