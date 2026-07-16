import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../database/schema/tableNames';
import { eq } from '../../queries/predicates';
import {
  DuplicateEntityError,
  EntityNotFoundError,
  QueryError,
} from '../../errors/repositoryErrors';
import { deviceMapper, type DeviceRow } from '../../mappers/platformMappers';
import type { Device } from '../../models/platform';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { BaseRepository } from './BaseRepository';
import type { RepositoryContext } from './RepositoryContext';

const DEVICE_COLUMNS = [
  'id',
  'deviceName',
  'platform',
  'osVersion',
  'appVersion',
  'createdAt',
  'updatedAt',
] as const;

/** Test-only subclass exposing the protected machinery. */
class DeviceTestRepository extends BaseRepository<DeviceRow, Device> {
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.devices,
      entityName: 'Device',
      columns: DEVICE_COLUMNS,
      mapper: deviceMapper,
    });
  }

  createRaw(row: DeviceRow): Device {
    return this.insertRow(row);
  }

  createManyRaw(rows: DeviceRow[]): Device[] {
    return this.insertManyRows(rows);
  }

  updateRaw(id: string, changes: Partial<DeviceRow>): Device {
    return this.updateById(id, changes);
  }

  updateManyRaw(ids: string[], changes: Partial<DeviceRow>, chunkSize?: number): number {
    return this.updateByIds(ids, changes, chunkSize);
  }
}

function deviceRow(id: string, createdAt: string): DeviceRow {
  return {
    id,
    deviceName: `device-${id}`,
    platform: 'win32',
    osVersion: '10.0',
    appVersion: '1.0.0',
    createdAt,
    updatedAt: createdAt,
  };
}

describe('BaseRepository', () => {
  let test: TestContext;
  let repo: DeviceTestRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new DeviceTestRepository(test.context);
  });

  afterEach(() => {
    test.cleanup();
  });

  it('insertRow + findById round-trips a model', () => {
    const created = repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
    expect(created.deviceName).toBe('device-d1');
    expect(repo.findById('d1')).toEqual(created);
  });

  it('findById returns null and findByIdOrThrow throws for missing rows', () => {
    expect(repo.findById('missing')).toBeNull();
    expect(() => repo.findByIdOrThrow('missing')).toThrow(EntityNotFoundError);
  });

  it('duplicate primary keys become DuplicateEntityError', () => {
    repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
    expect(() => repo.createRaw(deviceRow('d1', '2026-01-02T00:00:00.000Z'))).toThrow(
      DuplicateEntityError,
    );
  });

  it('findAll applies default deterministic ordering (createdAt, id)', () => {
    repo.createRaw(deviceRow('b', '2026-01-02T00:00:00.000Z'));
    repo.createRaw(deviceRow('a', '2026-01-01T00:00:00.000Z'));
    repo.createRaw(deviceRow('c', '2026-01-01T00:00:00.000Z'));
    expect(repo.findAll().map((d) => d.id)).toEqual(['a', 'c', 'b']);
  });

  it('findAll honors custom ordering and paging', () => {
    repo.createRaw(deviceRow('a', '2026-01-01T00:00:00.000Z'));
    repo.createRaw(deviceRow('b', '2026-01-02T00:00:00.000Z'));
    repo.createRaw(deviceRow('c', '2026-01-03T00:00:00.000Z'));
    const items = repo.findAll({
      orderBy: [{ column: 'createdAt', direction: 'desc' }],
      page: { limit: 2, offset: 1 },
    });
    expect(items.map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('rejects ordering by a column outside the whitelist', () => {
    expect(() => repo.findAll({ orderBy: [{ column: 'platform2', direction: 'asc' }] })).toThrow(
      QueryError,
    );
  });

  it('findPage returns items plus total', () => {
    repo.createRaw(deviceRow('a', '2026-01-01T00:00:00.000Z'));
    repo.createRaw(deviceRow('b', '2026-01-02T00:00:00.000Z'));
    repo.createRaw(deviceRow('c', '2026-01-03T00:00:00.000Z'));
    const page = repo.findPage({ page: { limit: 2, offset: 0 } });
    expect(page.items.map((d) => d.id)).toEqual(['a', 'b']);
    expect(page.total).toBe(3);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(0);
  });

  it('exists and count reflect stored rows', () => {
    repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
    expect(repo.exists('d1')).toBe(true);
    expect(repo.exists('nope')).toBe(false);
    expect(repo.count()).toBe(1);
    expect(repo.count(eq('id', 'nope'))).toBe(0);
  });

  it('updateById updates only defined fields and bumps nothing else', () => {
    repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
    const updated = repo.updateRaw('d1', {
      deviceName: 'renamed',
      osVersion: undefined,
      updatedAt: '2026-01-05T00:00:00.000Z',
    });
    expect(updated.deviceName).toBe('renamed');
    expect(updated.osVersion).toBe('10.0');
    expect(updated.updatedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('updateById throws EntityNotFoundError for a missing row', () => {
    expect(() => repo.updateRaw('missing', { deviceName: 'x' })).toThrow(EntityNotFoundError);
  });

  it('deleteById reports whether a row was removed', () => {
    repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
    expect(repo.deleteById('d1')).toBe(true);
    expect(repo.deleteById('d1')).toBe(false);
  });

  it('insertManyRows is atomic — one bad row rolls back the batch', () => {
    const rows = [
      deviceRow('a', '2026-01-01T00:00:00.000Z'),
      deviceRow('a', '2026-01-02T00:00:00.000Z'), // duplicate id
    ];
    expect(() => repo.createManyRaw(rows)).toThrow(DuplicateEntityError);
    expect(repo.count()).toBe(0);
  });

  it('executeTransaction rolls back on throw', () => {
    expect(() =>
      repo.executeTransaction(() => {
        repo.createRaw(deviceRow('d1', '2026-01-01T00:00:00.000Z'));
        throw new Error('abort');
      }),
    ).toThrow('abort');
    expect(repo.count()).toBe(0);
  });

  it('nested executeTransaction becomes a SAVEPOINT and composes', () => {
    repo.executeTransaction(() => {
      repo.createRaw(deviceRow('outer', '2026-01-01T00:00:00.000Z'));
      expect(() =>
        repo.executeTransaction(() => {
          repo.createRaw(deviceRow('inner', '2026-01-02T00:00:00.000Z'));
          throw new Error('inner abort');
        }),
      ).toThrow('inner abort');
    });
    expect(repo.exists('outer')).toBe(true);
    expect(repo.exists('inner')).toBe(false);
  });

  it('updateByIds updates across multiple chunks and sums changes', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    for (const [index, id] of ids.entries()) {
      repo.createRaw(deviceRow(id, `2026-01-0${index + 1}T00:00:00.000Z`));
    }
    const changed = repo.updateManyRaw(ids, { deviceName: 'renamed' }, 2); // 3 chunks
    expect(changed).toBe(5);
    expect(repo.findAll().every((device) => device.deviceName === 'renamed')).toBe(true);
  });

  it('updateByIds returns 0 for empty ids and rejects empty changes', () => {
    expect(repo.updateManyRaw([], { deviceName: 'x' })).toBe(0);
    repo.createRaw(deviceRow('a', '2026-01-01T00:00:00.000Z'));
    expect(() => repo.updateManyRaw(['a'], {})).toThrow(QueryError);
  });
});
