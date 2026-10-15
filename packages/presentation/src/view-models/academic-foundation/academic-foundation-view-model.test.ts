import { describe, expect, it, vi } from 'vitest';
import type { AcademicsApplicationService, CreateSubjectDto, ListClassesDto, ListSubjectsDto } from '@nemis-desktop/application';
import type { CommandOutcome } from '../../core/async-runner';
import { NotificationStore } from '../../stores/notification-store';
import { AcademicFoundationViewModel } from './academic-foundation-view-model';

function makeAcademics(): AcademicsApplicationService {
  return {
    listAcademicYears: vi.fn(async () => ({ data: [{
      id: 'year-1', institutionId: 'school-1', code: '2026/2027', startDate: '2026-09-01',
      endDate: '2027-07-31', isCurrent: true, status: 'ACTIVE', termCount: 0, classCount: 0,
    }] })),
    listClasses: vi.fn(async () => ({ data: { items: [], total: 0, limit: 25, offset: 0 } })),
    listSubjects: vi.fn(async () => ({ data: { items: [], total: 0, limit: 25, offset: 0 } })),
  } as unknown as AcademicsApplicationService;
}

describe('AcademicFoundationViewModel', () => {
  it('loads academic years through the ApplicationLayer facade', async () => {
    const vm = new AcademicFoundationViewModel({ academics: makeAcademics(), notifications: new NotificationStore() });
    await vm.loadAcademicYears();
    const state = vm.store.getState().academicYears;
    expect(state.status).toBe('success');
    if (state.status === 'success') expect(state.data[0]?.code).toBe('2026/2027');
  });

  it('represents an empty class page as an empty state', async () => {
    const vm = new AcademicFoundationViewModel({ academics: makeAcademics(), notifications: new NotificationStore() });
    await vm.loadClasses();
    expect(vm.store.getState().classes.status).toBe('empty');
  });
});

const subjectOut = (code: string, over: Record<string, unknown> = {}) => ({
  id: `id-${code}`, name: code, code, isActive: true, classCount: 0, ...over,
});

/** `existing` is what is already on the device; listSubjects pages through it
 * like the real use case. createSubject echoes the dto back as a saved row. */
function makeBatchAcademics(existing: ReadonlyArray<{ code: string; isActive: boolean }> = []) {
  return {
    listSubjects: vi.fn(async (dto: ListSubjectsDto) => {
      const offset = dto.offset ?? 0;
      const limit = dto.limit ?? 25;
      const items = existing.slice(offset, offset + limit).map((s) => subjectOut(s.code, { isActive: s.isActive }));
      return { data: { items, total: existing.length, limit, offset } };
    }),
    createSubject: vi.fn(async (dto: CreateSubjectDto) => ({
      data: subjectOut(dto.code.trim().toUpperCase(), { name: dto.name }),
    })),
  };
}

type BatchAcademics = ReturnType<typeof makeBatchAcademics>;

function makeBatchVm(academics: BatchAcademics) {
  // null auto-dismiss: toasts stay in the store for the assertions.
  const notifications = new NotificationStore({ success: null, info: null, warning: null, error: null });
  const vm = new AcademicFoundationViewModel({
    academics: academics as unknown as AcademicsApplicationService,
    notifications,
  });
  return { vm, notifications };
}

const toasts = (n: NotificationStore) => n.store.getState().notifications.map((t) => [t.kind, t.message]);
const messages = (outcomes: readonly CommandOutcome<unknown>[]) =>
  outcomes.map((o) => (o.ok ? 'ok' : o.error.userMessage));
/** The pre-check always asks for deactivated subjects; the list reload uses the on-screen filters. */
const preCheckCalls = (a: BatchAcademics) => a.listSubjects.mock.calls.filter(([dto]) => dto.includeInactive === true);
const reloads = (a: BatchAcademics) => a.listSubjects.mock.calls.filter(([dto]) => dto.includeInactive !== true).length;
const createdCodes = (a: BatchAcademics) => a.createSubject.mock.calls.map(([dto]) => dto.code);

