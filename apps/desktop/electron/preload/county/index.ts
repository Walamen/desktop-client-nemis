import { countyDashboardApi } from './dashboard-api';
import { countyDistrictsApi } from './districts-api';

export * from './dashboard-api';
export * from './districts-api';

/** The NemisApi slice the County (CEO) portal owns. */
export const countyApi = {
  county: { ...countyDashboardApi, ...countyDistrictsApi },
};
