'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel selectors owned by the DEO (district) portal. */
export const useDeoDashboardViewModel = () => usePresentation().viewModels.deoDashboard;
export const useDeoSchoolsViewModel = () => usePresentation().viewModels.deoSchools;
export const useDeoSchoolAdminsViewModel = () => usePresentation().viewModels.deoSchoolAdmins;
export const useDeoStudentsViewModel = () => usePresentation().viewModels.deoStudents;
export const useDeoTransfersViewModel = () => usePresentation().viewModels.deoTransfers;
export const useDeoFinanceViewModel = () => usePresentation().viewModels.deoFinance;
export const useDeoReportsViewModel = () => usePresentation().viewModels.deoReports;
export const useDeoTeachersViewModel = () => usePresentation().viewModels.deoTeachers;
