import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../../errors/repositoryErrors';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { SqliteAppSettingsRepository } from './SqliteAppSettingsRepository';

describe('SqliteAppSettingsRepository', () => {
  let test: TestContext;
  let repo: SqliteAppSettingsRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteAppSettingsRepository(test.context);
  });

  afterEach(() => {
    test.cleanup();
  });

  it('setByKey inserts a new setting and getByKey round-trips the value', () => {
    const setting = repo.setByKey('theme', 'dark');
    expect(setting.key).toBe('theme');
    expect(setting.value).toBe('dark');
    expect(repo.getByKey('theme')?.value).toBe('dark');
  });

  it('setByKey updates an existing setting in place (same id, same key)', () => {
    const first = repo.setByKey('theme', 'dark');
    const second = repo.setByKey('theme', 'light');
    expect(second.id).toBe(first.id);
    expect(second.value).toBe('light');
    expect(repo.getAll()).toHaveLength(1);
  });

  it('stores structured values and null', () => {
    repo.setByKey('sync', { intervalMinutes: 15, enabled: true });
    expect(repo.getByKey('sync')?.value).toEqual({ intervalMinutes: 15, enabled: true });
    repo.setByKey('flag', null);
    expect(repo.getByKey('flag')?.value).toBeNull();
  });

  it('getByKey returns null for a missing key', () => {
    expect(repo.getByKey('missing')).toBeNull();
  });

  it('getAll returns settings ordered by key', () => {
    repo.setByKey('b', 1);
    repo.setByKey('a', 2);
    expect(repo.getAll().map((s) => s.key)).toEqual(['a', 'b']);
  });

  it('deleteByKey reports whether a setting was removed', () => {
    repo.setByKey('theme', 'dark');
    expect(repo.deleteByKey('theme')).toBe(true);
    expect(repo.deleteByKey('theme')).toBe(false);
  });

  it('rejects invalid keys and non-serializable values', () => {
    expect(() => repo.setByKey('', 'x')).toThrow(ValidationError);
    expect(() => repo.setByKey('k'.repeat(129), 'x')).toThrow(ValidationError);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => repo.setByKey('bad', circular)).toThrow(ValidationError);
  });
});
