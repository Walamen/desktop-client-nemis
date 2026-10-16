import type { CountySchoolDetailResult, CountySchoolsResult } from '@nemis-desktop/types';

/** Defined once as the IPC wire types, as the dashboard and districts DTOs are. */
export type CountySchoolsOutput = CountySchoolsResult;
export type CountySchoolDetailOutput = CountySchoolDetailResult | null;
