import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import { AcademicYearStatus, GradeLevel } from '@nemis-desktop/types';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '../registrar';
import { registerAcademicYearHandlers } from './academicYear';
import { registerTermHandlers } from './term';
import { registerClassHandlers } from './classes';
import { registerSubjectHandlers } from './subject';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function makeHarness() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  return { calls, handle };
}

function ok<T>(data: T) {
  return Promise.resolve({ data });
}

const academicYearRow = {
  id: 'ay-1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01',
  endDate: '2026-07-31', isCurrent: true, status: AcademicYearStatus.ACTIVE, termCount: 0, classCount: 0,
};
const termRow = {
  id: 't-1', academicYearId: 'ay-1', name: 'Term 1', startDate: '2025-09-01',
  endDate: '2025-12-19', isCurrent: true,
};
const classRow = {
  id: 'c-1', academicYearId: 'ay-1', name: 'JSS1-A', gradeLevel: GradeLevel.GRADE_7,
  isActive: true, subjectCount: 0,
};
const subjectRow = { id: 's-1', name: 'Mathematics', code: 'MATH', isActive: true, classCount: 0 };
const classSubjectRow = { classId: 'c-1', subjectId: 's-1', subjectName: 'Mathematics', subjectCode: 'MATH', assignedAt: '2026-07-21T00:00:00.000Z' };

const academics = {
  getCurrentAcademicYear: vi.fn(() => ok(academicYearRow)),
  listAcademicYears: vi.fn(() => ok([academicYearRow])),
  createAcademicYear: vi.fn(() => ok(academicYearRow)),
  updateAcademicYear: vi.fn(() => ok(academicYearRow)),
  setCurrentAcademicYear: vi.fn(() => ok(academicYearRow)),
  setAcademicYearStatus: vi.fn(() => ok(academicYearRow)),
  listTerms: vi.fn(() => ok([termRow])),
  getCurrentTerm: vi.fn(() => ok(termRow)),
  createTerm: vi.fn(() => ok(termRow)),
  updateTerm: vi.fn(() => ok(termRow)),
  setCurrentTerm: vi.fn(() => ok(termRow)),
  deleteTerm: vi.fn(() => ok({ id: 't-1' })),
  listClasses: vi.fn(() => ok({ items: [classRow], total: 1, limit: 25, offset: 0 })),
  createClass: vi.fn(() => ok(classRow)),
  updateClass: vi.fn(() => ok(classRow)),
  setClassActive: vi.fn(() => ok(classRow)),
  getGradeLevelCounts: vi.fn(() => ok([{ gradeLevel: GradeLevel.GRADE_7, classCount: 1 }])),
  listSubjects: vi.fn(() => ok({ items: [subjectRow], total: 1, limit: 25, offset: 0 })),
  createSubject: vi.fn(() => ok(subjectRow)),
  updateSubject: vi.fn(() => ok(subjectRow)),
  setSubjectActive: vi.fn(() => ok(subjectRow)),
  listClassSubjects: vi.fn(() => ok([classSubjectRow])),
  assignSubjectToClass: vi.fn(() => ok(classSubjectRow)),
  unassignSubjectFromClass: vi.fn(() => ok({ id: 'c-1:s-1' })),
};

const app = { academics } as unknown as ApplicationLayer;

describe('academic-year IPC handlers', () => {
  it('registers every channel and returns unwrapped data', async () => {
    const { calls, handle } = makeHarness();
    registerAcademicYearHandlers(handle, app);

    const list = calls.get('academic-year:list')!;
    expect(await list.handler()).toEqual([academicYearRow]);
    expect(() => list.validate(['unexpected'])).toThrow(IPCError);

    const create = calls.get('academic-year:create')!;
    expect(() => create.validate([{}])).toThrow(IPCError);
    const created = await create.handler({
      code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
    });
    expect(created).toEqual(academicYearRow);

    const update = calls.get('academic-year:update')!;
    expect(await update.handler({ id: 'ay-1', code: '2030/2031' })).toEqual(academicYearRow);

    const setCurrent = calls.get('academic-year:set-current')!;
    await setCurrent.handler('ay-1');
    expect(academics.setCurrentAcademicYear).toHaveBeenCalledWith({ id: 'ay-1' });

    const setStatus = calls.get('academic-year:set-status')!;
    expect(() => setStatus.validate([{ id: 'ay-1', status: 'NOT_A_STATUS' }])).toThrow(IPCError);
    await setStatus.handler({ id: 'ay-1', status: AcademicYearStatus.CLOSED });
    expect(academics.setAcademicYearStatus).toHaveBeenCalledWith({
      id: 'ay-1', status: AcademicYearStatus.CLOSED,
    });
  });
});

