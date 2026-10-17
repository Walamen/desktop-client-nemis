import { dashboardBridge } from './dashboard-bridge';
import { districtsBridge } from './districts-bridge';
import { schoolsBridge } from './schools-bridge';
import { registrationsBridge } from './registrations-bridge';
import { studentsBridge } from './students-bridge';

/** County (CEO) portal callers of window.nemis, one file per area, the same
 * way school-admin/ and teacher/ are organized. */
export const countyBridge = {
  ...dashboardBridge,
  ...districtsBridge,
  ...schoolsBridge,
  ...registrationsBridge,
  ...studentsBridge,
};
