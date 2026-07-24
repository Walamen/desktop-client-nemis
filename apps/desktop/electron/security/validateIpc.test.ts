import { describe, expect, it } from 'vitest';
import {
  assertNoArgs,
  assertSettingKeyArg,
  assertSingleIdArg,
  assertCreateAcademicYearArgs,
  assertUpdateAcademicYearArgs,
  assertSetAcademicYearStatusArgs,
  assertCreateTermArgs,
  assertUpdateTermArgs,
  assertListClassesArgs,
  assertCreateClassArgs,
  assertUpdateClassArgs,
  assertSetActiveArgs,
  assertListSubjectsArgs,
  assertCreateSubjectArgs,
  assertUpdateSubjectArgs,
  assertClassSubjectPairArgs,
  assertMoveEnrollmentClassArgs,
} from './validateIpc';

describe('assertNoArgs', () => {
  it('passes empty args and rejects extras', () => {
    expect(() => assertNoArgs([])).not.toThrow();
    expect(() => assertNoArgs(['x'])).toThrow();
  });
});

describe('assertSettingKeyArg', () => {
  it('accepts exactly one bounded non-empty string', () => {
    expect(() => assertSettingKeyArg(['theme'])).not.toThrow();
  });

  it('rejects wrong arity', () => {
    expect(() => assertSettingKeyArg([])).toThrow();
    expect(() => assertSettingKeyArg(['a', 'b'])).toThrow();
  });

  it('rejects non-strings, empty, and oversized keys', () => {
    expect(() => assertSettingKeyArg([42])).toThrow();
    expect(() => assertSettingKeyArg([null])).toThrow();
    expect(() => assertSettingKeyArg([{ key: 'theme' }])).toThrow();
    expect(() => assertSettingKeyArg([''])).toThrow();
    expect(() => assertSettingKeyArg(['k'.repeat(129)])).toThrow();
  });
});

describe('assertSingleIdArg', () => {
  it('accepts one non-empty string and rejects everything else', () => {
    expect(() => assertSingleIdArg(['ay-1'])).not.toThrow();
    expect(() => assertSingleIdArg([])).toThrow();
    expect(() => assertSingleIdArg(['a', 'b'])).toThrow();
    expect(() => assertSingleIdArg([42])).toThrow();
    expect(() => assertSingleIdArg([''])).toThrow();
    expect(() => assertSingleIdArg(['x'.repeat(129)])).toThrow();
  });
});

