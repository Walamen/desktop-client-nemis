import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROVISIONING_COLLECTIONS, type ProvisioningData, type ProvisioningSnapshot } from '@nemis-desktop/types';
import { DatabaseManager } from '@app/database/DatabaseManager';
import { ProvisioningImporter } from './ProvisioningImporter';

describe('ProvisioningImporter', () => {
  let directory: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-provisioning-'));
    manager = new DatabaseManager({
      userDataDir: directory,
      device: { deviceName: 'PC', platform: 'win32', osVersion: '11', appVersion: '1.0.0' },
    });
    manager.initialize();
  });
  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('atomically imports, verifies, and records completion', () => {
    const importer = new ProvisioningImporter(manager);
    const snapshot = makeSnapshot();
    importer.import(snapshot, {
      institutionId: 'school-1',
      userId: 'user-1',
      serverDeviceId: 'server-device-1',
    });
    expect(importer.getCompletion()).toMatchObject({
      institutionId: 'school-1',
      userId: 'user-1',
    });
    expect(
      (manager.connection.prepare('SELECT COUNT(*) count FROM institutions').get() as { count: number }).count,
    ).toBe(1);
  });

  it('rejects corruption without replacing existing school data', () => {
    const importer = new ProvisioningImporter(manager);
    const snapshot = makeSnapshot();
    importer.import(snapshot, {
      institutionId: 'school-1',
      userId: 'user-1',
      serverDeviceId: 'server-device-1',
    });
    const corrupt = { ...snapshot, checksum: '0'.repeat(64) };
    expect(() =>
      importer.import(corrupt, {
        institutionId: 'school-1',
        userId: 'user-1',
        serverDeviceId: 'server-device-1',
      }),
    ).toThrow(/checksum/i);
    expect(
      (manager.connection.prepare('SELECT name FROM institutions WHERE id=?').get('school-1') as { name: string }).name,
    ).toBe('Central High');
  });
});

function makeSnapshot(): ProvisioningSnapshot {
  const empty = Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, []])) as unknown as ProvisioningData;
  const data: ProvisioningData = {
    ...empty,
    institutions: [{
      id: 'school-1', code: 'SCH-1', name: 'Central High', type: 'SECONDARY',
      ownership: 'PUBLIC', countyId: 'county-1', districtId: null,
      approvalStatus: 'APPROVED', street: null, communityTown: null,
      latitude: null, longitude: null, rejectionReason: null, profile: null,
      version: 1, updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: null,
    }],
    users: [{
      id: 'user-1', firstName: 'School', middleName: null, lastName: 'Admin',
      email: 'admin@school.edu', isActive: true, version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: null,
    }],
    userOrganizations: [{
      id: 'org-1', userId: 'user-1', role: 'INSTITUTION_ADMIN',
      institutionId: 'school-1', countyId: 'county-1', districtId: null, isActive: true,
    }],
  };
  const manifest = Object.fromEntries(
    PROVISIONING_COLLECTIONS.map((key) => [key, data[key].length]),
  ) as ProvisioningSnapshot['manifest'];
  return {
    contractVersion: 1,
    snapshotId: 'snapshot-1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    institutionId: 'school-1',
    deviceId: 'server-device-1',
    checksumAlgorithm: 'sha256',
    checksum: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    manifest,
    data,
  };
}
