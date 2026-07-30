export * from './dashboard-bridge';

import { teacherDashboardBridge } from './dashboard-bridge';

/** Everything the Teacher portal owns for itself. Attendance recording and
 * the generic record store are cross-portal (see nemis-bridge/shared/) —
 * this file grows as teacher-specific IPC endpoints (gradebook, my-classes,
 * resources, etc.) come online. */
export const teacherBridge = {
  ...teacherDashboardBridge,
};
