import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyUsersReadModel } from './SqliteCountyUsersReadModel';

const NOW = '2026-01-01T00:00:00.000Z';
/** The pinned clock: "now" for the 30-day active window. */
const CLOCK = new Date('2026-01-31T00:00:00.000Z');
const daysAgo = (days: number) => new Date(CLOCK.getTime() - days * 86_400_000).toISOString();

describe('SqliteCountyUsersReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyUsersReadModel;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const school = (
    id: string,
    name: string,
    districtId: string,
    opts: { isActive?: number; countyId?: string; type?: string } = {},
  ) =>
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,?,'GOVERNMENT',?,?,'APPROVED',1,?,?)`,
      id, id.toUpperCase(), name, opts.type ?? 'SCHOOL', opts.countyId ?? 'county-1', districtId, NOW, opts.isActive ?? 1,
    );
  const user = (
    id: string,
    opts: {
      first?: string;
      last?: string;
      email?: string | null;
      isActive?: number;
      createdAt?: string | null;
      lastLoginAt?: string | null;
      emailVerified?: number | null;
    } = {},
  ) =>
    run(
      `INSERT INTO users (id,firstName,lastName,email,isActive,version,updatedAt,phoneNumber,lastLoginAt,photoUrl,createdAt,emailVerified)
       VALUES (?,?,?,?,?,1,?,'0770000001',?,NULL,?,?)`,
      id, opts.first ?? 'Ama', opts.last ?? 'Kollie', opts.email === undefined ? `${id}@moe.gov.lr` : opts.email,
      opts.isActive ?? 1, NOW, opts.lastLoginAt ?? null, opts.createdAt === undefined ? NOW : opts.createdAt,
      opts.emailVerified === undefined ? null : opts.emailVerified,
    );
  const link = (
    id: string,
    userId: string,
    role: string,
    opts: { institutionId?: string | null; countyId?: string | null; districtId?: string | null; isActive?: number } = {},
  ) =>
    run(
      `INSERT INTO user_organizations (id,userId,role,institutionId,countyId,districtId,isActive) VALUES (?,?,?,?,?,?,?)`,
      id, userId, role, opts.institutionId ?? null, opts.countyId ?? null, opts.districtId ?? null, opts.isActive ?? 1,
    );
  /** A principal as real devices hold one: the school only, no county. */
  const principal = (userId: string, institutionId = 'sch-a', userOpts: Parameters<typeof user>[1] = {}) => {
    user(userId, userOpts);
    link(`o-${userId}`, userId, 'INSTITUTION_ADMIN', { institutionId });
  };

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyUsersReadModel(test.context, () => CLOCK);
    run(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Owensgrove','county-1',0)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-9','Elsewhere','county-2',1)`);
    school('sch-a', 'Alpha School', 'd-1');
    school('sch-b', 'Beta School', 'd-2');
    school('sch-closed', 'Closed School', 'd-1', { isActive: 0 });
    school('sch-office', 'District Office', 'd-1', { type: 'DISTRICT_OFFICE' });
    school('sch-other', 'Other County School', 'd-9', { countyId: 'county-2' });
  });
  afterEach(() => test.cleanup());

  const list = (extra: Record<string, unknown> = {}) => readModel.listUsers({ page: 1, limit: 12, ...extra });
  const ids = (extra: Record<string, unknown> = {}) => list(extra).data.map((u) => u.id);

  it('lists a principal whose link has no countyId (through the school)', () => {
    principal('u-p', 'sch-a', { first: 'Pat', last: 'Doe', lastLoginAt: daysAgo(1) });

    const result = list();
    expect(result.total).toBe(1);
    expect(result.data).toEqual([
      {
        id: 'u-p', firstName: 'Pat', lastName: 'Doe', email: 'u-p@moe.gov.lr', phoneNumber: '0770000001', photoUrl: null,
        role: 'INSTITUTION_ADMIN', isActive: true, emailVerified: null, lastLoginAt: daysAgo(1),
        districtId: null, districtName: null, institutionId: 'sch-a', schoolName: 'Alpha School',
      },
    ]);
    expect(result.stats).toEqual({ totalUsers: 1, activeUsers: 1, pendingActivation: 0, schoolAdmins: 1 });
  });

  it('lists a district-only legacy DEO link', () => {
    user('u-d');
    link('o-d', 'u-d', 'DEO', { districtId: 'd-1' });

    const [row] = list().data;
    expect(row).toMatchObject({ id: 'u-d', role: 'DEO', districtId: 'd-1', districtName: 'Buchanan', institutionId: null, schoolName: null });
  });

  it('lists a pool DEO as DEO with no district or school', () => {
    user('u-pool');
    link('o-pool', 'u-pool', 'DEO');

    const [row] = list().data;
    expect(row).toMatchObject({ id: 'u-pool', role: 'DEO', districtId: null, districtName: null, institutionId: null, schoolName: null });
  });

  it("excludes inactive links, TEACHER/COUNTY_ADMIN roles and another county's users", () => {
    user('u-ok');
    link('o-ok', 'u-ok', 'DEO', { countyId: 'county-1', districtId: 'd-1' });
    user('u-inactive-link');
    link('o-inactive', 'u-inactive-link', 'INSTITUTION_ADMIN', { institutionId: 'sch-a', isActive: 0 });
    user('u-teacher');
    link('o-teacher', 'u-teacher', 'TEACHER', { institutionId: 'sch-a' });
    user('u-ceo');
    link('o-ceo', 'u-ceo', 'COUNTY_ADMIN', { countyId: 'county-1' });
    principal('u-other-school', 'sch-other');
    user('u-other-county');
    link('o-other-county', 'u-other-county', 'DEO', { countyId: 'county-2' });
    user('u-other-district');
    link('o-other-district', 'u-other-district', 'DEO', { districtId: 'd-9' });

    const result = list();
    expect(result.data.map((u) => u.id)).toEqual(['u-ok']);
    expect(result.total).toBe(1);
    expect(result.stats.totalUsers).toBe(1);
  });

  it('a user with DEO and school-admin links appears once, as DEO, counted once', () => {
    user('u-both');
    // The school link sorts first by id; the DEO link still wins.
    link('o-a', 'u-both', 'INSTITUTION_ADMIN', { institutionId: 'sch-a' });
    link('o-z', 'u-both', 'DEO', { districtId: 'd-1' });
    user('u-two-schools');
    link('o-b1', 'u-two-schools', 'INSTITUTION_ADMIN', { institutionId: 'sch-b' });
    link('o-b2', 'u-two-schools', 'INSTITUTION_ADMIN', { institutionId: 'sch-a' });

    const result = list();
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.data.find((u) => u.id === 'u-both')).toMatchObject({
      role: 'DEO', districtId: 'd-1', districtName: 'Buchanan', institutionId: null, schoolName: null,
    });
    expect(result.data.find((u) => u.id === 'u-two-schools')).toMatchObject({ institutionId: 'sch-b', schoolName: 'Beta School' });
    expect(result.stats).toEqual({ totalUsers: 2, activeUsers: 0, pendingActivation: 0, schoolAdmins: 1 });
    expect(list({ role: 'DEO' }).total).toBe(1);
    expect(list({ role: 'INSTITUTION_ADMIN' }).data.map((u) => u.id)).toEqual(['u-two-schools']);
  });

  it('search matches name or email case-insensitively and % literally', () => {
    principal('u-1', 'sch-a', { first: 'Musu', last: 'Kollie', email: 'musu@moe.gov.lr' });
    principal('u-2', 'sch-a', { first: 'Jallah', last: 'Doe', email: 'JD@MOE.GOV.LR' });
    principal('u-3', 'sch-a', { first: '100%', last: 'Sure', email: null });
    principal('u-4', 'sch-a', { first: '1000', last: 'Plain', email: 'a_b@moe.gov.lr' });

    expect(ids({ search: 'KOLL' })).toEqual(['u-1']);
    expect(ids({ search: 'jd@moe' })).toEqual(['u-2']);
    expect(ids({ search: 'jallah' })).toEqual(['u-2']);
    expect(ids({ search: '0%' })).toEqual(['u-3']);
    expect(ids({ search: 'a_b' })).toEqual(['u-4']);
    expect(ids({ search: 'x_y' })).toEqual([]);
    const searched = list({ search: 'KOLL' });
    expect(searched.total).toBe(1);
    // Stats ignore the search.
    expect(searched.stats.totalUsers).toBe(4);
  });

  it('role filter; createdAt desc then id; null createdAt last; paging 12', () => {
    for (let n = 1; n <= 12; n += 1) {
      const id = `u-${String(n).padStart(2, '0')}`;
      principal(id, 'sch-a', { createdAt: `2025-06-${String(n).padStart(2, '0')}T00:00:00.000Z` });
    }
    principal('u-tie-b', 'sch-a', { createdAt: '2025-07-01T00:00:00.000Z' });
    principal('u-tie-a', 'sch-a', { createdAt: '2025-07-01T00:00:00.000Z' });
    principal('u-null', 'sch-a', { createdAt: null });
    user('u-deo', { createdAt: '2025-08-01T00:00:00.000Z' });
    link('o-deo', 'u-deo', 'DEO', { districtId: 'd-1' });

    const first = list();
    expect(first.total).toBe(16);
    expect(first.data.map((u) => u.id)).toEqual([
      'u-deo', 'u-tie-a', 'u-tie-b', 'u-12', 'u-11', 'u-10', 'u-09', 'u-08', 'u-07', 'u-06', 'u-05', 'u-04',
    ]);
    expect(ids({ page: 2 })).toEqual(['u-03', 'u-02', 'u-01', 'u-null']);

    const admins = list({ role: 'INSTITUTION_ADMIN', page: 2 });
    expect(admins.total).toBe(15);
    expect(admins.data.map((u) => u.id)).toEqual(['u-02', 'u-01', 'u-null']);
    expect(admins.stats.totalUsers).toBe(16);
    expect(ids({ role: 'DEO' })).toEqual(['u-deo']);
  });

  it('stats: 30-day edge (29d in, 31d out), inactive excluded from active, pending counts emailVerified=0 any isActive, NULL not pending', () => {
    principal('u-recent', 'sch-a', { lastLoginAt: daysAgo(29), emailVerified: 1 });
    principal('u-stale', 'sch-a', { lastLoginAt: daysAgo(31) });
    principal('u-disabled', 'sch-a', { isActive: 0, lastLoginAt: daysAgo(1) });
    principal('u-pending-off', 'sch-a', { isActive: 0, emailVerified: 0 });
    user('u-pending-on', { emailVerified: 0 });
    link('o-pending-on', 'u-pending-on', 'DEO');
    principal('u-never', 'sch-a', { emailVerified: null });

    const result = list();
    expect(result.stats).toEqual({ totalUsers: 6, activeUsers: 1, pendingActivation: 2, schoolAdmins: 5 });
    const byId = new Map(result.data.map((u) => [u.id, u]));
    expect(byId.get('u-recent')).toMatchObject({ emailVerified: true, isActive: true });
    expect(byId.get('u-pending-off')).toMatchObject({ emailVerified: false, isActive: false });
    expect(byId.get('u-never')?.emailVerified).toBeNull();
  });

  it("no counties row → all schools' admins (OWN_COUNTY fallback)", () => {
    principal('u-here', 'sch-a');
    principal('u-there', 'sch-other');
    expect(ids().sort()).toEqual(['u-here']);

    run('DELETE FROM counties');
    expect(ids().sort()).toEqual(['u-here', 'u-there']);
    expect(list().stats.totalUsers).toBe(2);
  });

  it('listOptions: county districts by name; active SCHOOL-type institutions only', () => {
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-0','Arthington','county-1',1)`);
    school('sch-0', 'Aardvark School', 'd-2');

    expect(readModel.listOptions()).toEqual({
      districts: [
        { id: 'd-0', name: 'Arthington' },
        { id: 'd-1', name: 'Buchanan' },
        { id: 'd-2', name: 'Owensgrove' },
      ],
      schools: [
        { id: 'sch-0', name: 'Aardvark School', districtId: 'd-2' },
        { id: 'sch-a', name: 'Alpha School', districtId: 'd-1' },
        { id: 'sch-b', name: 'Beta School', districtId: 'd-2' },
      ],
    });
  });
});
