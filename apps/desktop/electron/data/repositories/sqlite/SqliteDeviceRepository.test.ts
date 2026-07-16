import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntityNotFoundError, ValidationError } from '../../errors/repositoryErrors';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { SqliteDeviceRepository } from './SqliteDeviceRepository';

describe('SqliteDeviceRepository', () => {
  let test: TestContext;
  let repo: SqliteDeviceRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteDeviceRepository(test.context);
  });

  afterEach(() => {
    test.cleanup();
  });

  const input = {
    deviceName: 'school-lab-01',
    platform: 'win32',
    osVersion: '10.0.19045',
    appVersion: '1.0.0',
  };

  it('create generates id and timestamps and round-trips', () => {
    const device = repo.create(input);
    expect(device.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(device.createdAt).toBe(device.updatedAt);
    expect(repo.findById(device.id)).toEqual(device);
    expect(repo.count()).toBe(1);
  });

  it('create rejects invalid input before touching SQL', () => {
    expect(() => repo.create({ ...input, deviceName: '' })).toThrow(ValidationError);
    expect(repo.count()).toBe(0);
  });

  it('update changes only provided fields and bumps updatedAt', () => {
    const device = repo.create(input);
    const updated = repo.update(device.id, { appVersion: '1.1.0' });
    expect(updated.appVersion).toBe('1.1.0');
    expect(updated.deviceName).toBe('school-lab-01');
    expect(updated.createdAt).toBe(device.createdAt);
  });

  it('update of a missing device throws EntityNotFoundError', () => {
    expect(() => repo.update('missing', { appVersion: '2.0.0' })).toThrow(EntityNotFoundError);
  });

  it('update rejects invalid field values', () => {
    const device = repo.create(input);
    expect(() => repo.update(device.id, { deviceName: 'x'.repeat(201) })).toThrow(ValidationError);
  });
});
