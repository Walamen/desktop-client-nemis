import type { AttendanceApplicationService } from '@nemis-desktop/application';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { group, query } from './core';

/** ApplicationLayer groups backed by nemis-bridge/shared — used by every
 * portal (current-user identity, device info, attendance — recorded by
 * teachers, reported on by school admins). Auth/sync/generic records are
 * consumed straight from sharedBridge by components, not through the
 * ApplicationLayer facade — see services/nemis-bridge/shared/ for those. */
export const sharedIpc = {
  identity: group('identity', {
    getCurrentUser: () => query(() => sharedBridge.getCurrentUser()),
  }),
  infra: group('infra', {
    getDeviceInfo: () => query(() => sharedBridge.getDeviceInfo()),
  }),
  attendance: group<AttendanceApplicationService>('attendance', {
    getByClassAndDate: (dto) => query(() => sharedBridge.listAttendance(dto)),
    record: (dto) => query(() => sharedBridge.recordAttendance(dto)),
  }),
};
