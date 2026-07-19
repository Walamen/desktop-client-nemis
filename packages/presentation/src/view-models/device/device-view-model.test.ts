import { describe, expect, it } from 'vitest';
import { NotificationStore } from '../../stores/notification-store';
import { SessionStore } from '../../stores/session-store';
import { createTestApplication } from '../../testing/create-test-application';
import { DeviceViewModel } from './device-view-model';

describe('DeviceViewModel', () => {
  it('registers the device, stores it, and records it in the session', async () => {
    const { app } = createTestApplication();
    const notifications = new NotificationStore();
    const session = new SessionStore();
    const vm = new DeviceViewModel({ infra: app.infra, notifications, session });
    const outcome = await vm.registerDevice({
      deviceName: 'Front-desk PC',
      platform: 'win32',
      osVersion: '10.0.19045',
      appVersion: '1.0.0',
    });
    expect(outcome.ok).toBe(true);
    const device = vm.store.getState().device;
    expect(device.status).toBe('success');
    if (device.status === 'success') {
      expect(device.data.deviceName).toBe('Front-desk PC');
      expect(session.store.getState().currentDeviceId).toBe(device.data.id);
    }
    expect(notifications.store.getState().notifications[0]?.kind).toBe('success');
  });
});
