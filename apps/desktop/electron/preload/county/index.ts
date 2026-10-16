import { countyDashboardApi } from './dashboard-api';

export * from './dashboard-api';

/** The NemisApi slice the County (CEO) portal owns. */
export const countyApi = {
  county: countyDashboardApi,
};
