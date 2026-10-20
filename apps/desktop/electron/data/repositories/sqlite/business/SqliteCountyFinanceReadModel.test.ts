import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyFinanceReadModel } from './SqliteCountyFinanceReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyFinanceReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyFinanceReadModel;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const school = (
    id: string,
    name: string,
    districtId: string | null,
    opts: { isActive?: number; countyId?: string; ownership?: string } = {},
  ) =>
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'SCHOOL',?,?,?,'APPROVED',1,?,?)`,
      id, `${id.toUpperCase()}-CODE`, name, opts.ownership ?? 'GOVERNMENT', opts.countyId ?? 'county-1', districtId, NOW,
      opts.isActive ?? 1,
    );
  const year = (id: string, institutionId: string, isCurrent: number, code = 'Y2026') =>
    run(
      `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt) VALUES (?,?,?,?,?,?,1,?)`,
      id, institutionId, code, '2025-09-01', '2026-07-01', isCurrent, NOW,
    );
  const student = (id: string, institutionId: string, first: string, last: string, isActive = 1) =>
    run(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt)
       VALUES (?,?,?,?,?,'2014-02-03','FEMALE',?,1,?)`,
      id, institutionId, first, last, `1000000000${id.slice(-2).padStart(2, '0')}`, isActive, NOW,
    );
  const rule = (
    id: string,
    institutionId: string | null,
    name: string,
    opts: { isActive?: number; isMandatory?: number; createdAt?: string; levels?: string } = {},
  ) =>
    run(
      `INSERT INTO fee_rules (id,institutionId,name,description,category,amount,currency,applicableLevels,isMandatory,isActive,createdBy,createdAt,updatedAt)
       VALUES (?,?,?,NULL,'TUITION',100,'LRD',?,?,?,'u',?,?)`,
      id, institutionId, name, opts.levels ?? '["PRIMARY"]', opts.isMandatory ?? 1, opts.isActive ?? 1,
      opts.createdAt ?? NOW, NOW,
    );
  const obligation = (
    id: string,
    studentId: string,
    feeRuleId: string,
    institutionId: string,
    yearId: string,
    required: number,
    paid: number,
    status: string,
  ) =>
    run(
      `INSERT INTO fee_obligations (id,studentId,feeRuleId,institutionId,academicYearId,termId,requiredAmount,totalPaid,status,createdBy,createdAt,updatedAt)
       VALUES (?,?,?,?,?,'term-1',?,?,?,'u',?,?)`,
      id, studentId, feeRuleId, institutionId, yearId, required, paid, status, NOW, NOW,
    );
  const payment = (
    id: string,
    obligationId: string,
    studentId: string,
    institutionId: string,
    amount: number,
    paidAt: string,
    opts: { isReversed?: number; method?: string } = {},
  ) =>
    run(
      `INSERT INTO fee_payments (id,obligationId,studentId,institutionId,amount,method,reference,notes,receiptNumber,recordedBy,isReversed,paidAt,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,NULL,NULL,?,'u',?,?,?,?)`,
      id, obligationId, studentId, institutionId, amount, opts.method ?? 'CASH', `R-${id}`, opts.isReversed ?? 0, paidAt, NOW, NOW,
    );

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyFinanceReadModel(test.context);
    run(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Owensgrove','county-1',1)`);
    school('sch-a', 'Alpha School', 'd-1');
    school('sch-b', 'Beta School', 'd-2', { ownership: 'PRIVATE' });
    school('sch-n', 'Nowhere School', null);
    school('sch-c', 'Closed School', 'd-1', { isActive: 0 });
    school('sch-f', 'Far School', 'd-1', { countyId: 'county-2' });
    year('y-a', 'sch-a', 1);
    year('y-a-old', 'sch-a', 0, 'Y2025');
    year('y-b', 'sch-b', 1);
    year('y-c', 'sch-c', 1);
    year('y-f', 'sch-f', 1);
    // sch-n has no current year.

    student('st-01', 'sch-a', 'Mary', 'Kollie');
    student('st-02', 'sch-a', 'John', 'Doe');
    student('st-03', 'sch-a', 'Ama', 'Sirleaf');
    student('st-04', 'sch-a', 'No', 'Fees');
    student('st-05', 'sch-a', 'Gone', 'Away', 0);
    student('st-06', 'sch-b', 'Musu', 'Kpoto');
    student('st-07', 'sch-n', 'Nobody', 'Here');
    student('st-08', 'sch-c', 'Closed', 'Kid');
    student('st-09', 'sch-f', 'Far', 'Kid');

    rule('r-a', 'sch-a', 'Tuition', { createdAt: '2026-01-02T00:00:00.000Z' });
    rule('r-a2', 'sch-a', 'Old Uniform', { isActive: 0 });
    rule('r-a3', 'sch-a', 'Sports', { isMandatory: 0, levels: '{}' });
    rule('r-b', 'sch-b', 'Beta Tuition', { levels: '[]' });
    rule('r-c', 'sch-c', 'Closed Tuition');
    rule('r-f', 'sch-f', 'Far Tuition');
    rule('r-nat', null, 'National Levy');

    // Alpha, current year: Mary paid (paid + waived), John partial (paid + outstanding), Ama unpaid.
    obligation('o-01', 'st-01', 'r-a', 'sch-a', 'y-a', 100, 100, 'PAID_IN_FULL');
    obligation('o-01b', 'st-01', 'r-a2', 'sch-a', 'y-a', 50, 0, 'WAIVED');
    obligation('o-02', 'st-02', 'r-a', 'sch-a', 'y-a', 100, 100, 'PAID_IN_FULL');
    obligation('o-02b', 'st-02', 'r-a2', 'sch-a', 'y-a', 50, 0, 'OUTSTANDING');
    obligation('o-03', 'st-03', 'r-a', 'sch-a', 'y-a', 100, 0, 'OUTSTANDING');
    // Alpha, last year: fully paid, must not count anywhere.
    obligation('o-03-old', 'st-03', 'r-a', 'sch-a', 'y-a-old', 1000, 1000, 'PAID_IN_FULL');
    obligation('o-06', 'st-06', 'r-b', 'sch-b', 'y-b', 200, 150, 'PARTIALLY_PAID');
    obligation('o-08', 'st-08', 'r-c', 'sch-c', 'y-c', 100, 100, 'PAID_IN_FULL');
    obligation('o-09', 'st-09', 'r-f', 'sch-f', 'y-f', 100, 100, 'PAID_IN_FULL');

    payment('p-01', 'o-01', 'st-01', 'sch-a', 100, '2026-03-01T10:00:00.000Z');
    payment('p-02', 'o-02', 'st-02', 'sch-a', 60, '2026-03-02T10:00:00.000Z');
    payment('p-02-rev', 'o-02', 'st-02', 'sch-a', 40, '2026-03-03T09:00:00.000Z', { isReversed: 1 });
    payment('p-02-local', 'o-02', 'st-02', 'sch-a', 40, '2026-03-03T10:00:00.000Z');
    run(
      `INSERT INTO fee_payment_reversals (id,paymentId,institutionId,reason,reversedBy,reversedAt,createdAt,updatedAt)
       VALUES ('rv-1','p-02-local','sch-a','Duplicate','u',?,?,?)`,
      NOW, NOW, NOW,
    );
    payment('p-02d', 'o-02', 'st-02', 'sch-a', 40, '2026-03-04T10:00:00.000Z');
    payment('p-03-old', 'o-03-old', 'st-03', 'sch-a', 1000, '2025-03-01T10:00:00.000Z');
    payment('p-06', 'o-06', 'st-06', 'sch-b', 150, '2026-03-05T10:00:00.000Z', { method: 'MOBILE_MONEY' });
    payment('p-08', 'o-08', 'st-08', 'sch-c', 100, '2026-03-06T10:00:00.000Z');
    payment('p-09', 'o-09', 'st-09', 'sch-f', 100, '2026-03-07T10:00:00.000Z');
  });
  afterEach(() => test.cleanup());

  const payments = (extra: Record<string, unknown> = {}) =>
    readModel.listFeeCollections({ page: 1, limit: 50, ...extra });

  describe('getDashboard', () => {
    it('dashboard counts only current-year obligations', () => {
      const d = readModel.getDashboard();
      expect(d.totalExpected).toBe(600);
      expect(d.totalCollected).toBe(350);
      expect(d.totalOutstanding).toBe(250);
      expect(d.collectionRate).toBe(58);
      expect(d.currency).toBe('LRD');
    });

    it('paid, partial and unpaid follow the server rule', () => {
      const d = readModel.getDashboard();
      // Alpha: Mary paid, John partial, Ama + No Fees unpaid (Gone Away inactive);
      // Beta: Musu partial; Nowhere: Nobody unpaid.
      expect({ paid: d.studentsPaid, partial: d.studentsPartial, unpaid: d.studentsUnpaid }).toEqual({
        paid: 1,
        partial: 2,
        unpaid: 3,
      });
    });

    it('a school with no current year expects nothing and is not reporting', () => {
      const d = readModel.getDashboard();
      expect(d.totalSchools).toBe(3);
      expect(d.schoolsReporting).toBe(2);
      const nowhere = readModel.listSchools().find((s) => s.institutionId === 'sch-n');
      expect(nowhere).toMatchObject({
        totalExpected: 0,
        totalCollected: 0,
        collectionRate: 0,
        studentCount: 1,
        unpaidCount: 1,
        districtId: null,
        districtName: null,
      });
    });

    it('schools without a district are totalled but left out of the district comparison', () => {
      expect(readModel.getDashboard().districtComparison).toEqual(
        expect.arrayContaining([
          { districtId: 'd-1', districtName: 'Buchanan', totalExpected: 400, totalCollected: 200, collectionRate: 50, schoolCount: 1 },
          { districtId: 'd-2', districtName: 'Owensgrove', totalExpected: 200, totalCollected: 150, collectionRate: 75, schoolCount: 1 },
        ]),
      );
      expect(readModel.getDashboard().districtComparison).toHaveLength(2);
    });

    it('the year name is shared or null', () => {
      expect(readModel.getDashboard().academicYearName).toBe('Y2026');
      run(`UPDATE academic_years SET code = 'Y2026-B' WHERE id = 'y-b'`);
      expect(readModel.getDashboard().academicYearName).toBeNull();
    });

    it('the year name is null when no school has a current year', () => {
      run(`UPDATE academic_years SET isCurrent = 0`);
      expect(readModel.getDashboard().academicYearName).toBeNull();
    });
  });

  describe('listSchools', () => {
    it('inactive and other-county schools are excluded everywhere', () => {
      expect(readModel.listSchools().map((s) => s.institutionId).sort()).toEqual(['sch-a', 'sch-b', 'sch-n']);
      expect(payments().records.map((r) => r.schoolName)).not.toContain('Closed School');
      expect(payments().records.map((r) => r.schoolName)).not.toContain('Far School');
      expect(readModel.listFeeRules({ page: 1, limit: 10 }).schools.map((s) => s.id)).toEqual(['sch-a', 'sch-b']);
    });

    it('rows carry the summary, worst rate first', () => {
      const rows = readModel.listSchools();
      expect(rows.map((r) => r.institutionId)).toEqual(['sch-n', 'sch-a', 'sch-b']);
      expect(rows[1]).toEqual({
        institutionId: 'sch-a',
        institutionName: 'Alpha School',
        institutionCode: 'SCH-A-CODE',
        districtId: 'd-1',
        districtName: 'Buchanan',
        totalExpected: 400,
        totalCollected: 200,
        totalOutstanding: 200,
        collectionRate: 50,
        studentCount: 4,
        paidCount: 1,
        partialCount: 1,
        unpaidCount: 2,
        currency: 'LRD',
      });
    });
  });

  describe('listFeeCollections', () => {
    it('payments exclude reversed and locally reversed payments and old-year payments', () => {
      const result = payments();
      expect(result.records.map((r) => r.id)).toEqual(['p-06', 'p-02d', 'p-02', 'p-01']);
      expect(result.summary).toEqual({ totalCollected: 350, totalTransactions: 4, schoolsWithPayments: 2 });
      expect(result.total).toBe(4);
    });

    it('a payment whose student is not on this device still counts', () => {
      // The child moved to another county, so their student row is gone, but
      // the payment was made at this county's school (server includes it).
      run(`DELETE FROM students WHERE id = 'st-06'`);
      const result = payments();
      expect(result.summary).toEqual({ totalCollected: 350, totalTransactions: 4, schoolsWithPayments: 2 });
      expect(result.records[0]).toMatchObject({ id: 'p-06', studentName: '', nemisId: null, schoolName: 'Beta School' });
      expect(payments({ search: 'beta' }).records.map((r) => r.id)).toEqual(['p-06']);
    });

    it('records carry the student, school and rule', () => {
      expect(payments().records[0]).toEqual({
        id: 'p-06',
        studentName: 'Musu Kpoto',
        nemisId: '100000000006',
        schoolName: 'Beta School',
        schoolOwnership: 'PRIVATE',
        districtName: 'Owensgrove',
        feeRuleName: 'Beta Tuition',
        amountPaid: 150,
        method: 'MOBILE_MONEY',
        reference: null,
        paidAt: '2026-03-05T10:00:00.000Z',
      });
    });

    it('payment search needs every word', () => {
      expect(payments({ search: 'Mary Kollie' }).records.map((r) => r.id)).toEqual(['p-01']);
      expect(payments({ search: 'mary doe' }).records).toEqual([]);
      expect(payments({ search: 'alpha' }).total).toBe(3);
      expect(payments({ search: '100000000006' }).records.map((r) => r.id)).toEqual(['p-06']);
    });

    it('search wildcards are literal', () => {
      expect(payments({ search: '%' }).records).toEqual([]);
      expect(payments({ search: '_' }).records).toEqual([]);
    });

    it('payments filter by district and ownership; summary covers the whole filtered set, records the page', () => {
      expect(payments({ districtId: 'd-2' }).records.map((r) => r.id)).toEqual(['p-06']);
      expect(payments({ ownership: 'GOVERNMENT' }).records.map((r) => r.id)).toEqual(['p-02d', 'p-02', 'p-01']);
      const page2 = payments({ page: 2, limit: 2 });
      expect(page2.records.map((r) => r.id)).toEqual(['p-02', 'p-01']);
      expect(page2.summary.totalTransactions).toBe(4);
      expect(page2).toMatchObject({ total: 4, page: 2, limit: 2 });
    });
  });

  describe('listFeeRules', () => {
    it('fee rules include inactive ones, active first, schools by name, 10 per page', () => {
      const result = readModel.listFeeRules({ page: 1, limit: 10 });
      expect(result).toMatchObject({ total: 2, page: 1, limit: 10 });
      const [alpha, beta] = result.schools;
      expect(alpha).toMatchObject({
        id: 'sch-a',
        name: 'Alpha School',
        ownership: 'GOVERNMENT',
        district: { id: 'd-1', name: 'Buchanan' },
      });
      expect(alpha!.ownFeeRules.map((r) => r.id)).toEqual(['r-a', 'r-a3', 'r-a2']);
      expect(alpha!.ownFeeRules[2]).toMatchObject({ isActive: false, isMandatory: true });
      expect(alpha!.ownFeeRules[0]).toMatchObject({ applicableLevels: ['PRIMARY'], description: null, amount: 100, currency: 'LRD' });
      expect(alpha!.ownFeeRules[1]!.applicableLevels).toEqual([]);
      expect(beta!.ownFeeRules[0]!.applicableLevels).toEqual([]);
    });

    it('fee rules page, filter by ownership and search the school name', () => {
      expect(readModel.listFeeRules({ page: 2, limit: 1 }).schools.map((s) => s.id)).toEqual(['sch-b']);
      expect(readModel.listFeeRules({ page: 1, limit: 10, ownership: 'PRIVATE' }).schools.map((s) => s.id)).toEqual(['sch-b']);
      expect(readModel.listFeeRules({ page: 1, limit: 10, search: 'alp' }).schools.map((s) => s.id)).toEqual(['sch-a']);
      expect(readModel.listFeeRules({ page: 1, limit: 10, search: '%' }).schools).toEqual([]);
    });

    it('a school without a district has a null district', () => {
      rule('r-n', 'sch-n', 'Nowhere Fee');
      const nowhere = readModel.listFeeRules({ page: 1, limit: 10 }).schools.find((s) => s.id === 'sch-n');
      expect(nowhere!.district).toBeNull();
    });
  });
});
