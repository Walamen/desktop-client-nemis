import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountySettingsReadModel } from './SqliteCountySettingsReadModel';

const STAMP = '2026-01-01T00:00:00.000Z';

describe('SqliteCountySettingsReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
  });
  afterEach(() => test.cleanup());

  it('no county row yet: null and zero counts', () => {
    expect(new SqliteCountySettingsReadModel(test.context).get()).toEqual({ county: null, districtCount: 0, schoolCount: 0 });
  });

  it('the county row with its district and school counts', () => {
    run(
      `INSERT INTO counties (id,code,name,isActive,createdAt,updatedAt) VALUES ('county-1','GB','Grand Bassa',0,?,?)`,
      '2020-01-01T00:00:00.000Z', STAMP,
    );
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Owensgrove','county-1',0)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-far','Far','county-2',1)`);
    for (const [id, countyId] of [['sch-a', 'county-1'], ['sch-b', 'county-1'], ['sch-far', 'county-2']] as const) {
      run(
        `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
         VALUES (?,?,?,'SCHOOL','GOVERNMENT',?,'d-1','APPROVED',1,?,1)`,
        id, id, id, countyId, STAMP,
      );
    }
    expect(new SqliteCountySettingsReadModel(test.context).get()).toEqual({
      county: {
        id: 'county-1', name: 'Grand Bassa', code: 'GB', isActive: false,
        createdAt: '2020-01-01T00:00:00.000Z', updatedAt: STAMP,
      },
      districtCount: 2,
      schoolCount: 2,
    });
  });
});