describe('assertCreateAcademicYearArgs', () => {
  const valid = { code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31' };

  it('accepts a well-formed request, with and without makeCurrent', () => {
    expect(() => assertCreateAcademicYearArgs([valid])).not.toThrow();
    expect(() => assertCreateAcademicYearArgs([{ ...valid, makeCurrent: true }])).not.toThrow();
  });

  it('rejects wrong arity, non-objects, missing fields, bad dates, unknown keys', () => {
    expect(() => assertCreateAcademicYearArgs([])).toThrow();
    expect(() => assertCreateAcademicYearArgs([valid, valid])).toThrow();
    expect(() => assertCreateAcademicYearArgs(['not-an-object'])).toThrow();
    expect(() => assertCreateAcademicYearArgs([{ startDate: valid.startDate, endDate: valid.endDate }])).toThrow();
    expect(() => assertCreateAcademicYearArgs([{ ...valid, startDate: 'not-a-date' }])).toThrow();
    expect(() => assertCreateAcademicYearArgs([{ ...valid, makeCurrent: 'yes' }])).toThrow();
    expect(() => assertCreateAcademicYearArgs([{ ...valid, extra: 'nope' }])).toThrow();
  });
});

describe('assertUpdateAcademicYearArgs', () => {
  it('accepts id-only and partial-field requests; rejects missing id', () => {
    expect(() => assertUpdateAcademicYearArgs([{ id: 'ay-1' }])).not.toThrow();
    expect(() => assertUpdateAcademicYearArgs([{ id: 'ay-1', code: '2030/2031' }])).not.toThrow();
    expect(() => assertUpdateAcademicYearArgs([{ code: '2030/2031' }])).toThrow();
  });
});

describe('assertSetAcademicYearStatusArgs', () => {
  it('accepts a known status and rejects unknown ones', () => {
    expect(() => assertSetAcademicYearStatusArgs([{ id: 'ay-1', status: 'CLOSED' }])).not.toThrow();
    expect(() => assertSetAcademicYearStatusArgs([{ id: 'ay-1', status: 'DELETED' }])).toThrow();
    expect(() => assertSetAcademicYearStatusArgs([{ id: 'ay-1' }])).toThrow();
  });
});

describe('assertCreateTermArgs / assertUpdateTermArgs', () => {
  it('CreateTerm requires academicYearId/name/startDate/endDate', () => {
    expect(() =>
      assertCreateTermArgs([
        { academicYearId: 'ay-1', name: 'Term 1', startDate: '2025-09-01', endDate: '2025-12-19' },
      ]),
    ).not.toThrow();
    expect(() => assertCreateTermArgs([{ academicYearId: 'ay-1', name: 'Term 1' }])).toThrow();
  });

  it('UpdateTerm allows partial fields but requires id', () => {
    expect(() => assertUpdateTermArgs([{ id: 't-1', name: 'Term One' }])).not.toThrow();
    expect(() => assertUpdateTermArgs([{ name: 'Term One' }])).toThrow();
  });
});

describe('assertListClassesArgs', () => {
  it('accepts an empty filter object and a fully-populated one', () => {
    expect(() => assertListClassesArgs([{}])).not.toThrow();
    expect(() =>
      assertListClassesArgs([
        {
          limit: 25, offset: 0, keyword: 'JSS', academicYearId: 'ay-1',
          gradeLevel: 'GRADE_7', includeInactive: true, sort: 'name',
        },
      ]),
    ).not.toThrow();
  });

  it('rejects out-of-range limit, unknown gradeLevel/sort, and non-objects', () => {
    expect(() => assertListClassesArgs([{ limit: 0 }])).toThrow();
    expect(() => assertListClassesArgs([{ limit: 101 }])).toThrow();
    expect(() => assertListClassesArgs([{ gradeLevel: 'GRADE_99' }])).toThrow();
    expect(() => assertListClassesArgs([{ sort: 'nope' }])).toThrow();
    expect(() => assertListClassesArgs(['nope'])).toThrow();
  });
});

describe('assertCreateClassArgs / assertUpdateClassArgs', () => {
  it('CreateClass requires academicYearId/name/gradeLevel and bounds capacity', () => {
    expect(() =>
      assertCreateClassArgs([{ academicYearId: 'ay-1', name: 'JSS1-A', gradeLevel: 'GRADE_7' }]),
    ).not.toThrow();
    expect(() =>
      assertCreateClassArgs([
        { academicYearId: 'ay-1', name: 'JSS1-A', gradeLevel: 'GRADE_7', capacity: 0 },
      ]),
    ).toThrow();
    expect(() =>
      assertCreateClassArgs([{ academicYearId: 'ay-1', name: 'JSS1-A', gradeLevel: 'NOT_A_GRADE' }]),
    ).toThrow();
  });

  it('UpdateClass allows null to clear section/capacity', () => {
    expect(() => assertUpdateClassArgs([{ id: 'c-1', section: null, capacity: null }])).not.toThrow();
    expect(() => assertUpdateClassArgs([{ id: 'c-1', capacity: 1001 }])).toThrow();
  });
});

describe('assertSetActiveArgs', () => {
  it('requires id and a boolean isActive', () => {
    expect(() => assertSetActiveArgs([{ id: 'c-1', isActive: false }])).not.toThrow();
    expect(() => assertSetActiveArgs([{ id: 'c-1', isActive: 'false' }])).toThrow();
  });
});

describe('assertListSubjectsArgs', () => {
  it('accepts empty and populated filters; rejects unknown sort', () => {
    expect(() => assertListSubjectsArgs([{}])).not.toThrow();
    expect(() => assertListSubjectsArgs([{ sort: 'code', includeInactive: true }])).not.toThrow();
    expect(() => assertListSubjectsArgs([{ sort: 'invalid' }])).toThrow();
  });
});

describe('assertCreateSubjectArgs / assertUpdateSubjectArgs', () => {
  it('CreateSubject requires name and code', () => {
    expect(() => assertCreateSubjectArgs([{ name: 'Mathematics', code: 'MATH' }])).not.toThrow();
    expect(() => assertCreateSubjectArgs([{ name: 'Mathematics' }])).toThrow();
    expect(() => assertCreateSubjectArgs([{ name: 'Mathematics', code: 'x'.repeat(33) }])).toThrow();
  });

  it('UpdateSubject allows null to clear description', () => {
    expect(() => assertUpdateSubjectArgs([{ id: 's-1', description: null }])).not.toThrow();
    expect(() => assertUpdateSubjectArgs([{ description: 'x' }])).toThrow();
  });
});

describe('assertClassSubjectPairArgs', () => {
  it('requires both classId and subjectId', () => {
    expect(() => assertClassSubjectPairArgs([{ classId: 'c-1', subjectId: 's-1' }])).not.toThrow();
    expect(() => assertClassSubjectPairArgs([{ classId: 'c-1' }])).toThrow();
  });
});

describe('assertMoveEnrollmentClassArgs', () => {
  it('requires only bounded enrollment and target class ids', () => {
    expect(() =>
      assertMoveEnrollmentClassArgs([
        { enrollmentId: 'enr-1', targetClassId: 'class-2' },
      ]),
    ).not.toThrow();
    expect(() =>
      assertMoveEnrollmentClassArgs([{ enrollmentId: 'enr-1' }]),
    ).toThrow();
    expect(() =>
      assertMoveEnrollmentClassArgs([
        { enrollmentId: 'enr-1', targetClassId: 'class-2', extra: true },
      ]),
    ).toThrow();
  });
});
