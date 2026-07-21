import { describe, expect, it } from 'vitest';
import { AcademicYearStatus, GradeLevel } from '@nemis-desktop/types';
import { AcademicYear } from './entities/academic-year';
import { Term } from './entities/term';
import { Class } from './entities/class';
import { Subject } from './entities/subject';
import { BusinessRuleViolationException } from '../exceptions';

const ISO = '2026-07-21T00:00:00.000Z';

describe('AcademicYear lifecycle', () => {
  function activeYear(overrides: Partial<{ isCurrent: boolean; status: AcademicYearStatus }> = {}) {
    return AcademicYear.reconstitute({
      id: 'ay-1',
      institutionId: 'inst-1',
      code: '2025/2026',
      start: '2025-09-01',
      end: '2026-07-31',
      isCurrent: overrides.isCurrent ?? false,
      status: overrides.status ?? AcademicYearStatus.ACTIVE,
      version: 1,
      updatedAt: ISO,
    });
  }

  it('create() defaults to ACTIVE and emits AcademicYearCreated', () => {
    const year = AcademicYear.create({
      id: 'ay-2',
      institutionId: 'inst-1',
      code: '2026/2027',
      start: '2026-09-01',
      end: '2027-07-31',
      occurredAt: ISO,
    });
    expect(year.status).toBe(AcademicYearStatus.ACTIVE);
    expect(year.isCurrent).toBe(false);
    const events = year.pullDomainEvents();
    expect(events[0]?.name).toBe('AcademicYearCreated');
  });

  it('rename() and reschedule() bump version; reject on non-ACTIVE', () => {
    const year = activeYear();
    year.rename('2025/2099', 'admin', ISO);
    expect(year.code.value).toBe('2025/2099');
    expect(year.version).toBe(2);

    year.reschedule('2025-08-01', '2026-06-30', 'admin', ISO);
    expect(year.period.start).toBe('2025-08-01');
    expect(year.version).toBe(3);

    const closed = activeYear({ status: AcademicYearStatus.CLOSED });
    expect(() => closed.rename('2030/2031', 'admin', ISO)).toThrow(
      BusinessRuleViolationException,
    );
  });

  it('makeCurrent rejects non-ACTIVE years', () => {
    const archived = activeYear({ status: AcademicYearStatus.ARCHIVED });
    expect(() => archived.makeCurrent('admin', ISO)).toThrow(BusinessRuleViolationException);
  });

  it('close() requires ACTIVE and not current', () => {
    const current = activeYear({ isCurrent: true });
    expect(() => current.close('admin', ISO)).toThrow(BusinessRuleViolationException);

    const year = activeYear();
    year.close('admin', ISO);
    expect(year.status).toBe(AcademicYearStatus.CLOSED);
    expect(() => year.close('admin', ISO)).toThrow(BusinessRuleViolationException);
  });

  it('archive() requires not current; is idempotent when already archived', () => {
    const current = activeYear({ isCurrent: true });
    expect(() => current.archive('admin', ISO)).toThrow(BusinessRuleViolationException);

    const closed = activeYear({ status: AcademicYearStatus.CLOSED });
    closed.archive('admin', ISO);
    expect(closed.status).toBe(AcademicYearStatus.ARCHIVED);

    const versionBefore = closed.version;
    closed.archive('admin', ISO);
    expect(closed.version).toBe(versionBefore);
  });

  it('restore() returns an archived/closed year to ACTIVE', () => {
    const archived = activeYear({ status: AcademicYearStatus.ARCHIVED });
    archived.restore('admin', ISO);
    expect(archived.status).toBe(AcademicYearStatus.ACTIVE);
  });
});

describe('Term lifecycle', () => {
  it('create() emits TermCreated', () => {
    const term = Term.create({
      id: 't-1',
      academicYearId: 'ay-1',
      name: 'Term 1',
      start: '2025-09-01',
      end: '2025-12-19',
      occurredAt: ISO,
    });
    expect(term.pullDomainEvents()[0]?.name).toBe('TermCreated');
    expect(term.isCurrent).toBe(false);
    expect(term.version).toBe(1);
  });

  it('rename/reschedule/makeCurrent/clearCurrent bump version and are idempotent', () => {
    const term = Term.reconstitute({
      id: 't-1',
      academicYearId: 'ay-1',
      name: 'Term 1',
      start: '2025-09-01',
      end: '2025-12-19',
      isCurrent: false,
      version: 1,
      updatedAt: ISO,
    });
    term.rename('Term One', 'admin', ISO);
    expect(term.name).toBe('Term One');
    expect(term.version).toBe(2);

    term.makeCurrent('admin', ISO);
    expect(term.isCurrent).toBe(true);
    expect(term.version).toBe(3);
    term.makeCurrent('admin', ISO); // idempotent
    expect(term.version).toBe(3);

    term.clearCurrent('admin', ISO);
    expect(term.isCurrent).toBe(false);
    expect(term.version).toBe(4);
  });
});

