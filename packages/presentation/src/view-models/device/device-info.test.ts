import { describe, expect, it } from 'vitest';
import { NotificationStore } from '../../stores/notification-store';
import { SessionStore } from '../../stores/session-store';
import { createTestApplication } from '../../testing/create-test-application';
import { DeviceViewModel } from './device-view-model';

describe('DeviceViewModel.loadDeviceInfo', () => {
  it('is empty when no device is registered', async () => {
    const { app } = createTestApplication();
    const vm = new DeviceViewModel({ infra: app.infra, notifications: new NotificationStore(), session: new SessionStore() });
    await vm.loadDeviceInfo();
    expect(vm.store.getState().device.status).toBe('empty');
  });

  it('loads the current device info', async () => {
    const { app, ports } = createTestApplication();
    ports.deviceGateway.register({ deviceName: 'Front-desk PC', platform: 'win32', osVersion: '10.0.19045', appVersion: '1.0.0' });
    const vm = new DeviceViewModel({ infra: app.infra, notifications: new NotificationStore(), session: new SessionStore() });
    await vm.loadDeviceInfo();
    const device = vm.store.getState().device;
    expect(device.status).toBe('success');
    if (device.status === 'success') expect(device.data.deviceName).toBe('Front-desk PC');
  });
});
