import type { CountyDashboardResult } from '@nemis-desktop/types';

/** Defined once as the IPC wire type so the main-process handler returns the
 * DTO directly and the renderer passes it straight to the presentation layer. */
export type CountyDashboardOutput = CountyDashboardResult;
