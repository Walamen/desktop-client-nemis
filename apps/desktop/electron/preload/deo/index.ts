import { IpcChannels } from '@nemis-desktop/types';
import type { DeoApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const deoDashboardApi: DeoApi = {
  getDashboard: () => invoke(IpcChannels.DEO_GET_DASHBOARD),
  resolveAlert: (alertId) => invoke(IpcChannels.DEO_RESOLVE_ALERT, alertId),
  listSchools: () => invoke(IpcChannels.DEO_LIST_SCHOOLS),
};

/** The NemisApi slice the DEO (district) portal owns. Add each new area as
 * its own file and spread it in here, the same way county/ is organized. */
export const deoApi = {
  deo: { ...deoDashboardApi },
};
