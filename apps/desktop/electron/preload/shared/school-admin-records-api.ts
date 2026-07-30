import { IpcChannels } from '@nemis-desktop/types';
import type { SchoolAdminApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

/** Generic per-institution collection store — the channel names ("schoolAdmin")
 * predate the role split. Despite the name, it's used by finance, messaging,
 * notifications, reports and grading across every portal, not just school
 * admin — see services/nemis-bridge/shared/collections-bridge.ts. */
export const schoolAdminRecordsApi: SchoolAdminApi = {
  list: (request) => invoke(IpcChannels.SCHOOL_ADMIN_LIST, request),
  save: (request) => invoke(IpcChannels.SCHOOL_ADMIN_SAVE, request),
  delete: (request) => invoke(IpcChannels.SCHOOL_ADMIN_DELETE, request),
};
