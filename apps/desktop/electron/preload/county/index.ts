import { countyDashboardApi } from './dashboard-api';
import { countyDistrictsApi } from './districts-api';
import { countySchoolsApi } from './schools-api';

export * from './dashboard-api';
export * from './districts-api';
export * from './schools-api';

/** The NemisApi slice the County (CEO) portal owns. */
export const countyApi = {
  county: { ...countyDashboardApi, ...countyDistrictsApi, ...countySchoolsApi },
};
