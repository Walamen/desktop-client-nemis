import type { CountyDistrictDetailResult, CountyDistrictsResult } from '@nemis-desktop/types';

/** Defined once as the IPC wire types, as the dashboard DTO is. */
export type CountyDistrictsOutput = CountyDistrictsResult;
export type CountyDistrictDetailOutput = CountyDistrictDetailResult | null;
