import { describe, expect, it } from 'vitest';
import { isImportable, placeRows, resolveRowClass, type ClassOption } from './class-placement';

const c = (id: string, name: string, gradeLevel: string): ClassOption => ({ id, name, gradeLevel });
const g3a = c('c3a', '3A', 'GRADE_3');
const g3b = c('c3b', '3B', 'GRADE_3');
const g1a = c('c1a', '1A', 'GRADE_1');
const row = (over: Partial<{ gradeLevel: string; className: string; classId: string }> = {}) => ({
  gradeLevel: 'GRADE_3', className: '', classId: '', ...over,
});

describe('resolveRowClass', () => {
  it('keeps a picked class of the row grade', () => {
    expect(resolveRowClass(row({ classId: 'c3b' }), [g3a, g3b])).toEqual({ classId: 'c3b', className: '3B', error: null });
  });

  it('drops a kept class of another grade and re-resolves (auto-pick)', () => {
    expect(resolveRowClass(row({ gradeLevel: 'GRADE_1', classId: 'c3a' }), [g3a, g1a]))
      .toEqual({ classId: 'c1a', className: '1A', error: null });
  });

  it("matches the file's class name trimmed and case-insensitively within the grade", () => {
    expect(resolveRowClass(row({ className: '  3b ' }), [g3a, g3b])).toEqual({ classId: 'c3b', className: '3B', error: null });
  });

  it('names the other grade when the class belongs to it', () => {
    expect(resolveRowClass(row({ className: '1a' }), [g3a, g1a]).error).toBe('Class "1A" is GRADE 1, not GRADE 3');
  });

  it('flags a name that matches no class', () => {
    expect(resolveRowClass(row({ className: '3Z' }), [g3a, g3b]))
      .toEqual({ classId: '', className: '3Z', error: 'No GRADE 3 class named "3Z" — pick one' });
  });

  it('auto-picks the only class of the grade when the cell is blank', () => {
    expect(resolveRowClass(row(), [g3a, g1a])).toEqual({ classId: 'c3a', className: '3A', error: null });
  });

  it('asks for a pick when the grade has several classes', () => {
    expect(resolveRowClass(row(), [g3a, g3b]).error).toBe('Pick a class');
  });

  it('says to create a class when the grade has none', () => {
    expect(resolveRowClass(row(), [g1a]).error).toBe('No GRADE 3 class — create one under Teaching → Classes');
  });

  it('prefers the exact spelling when a case-insensitive name matches two classes', () => {
    const lower = c('lower', '3a', 'GRADE_3');
    expect(resolveRowClass(row({ className: '3a' }), [g3a, lower]).classId).toBe('lower');
    expect(resolveRowClass(row({ className: '3A ' }), [g3a, lower]).classId).toBe('c3a');
    expect(resolveRowClass(row({ className: ' 3A' }), [g3a, c('x', '3A ', 'GRADE_3')]).error).toBe('Pick a class');
  });

  it('gives no class error when the grade itself is missing or unknown', () => {
    expect(resolveRowClass(row({ gradeLevel: '' }), [g3a])).toEqual({ classId: '', className: '', error: null });
    expect(resolveRowClass(row({ gradeLevel: 'GRADE_99' }), [g3a]).error).toBeNull();
  });

  it('accepts a lower-case grade', () => {
    expect(resolveRowClass(row({ gradeLevel: 'grade_3' }), [g3a]).classId).toBe('c3a');
  });
});

describe('placeRows', () => {
  const r = (over: Partial<{ gradeLevel: string; className: string; classId: string }>, errors: Record<string, string> = {}) =>
    ({ ...row(over), id: 'r', errors });

  it('adds the class and its error to each row', () => {
    const [ok, bad] = placeRows([r({}), r({ className: '3Z' })], [g3a]);
    expect(ok).toMatchObject({ classId: 'c3a', className: '3A', errors: {} });
    expect(bad?.errors).toEqual({ classId: 'No GRADE 3 class named "3Z" — pick one' });
  });

  it("keeps the row's other errors and drops a stale class error", () => {
    const [placed] = placeRows([r({}, { firstName: 'Required', classId: 'old' })], [g3a]);
    expect(placed?.errors).toEqual({ firstName: 'Required' });
  });

  it('returns rows untouched while classes are not loaded — no class errors at all', () => {
    const input = [r({})];
    const out = placeRows(input, null);
    expect(out).toEqual(input);
    expect(isImportable(out[0]!)).toBe(false);
  });
});

describe('isImportable', () => {
  it('needs no errors and a class', () => {
    expect(isImportable({ classId: 'c', errors: {} })).toBe(true);
    expect(isImportable({ classId: '', errors: {} })).toBe(false);
    expect(isImportable({ classId: 'c', errors: { firstName: 'Required' } })).toBe(false);
  });
});
