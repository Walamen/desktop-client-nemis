import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../errors/repositoryErrors';
import { createTestContext, type TestContext } from '../../testing/createTestContext';
import { SqliteAuditLogRepository } from './SqliteAuditLogRepository';

describe('SqliteAuditLogRepository', () => {
  let test: TestContext;
  let repo: SqliteAuditLogRepository;

  // Fake timers: see SqliteSyncQueueRepository.test.ts — 1ms ticks make
  // createdAt-ordered assertions deterministic.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00.000Z'));
    test = createTestContext();
    repo = new SqliteAuditLogRepository(test.context);
  });

  afterEach(() => {
    vi.useRealTimers();
    test.cleanup();
  });

  const tick = () => vi.advanceTimersByTime(1);

  it('append stores an entry with details and generates id/createdAt', () => {
    const entry = repo.append({
      category: 'security',
      event: 'permission.denied',
      details: { channel: 'settings:get' },
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.details).toEqual({ channel: 'settings:get' });
    expect(repo.count()).toBe(1);
  });

  it('append validates category and event', () => {
    expect(() => repo.append({ category: 'nope' as never, event: 'x' })).toThrow(ValidationError);
    expect(() => repo.append({ category: 'sync', event: '' })).toThrow(ValidationError);
  });

  it('findByCategory filters and supports paging', () => {
    repo.append({ category: 'sync', event: 'sync.started' });
    tick();
    repo.append({ category: 'database', event: 'database.started' });
    tick();
    repo.append({ category: 'sync', event: 'sync.finished' });
    const syncEntries = repo.findByCategory('sync');
    expect(syncEntries.map((e) => e.event)).toEqual(['sync.started', 'sync.finished']);
    expect(repo.findByCategory('sync', { page: { limit: 1, offset: 1 } })).toHaveLength(1);
  });

  it('findInRange bounds by createdAt inclusively', () => {
    const entry = repo.append({ category: 'application', event: 'app.started' });
    expect(repo.findInRange(entry.createdAt, entry.createdAt)).toHaveLength(1);
    expect(repo.findInRange('2000-01-01T00:00:00.000Z', '2000-12-31T00:00:00.000Z')).toHaveLength(
      0,
    );
  });

  it('findPage returns a page with total', () => {
    repo.append({ category: 'sync', event: 'a' });
    repo.append({ category: 'sync', event: 'b' });
    const page = repo.findPage({ page: { limit: 1, offset: 0 } });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  it('prune deletes entries older than the cutoff and validates the cutoff', () => {
    repo.append({ category: 'sync', event: 'old' });
    expect(repo.prune('9999-01-01T00:00:00.000Z')).toBe(1);
    expect(repo.count()).toBe(0);
    expect(() => repo.prune('garbage')).toThrow(ValidationError);
  });
});
