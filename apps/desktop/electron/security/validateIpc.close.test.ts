import { describe, expect, it } from 'vitest';
import {
  assertCloseFillCellsArgs,
  assertCloseReopenArgs,
  assertCloseSavePromotionArgs,
  assertCorrectGradeArgs,
  assertCorrectOutcomeArgs,
  assertCorrectRemarkArgs,
} from './validateIpc';

const entry = { studentId: 's', subjectId: 'x', gradingPeriodId: 'g', score: 50, reason: 'r' };

describe('close channel limits match the server', () => {
  it('fill-cells accepts 2000 rows and refuses 2001', () => {
    const rows = (n: number) => Array.from({ length: n }, () => entry);
    expect(() => assertCloseFillCellsArgs([{ yearId: 'y', entries: rows(2000) }])).not.toThrow();
    expect(() => assertCloseFillCellsArgs([{ yearId: 'y', entries: rows(2001) }])).toThrow();
  });

  it('reopen reason is capped at 1000 characters', () => {
    expect(() => assertCloseReopenArgs([{ yearId: 'y', reason: 'a'.repeat(1000) }])).not.toThrow();
    expect(() => assertCloseReopenArgs([{ yearId: 'y', reason: 'a'.repeat(1001) }])).toThrow();
  });

  it('correction reasons are capped at 1000 characters', () => {
    const long = 'a'.repeat(1001);
    const ok = 'a'.repeat(1000);
    const grade = { yearId: 'y', studentId: 's', subjectId: 'x', gradingPeriodId: 'g', score: 1 };
    expect(() => assertCorrectGradeArgs([{ ...grade, reason: ok }])).not.toThrow();
    expect(() => assertCorrectGradeArgs([{ ...grade, reason: long }])).toThrow();
    const outcome = { yearId: 'y', studentId: 's', outcome: 'RETAINED', nextGradeLevel: null };
    expect(() => assertCorrectOutcomeArgs([{ ...outcome, reason: ok }])).not.toThrow();
    expect(() => assertCorrectOutcomeArgs([{ ...outcome, reason: long }])).toThrow();
    const remark = { yearId: 'y', studentId: 's', remark: 'fine' };
    expect(() => assertCorrectRemarkArgs([{ ...remark, reason: ok }])).not.toThrow();
    expect(() => assertCorrectRemarkArgs([{ ...remark, reason: long }])).toThrow();
  });

  it('override reason is capped at 1000 but remarks keep 2000', () => {
    const decision = { studentId: 's', outcome: 'RETAINED', nextGradeLevel: null };
    expect(() => assertCloseSavePromotionArgs([{ yearId: 'y', decisions: [{ ...decision, overrideReason: 'a'.repeat(1001) }] }])).toThrow();
    expect(() => assertCloseSavePromotionArgs([{ yearId: 'y', decisions: [{ ...decision, overrideReason: 'a'.repeat(1000) }] }])).not.toThrow();
    expect(() => assertCloseSavePromotionArgs([{ yearId: 'y', decisions: [], principalRemarks: [{ studentId: 's', remark: 'a'.repeat(2000) }] }])).not.toThrow();
  });
});
