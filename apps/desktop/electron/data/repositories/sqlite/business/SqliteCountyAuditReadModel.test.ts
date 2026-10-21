import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyAuditReadModel } from './SqliteCountyAuditReadModel';

// Local time, like the cards (today = since local midnight).
const NOW = new Date(2026, 9, 21, 12, 0, 0);
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h, 0, 0).toISOString();

describe('SqliteCountyAuditReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyAuditReadModel;

  const audit = (id: string, timestamp: string, extra: Partial<Record<string, string>> = {}) =>
    db
      .prepare(
        `INSERT INTO audit_logs (id,userId,action,entityType,entityId,timestamp,actorName,actorScope)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        id, extra.userId ?? 'deo-1', extra.action ?? 'CREATE', extra.entityType ?? 'Student', null,
        timestamp, extra.actorName ?? 'James Doe', extra.actorScope ?? 'District',
      );

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyAuditReadModel(test.context, () => NOW);
  });
  afterEach(() => test.cleanup());

  it('cards: 12 months, since local midnight, since midnight 7 days ago', () => {
    audit('today', at(2026, 9, 21, 8));
    audit('this-week', at(2026, 9, 15));
    audit('last-month', at(2026, 8, 1));
    audit('too-old', at(2025, 9, 20));
    expect(readModel.getStats()).toMatchObject({ total: 3, today: 1, week: 2 });
  });

  it('filter options are the actions and entity types present, labelled and sorted', () => {
    audit('a', at(2026, 9, 20), { action: 'UPDATE', entityType: 'feeRule' });
    audit('b', at(2026, 9, 20), { action: 'CREATE', entityType: 'institutions' });
    audit('c', at(2026, 9, 20), { action: 'CREATE', entityType: 'Staff' });
    audit('old', at(2025, 0, 1), { action: 'DELETE', entityType: 'Term' });
    const stats = readModel.getStats();
    expect(stats.actions).toEqual([
      { value: 'CREATE', label: 'Created' },
      { value: 'UPDATE', label: 'Updated' },
    ]);
    expect(stats.entityTypes).toEqual([
      { value: 'feeRule', label: 'Fee Rule' },
      { value: 'institutions', label: 'Institution' },
      { value: 'Staff', label: 'Staff' },
    ]);
  });

  it('lists newest first with labels and pages', () => {
    for (let i = 0; i < 120; i += 1) audit(`r-${String(i).padStart(3, '0')}`, new Date(NOW.getTime() - i * 60_000).toISOString());
    const first = readModel.list({ page: 1, limit: 50 });
    expect(first.total).toBe(120);
    expect(first.items[0]).toEqual({
      id: 'r-000', action: 'CREATE', actionLabel: 'Created', entityType: 'Student', entityLabel: 'Student',
      actorName: 'James Doe', scope: 'District', timestamp: NOW.toISOString(),
    });
    expect(readModel.list({ page: 3, limit: 50 }).items).toHaveLength(20);
  });

  it('search matches actor name, action label and entity label; filters are exact', () => {
    audit('a', at(2026, 9, 20), { actorName: 'Comfort Kollie', action: 'UPDATE', entityType: 'Staff' });
    audit('b', at(2026, 9, 19), { action: 'CREATE', entityType: 'feeRule' });
    audit('c', at(2026, 9, 18), { action: 'DELETE', entityType: 'Term' });
    const ids = (q: Parameters<SqliteCountyAuditReadModel['list']>[0]) => readModel.list(q).items.map((r) => r.id);
    expect(ids({ page: 1, limit: 50, search: 'comf' })).toEqual(['a']);
    expect(ids({ page: 1, limit: 50, search: 'creat' })).toEqual(['b']);
    expect(ids({ page: 1, limit: 50, search: 'fee rule' })).toEqual(['b']);
    expect(ids({ page: 1, limit: 50, action: 'DELETE' })).toEqual(['c']);
    expect(ids({ page: 1, limit: 50, entityType: 'Staff' })).toEqual(['a']);
    expect(readModel.list({ page: 1, limit: 50, search: 'comf', action: 'CREATE' }).total).toBe(0);
  });

  it('search text with LIKE wildcards or quotes matches literally', () => {
    audit('a', at(2026, 9, 20), { actorName: 'James Doe' });
    audit('b', at(2026, 9, 20), { actorName: '50%_off' });
    expect(readModel.list({ page: 1, limit: 50, search: '50%_' }).items.map((r) => r.id)).toEqual(['b']);
    expect(readModel.list({ page: 1, limit: 50, search: '%' }).items.map((r) => r.id)).toEqual(['b']);
    expect(readModel.list({ page: 1, limit: 50, search: "o'b" }).total).toBe(0);
  });

  it('rows older than 12 months are not listed', () => {
    audit('old', at(2025, 9, 1));
    expect(readModel.list({ page: 1, limit: 50 })).toEqual({ items: [], total: 0, page: 1, limit: 50 });
  });
});