describe('term IPC handlers', () => {
  it('registers every channel and returns unwrapped data', async () => {
    const { calls, handle } = makeHarness();
    registerTermHandlers(handle, app);

    const list = calls.get('term:list')!;
    expect(await list.handler('ay-1')).toEqual([termRow]);
    expect(academics.listTerms).toHaveBeenCalledWith({ academicYearId: 'ay-1' });

    const getCurrent = calls.get('term:get-current')!;
    expect(await getCurrent.handler()).toEqual(termRow);

    const create = calls.get('term:create')!;
    expect(() => create.validate([{ academicYearId: 'ay-1' }])).toThrow(IPCError);
    expect(
      await create.handler({
        academicYearId: 'ay-1', name: 'Term 1', startDate: '2025-09-01', endDate: '2025-12-19',
      }),
    ).toEqual(termRow);

    const del = calls.get('term:delete')!;
    expect(await del.handler('t-1')).toEqual({ id: 't-1' });
    expect(academics.deleteTerm).toHaveBeenCalledWith({ id: 't-1' });
  });
});

describe('class IPC handlers', () => {
  it('registers every channel and returns unwrapped data', async () => {
    const { calls, handle } = makeHarness();
    registerClassHandlers(handle, app);

    const list = calls.get('class:list')!;
    expect(() => list.validate([{ limit: 0 }])).toThrow(IPCError);
    expect(await list.handler({ limit: 25, offset: 0 })).toEqual({
      items: [classRow], total: 1, limit: 25, offset: 0,
    });

    const create = calls.get('class:create')!;
    expect(() =>
      create.validate([{ academicYearId: 'ay-1', name: 'A', gradeLevel: 'NOT_A_GRADE' }]),
    ).toThrow(IPCError);
    expect(
      await create.handler({ academicYearId: 'ay-1', name: 'JSS1-A', gradeLevel: GradeLevel.GRADE_7 }),
    ).toEqual(classRow);

    const counts = calls.get('class:grade-level-counts')!;
    expect(await counts.handler()).toEqual([{ gradeLevel: GradeLevel.GRADE_7, classCount: 1 }]);

    const assign = calls.get('class-subject:assign')!;
    expect(await assign.handler({ classId: 'c-1', subjectId: 's-1' })).toEqual(classSubjectRow);
    expect(academics.assignSubjectToClass).toHaveBeenCalledWith({ classId: 'c-1', subjectId: 's-1' });
  });
});

describe('subject IPC handlers', () => {
  it('registers every channel and returns unwrapped data', async () => {
    const { calls, handle } = makeHarness();
    registerSubjectHandlers(handle, app);

    const list = calls.get('subject:list')!;
    expect(await list.handler({})).toEqual({ items: [subjectRow], total: 1, limit: 25, offset: 0 });

    const create = calls.get('subject:create')!;
    expect(() => create.validate([{ name: 'Mathematics' }])).toThrow(IPCError);
    expect(await create.handler({ name: 'Mathematics', code: 'MATH' })).toEqual(subjectRow);

    const setActive = calls.get('subject:set-active')!;
    expect(await setActive.handler({ id: 's-1', isActive: false })).toEqual(subjectRow);
    expect(academics.setSubjectActive).toHaveBeenCalledWith({ id: 's-1', isActive: false });
  });
});
