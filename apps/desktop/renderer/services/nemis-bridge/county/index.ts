import { dashboardBridge } from './dashboard-bridge';
import { districtsBridge } from './districts-bridge';
import { schoolsBridge } from './schools-bridge';
import { registrationsBridge } from './registrations-bridge';
import { studentsBridge } from './students-bridge';
import { guardiansBridge } from './guardians-bridge';
import { teachersBridge } from './teachers-bridge';
import { financeBridge } from './finance-bridge';
import { reportsBridge } from './reports-bridge';
import { messagingBridge } from './messaging-bridge';
import { auditBridge } from './audit-bridge';
import { usersBridge } from './users-bridge';

/** County (CEO) portal callers of window.nemis, one file per area, the same
 * way school-admin/ and teacher/ are organized. */
export const countyBridge = {
  ...dashboardBridge,
  ...districtsBridge,
  ...schoolsBridge,
  ...registrationsBridge,
  ...studentsBridge,
  ...guardiansBridge,
  ...teachersBridge,
  ...financeBridge,
  ...reportsBridge,
  ...messagingBridge,
  ...auditBridge,
  ...usersBridge,
};
