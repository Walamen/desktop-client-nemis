import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../testing/createTestContext';
import { SqliteDeviceRepository } from '../repositories/sqlite/SqliteDeviceRepository';
import { SqliteAppSettingsRepository } from '../repositories/sqlite/SqliteAppSettingsRepository';
import { SqliteAuditLogRepository } from '../repositories/sqlite/SqliteAuditLogRepository';
import { DeviceGatewayAdapter } from './DeviceGatewayAdapter';
import { SettingsGatewayAdapter } from './SettingsGatewayAdapter';
import {
  RegisterDeviceUseCase,
  UpdateSettingsUseCase,
  SystemClock,
  NoopEventPublisher,
  ConsoleLogger,
} from '@nemis-desktop/application';

describe('infra use cases end-to-end against real SQLite', () => {
  let test: TestContext;

  beforeEach(() => {
    test = createTestContext();
  });
  afterEach(() => {
    test.cleanup();
  });

  it('RegisterDevice persists a real device row via the gateway adapter', async () => {
    const devices = new SqliteDeviceRepository(test.context);
    const useCase = new RegisterDeviceUseCase({
      deviceGateway: new DeviceGatewayAdapter(devices),
      clock: new SystemClock(),
      events: new NoopEventPublisher(),
      logger: new ConsoleLogger(),
    });
    const res = await useCase.execute({
      deviceName: 'lab-01',
      platform: 'win32',
      osVersion: '10.0',
      appVersion: '1.0.0',
    });
    expect(res.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(devices.findById(res.data.id)?.deviceName).toBe('lab-01');
  });

  it('UpdateSettings writes a real setting row atomically via the gateway adapter', async () => {
    const settings = new SqliteAppSettingsRepository(test.context);
    const auditLog = new SqliteAuditLogRepository(test.context);
    const useCase = new UpdateSettingsUseCase({
      settingsGateway: new SettingsGatewayAdapter(settings, auditLog, test.context.transactions),
      clock: new SystemClock(),
      events: new NoopEventPublisher(),
      logger: new ConsoleLogger(),
    });
    const res = await useCase.execute({ key: 'theme', value: 'dark' });
    expect(res.data.value).toBe('dark');
    expect(settings.getByKey('theme')?.value).toBe('dark');
  });
});
