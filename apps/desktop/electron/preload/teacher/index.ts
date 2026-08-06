export * from './dashboard-api';
export * from './assignment-api';

/** Everything the Teacher portal owns for itself. Attendance recording and
 * the generic record store are cross-portal (see
 * electron/preload/shared/) — this grows as more teacher-specific channels
 * come online. */
