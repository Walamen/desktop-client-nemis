import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyNotificationsRepository } from './SqliteCountyNotificationsRepository';

const STAMP = '2026-01-01T00:00:00.000Z';
const NOW = '2026-10-21T08:00:00.000Z';

describe('SqliteCountyNotificationsRepository', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let repository: SqliteCountyNotificationsRepository;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const notification = (id: string, recipientId: string, isRead: number, createdAt: string, link: string | null = null) =>
    run(
      `INSERT INTO user_notifications (id,recipientId,type,title,message,isRead,metadata,link,createdAt,updatedAt)
       VALUES (?,?,'SYSTEM_ANNOUNCEMENT',?,?,?,NULL,?,?,?)`,
      id, recipientId, `Title ${id}`, `Message ${id}`, isRead, link, createdAt, createdAt,
    );
  const alert = (id: string, opts: { countyId?: string | null; districtId?: string | null; institutionId?: string | null; isResolved?: number }) =>
    run(
      `INSERT INTO alerts (id,countyId,districtId,institutionId,type,severity,title,description,isResolved,resolvedAt,resolvedBy,metadata,createdAt,updatedAt)
       VALUES (?,?,?,?,'DATA','HIGH','A','D',?,NULL,NULL,NULL,?,?)`,
      id, opts.countyId ?? null, opts.districtId ?? null, opts.institutionId ?? null, opts.isResolved ?? 0, STAMP, STAMP,
    );

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    repository = new SqliteCountyNotificationsRepository(test.context, () => NOW);
    run(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-far','Far','county-2',1)`);
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES ('sch-a','A','Alpha','SCHOOL','GOVERNMENT','county-1','d-1','APPROVED',1,?,1)`,
      STAMP,
    );
    for (let i = 1; i <= 25; i += 1) {
      notification(`n-${String(i).padStart(2, '0')}`, 'ceo-1', i % 5 === 0 ? 1 : 0, `2026-10-${String(i).padStart(2, '0')}T00:00:00.000Z`);
    }
    notification('other', 'someone-else', 0, '2026-10-30T00:00:00.000Z');
    alert('al-county', { countyId: 'county-1' });
    alert('al-school', { institutionId: 'sch-a' });
    alert('al-district', { districtId: 'd-1' });
    alert('al-resolved', { countyId: 'county-1', isResolved: 1 });
    alert('al-far', { districtId: 'd-far' });
  });
  afterEach(() => test.cleanup());

  it('filters, pages of 20 newest first, and counts', () => {
    const first = repository.list('ceo-1', { filter: 'ALL', page: 1, limit: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.items[0]).toEqual({
      id: 'n-25', type: 'SYSTEM_ANNOUNCEMENT', title: 'Title n-25', message: 'Message n-25', isRead: true,
      link: null, createdAt: '2026-10-25T00:00:00.000Z',
    });
    expect(first).toMatchObject({ total: 25, totalAll: 25, unread: 20, page: 1, limit: 20 });
    expect(repository.list('ceo-1', { filter: 'ALL', page: 2, limit: 20 }).items.map((n) => n.id)).toEqual([
      'n-05', 'n-04', 'n-03', 'n-02', 'n-01',
    ]);
    const unread = repository.list('ceo-1', { filter: 'UNREAD', page: 1, limit: 20 });
    expect(unread).toMatchObject({ total: 20, totalAll: 25 });
    expect(repository.list('ceo-1', { filter: 'READ', page: 1, limit: 20 }).total).toBe(5);
  });

  it('alerts unresolved counts only the county', () => {
    expect(repository.list('ceo-1', { filter: 'ALL', page: 1, limit: 20 }).alertsUnresolved).toBe(3);
  });

  it('mark read writes an outbox update', () => {
    expect(repository.markRead('ceo-1', 'n-01')).toBe(true);
    expect(db.prepare(`SELECT isRead, updatedAt FROM user_notifications WHERE id = 'n-01'`).get()).toEqual({
      isRead: 1,
      updatedAt: NOW,
    });
    const queued = db
      .prepare(
        `SELECT entityType, entityId, operationType FROM sync_queue
         WHERE entityType = 'user_notifications' AND operationType = 'update'`,
      )
      .all();
    expect(queued).toEqual([{ entityType: 'user_notifications', entityId: 'n-01', operationType: 'update' }]);
    expect(repository.markRead('ceo-1', 'n-01')).toBe(false);
  });

  it("mark read of someone else's notification changes nothing", () => {
    expect(repository.markRead('ceo-1', 'other')).toBe(false);
    expect(db.prepare(`SELECT isRead FROM user_notifications WHERE id = 'other'`).get()).toEqual({ isRead: 0 });
  });

  it('mark all read marks only my unread ones', () => {
    expect(repository.markAllRead('ceo-1')).toBe(20);
    expect(repository.list('ceo-1', { filter: 'UNREAD', page: 1, limit: 20 }).total).toBe(0);
    expect(db.prepare(`SELECT isRead FROM user_notifications WHERE id = 'other'`).get()).toEqual({ isRead: 0 });
  });
});
