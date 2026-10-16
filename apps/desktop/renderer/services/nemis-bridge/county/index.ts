import { dashboardBridge } from './dashboard-bridge';

/** County (CEO) portal callers of window.nemis, one file per area, the same
 * way school-admin/ and teacher/ are organized. */
export const countyBridge = {
  ...dashboardBridge,
};
