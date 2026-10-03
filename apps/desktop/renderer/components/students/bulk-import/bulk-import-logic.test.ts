import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { GradeLevel } from '@nemis-desktop/types';
import type { BulkClaimResult } from '@nemis-desktop/types';
import { generateNemisId } from '@nemis-desktop/shared';
import {
  HEADERS, MAX_CLAIM_ROWS, allToRetry, buildRetryWorkbook, mapClaimOutcome, parseWorkbookToRows,
  partitionRows, splitClaimBatch, toBulkClaimRows, validateRow, type BulkRow, type IndexedRow,
} from './bulk-import-logic';

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

function toBytes(wb: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('validateRow nemisId', () => {
  it('accepts blank, rejects Luhn-bad, accepts separated valid', () => {
    const id = generateNemisId();
    expect(mk().errors.nemisId).toBeUndefined();
    const bad = id.slice(0, 11) + String((Number(id[11]) + 1) % 10);
    expect(mk({ nemisId: bad }).errors.nemisId).toBe('Invalid NEMIS ID (12 digits, check digit)');
    const sep = `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8)}`;
    expect(mk({ nemisId: sep }).errors.nemisId).toBeUndefined();
  });
});

describe('partitionRows', () => {
  it('sorts invalid, mismatched, local and claim with originalIndex preserved', () => {
    const rows = [
      mk({ firstName: '' }),
      mk({ gradeLevel: 'GRADE_6' }),
      mk(),
      mk({ nemisId: generateNemisId() }),
    ];
    const p = partitionRows(rows, GradeLevel.GRADE_5);
    expect(p.local.map((r) => r.originalIndex)).toEqual([2]);
    expect(p.claim.map((r) => r.originalIndex)).toEqual([3]);
    expect(p.failed).toEqual([{
      originalIndex: 1,
      error: 'Grade level "GRADE_6" does not match the selected class grade "GRADE_5"',
    }]);
  });
});

describe('toBulkClaimRows', () => {
  it('canonicalises a separated ID and keeps order', () => {
    const a = generateNemisId();
    const b = generateNemisId();
    const sep = `${a.slice(0, 4)}-${a.slice(4, 8)}-${a.slice(8)}`;
    const claim: IndexedRow[] = [{ originalIndex: 4, row: mk({ nemisId: sep }) }, { originalIndex: 7, row: mk({ nemisId: b }) }];
    const out = toBulkClaimRows(claim);
    expect(out.map((r) => r.nemisId)).toEqual([a, b]);
    expect(out[0]?.gradeLevel).toBe('GRADE_5');
  });
});

describe('mapClaimOutcome', () => {
  const rows = [
    mk(), mk({ nemisId: generateNemisId() }), mk({ firstName: '' }),
    mk({ nemisId: generateNemisId() }), mk(), mk({ nemisId: generateNemisId() }),
  ];
  const claim = partitionRows(rows, GradeLevel.GRADE_5).claim;

  it('aligns created and failed to original rows', () => {
    expect(claim.map((c) => c.originalIndex)).toEqual([1, 3, 5]);
    const result: BulkClaimResult = {
      created: [{ index: 1, nemisId: 'B' }], failed: [{ index: 0, error: 'A bad' }], registryUnavailableMessage: null,
    };
    const m = mapClaimOutcome(claim, result);
    expect(m.claimed).toEqual([{ originalIndex: 3, nemisId: 'B' }]);
    expect(m.retry).toEqual([
      { originalIndex: 1, reason: 'A bad' },
      { originalIndex: 5, reason: 'The server did not process this row. Import it again.' },
    ]);
  });
  it('uses the registry message for rows after an early stop', () => {
    const result: BulkClaimResult = {
      created: [{ index: 0, nemisId: 'A' }], failed: [], registryUnavailableMessage: 'Registry down',
    };
    const m = mapClaimOutcome(claim, result);
    expect(m.claimed).toEqual([{ originalIndex: 1, nemisId: 'A' }]);
    expect(m.retry).toEqual([{ originalIndex: 3, reason: 'Registry down' }, { originalIndex: 5, reason: 'Registry down' }]);
  });
  it('ignores out-of-range indices', () => {
    const m = mapClaimOutcome(claim, {
      created: [{ index: 99, nemisId: 'X' }], failed: [{ index: -1, error: 'e' }], registryUnavailableMessage: null,
    });
    expect(m.claimed).toEqual([]);
    expect(m.retry).toHaveLength(3);
  });
  it('allToRetry maps every row', () => {
    expect(allToRetry(claim, 'offline').map((r) => r.originalIndex)).toEqual([1, 3, 5]);
  });
});

describe('splitClaimBatch', () => {
  it('sends the first 500 and overflows the rest', () => {
    const claim: IndexedRow[] = Array.from({ length: 503 }, (_, i) => ({ originalIndex: i, row: mk() }));
    const { send, overflow } = splitClaimBatch(claim);
    expect(MAX_CLAIM_ROWS).toBe(500);
    expect(send).toHaveLength(500);
    expect(overflow.map((r) => r.originalIndex)).toEqual([500, 501, 502]);
    expect(splitClaimBatch(claim.slice(0, 3)).overflow).toEqual([]);
  });
});

describe('retry workbook and template', () => {
  it('round-trips through the parser in originalIndex order', () => {
    const id = generateNemisId();
    const rows = [mk(), mk({ nemisId: id }), mk(), mk()];
    const wb = buildRetryWorkbook(rows, [{ originalIndex: 3, reason: 'later' }, { originalIndex: 1, reason: 'earlier' }]);
    const header = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Students']!, { header: 1 })[0];
    expect(header?.at(-1)).toBe('Reason');
    const parsed = parseWorkbookToRows(toBytes(wb));
    expect(parsed.map((r) => [r.firstName, r.nemisId])).toEqual([[rows[1]!.firstName, id], [rows[3]!.firstName, '']]);
  });
  it('template headers include the NEMIS ID column after Grade Level', () => {
    expect(HEADERS[5]).toMatch(/^Grade Level/);
    expect(HEADERS[6]).toBe('NEMIS ID (leave blank for new students)');
  });
  it('parses a numeric NEMIS ID cell to its digit string', () => {
    const id = generateNemisId();
    const ws = XLSX.utils.aoa_to_sheet([['First Name *', 'NEMIS ID'], ['Amy', Number(id)]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    expect(parseWorkbookToRows(toBytes(wb))[0]?.nemisId).toBe(id);
  });
});
