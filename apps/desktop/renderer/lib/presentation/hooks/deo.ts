'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel selectors owned by the DEO (district) portal. */
export const useDeoDashboardViewModel = () => usePresentation().viewModels.deoDashboard;
export const useDeoSchoolsViewModel = () => usePresentation().viewModels.deoSchools;
export const useDeoSchoolAdminsViewModel = () => usePresentation().viewModels.deoSchoolAdmins;
export const useDeoTeachersViewModel = () => usePresentation().viewModels.deoTeachers;
