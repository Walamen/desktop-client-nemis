'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel selectors owned by the County (CEO) portal. */
export const useCountyDashboardViewModel = () => usePresentation().viewModels.countyDashboard;
export const useCountyDistrictsViewModel = () => usePresentation().viewModels.countyDistricts;
export const useCountyDistrictDetailViewModel = () => usePresentation().viewModels.countyDistrictDetail;
export const useCountySchoolsViewModel = () => usePresentation().viewModels.countySchools;
export const useCountySchoolDetailViewModel = () => usePresentation().viewModels.countySchoolDetail;