describe('AcademicFoundationViewModel.createSubjects', () => {
  it('creates every subject in order, then reloads once and shows one toast', async () => {
    const academics = makeBatchAcademics();
    const { vm, notifications } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }, { name: 'English', code: 'ENG' }]);
    expect(messages(outcomes)).toEqual(['ok', 'ok']);
    expect(createdCodes(academics)).toEqual(['MATH', 'ENG']);
    expect(reloads(academics)).toBe(1);
    expect(toasts(notifications)).toEqual([['success', '2 subjects created.']]);
  });

  it('uses the single-subject message for a batch of one', async () => {
    const academics = makeBatchAcademics();
    const { vm, notifications } = makeBatchVm(academics);
    await vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }]);
    expect(toasts(notifications)).toEqual([['success', 'Subject created.']]);
  });

  it('keeps outcomes in order on partial failure, with one warning and one reload', async () => {
    const academics = makeBatchAcademics();
    academics.createSubject.mockImplementation(async (dto: CreateSubjectDto) => {
      if (dto.code === 'BAD') throw new Error('boom');
      return { data: subjectOut(dto.code, { name: dto.name }) };
    });
    const { vm, notifications } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Bad', code: 'BAD' }, { name: 'English', code: 'ENG' }]);
    expect(messages(outcomes)).toEqual(['Something went wrong. Please try again.', 'ok']);
    expect(reloads(academics)).toBe(1);
    expect(toasts(notifications)).toEqual([['warning', '1 subject created, 1 failed — see the drawer.']]);
  });

  it('pluralises the warning when more than one subject saved', async () => {
    const academics = makeBatchAcademics([{ code: 'MATH', isActive: true }]);
    const { vm, notifications } = makeBatchVm(academics);
    await vm.createSubjects([{ name: 'A', code: 'A' }, { name: 'B', code: 'B' }, { name: 'M', code: 'MATH' }]);
    expect(toasts(notifications)).toEqual([['warning', '2 subjects created, 1 failed — see the drawer.']]);
  });

  it('does not reload and shows one error when nothing saved', async () => {
    const academics = makeBatchAcademics();
    academics.createSubject.mockRejectedValue(new Error('boom'));
    const { vm, notifications } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'A', code: 'A' }, { name: 'B', code: 'B' }]);
    expect(outcomes.every((o) => !o.ok)).toBe(true);
    expect(reloads(academics)).toBe(0);
    expect(toasts(notifications)).toEqual([['error', 'No subjects were created — see the errors in the drawer.']]);
  });

  it('does not start the next create until the previous one finished', async () => {
    const academics = makeBatchAcademics();
    let release: () => void = () => {};
    academics.createSubject.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ data: subjectOut('MATH') }); }),
    );
    const { vm } = makeBatchVm(academics);
    const pending = vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }, { name: 'English', code: 'ENG' }]);
    await vi.waitFor(() => expect(academics.createSubject).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(academics.createSubject).toHaveBeenCalledTimes(1);
    release();
    await pending;
    expect(createdCodes(academics)).toEqual(['MATH', 'ENG']);
  });

  it('returns nothing and does no work for an empty batch', async () => {
    const academics = makeBatchAcademics();
    const { vm, notifications } = makeBatchVm(academics);
    expect(await vm.createSubjects([])).toEqual([]);
    expect(academics.listSubjects).not.toHaveBeenCalled();
    expect(academics.createSubject).not.toHaveBeenCalled();
    expect(toasts(notifications)).toEqual([]);
  });

  it('rejects a code that already exists, ignoring case and spaces, without sending it', async () => {
    const academics = makeBatchAcademics([{ code: 'MATH', isActive: true }]);
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Maths', code: ' math ' }, { name: 'English', code: 'ENG' }]);
    expect(messages(outcomes)).toEqual(['A subject with code "MATH" already exists.', 'ok']);
    expect(createdCodes(academics)).toEqual(['ENG']);
  });

  it('points to restore when the existing subject is deactivated', async () => {
    const academics = makeBatchAcademics([{ code: 'ART', isActive: false }]);
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Art', code: 'art' }]);
    expect(messages(outcomes)).toEqual(['A deactivated subject with code "ART" already exists. Tick "Include deactivated subjects" to find and restore it.']);
    expect(academics.createSubject).not.toHaveBeenCalled();
  });

  it('pages through every subject for the pre-check', async () => {
    const existing = Array.from({ length: 150 }, (_, i) => ({ code: `S${i}`, isActive: true }));
    const academics = makeBatchAcademics(existing);
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Late page', code: 's120' }]);
    expect(messages(outcomes)).toEqual(['A subject with code "S120" already exists.']);
    expect(preCheckCalls(academics).map(([dto]) => [dto.limit, dto.offset])).toEqual([[100, 0], [100, 100]]);
    expect(preCheckCalls(academics).every(([dto]) => dto.sort === 'code')).toBe(true);
  });

  it('still sends every row when the pre-check cannot read the list', async () => {
    const academics = makeBatchAcademics([{ code: 'MATH', isActive: true }]);
    academics.listSubjects.mockRejectedValueOnce(new Error('db down'));
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }]);
    expect(messages(outcomes)).toEqual(['ok']);
    expect(createdCodes(academics)).toEqual(['MATH']);
  });

  it('still catches a code repeated inside the batch when the pre-check cannot read the list', async () => {
    const academics = makeBatchAcademics();
    academics.listSubjects.mockRejectedValueOnce(new Error('db down'));
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }, { name: 'Maths', code: 'math' }]);
    expect(messages(outcomes)).toEqual(['ok', 'A subject with code "MATH" already exists.']);
    expect(academics.createSubject).toHaveBeenCalledTimes(1);
  });

  it('catches a code repeated inside the batch', async () => {
    const academics = makeBatchAcademics();
    const { vm } = makeBatchVm(academics);
    const outcomes = await vm.createSubjects([{ name: 'Mathematics', code: 'MATH' }, { name: 'Maths', code: 'math' }]);
    expect(messages(outcomes)).toEqual(['ok', 'A subject with code "MATH" already exists.']);
    expect(createdCodes(academics)).toEqual(['MATH']);
  });

  it('pre-check ignores the on-screen filters', async () => {
    const academics = makeBatchAcademics([{ code: 'ART', isActive: false }]);
    const { vm } = makeBatchVm(academics);
    vm.setSubjectFilters({ keyword: 'zzz', includeInactive: false });
    const outcomes = await vm.createSubjects([{ name: 'Art', code: 'ART' }]);
    expect(messages(outcomes)).toEqual(['A deactivated subject with code "ART" already exists. Tick "Include deactivated subjects" to find and restore it.']);
    expect(preCheckCalls(academics).every(([dto]) => dto.keyword === undefined)).toBe(true);
  });
});

