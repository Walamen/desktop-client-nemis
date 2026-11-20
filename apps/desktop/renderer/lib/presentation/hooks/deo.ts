'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel selectors owned by the DEO (district) portal. */
export const useDeoDashboardViewModel = () => usePresentation().viewModels.deoDashboard;
export const useDeoAlertsViewModel = () => usePresentation().viewModels.deoAlerts;
export const useDeoInfrastructureViewModel = () => usePresentation().viewModels.deoInfrastructure;
export const useDeoSchoolsViewModel = () => usePresentation().viewModels.deoSchools;
export const useDeoSchoolDetailViewModel = () => usePresentation().viewModels.deoSchoolDetail;
export const useDeoSchoolAdminsViewModel = () => usePresentation().viewModels.deoSchoolAdmins;
export const useDeoStudentsViewModel = () => usePresentation().viewModels.deoStudents;
export const useDeoTransfersViewModel = () => usePresentation().viewModels.deoTransfers;
export const useDeoFinanceViewModel = () => usePresentation().viewModels.deoFinance;
export const useDeoMessagesViewModel = () => usePresentation().viewModels.deoMessages;
export const useDeoNotificationsViewModel = () => usePresentation().viewModels.deoNotifications;
export const useDeoSettingsViewModel = () => usePresentation().viewModels.deoSettings;
export const useDeoReportsViewModel = () => usePresentation().viewModels.deoReports;
export const useDeoReportsComplianceViewModel = () => usePresentation().viewModels.deoReportsCompliance;
export const useDeoTeachersViewModel = () => usePresentation().viewModels.deoTeachers;
