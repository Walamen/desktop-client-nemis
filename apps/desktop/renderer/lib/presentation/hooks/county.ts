'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel selectors owned by the County (CEO) portal. */
export const useCountyDashboardViewModel = () => usePresentation().viewModels.countyDashboard;
export const useCountyDistrictsViewModel = () => usePresentation().viewModels.countyDistricts;
export const useCountyDistrictDetailViewModel = () => usePresentation().viewModels.countyDistrictDetail;
export const useCountySchoolsViewModel = () => usePresentation().viewModels.countySchools;
export const useCountySchoolDetailViewModel = () => usePresentation().viewModels.countySchoolDetail;
export const useCountySchoolRegistrationViewModel = () => usePresentation().viewModels.countySchoolRegistration;
export const useCountyStudentsViewModel = () => usePresentation().viewModels.countyStudents;
export const useCountyStudentDetailViewModel = () => usePresentation().viewModels.countyStudentDetail;
export const useCountyGuardiansViewModel = () => usePresentation().viewModels.countyGuardians;
export const useCountyGuardianDetailViewModel = () => usePresentation().viewModels.countyGuardianDetail;
export const useCountyTeachersViewModel = () => usePresentation().viewModels.countyTeachers;
export const useCountyFinanceViewModel = () => usePresentation().viewModels.countyFinance;
export const useCountyFeeRulesViewModel = () => usePresentation().viewModels.countyFeeRules;
export const useCountyTeacherDetailViewModel = () => usePresentation().viewModels.countyTeacherDetail;
export const useCountyUsersViewModel = () => usePresentation().viewModels.countyUsers;
export const useCountyUserOptionsViewModel = () => usePresentation().viewModels.countyUserOptions;