describe('AcademicFoundationViewModel.loadYearClasses', () => {
  const cls = (n: number) => ({
    id: `c${n}`, academicYearId: 'y1', name: `C${n}`, gradeLevel: 'GRADE_1', isActive: true, subjectCount: 0,
  });

  /** Pages through `total` classes like the real use case. */
  function pagedAcademics(total: number) {
    const all = Array.from({ length: total }, (_, i) => cls(i + 1));
    return {
      listClasses: vi.fn(async (dto: ListClassesDto) => {
        const offset = dto.offset ?? 0;
        const limit = dto.limit ?? 25;
        return { data: { items: all.slice(offset, offset + limit), total, limit, offset } };
      }),
    };
  }

  const makeVm = (academics: unknown) =>
    new AcademicFoundationViewModel({
      academics: academics as AcademicsApplicationService,
      notifications: new NotificationStore(),
    });

  it('pages through every class of the year, 100 at a time', async () => {
    const academics = pagedAcademics(230);
    const vm = makeVm(academics);
    await vm.loadYearClasses('y1');
    expect(academics.listClasses.mock.calls.map(([dto]) => dto)).toEqual([
      { academicYearId: 'y1', limit: 100, offset: 0 },
      { academicYearId: 'y1', limit: 100, offset: 100 },
      { academicYearId: 'y1', limit: 100, offset: 200 },
    ]);
    const state = vm.store.getState().yearClasses;
    expect(state.status).toBe('success');
    if (state.status === 'success') expect(state.data).toHaveLength(230);
  });

  it('leaves the paginated class list, its filters and pagination alone', async () => {
    const vm = makeVm(pagedAcademics(3));
    vm.setClassFilters({ gradeLevel: 'GRADE_7' as never });
    const before = vm.store.getState();
    await vm.loadYearClasses('y1');
    const after = vm.store.getState();
    expect(after.classes).toBe(before.classes);
    expect(after.classFilters).toBe(before.classFilters);
    expect(after.classPagination).toBe(before.classPagination);
  });

  it('is empty when the year has no classes', async () => {
    const vm = makeVm(pagedAcademics(0));
    await vm.loadYearClasses('y1');
    expect(vm.store.getState().yearClasses.status).toBe('empty');
  });

  it('is an error, not empty, when a page cannot be read', async () => {
    const vm = makeVm({ listClasses: vi.fn(async () => { throw new Error('[DB_ERROR] boom'); }) });
    await vm.loadYearClasses('y1');
    expect(vm.store.getState().yearClasses.status).toBe('error');
  });

  it('records which year it loaded and always starts from loading, never refreshing', async () => {
    const vm = makeVm(pagedAcademics(2));
    await vm.loadYearClasses('y1');
    expect(vm.store.getState().yearClasses.status).toBe('success');
    const seen: string[] = [];
    vm.store.subscribe((s) => seen.push(s.yearClasses.status));
    const pending = vm.loadYearClasses('y2');
    expect(vm.store.getState().yearClasses).toEqual({ status: 'loading' });
    expect(vm.store.getState().yearClassesYearId).toBe('y2');
    await pending;
    expect(seen).not.toContain('refreshing');
    expect(vm.store.getState().yearClassesYearId).toBe('y2');
  });

  it('an earlier load that resolves last cannot overwrite the later year', async () => {
    const resolvers: Record<string, () => void> = {};
    const academics = {
      listClasses: vi.fn((dto: ListClassesDto) =>
        new Promise((resolve) => {
          resolvers[dto.academicYearId as string] = () =>
            resolve({ data: { items: [{ ...cls(1), academicYearId: dto.academicYearId }], total: 1, limit: 100, offset: 0 } });
        })),
    };
    const vm = makeVm(academics);
    const first = vm.loadYearClasses('y0');
    const second = vm.loadYearClasses('y1');
    resolvers.y1!();
    await second;
    resolvers.y0!();
    await first;
    const state = vm.store.getState();
    expect(state.yearClassesYearId).toBe('y1');
    expect(state.yearClasses.status).toBe('success');
    if (state.yearClasses.status === 'success') expect(state.yearClasses.data.map((c) => c.academicYearId)).toEqual(['y1']);
  });
});
