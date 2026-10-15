import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { GradeLevel } from '@nemis-desktop/types';
import type { BulkClaimResult } from '@nemis-desktop/types';
import { generateNemisId } from '@nemis-desktop/shared';
import {
  HEADERS, MAX_CLAIM_ROWS, allToRetry, buildRetryWorkbook, mapClaimOutcome, parseWorkbookToRows,
  partitionRows, splitClaimBatch, toBulkClaimRows, validateRow, validateRows, type BulkRow, type IndexedRow,
} from './bulk-import-logic';

let seq = 0;
function mk(over: Partial<BulkRow> = {}): BulkRow {
  seq += 1;
  const row: BulkRow = {
    id: `r${seq}`, firstName: `First${seq}`, lastName: `Last${seq}`, dateOfBirth: '2012-03-04', gender: 'MALE',
    admissionDate: '2026-09-01', gradeLevel: 'GRADE_5', className: '', classId: '', nemisId: '', guardianFirstName: 'Gf', guardianLastName: 'Gl',
    guardianRelationship: 'Mother', guardianPhone: '+231770000000', studentEmail: '', guardianEmail: '', errors: {}, ...over,
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
    expect(p.failed).toEqual([
      { originalIndex: 0, error: 'Fix before importing: firstName: Required' },
      {
        originalIndex: 1,
        error: 'Grade level "GRADE_6" does not match the selected class grade "GRADE_5"',
      },
    ]);
  });

  it('fails a Luhn-bad NEMIS ID row with its reason', () => {
    const id = generateNemisId();
    const bad = id.slice(0, 11) + String((Number(id[11]) + 1) % 10);
    const p = partitionRows([mk(), mk({ nemisId: bad })], GradeLevel.GRADE_5);
    expect(p.failed).toEqual([{
      originalIndex: 1,
      error: 'Fix before importing: nemisId: Invalid NEMIS ID (12 digits, check digit)',
    }]);
  });
});

