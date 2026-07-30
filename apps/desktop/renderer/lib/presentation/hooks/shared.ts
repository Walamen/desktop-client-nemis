'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel/store selectors used by every portal: device info, current-user
 * identity, sync, connectivity/notification stores, bootstrap, and
 * attendance (recorded by teachers, reported on by school admins — see
 * services/nemis-bridge/shared/attendance-bridge.ts). */
export const useDeviceViewModel = () => usePresentation().viewModels.device;
export const useCurrentUserViewModel = () => usePresentation().viewModels.currentUser;
export const useSyncViewModel = () => usePresentation().viewModels.sync;
export const useConnectivityStore = () => usePresentation().stores.connectivity;
export const useNotificationStore = () => usePresentation().stores.notifications;
export const useBootstrapStore = () => usePresentation().stores.bootstrap;
export const useAttendanceViewModel = () => usePresentation().viewModels.attendance;
