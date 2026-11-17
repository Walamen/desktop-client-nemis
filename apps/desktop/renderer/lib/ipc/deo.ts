import type { DeoApplicationService } from '@nemis-desktop/application';
import { deoBridge } from '@/services/nemis-bridge/deo';
import { group, query } from './core';

/** ApplicationLayer groups the DEO (district) portal owns. */
export const deoIpc = {
  deo: group<DeoApplicationService>('deo', {
    getDashboard: () => query(() => deoBridge.getDashboard()),
    resolveAlert: (alertId) => query(() => deoBridge.resolveAlert(alertId)),
    listSchools: () => query(() => deoBridge.listSchools()),
    listSchoolAdmins: () => query(() => deoBridge.listSchoolAdmins()),
    listStudents: () => query(() => deoBridge.listStudents()),
    listTransfers: () => query(() => deoBridge.listTransfers()),
    listTeachers: () => query(() => deoBridge.listTeachers()),
  }),
};