describe('parseWorkbookToRows template example', () => {
  const header = HEADERS;
  const line = (first: string, last: string, dob: string) =>
    [first, last, dob, 'MALE', '2026-09-01', 'GRADE_5', '', '', 'Jane', 'Doe', 'Mother', '+231770123456', ''];
  const parse = (...lines: string[][]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...lines]), 'Students');
    return parseWorkbookToRows(toBytes(wb));
  };

  it('keeps a real John and skips only the exact example row', () => {
    const rows = parse(line('John', 'Smith', '2011-02-03'), line('John', 'Doe', '2010-05-15'), line('John', 'Doe', '2012-01-01'));
    expect(rows.map((r) => `${r.firstName} ${r.lastName} ${r.dateOfBirth}`)).toEqual([
      'John Smith 2011-02-03',
      'John Doe 2012-01-01',
    ]);
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
  it('template headers: Grade Level, then Class, then NEMIS ID', () => {
    expect(HEADERS[5]).toMatch(/^Grade Level/);
    expect(HEADERS[6]).toBe('Class');
    expect(HEADERS[7]).toBe('NEMIS ID (leave blank for new students)');
  });
  it('parses a numeric NEMIS ID cell to its digit string', () => {
    const id = generateNemisId();
    const ws = XLSX.utils.aoa_to_sheet([['First Name *', 'NEMIS ID'], ['Amy', Number(id)]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    expect(parseWorkbookToRows(toBytes(wb))[0]?.nemisId).toBe(id);
  });
  it('left-pads a numeric cell whose valid ID starts with 0, and the retry file keeps it', () => {
    let id = generateNemisId();
    while (!id.startsWith('0')) id = generateNemisId();
    const ws = XLSX.utils.aoa_to_sheet([['First Name *', 'NEMIS ID'], ['Amy', Number(id)]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    const row = parseWorkbookToRows(toBytes(wb))[0]!;
    expect(row.nemisId).toBe(id);
    expect(row.nemisId).toHaveLength(12);
    expect(validateRow(row).nemisId).toBeUndefined();
    const retry = buildRetryWorkbook([row], [{ originalIndex: 0, reason: 'x' }]);
    expect(parseWorkbookToRows(toBytes(retry))[0]?.nemisId).toBe(id);
  });
});

describe('validateRow studentEmail', () => {
  it('accepts sam@school.com and rejects a@bXc', () => {
    expect(mk({ studentEmail: 'sam@school.com' }).errors.studentEmail).toBeUndefined();
    expect(mk({ studentEmail: 'a@bXc' }).errors.studentEmail).toBe('Invalid email');
  });
});

describe('guardian email', () => {
  const parseSheet = (header: string[], ...lines: string[][]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...lines]), 'Students');
    return parseWorkbookToRows(toBytes(wb));
  };
  const base = [
    'Ama', 'Kollie', '2014-03-02', 'FEMALE', '2026-09-01', 'GRADE_5', '', '',
    'Musu', 'Kollie', 'Mother', '+231770000000', 'ama@example.com',
  ];

  it('the template has a Guardian Email column right after Student Email', () => {
    expect(HEADERS[12]).toBe('Student Email');
    expect(HEADERS[13]).toBe('Guardian Email');
    expect(HEADERS).toHaveLength(14);
  });

  it('reads the Guardian Email column, trimmed', () => {
    const [row] = parseSheet(HEADERS, [...base, '  musu@example.com ']);
    expect(row?.guardianEmail).toBe('musu@example.com');
    expect(row?.errors).toEqual({});
  });

  it('reads a camelCase guardianEmail header', () => {
    const [row] = parseSheet(['First Name', 'guardianEmail'], ['Ama', 'musu@example.com']);
    expect(row?.guardianEmail).toBe('musu@example.com');
  });

  it('a file without the column parses with a blank guardian email and no new error', () => {
    const [row] = parseSheet(HEADERS.slice(0, 13), base);
    expect(row?.guardianEmail).toBe('');
    expect(row?.errors).toEqual({});
  });

  it('a portal-web file (its headers, … grade header, NEMIS ID) parses with no errors', () => {
    const portalHeaders = [
      'First Name *', 'Last Name *', 'Date of Birth * (YYYY-MM-DD)', 'Gender * (MALE/FEMALE)',
      'Admission Date * (YYYY-MM-DD)', 'Grade Level * (KG/K1/K2/GRADE_1…GRADE_12)',
      'Guardian First Name *', 'Guardian Last Name *', 'Guardian Relationship *', 'Guardian Phone *',
      'Student Email', 'Guardian Email', 'NEMIS ID',
    ];
    const [row] = parseSheet(portalHeaders, [
      'Ama', 'Kollie', '2014-03-02', 'FEMALE', '2026-09-01', 'GRADE_5',
      'Musu', 'Kollie', 'Mother', '+231770000000', 'ama@example.com', 'musu@example.com', '',
    ]);
    expect(row).toMatchObject({
      gradeLevel: 'GRADE_5', guardianEmail: 'musu@example.com', studentEmail: 'ama@example.com', nemisId: '',
    });
    expect(row?.errors).toEqual({});
  });

  it('accepts blank and a valid address, rejects a bad one', () => {
    expect(mk().errors.guardianEmail).toBeUndefined();
    expect(mk({ guardianEmail: 'musu@school.com' }).errors.guardianEmail).toBeUndefined();
    expect(mk({ guardianEmail: 'musu@bXc' }).errors.guardianEmail).toBe('Invalid email');
  });

  it('rejects a new student whose email equals the guardian email, ignoring case and spaces', () => {
    const row = mk({ studentEmail: ' Jane@School.com', guardianEmail: 'jane@school.com ' });
    expect(row.errors.studentEmail).toBe("Can't be the same as the guardian's email");
    expect(row.errors.guardianEmail).toBeUndefined();
  });

  it('keeps the format error when the student email is invalid as well as equal', () => {
    expect(mk({ studentEmail: 'a@bXc', guardianEmail: 'a@bXc' }).errors.studentEmail).toBe('Invalid email');
  });

  it('does not block a claim row with the same two emails, and never sends the guardian email in a claim', () => {
    const row = mk({ nemisId: generateNemisId(), studentEmail: 'jane@school.com', guardianEmail: 'jane@school.com' });
    expect(row.errors).toEqual({});
    const [out] = toBulkClaimRows([{ originalIndex: 0, row }]);
    expect(out).not.toHaveProperty('guardianEmail');
  });

  it('the retry file keeps the guardian email in its own column', () => {
    const wb = buildRetryWorkbook([mk({ guardianEmail: 'musu@example.com' })], [{ originalIndex: 0, reason: 'x' }]);
    const header = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Students']!, { header: 1 })[0];
    expect(header?.slice(-2)).toEqual(['Guardian Email', 'Reason']);
    expect(parseWorkbookToRows(toBytes(wb))[0]?.guardianEmail).toBe('musu@example.com');
  });
});

describe('validateRows cross-row emails', () => {
  const msg = (n: number) => `Already used as a guardian's email in row ${n}`;

  it('flags a student email that is an earlier row\'s guardian email', () => {
    const out = validateRows([mk({ guardianEmail: 'musu@x.com' }), mk({ studentEmail: 'musu@x.com' })]);
    expect(out[0]?.errors.studentEmail).toBeUndefined();
    expect(out[0]?.errors.guardianEmail).toBeUndefined();
    expect(out[1]?.errors.studentEmail).toBe(msg(1));
  });

  it('flags a student email that is a later row\'s guardian email', () => {
    const out = validateRows([mk({ studentEmail: 'musu@x.com' }), mk({ guardianEmail: 'musu@x.com' })]);
    expect(out[0]?.errors.studentEmail).toBe(msg(2));
    expect(out[1]?.errors).toEqual({});
  });

  it('compares trimmed and case-insensitively', () => {
    const out = validateRows([mk({ guardianEmail: 'musu@x.com ' }), mk({ studentEmail: ' Musu@X.com' })]);
    expect(out[1]?.errors.studentEmail).toBe(msg(1));
  });

  it('ignores claim rows on either side', () => {
    const claimGuardian = validateRows([
      mk({ nemisId: generateNemisId(), guardianEmail: 'musu@x.com' }),
      mk({ studentEmail: 'musu@x.com' }),
    ]);
    expect(claimGuardian[1]?.errors.studentEmail).toBeUndefined();
    const claimStudent = validateRows([
      mk({ guardianEmail: 'musu@x.com' }),
      mk({ nemisId: generateNemisId(), studentEmail: 'musu@x.com' }),
    ]);
    expect(claimStudent[1]?.errors.studentEmail).toBeUndefined();
  });

  it('lets a format error on the student email win', () => {
    const out = validateRows([mk({ guardianEmail: 'musu@bXc' }), mk({ studentEmail: 'musu@bXc' })]);
    expect(out[1]?.errors.studentEmail).toBe('Invalid email');
  });

  it('lets the same-row message win when the own guardian email also matches', () => {
    const out = validateRows([
      mk({ guardianEmail: 'musu@x.com' }),
      mk({ studentEmail: 'musu@x.com', guardianEmail: 'musu@x.com' }),
    ]);
    expect(out[1]?.errors.studentEmail).toBe("Can't be the same as the guardian's email");
  });

  it('reports the first other row holding the address', () => {
    const out = validateRows([
      mk(), mk({ guardianEmail: 'musu@x.com' }), mk({ guardianEmail: 'musu@x.com' }), mk({ studentEmail: 'musu@x.com' }),
    ]);
    expect(out[3]?.errors.studentEmail).toBe(msg(2));
  });

  it('returns new rows without mutating the input, keeping ids and order', () => {
    const input = [mk({ guardianEmail: 'musu@x.com' }), mk({ studentEmail: 'musu@x.com' })];
    const snapshot = structuredClone(input);
    const out = validateRows(input);
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
    expect(out[1]).not.toBe(input[1]);
    expect(out.map((r) => r.id)).toEqual(input.map((r) => r.id));
  });

  it('is applied by parseWorkbookToRows', () => {
    const line = (first: string, studentEmail: string, guardianEmail: string) => [
      first, 'Kollie', '2014-03-02', 'FEMALE', '2026-09-01', 'GRADE_5', '', '',
      'Musu', 'Kollie', 'Mother', '+231770000000', studentEmail, guardianEmail,
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([HEADERS, line('Ama', 'ama@x.com', 'family@x.com'), line('Bola', 'family@x.com', '')]),
      'Students',
    );
    const rows = parseWorkbookToRows(toBytes(wb));
    expect(rows[0]?.errors).toEqual({});
    expect(rows[1]?.errors.studentEmail).toBe(msg(1));
  });
});

describe('validateRows duplicate student emails', () => {
  const dup = (n: number) => `Already used as a student's email in row ${n}`;

  it('flags every later row with the first row number; the first row stays valid', () => {
    const out = validateRows([
      mk({ studentEmail: 'kid@x.com' }), mk(), mk({ studentEmail: 'kid@x.com' }), mk({ studentEmail: 'kid@x.com' }),
    ]);
    expect(out[0]?.errors).toEqual({});
    expect(out[1]?.errors).toEqual({});
    expect(out[2]?.errors.studentEmail).toBe(dup(1));
    expect(out[3]?.errors.studentEmail).toBe(dup(1));
  });

  it('compares trimmed and case-insensitively', () => {
    const out = validateRows([mk({ studentEmail: ' Kid@X.com' }), mk({ studentEmail: 'kid@x.com ' })]);
    expect(out[1]?.errors.studentEmail).toBe(dup(1));
  });

  it('ignores claim rows on either side', () => {
    const claimFirst = validateRows([
      mk({ nemisId: generateNemisId(), studentEmail: 'kid@x.com' }), mk({ studentEmail: 'kid@x.com' }),
    ]);
    expect(claimFirst.map((r) => r.errors)).toEqual([{}, {}]);
    const claimSecond = validateRows([
      mk({ studentEmail: 'kid@x.com' }), mk({ nemisId: generateNemisId(), studentEmail: 'kid@x.com' }),
    ]);
    expect(claimSecond.map((r) => r.errors)).toEqual([{}, {}]);
  });

  it('earlier rules keep precedence', () => {
    expect(validateRows([mk({ studentEmail: 'a@bXc' }), mk({ studentEmail: 'a@bXc' })])[1]?.errors.studentEmail)
      .toBe('Invalid email');
    const out = validateRows([
      mk({ studentEmail: 'fam@x.com' }), mk({ guardianEmail: 'fam@x.com' }), mk({ studentEmail: 'fam@x.com' }),
    ]);
    expect(out[2]?.errors.studentEmail).toBe("Already used as a guardian's email in row 2");
  });

  it('parseWorkbookToRows applies it', () => {
    const line = (first: string) => [
      first, 'Kollie', '2014-03-02', 'FEMALE', '2026-09-01', 'GRADE_5', '', '',
      'Musu', 'Kollie', 'Mother', '+231770000000', 'kid@example.com',
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, line('Ama'), line('Bola')]), 'Students');
    const rows = parseWorkbookToRows(toBytes(wb));
    expect(rows[0]?.errors).toEqual({});
    expect(rows[1]?.errors.studentEmail).toBe(dup(1));
  });
});

