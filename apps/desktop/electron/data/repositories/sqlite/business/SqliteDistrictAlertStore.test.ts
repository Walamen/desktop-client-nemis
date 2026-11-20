import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteDistrictAlertStore } from './SqliteDistrictAlertStore';

const STAMP = '2026-01-01T00:00:00.000Z';
const NOW = '2026-11-16T12:00:00.000Z';
const OFFICER = { id: 'deo-1', name: 'Ama Kollie' };

describe('SqliteDistrictAlertStore', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let store: SqliteDistrictAlertStore;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const school = (id: string, districtId: string) =>
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'PRIMARY','PUBLIC','county-1',?,'APPROVED',1,?,1)`,
      id, id, `School ${id}`, districtId, STAMP,
    );
  const alert = (id: string, opts: { countyId?: string | null; districtId?: string | null; institutionId?: string | null; isResolved?: number }) =>
    run(
      `INSERT INTO alerts (id,countyId,districtId,institutionId,type,severity,title,description,isResolved,resolvedAt,resolvedBy,metadata,createdAt,updatedAt)
       VALUES (?,?,?,?,'DATA','HIGH','A','D',?,NULL,NULL,NULL,?,?)`,
      id, opts.countyId ?? null, opts.districtId ?? null, opts.institutionId ?? null, opts.isResolved ?? 0, STAMP, STAMP,
    );
  const row = (id: string) =>
    db.prepare(`SELECT isResolved, resolvedAt, resolvedBy, updatedAt FROM alerts WHERE id = ?`).get(id);
  const queued = () =>
    db
      .prepare(`SELECT entityType, entityId, operationType FROM sync_queue WHERE entityType = 'alerts' AND operationType = 'update'`)
      .all();

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    store = new SqliteDistrictAlertStore(test.context);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Compound 3','county-1',1)`);
    school('s-1', 'd-1');
    school('s-9', 'd-2');
    alert('a-district', { districtId: 'd-1' });
    alert('a-school', { institutionId: 's-1' });
    alert('a-county', { countyId: 'county-1' });
    alert('a-other-district', { districtId: 'd-2' });
    alert('a-other-school', { institutionId: 's-9' });
    alert('a-done', { districtId: 'd-1', isResolved: 1 });
    // Seeding queued inserts; only what resolve() queues matters below.
    run(`DELETE FROM sync_queue`);
  });
  afterEach(() => test.cleanup());

  it('resolves an alert tagged with the district and queues it for sync', () => {
    expect(store.resolve('d-1', 'a-district', OFFICER, NOW)).toBe(true);
    expect(row('a-district')).toEqual({ isResolved: 1, resolvedAt: NOW, resolvedBy: 'deo-1', updatedAt: NOW });
    expect(queued()).toEqual([{ entityType: 'alerts', entityId: 'a-district', operationType: 'update' }]);
  });

  it('resolves an alert raised against a school of the district', () => {
    expect(store.resolve('d-1', 'a-school', OFFICER, NOW)).toBe(true);
    expect(row('a-school')).toMatchObject({ isResolved: 1, resolvedBy: 'deo-1' });
  });

  it('does nothing the second time', () => {
    store.resolve('d-1', 'a-district', OFFICER, NOW);
    expect(store.resolve('d-1', 'a-district', { id: 'deo-2', name: 'Other Officer' }, '2026-11-17T00:00:00.000Z')).toBe(false);
    expect(row('a-district')).toMatchObject({ resolvedAt: NOW, resolvedBy: 'deo-1' });
    expect(queued()).toHaveLength(1);
  });

  it.each(['a-county', 'a-other-district', 'a-other-school', 'a-missing'])(
    'leaves %s alone: it is not this district’s',
    (alertId) => {
      expect(store.resolve('d-1', alertId, OFFICER, NOW)).toBe(false);
      if (alertId !== 'a-missing') expect(row(alertId)).toMatchObject({ isResolved: 0, resolvedBy: null });
      expect(queued()).toEqual([]);
    },
  );

  it("leaves a school's own staff request for the school admin to answer", () => {
    alert('a-request', { institutionId: 's-1' });
    run(`UPDATE alerts SET metadata = ? WHERE id = 'a-request'`, JSON.stringify({ gradeId: 'g-1', staffId: 'stf-1' }));
    run(`DELETE FROM sync_queue`);
    expect(store.resolve('d-1', 'a-request', OFFICER, NOW)).toBe(false);
    expect(row('a-request')).toMatchObject({ isResolved: 0 });
    expect(queued()).toEqual([]);
  });

  it('refuses an alert raised against an inactive school', () => {
    run(`UPDATE institutions SET isActive = 0 WHERE id = 's-1'`);
    run(`DELETE FROM sync_queue`);
    expect(store.resolve('d-1', 'a-school', OFFICER, NOW)).toBe(false);
    expect(row('a-school')).toMatchObject({ isResolved: 0, resolvedBy: null, updatedAt: STAMP });
    expect(queued()).toEqual([]);
  });

  it('leaves an already resolved alert as it was', () => {
    expect(store.resolve('d-1', 'a-done', OFFICER, NOW)).toBe(false);
    expect(row('a-done')).toMatchObject({ resolvedAt: null, resolvedBy: null, updatedAt: STAMP });
    expect(queued()).toEqual([]);
  });

  describe('infrastructure issues', () => {
    const issue = (
      id: string,
      opts: { status?: string; severity?: string; countyId?: string | null; districtId?: string | null; institutionId?: string | null; type?: string } = {},
    ) => {
      run(
        `INSERT INTO alerts (id,countyId,districtId,institutionId,type,severity,title,description,isResolved,metadata,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,'Leaking roof','D',0,?,?,?)`,
        id,
        opts.countyId ?? null,
        opts.districtId === undefined ? 'd-1' : opts.districtId,
        opts.institutionId ?? null,
        opts.type ?? 'INFRASTRUCTURE_ISSUE',
        opts.severity ?? 'HIGH',
        JSON.stringify({ ...(opts.status ? { status: opts.status } : {}), attachments: ['a.jpg'], acknowledgedAt: '2026-10-01T00:00:00.000Z' }),
        STAMP,
        STAMP,
      );
      run(`DELETE FROM sync_queue`);
    };
    const full = (id: string) => {
      const r = db.prepare(`SELECT isResolved, resolvedAt, resolvedBy, countyId, updatedAt, metadata FROM alerts WHERE id = ?`).get(id) as {
        countyId: string | null;
        metadata: string;
      } & Record<string, unknown>;
      return { ...r, metadata: JSON.parse(r.metadata) as Record<string, unknown> };
    };

    it('review: OPEN becomes UNDER_REVIEW, keeping the other metadata, and queues a sync', () => {
      issue('i-1');
      expect(store.review('d-1', 'i-1', OFFICER, 'Looking into it', NOW)).toBe(true);
      expect(full('i-1')).toMatchObject({
        isResolved: 0,
        updatedAt: NOW,
        metadata: {
          status: 'UNDER_REVIEW',
          reviewedAt: NOW,
          reviewedById: 'deo-1',
          reviewedByName: 'Ama Kollie',
          reviewComments: 'Looking into it',
          attachments: ['a.jpg'],
          acknowledgedAt: '2026-10-01T00:00:00.000Z',
        },
      });
      expect(queued()).toEqual([{ entityType: 'alerts', entityId: 'i-1', operationType: 'update' }]);
    });

    it('review: a missing comment is stored as null', () => {
      issue('i-1');
      store.review('d-1', 'i-1', OFFICER, null, NOW);
      expect(full('i-1').metadata.reviewComments).toBeNull();
    });

    it('review: UNDER_REVIEW is refused and nothing is queued', () => {
      issue('i-1', { status: 'UNDER_REVIEW' });
      expect(store.review('d-1', 'i-1', OFFICER, null, NOW)).toBe(false);
      expect(full('i-1')).toMatchObject({ updatedAt: STAMP });
      expect(queued()).toEqual([]);
    });

    it('a status that is not OPEN, UNDER_REVIEW or ESCALATED counts as OPEN', () => {
      issue('i-1', { status: 'RESOLVED' });
      expect(store.review('d-1', 'i-1', OFFICER, null, NOW)).toBe(true);
    });

    it('resolveInfrastructure: UNDER_REVIEW resolves the alert', () => {
      issue('i-1', { status: 'UNDER_REVIEW' });
      expect(store.resolveInfrastructure('d-1', 'i-1', OFFICER, 'Fixed', NOW)).toBe(true);
      expect(full('i-1')).toMatchObject({
        isResolved: 1,
        resolvedAt: NOW,
        resolvedBy: 'deo-1',
        updatedAt: NOW,
        metadata: {
          status: 'RESOLVED',
          resolvedAt: NOW,
          resolvedById: 'deo-1',
          resolvedByName: 'Ama Kollie',
          resolutionComments: 'Fixed',
          attachments: ['a.jpg'],
          acknowledgedAt: '2026-10-01T00:00:00.000Z',
        },
      });
      expect(queued()).toHaveLength(1);
    });

    it('resolveInfrastructure: ESCALATED is refused', () => {
      issue('i-1', { status: 'ESCALATED' });
      expect(store.resolveInfrastructure('d-1', 'i-1', OFFICER, null, NOW)).toBe(false);
      expect(full('i-1')).toMatchObject({ isResolved: 0, updatedAt: STAMP });
      expect(queued()).toEqual([]);
    });

    it('escalate: LOW severity is refused', () => {
      issue('i-1', { severity: 'LOW' });
      expect(store.escalate('d-1', 'i-1', OFFICER, 'Urgent', NOW)).toBe(false);
      expect(queued()).toEqual([]);
    });

    it('escalate: HIGH becomes ESCALATED and fills a null countyId from the district', () => {
      issue('i-1');
      expect(store.escalate('d-1', 'i-1', OFFICER, 'Roof may collapse', NOW)).toBe(true);
      expect(full('i-1')).toMatchObject({
        isResolved: 0,
        countyId: 'county-1',
        updatedAt: NOW,
        metadata: {
          status: 'ESCALATED',
          escalatedAt: NOW,
          escalatedById: 'deo-1',
          escalatedByName: 'Ama Kollie',
          escalationReason: 'Roof may collapse',
          escalatedToCounty: true,
          attachments: ['a.jpg'],
          acknowledgedAt: '2026-10-01T00:00:00.000Z',
        },
      });
      expect(queued()).toHaveLength(1);
    });

    it('escalate: keeps an existing countyId', () => {
      issue('i-1', { severity: 'CRITICAL', countyId: 'county-x' });
      expect(store.escalate('d-1', 'i-1', OFFICER, 'Reason', NOW)).toBe(true);
      expect(full('i-1').countyId).toBe('county-x');
    });

    it('escalate: a blank or whitespace reason is refused and nothing is queued', () => {
      issue('i-1');
      expect(store.escalate('d-1', 'i-1', OFFICER, '', NOW)).toBe(false);
      expect(store.escalate('d-1', 'i-1', OFFICER, '   ', NOW)).toBe(false);
      expect(full('i-1')).toMatchObject({ isResolved: 0, metadata: { attachments: ['a.jpg'] } });
      expect(queued()).toEqual([]);
    });

    it('escalate: ESCALATED again is refused', () => {
      issue('i-1', { status: 'ESCALATED' });
      expect(store.escalate('d-1', 'i-1', OFFICER, 'Again', NOW)).toBe(false);
    });

    it('the new actions refuse other types, other districts and school staff requests', () => {
      issue('i-other-type', { type: 'ATTENDANCE_CONCERN' });
      issue('i-other-district', { districtId: 'd-2' });
      issue('i-county', { districtId: null, countyId: 'county-1' });
      for (const id of ['i-other-type', 'i-other-district', 'i-county', 'missing']) {
        expect(store.review('d-1', id, OFFICER, null, NOW)).toBe(false);
        expect(store.resolveInfrastructure('d-1', id, OFFICER, null, NOW)).toBe(false);
        expect(store.escalate('d-1', id, OFFICER, 'r', NOW)).toBe(false);
      }
      expect(queued()).toEqual([]);
    });

    it('shared resolve: an ESCALATED issue is also marked RESOLVED with the officer', () => {
      issue('i-1', { status: 'ESCALATED' });
      expect(store.resolve('d-1', 'i-1', OFFICER, NOW)).toBe(true);
      expect(full('i-1')).toMatchObject({
        isResolved: 1,
        resolvedBy: 'deo-1',
        metadata: {
          status: 'RESOLVED',
          resolvedAt: NOW,
          resolvedById: 'deo-1',
          resolvedByName: 'Ama Kollie',
          attachments: ['a.jpg'],
          acknowledgedAt: '2026-10-01T00:00:00.000Z',
        },
      });
    });

    it('shared resolve: other alert types keep their metadata unchanged', () => {
      issue('i-att', { type: 'ATTENDANCE_CONCERN' });
      const before = full('i-att').metadata;
      expect(store.resolve('d-1', 'i-att', OFFICER, NOW)).toBe(true);
      expect(full('i-att').metadata).toEqual(before);
    });
  });
});
