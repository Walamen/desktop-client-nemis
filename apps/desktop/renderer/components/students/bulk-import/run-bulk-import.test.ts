import { describe, expect, it, vi } from 'vitest';
import { GradeLevel } from '@nemis-desktop/types';
import type { BulkClaimRequest, BulkClaimResult, CreateAndEnrollStudentRequest, OnlineCommandResult } from '@nemis-desktop/types';
import { generateNemisId } from '@nemis-desktop/shared';
import { MAX_CLAIM_ROWS, validateRow, type BulkRow } from './bulk-import-logic';
import {
  CLAIM_CALL_FAILED_REASON,
  LOCAL_CREATE_FAILED,
  OFFLINE_RETRY_REASON,
  TOO_MANY_CLAIM_ROWS_REASON,
  runBulkImport,
  type CreateAndEnrollFn,
} from './run-bulk-import';

let seq = 0;
function mk(over: Partial<BulkRow> = {}): BulkRow {
  seq += 1;
  const row: BulkRow = {
    id: `r${seq}`, firstName: `First${seq}`, lastName: `Last${seq}`, dateOfBirth: '2012-03-04', gender: 'MALE',
    admissionDate: '2026-09-01', gradeLevel: 'GRADE_5', nemisId: '', guardianFirstName: 'Gf', guardianLastName: 'Gl',
    guardianRelationship: 'Mother', guardianPhone: '+231770000000', studentEmail: '', errors: {}, ...over,
  };
  row.errors = validateRow(row);
  return row;
}

const target = { academicYearId: 'y1', classId: 'c1', termId: 't1' };

function okCreate(): CreateAndEnrollFn {
  let n = 0;
  return vi.fn(async () => {
    n += 1;
    return { ok: true as const, data: { nemisId: `00000000000${n}` } };
  });
}

function claimOk(result: Partial<BulkClaimResult> = {}, refreshed = true) {
  return vi.fn(async (request: BulkClaimRequest): Promise<OnlineCommandResult<BulkClaimResult>> => ({
    data: {
      created: request.students.map((s, index) => ({ index, nemisId: s.nemisId })),
      failed: [],
      registryUnavailableMessage: null,
      ...result,
    },
    refreshed,
  }));
}

