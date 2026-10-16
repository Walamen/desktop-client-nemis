'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel selectors owned by the County (CEO) portal. */
export const useSchoolsViewModel = () => usePresentation().viewModels.schools;
export const useCountyDashboardViewModel = () => usePresentation().viewModels.countyDashboard;
export const useCountyDistrictsViewModel = () => usePresentation().viewModels.countyDistricts;
export const useCountyDistrictDetailViewModel = () => usePresentation().viewModels.countyDistrictDetail;