describe('Class column', () => {
  const parseSheet = (header: string[], ...lines: unknown[][]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...lines]), 'Students');
    return parseWorkbookToRows(toBytes(wb));
  };
  const line = (klass: unknown) => [
    'Ama', 'Kollie', '2014-03-02', 'FEMALE', '2026-09-01', 'GRADE_3', klass, '',
    'Musu', 'Kollie', 'Mother', '+231770000000', '', '',
  ];

  it('reads the Class cell trimmed, with no class id yet and no new error', () => {
    const [row] = parseSheet(HEADERS, line('  3A '));
    expect(row).toMatchObject({ className: '3A', classId: '', errors: {} });
  });

  it('reads a numeric class name as text', () => {
    expect(parseSheet(HEADERS, line(7))[0]?.className).toBe('7');
  });

  it('a file without the Class column parses with a blank class', () => {
    const header = HEADERS.filter((h) => h !== 'Class');
    const withoutClass = line('').filter((_, i) => i !== 6);
    expect(parseSheet(header, withoutClass)[0]).toMatchObject({ className: '', classId: '', errors: {} });
  });

  it('the retry file writes each row class name and re-imports it', () => {
    const rows = [mk({ gradeLevel: 'GRADE_3', className: '3B', classId: 'c3b' })];
    const wb = buildRetryWorkbook(rows, [{ originalIndex: 0, reason: 'x' }]);
    const header = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Students']!, { header: 1 })[0];
    expect(header?.[6]).toBe('Class');
    expect(parseWorkbookToRows(toBytes(wb))[0]?.className).toBe('3B');
  });
});
