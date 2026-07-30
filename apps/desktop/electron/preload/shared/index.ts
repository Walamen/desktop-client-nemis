export * from './auth-api';
export * from './provisioning-api';
export * from './sync-api';
export * from './system-api';
export * from './settings-api';
export * from './identity-api';
export * from './device-api';
export * from './attendance-api';
export * from './school-admin-records-api';

import { authApi } from './auth-api';
import { provisioningApi } from './provisioning-api';
import { syncApi } from './sync-api';
import { systemApi } from './system-api';
import { settingsApi } from './settings-api';
import { identityApi } from './identity-api';
import { deviceApi } from './device-api';
import { attendanceApi } from './attendance-api';
import { schoolAdminRecordsApi } from './school-admin-records-api';

/** The NemisApi slice every portal shares. */
export const sharedApi = {
  auth: authApi,
  provisioning: provisioningApi,
  sync: syncApi,
  system: systemApi,
  settings: settingsApi,
  identity: identityApi,
  device: deviceApi,
  attendance: attendanceApi,
  schoolAdmin: schoolAdminRecordsApi,
};
