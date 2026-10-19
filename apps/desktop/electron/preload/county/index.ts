import { countyDashboardApi } from './dashboard-api';
import { countyDistrictsApi } from './districts-api';
import { countySchoolsApi } from './schools-api';
import { countyRegistrationsApi } from './registrations-api';
import { countyStudentsApi } from './students-api';
import { countyGuardiansApi } from './guardians-api';
import { countyTeachersApi } from './teachers-api';

export * from './dashboard-api';
export * from './districts-api';
export * from './schools-api';
export * from './registrations-api';
export * from './students-api';
export * from './guardians-api';

/** The NemisApi slice the County (CEO) portal owns. */
export const countyApi = {
  county: { ...countyDashboardApi, ...countyDistrictsApi, ...countySchoolsApi, ...countyRegistrationsApi, ...countyStudentsApi, ...countyGuardiansApi, ...countyTeachersApi },
};
