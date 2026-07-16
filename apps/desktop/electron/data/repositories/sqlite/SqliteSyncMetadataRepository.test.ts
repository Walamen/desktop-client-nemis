import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeMetadata } from '../../../database/seed/initializeMetadata';
import { EntityNotFoundError, ValidationError } from '../../errors/repositoryErrors';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { SqliteSyncMetadataRepository } from './SqliteSyncMetadataRepository';

const TEST_DEVICE = {
  deviceName: 'test-device',
  platform: 'win32',
  osVersion: '10.0',
  appVersion: '1.0.0',
};

describe('SqliteSyncMetadataRepository', () => {
  let test: TestContext;
  let repo: SqliteSyncMetadataRepository;

  beforeEach(() => {
    test = createTestContext();
    initializeMetadata(test.context.connection, TEST_DEVICE, 1);
    repo = new SqliteSyncMetadataRepository(test.context);
  });

  afterEach(() => {
    test.cleanup();
  });

  it('get returns the platform-seeded singleton', () => {
    const metadata = repo.get();
    expect(metadata.id).toBe('singleton');
    expect(metadata.syncStatus).toBe('never');
    expect(metadata.lastSyncAt).toBeNull();
  });

  it('update patches only the provided fields', () => {
    const updated = repo.update({
      syncStatus: 'idle',
      lastSyncAt: '2026-07-16T10:00:00.000Z',
    });
    expect(updated.syncStatus).toBe('idle');
    expect(updated.lastSyncAt).toBe('2026-07-16T10:00:00.000Z');
    expect(updated.schemaVersion).toBe(repo.get().schemaVersion);
  });

  it('update can clear lastSyncAt back to null', () => {
    repo.update({ lastSyncAt: '2026-07-16T10:00:00.000Z' });
    expect(repo.update({ lastSyncAt: null }).lastSyncAt).toBeNull();
  });

  it('rejects an invalid syncStatus and bad timestamps', () => {
    expect(() => repo.update({ syncStatus: 'broken' as never })).toThrow(ValidationError);
    expect(() => repo.update({ lastSyncAt: 'not-a-date' })).toThrow(ValidationError);
  });

  it('get throws EntityNotFoundError when the singleton is missing (integrity failure)', () => {
    test.context.connection.prepare('DELETE FROM sync_metadata').run();
    expect(() => repo.get()).toThrow(EntityNotFoundError);
  });
});