describe('runBulkImport', () => {
  it('creates local rows with the batch placement, one primary guardian and assertedNoNemisId false', async () => {
    const createAndEnroll = okCreate();
    const bulkClaim = claimOk();
    const rows = [mk({ studentEmail: 'kid@example.com', admissionDate: '2026-09-02' })];
    const out = await runBulkImport({
      rows, gradeLevel: GradeLevel.GRADE_5, institutionId: 'inst-1', target, online: true, createAndEnroll, bulkClaim,
    });
    const req = vi.mocked(createAndEnroll).mock.calls[0]?.[0] as CreateAndEnrollStudentRequest;
    expect(req).toMatchObject({
      institutionId: 'inst-1', academicYearId: 'y1', classId: 'c1', termId: 't1', enrollmentDate: '2026-09-02',
      assertedNoNemisId: false, email: 'kid@example.com', gender: 'MALE', gradeLevel: 'GRADE_5',
      guardians: [{ firstName: 'Gf', lastName: 'Gl', relationship: 'Mother', phoneNumber: '+231770000000', isPrimary: true }],
    });
    expect(req.guardians).toHaveLength(1);
    expect(bulkClaim).not.toHaveBeenCalled();
    expect(out.created).toEqual([{ originalIndex: 0, nemisId: '000000000001' }]);
    expect(out.submitted).toBe(1);
  });

  it('fails a local row with the parsed IPC message, or the fallback', async () => {
    const createAndEnroll: CreateAndEnrollFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: new Error('x', { cause: new Error('[VALIDATION_FAILED] Bad date') }) })
      .mockResolvedValueOnce({ ok: false, error: new Error('Something went wrong.') })
      .mockRejectedValueOnce(new Error('boom'));
    const out = await runBulkImport({
      rows: [mk(), mk(), mk()], gradeLevel: GradeLevel.GRADE_5, institutionId: 'inst-1', target, online: true,
      createAndEnroll, bulkClaim: claimOk(),
    });
    expect(out.failed).toEqual([
      { originalIndex: 0, error: 'Bad date' },
      { originalIndex: 1, error: LOCAL_CREATE_FAILED },
      { originalIndex: 2, error: LOCAL_CREATE_FAILED },
    ]);
  });

  it('offline: never calls bulkClaim; claim rows go to retry with the offline copy', async () => {
    const bulkClaim = claimOk();
    const out = await runBulkImport({
      rows: [mk({ nemisId: generateNemisId() }), mk()], gradeLevel: GradeLevel.GRADE_5, institutionId: 'inst-1',
      target, online: false, createAndEnroll: okCreate(), bulkClaim,
    });
    expect(bulkClaim).not.toHaveBeenCalled();
    expect(out.retry).toEqual([{ originalIndex: 0, reason: OFFLINE_RETRY_REASON }]);
    expect(out.created.map((c) => c.originalIndex)).toEqual([1]);
  });

  it('a throwing claim call sends every claim row to retry with the parsed message, keeping local creates', async () => {
    const bulkClaim = vi.fn(async () => {
      throw new Error("[REMOTE_REJECTED] Bulk import must target your institution's current academic year.");
    });
    const out = await runBulkImport({
      rows: [mk({ nemisId: generateNemisId() }), mk(), mk({ nemisId: generateNemisId() })],
      gradeLevel: GradeLevel.GRADE_5, institutionId: 'inst-1', target, online: true, createAndEnroll: okCreate(), bulkClaim,
    });
    const reason = "Bulk import must target your institution's current academic year.";
    expect(out.retry).toEqual([{ originalIndex: 0, reason }, { originalIndex: 2, reason }]);
    expect(out.created.map((c) => c.originalIndex)).toEqual([1]);
  });

  it('an unparseable throw uses the generic retry reason', async () => {
    const out = await runBulkImport({
      rows: [mk({ nemisId: generateNemisId() })], gradeLevel: GradeLevel.GRADE_5, institutionId: 'inst-1', target,
      online: true, createAndEnroll: okCreate(), bulkClaim: vi.fn(async () => { throw new Error('socket hang up'); }),
    });
    expect(out.retry).toEqual([{ originalIndex: 0, reason: CLAIM_CALL_FAILED_REASON }]);
  });

  it('refreshed false marks the outcome pending sync', async () => {
    const out = await runBulkImport({
      rows: [mk({ nemisId: generateNemisId() })], gradeLevel: GradeLevel.GRADE_5, institutionId: 'inst-1', target,
      online: true, createAndEnroll: okCreate(), bulkClaim: claimOk({}, false),
    });
    expect(out.pendingSync).toBe(true);
    expect(out.claimed).toHaveLength(1);
  });

  it(`more than ${MAX_CLAIM_ROWS} NEMIS-ID rows: sends the first ${MAX_CLAIM_ROWS}, the rest go to retry`, async () => {
    const rows = Array.from({ length: MAX_CLAIM_ROWS + 1 }, () => mk({ nemisId: generateNemisId() }));
    const bulkClaim = claimOk();
    const out = await runBulkImport({
      rows, gradeLevel: GradeLevel.GRADE_5, institutionId: 'inst-1', target, online: true,
      createAndEnroll: okCreate(), bulkClaim,
    });
    expect(bulkClaim).toHaveBeenCalledTimes(1);
    expect(bulkClaim.mock.calls[0]?.[0].students).toHaveLength(MAX_CLAIM_ROWS);
    expect(out.claimed).toHaveLength(MAX_CLAIM_ROWS);
    expect(out.retry).toEqual([{ originalIndex: MAX_CLAIM_ROWS, reason: TOO_MANY_CLAIM_ROWS_REASON }]);
  });

  it('grade-mismatch rows fail with the server wording and are never sent', async () => {
    const bulkClaim = claimOk();
    const out = await runBulkImport({
      rows: [mk({ gradeLevel: 'GRADE_6', nemisId: generateNemisId() })], gradeLevel: GradeLevel.GRADE_5,
      institutionId: 'inst-1', target, online: true, createAndEnroll: okCreate(), bulkClaim,
    });
    expect(bulkClaim).not.toHaveBeenCalled();
    expect(out.failed).toEqual([
      { originalIndex: 0, error: 'Grade level "GRADE_6" does not match the selected class grade "GRADE_5"' },
    ]);
  });
});
