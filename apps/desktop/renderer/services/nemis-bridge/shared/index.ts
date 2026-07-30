export * from './auth-bridge';
export * from './sync-bridge';
export * from './identity-bridge';
export * from './device-bridge';
export * from './attendance-bridge';
export * from './collections-bridge';
export * from './system-bridge';

import { authBridge } from './auth-bridge';
import { syncBridge } from './sync-bridge';
import { identityBridge } from './identity-bridge';
import { deviceBridge } from './device-bridge';
import { attendanceBridge } from './attendance-bridge';
import { collectionsBridge } from './collections-bridge';
import { systemBridge } from './system-bridge';

/** Everything every portal shares: auth/provisioning, sync, current-user
 * identity, device info, attendance, app version, and the generic record
 * store. */
export const sharedBridge = {
  ...authBridge,
  ...syncBridge,
  ...identityBridge,
  ...deviceBridge,
  ...attendanceBridge,
  ...collectionsBridge,
  ...systemBridge,
};