describe('Class lifecycle', () => {
  function reconstitutedClass() {
    return Class.reconstitute({
      id: 'c-1',
      institutionId: 'inst-1',
      academicYearId: 'ay-1',
      name: 'JSS1-A',
      gradeLevel: GradeLevel.GRADE_7,
      capacity: 40,
      isActive: true,
      version: 1,
      updatedAt: ISO,
    });
  }

  it('create() defaults active with no section, emits ClassCreated', () => {
    const klass = Class.create({
      id: 'c-2',
      institutionId: 'inst-1',
      academicYearId: 'ay-1',
      name: 'JSS1-B',
      gradeLevel: GradeLevel.GRADE_7,
      occurredAt: ISO,
    });
    expect(klass.isActive).toBe(true);
    expect(klass.section).toBeUndefined();
    expect(klass.pullDomainEvents()[0]?.name).toBe('ClassCreated');
  });

  it('rejects out-of-range capacity', () => {
    expect(() =>
      Class.create({
        id: 'c-3',
        institutionId: 'inst-1',
        academicYearId: 'ay-1',
        name: 'X',
        gradeLevel: GradeLevel.GRADE_1,
        capacity: 0,
        occurredAt: ISO,
      }),
    ).toThrow();
    expect(() =>
      Class.create({
        id: 'c-4',
        institutionId: 'inst-1',
        academicYearId: 'ay-1',
        name: 'X',
        gradeLevel: GradeLevel.GRADE_1,
        capacity: 1001,
        occurredAt: ISO,
      }),
    ).toThrow();
  });

  it('update() applies partial fields; null clears section/capacity', () => {
    const klass = reconstitutedClass();
    klass.update({ section: 'B', capacity: 45 }, 'admin', ISO);
    expect(klass.section).toBe('B');
    expect(klass.capacity).toBe(45);
    expect(klass.version).toBe(2);

    klass.update({ section: null, capacity: null }, 'admin', ISO);
    expect(klass.section).toBeUndefined();
    expect(klass.capacity).toBeUndefined();
  });

  it('deactivate/activate toggle isActive and are idempotent', () => {
    const klass = reconstitutedClass();
    klass.deactivate('admin', ISO);
    expect(klass.isActive).toBe(false);
    const versionAfterDeactivate = klass.version;
    klass.deactivate('admin', ISO);
    expect(klass.version).toBe(versionAfterDeactivate);

    klass.activate('admin', ISO);
    expect(klass.isActive).toBe(true);
  });
});

describe('Subject lifecycle', () => {
  it('create() normalizes code to uppercase and emits SubjectCreated', () => {
    const subject = Subject.create({
      id: 's-1',
      institutionId: 'inst-1',
      name: 'Mathematics',
      code: 'math',
      occurredAt: ISO,
    });
    expect(subject.code).toBe('MATH');
    expect(subject.isActive).toBe(true);
    expect(subject.pullDomainEvents()[0]?.name).toBe('SubjectCreated');
  });

  it('update() normalizes code and clears description with null', () => {
    const subject = Subject.reconstitute({
      id: 's-1',
      institutionId: 'inst-1',
      name: 'Mathematics',
      code: 'MATH',
      description: 'Core subject',
      isActive: true,
      version: 1,
      updatedAt: ISO,
    });
    subject.update({ code: 'mth', description: null }, 'admin', ISO);
    expect(subject.code).toBe('MTH');
    expect(subject.description).toBeUndefined();
    expect(subject.version).toBe(2);
  });

  it('deactivate/activate toggle isActive', () => {
    const subject = Subject.reconstitute({
      id: 's-1',
      institutionId: 'inst-1',
      name: 'Mathematics',
      code: 'MATH',
      isActive: true,
      version: 1,
      updatedAt: ISO,
    });
    subject.deactivate('admin', ISO);
    expect(subject.isActive).toBe(false);
    subject.activate('admin', ISO);
    expect(subject.isActive).toBe(true);
  });
});
