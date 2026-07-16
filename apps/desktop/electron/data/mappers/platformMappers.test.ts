import { describe, expect, it } from 'vitest';
import { RepositoryError } from '../errors/repositoryErrors';
import { parseJsonColumn, serializeJsonColumn } from './json';
import { appSettingMapper, auditLogMapper, deviceMapper, syncQueueMapper } from './platformMappers';

describe('json column helpers', () => {
  it('parses stored JSON and passes NULL through', () => {
    expect(parseJsonColumn('{"a":1}', 'ctx')).toEqual({ a: 1 });
    expect(parseJsonColumn('null', 'ctx')).toBeNull();
    expect(parseJsonColumn(null, 'ctx')).toBeNull();
  });

  it('reports corrupt stored JSON as a repository error', () => {
    expect(() => parseJsonColumn('{nope', 'audit_log.details')).toThrow(RepositoryError);
  });

  it('serializes values and maps undefined to NULL', () => {
    expect(serializeJsonColumn({ a: 1 }, 'ctx')).toBe('{"a":1}');
    expect(serializeJsonColumn(null, 'ctx')).toBe('null');
    expect(serializeJsonColumn(undefined, 'ctx')).toBeNull();
  });

  it('rejects non-serializable values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => serializeJsonColumn(circular, 'ctx')).toThrow(RepositoryError);
  });
});

describe('platform mappers', () => {
  it('deviceMapper copies the row verbatim', () => {
    const row = {
      id: 'd1',
      deviceName: 'lab-01',
      platform: 'win32',
      osVersion: '10.0.19045',
      appVersion: '1.0.0',
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    };
    expect(deviceMapper.toModel(row)).toEqual(row);
  });

  it('appSettingMapper parses the JSON value column', () => {
    const model = appSettingMapper.toModel({
      id: 's1',
      key: 'theme',
      value: '"system"',
      createdAt: 't0',
      updatedAt: 't0',
    });
    expect(model.value).toBe('system');
  });

  it('syncQueueMapper parses payload and narrows enums', () => {
    const model = syncQueueMapper.toModel({
      id: 'q1',
      entityType: 'student',
      entityId: 'e1',
      operationType: 'create',
      payload: '{"name":"Ada"}',
      retryCount: 0,
      status: 'pending',
      createdAt: 't0',
      updatedAt: 't0',
    });
    expect(model.payload).toEqual({ name: 'Ada' });
    expect(model.status).toBe('pending');
  });

  it('auditLogMapper passes NULL details through as null', () => {
    const model = auditLogMapper.toModel({
      id: 'a1',
      category: 'database',
      event: 'database.started',
      details: null,
      createdAt: 't0',
    });
    expect(model.details).toBeNull();
  });
});
