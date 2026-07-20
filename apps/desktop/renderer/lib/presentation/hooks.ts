'use client';

import { usePresentation } from './presentation-provider';

export const useDashboardViewModel = () => usePresentation().viewModels.dashboard;
export const useStudentsViewModel = () => usePresentation().viewModels.students;
export const useSettingsViewModel = () => usePresentation().viewModels.settings;
export const useCurrentUserViewModel = () => usePresentation().viewModels.currentUser;
export const useSyncViewModel = () => usePresentation().viewModels.sync;
export const useConnectivityStore = () => usePresentation().stores.connectivity;
export const useNotificationStore = () => usePresentation().stores.notifications;
