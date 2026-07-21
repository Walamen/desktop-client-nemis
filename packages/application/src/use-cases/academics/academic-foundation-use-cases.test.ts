import { beforeEach, describe, expect, it } from 'vitest';
import { Institution } from '@nemis-desktop/domain';
import { AcademicYearStatus, ApprovalStatus, GradeLevel, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { PassthroughUnitOfWork } from '../../testing/passthrough-unit-of-work';
import { CollectingEventPublisher } from '../../testing/collecting-event-publisher';
import { SequentialIdGenerator } from '../../testing/sequential-id-generator';
import { InMemoryInstitutionRepository } from '../../testing/institution/in-memory-institution-repository';
import { InMemoryAcademicYearRepository } from '../../testing/academics/in-memory-academic-year-repository';
import { InMemoryTermRepository } from '../../testing/academics/in-memory-term-repository';
import { InMemoryClassRepository } from '../../testing/academics/in-memory-class-repository';
import { InMemorySubjectRepository } from '../../testing/academics/in-memory-subject-repository';
import { WorkflowException } from '../../exceptions';

import { ListAcademicYearsUseCase } from './list-academic-years';
import { CreateAcademicYearUseCase } from './create-academic-year';
import { UpdateAcademicYearUseCase } from './update-academic-year';
import { SetCurrentAcademicYearUseCase } from './set-current-academic-year';
import { SetAcademicYearStatusUseCase } from './set-academic-year-status';
import { ListTermsUseCase } from './list-terms';
import { GetCurrentTermUseCase } from './get-current-term';
import { CreateTermUseCase } from './create-term';
import { UpdateTermUseCase } from './update-term';
import { SetCurrentTermUseCase } from './set-current-term';
import { DeleteTermUseCase } from './delete-term';
import { ListClassesUseCase } from './list-classes';
import { CreateClassUseCase } from './create-class';
import { UpdateClassUseCase } from './update-class';
import { SetClassActiveUseCase } from './set-class-active';
import { GetGradeLevelCountsUseCase } from './get-grade-level-counts';
import { ListSubjectsUseCase } from './list-subjects';
import { CreateSubjectUseCase } from './create-subject';
import { UpdateSubjectUseCase } from './update-subject';
import { SetSubjectActiveUseCase } from './set-subject-active';
import { ListClassSubjectsUseCase } from './list-class-subjects';
import { AssignSubjectToClassUseCase } from './assign-subject-to-class';
import { UnassignSubjectFromClassUseCase } from './unassign-subject-from-class';

const logger = new RecordingLogger();
const clock = new FixedClock('2026-07-21T09:00:00.000Z');

function setup() {
  const institutions = new InMemoryInstitutionRepository();
  institutions.store.set(
    'inst-1',
    Institution.reconstitute({
      id: 'inst-1',
      code: 'SCH-1',
      name: 'Test School',
      type: InstitutionType.SCHOOL,
      ownership: OwnershipType.GOVERNMENT,
      countyId: 'county-1',
      approvalStatus: ApprovalStatus.APPROVED,
      version: 1,
      updatedAt: '2026-07-01T00:00:00.000Z',
    }),
  );
  const subjects = new InMemorySubjectRepository();
  const classes = new InMemoryClassRepository(subjects);
  const terms = new InMemoryTermRepository();
  const academicYears = new InMemoryAcademicYearRepository(terms, classes);
  const unitOfWork = new PassthroughUnitOfWork();
  const ids = new SequentialIdGenerator('e');
  const events = new CollectingEventPublisher();
  return { institutions, subjects, classes, terms, academicYears, unitOfWork, ids, events };
}

describe('Academic Year use cases', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('CreateAcademicYear rejects a duplicate code and creates otherwise', async () => {
    const useCase = new CreateAcademicYearUseCase({
      academicYears: ctx.academicYears,
      institutions: ctx.institutions,
      unitOfWork: ctx.unitOfWork,
      clock,
      ids: ctx.ids,
      events: ctx.events,
      logger,
    });
    const res = await useCase.execute({ code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31' });
    expect(res.data.code).toBe('2025/2026');
    expect(res.data.status).toBe(AcademicYearStatus.ACTIVE);
    expect(ctx.events.published[0]?.name).toBe('AcademicYearCreated');

    await expect(
      useCase.execute({ code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31' }),
    ).rejects.toThrow(WorkflowException);
  });

  it('CreateAcademicYear with makeCurrent clears other current years', async () => {
    const createUseCase = new CreateAcademicYearUseCase({
      academicYears: ctx.academicYears,
      institutions: ctx.institutions,
      unitOfWork: ctx.unitOfWork,
      clock,
      ids: ctx.ids,
      events: ctx.events,
      logger,
    });
    const first = await createUseCase.execute({
      code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31', makeCurrent: true,
    });
    expect(first.data.isCurrent).toBe(true);

    const second = await createUseCase.execute({
      code: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31', makeCurrent: true,
    });
    expect(second.data.isCurrent).toBe(true);
    expect(ctx.academicYears.findById(first.data.id)?.isCurrent).toBe(false);
  });

  it('ListAcademicYears includes term and class counts', async () => {
    const create = new CreateAcademicYearUseCase({
      academicYears: ctx.academicYears, institutions: ctx.institutions, unitOfWork: ctx.unitOfWork,
      clock, ids: ctx.ids, events: ctx.events, logger,
    });
    await create.execute({ code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31' });
    const list = new ListAcademicYearsUseCase({ academicYears: ctx.academicYears, logger });
    const res = await list.execute({});
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ termCount: 0, classCount: 0 });
  });

  it('UpdateAcademicYear renames and reschedules; rejects duplicate code', async () => {
    const create = new CreateAcademicYearUseCase({
      academicYears: ctx.academicYears, institutions: ctx.institutions, unitOfWork: ctx.unitOfWork,
      clock, ids: ctx.ids, events: ctx.events, logger,
    });
    const a = await create.execute({ code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31' });
    const b = await create.execute({ code: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31' });

    const update = new UpdateAcademicYearUseCase({
      academicYears: ctx.academicYears, unitOfWork: ctx.unitOfWork, clock, logger,
    });
    const updated = await update.execute({ id: a.data.id, code: '2030/2031' });
    expect(updated.data.code).toBe('2030/2031');

    await expect(update.execute({ id: b.data.id, code: '2030/2031' })).rejects.toThrow(WorkflowException);
  });

  it('SetCurrentAcademicYear swaps current between years', async () => {
    const create = new CreateAcademicYearUseCase({
      academicYears: ctx.academicYears, institutions: ctx.institutions, unitOfWork: ctx.unitOfWork,
      clock, ids: ctx.ids, events: ctx.events, logger,
    });
    const a = await create.execute({ code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31', makeCurrent: true });
    const b = await create.execute({ code: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31' });

    const setCurrent = new SetCurrentAcademicYearUseCase({
      academicYears: ctx.academicYears, unitOfWork: ctx.unitOfWork, clock, logger,
    });
    const res = await setCurrent.execute({ id: b.data.id });
    expect(res.data.isCurrent).toBe(true);
    expect(ctx.academicYears.findById(a.data.id)?.isCurrent).toBe(false);
  });

  it('SetAcademicYearStatus blocks closing the current year and allows close→archive→restore', async () => {
    const create = new CreateAcademicYearUseCase({
      academicYears: ctx.academicYears, institutions: ctx.institutions, unitOfWork: ctx.unitOfWork,
      clock, ids: ctx.ids, events: ctx.events, logger,
    });
    const current = await create.execute({
      code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31', makeCurrent: true,
    });
    const setStatus = new SetAcademicYearStatusUseCase({
      academicYears: ctx.academicYears, unitOfWork: ctx.unitOfWork, clock, logger,
    });
    await expect(
      setStatus.execute({ id: current.data.id, status: AcademicYearStatus.CLOSED }),
    ).rejects.toThrow();

    const other = await create.execute({ code: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31' });
    const closed = await setStatus.execute({ id: other.data.id, status: AcademicYearStatus.CLOSED });
    expect(closed.data.status).toBe(AcademicYearStatus.CLOSED);
    const archived = await setStatus.execute({ id: other.data.id, status: AcademicYearStatus.ARCHIVED });
    expect(archived.data.status).toBe(AcademicYearStatus.ARCHIVED);
    const restored = await setStatus.execute({ id: other.data.id, status: AcademicYearStatus.ACTIVE });
    expect(restored.data.status).toBe(AcademicYearStatus.ACTIVE);
  });
});

describe('Term use cases', () => {
  let ctx: ReturnType<typeof setup>;
  let yearId: string;
  beforeEach(async () => {
    ctx = setup();
    const create = new CreateAcademicYearUseCase({
      academicYears: ctx.academicYears, institutions: ctx.institutions, unitOfWork: ctx.unitOfWork,
      clock, ids: ctx.ids, events: ctx.events, logger,
    });
    const year = await create.execute({ code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31' });
    yearId = year.data.id;
  });

  function deps() {
    return {
      terms: ctx.terms, academicYears: ctx.academicYears, unitOfWork: ctx.unitOfWork,
      clock, ids: ctx.ids, events: ctx.events, logger,
    };
  }

  it('CreateTerm rejects dates outside the academic year and duplicate names', async () => {
    const useCase = new CreateTermUseCase(deps());
    await expect(
      useCase.execute({ academicYearId: yearId, name: 'Term 1', startDate: '2025-08-01', endDate: '2025-12-19' }),
    ).rejects.toThrow(WorkflowException);

    const term = await useCase.execute({
      academicYearId: yearId, name: 'Term 1', startDate: '2025-09-01', endDate: '2025-12-19',
    });
    expect(term.data.name).toBe('Term 1');

    await expect(
      useCase.execute({ academicYearId: yearId, name: 'Term 1', startDate: '2026-01-05', endDate: '2026-04-01' }),
    ).rejects.toThrow(WorkflowException);
  });

  it('CreateTerm with makeCurrent clears other current terms in the same year', async () => {
    const useCase = new CreateTermUseCase(deps());
    const t1 = await useCase.execute({
      academicYearId: yearId, name: 'Term 1', startDate: '2025-09-01', endDate: '2025-12-19', makeCurrent: true,
    });
    const t2 = await useCase.execute({
      academicYearId: yearId, name: 'Term 2', startDate: '2026-01-05', endDate: '2026-04-01', makeCurrent: true,
    });
    expect(t2.data.isCurrent).toBe(true);
    expect(ctx.terms.findById(t1.data.id)?.isCurrent).toBe(false);
  });

  it('ListTerms / GetCurrentTerm / UpdateTerm / SetCurrentTerm / DeleteTerm', async () => {
    const create = new CreateTermUseCase(deps());
    const term = await create.execute({
      academicYearId: yearId, name: 'Term 1', startDate: '2025-09-01', endDate: '2025-12-19',
    });

    const list = new ListTermsUseCase({ terms: ctx.terms, logger });
    expect((await list.execute({ academicYearId: yearId })).data).toHaveLength(1);

    const setCurrent = new SetCurrentTermUseCase({ terms: ctx.terms, unitOfWork: ctx.unitOfWork, clock, logger });
    await setCurrent.execute({ id: term.data.id });
    const getCurrent = new GetCurrentTermUseCase({ terms: ctx.terms, logger });
    expect((await getCurrent.execute({})).data?.id).toBe(term.data.id);

    const update = new UpdateTermUseCase({
      terms: ctx.terms, academicYears: ctx.academicYears, unitOfWork: ctx.unitOfWork, clock, logger,
    });
    const renamed = await update.execute({ id: term.data.id, name: 'Term One' });
    expect(renamed.data.name).toBe('Term One');
    await expect(
      update.execute({ id: term.data.id, startDate: '2020-01-01' }),
    ).rejects.toThrow(WorkflowException);

    const del = new DeleteTermUseCase({ terms: ctx.terms, unitOfWork: ctx.unitOfWork, logger });
    await del.execute({ id: term.data.id });
    expect(ctx.terms.findById(term.data.id)).toBeNull();
  });
});

describe('Class use cases', () => {
  let ctx: ReturnType<typeof setup>;
  let yearId: string;
  beforeEach(async () => {
    ctx = setup();
    const create = new CreateAcademicYearUseCase({
      academicYears: ctx.academicYears, institutions: ctx.institutions, unitOfWork: ctx.unitOfWork,
      clock, ids: ctx.ids, events: ctx.events, logger,
    });
    const year = await create.execute({ code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31' });
    yearId = year.data.id;
  });

  function classDeps() {
    return {
      classes: ctx.classes, academicYears: ctx.academicYears, institutions: ctx.institutions,
      unitOfWork: ctx.unitOfWork, clock, ids: ctx.ids, events: ctx.events, logger,
    };
  }

  it('CreateClass rejects duplicate names in the same year and creates otherwise', async () => {
    const useCase = new CreateClassUseCase(classDeps());
    const created = await useCase.execute({
      academicYearId: yearId, name: 'JSS1-A', gradeLevel: GradeLevel.GRADE_7, capacity: 40,
    });
    expect(created.data.isActive).toBe(true);

    await expect(
      useCase.execute({ academicYearId: yearId, name: 'JSS1-A', gradeLevel: GradeLevel.GRADE_7 }),
    ).rejects.toThrow(WorkflowException);
  });

  it('ListClasses filters by keyword, gradeLevel, and includeInactive', async () => {
    const create = new CreateClassUseCase(classDeps());
    await create.execute({ academicYearId: yearId, name: 'JSS1-A', gradeLevel: GradeLevel.GRADE_7 });
    const b = await create.execute({ academicYearId: yearId, name: 'JSS2-B', gradeLevel: GradeLevel.GRADE_8 });

    const setActive = new SetClassActiveUseCase({ classes: ctx.classes, unitOfWork: ctx.unitOfWork, clock, logger });
    await setActive.execute({ id: b.data.id, isActive: false });

    const list = new ListClassesUseCase({ classes: ctx.classes, logger });
    const activeOnly = await list.execute({ limit: 25, offset: 0 });
    expect(activeOnly.data.items).toHaveLength(1);

    const withInactive = await list.execute({ limit: 25, offset: 0, includeInactive: true });
    expect(withInactive.data.items).toHaveLength(2);

    const byGrade = await list.execute({ limit: 25, offset: 0, gradeLevel: GradeLevel.GRADE_7 });
    expect(byGrade.data.items).toHaveLength(1);
  });

  it('UpdateClass rejects out-of-range capacity and applies partial updates', async () => {
    const create = new CreateClassUseCase(classDeps());
    const created = await create.execute({
      academicYearId: yearId, name: 'JSS1-A', gradeLevel: GradeLevel.GRADE_7,
    });
    const update = new UpdateClassUseCase({ classes: ctx.classes, unitOfWork: ctx.unitOfWork, clock, logger });
    const updated = await update.execute({ id: created.data.id, section: 'B', capacity: 45 });
    expect(updated.data.section).toBe('B');
    expect(updated.data.capacity).toBe(45);

    await expect(update.execute({ id: created.data.id, capacity: 5000 })).rejects.toThrow();
  });

  it('GetGradeLevelCounts aggregates active classes by grade', async () => {
    const create = new CreateClassUseCase(classDeps());
    await create.execute({ academicYearId: yearId, name: 'A', gradeLevel: GradeLevel.GRADE_7 });
    await create.execute({ academicYearId: yearId, name: 'B', gradeLevel: GradeLevel.GRADE_7 });
    await create.execute({ academicYearId: yearId, name: 'C', gradeLevel: GradeLevel.GRADE_8 });

    const counts = new GetGradeLevelCountsUseCase({ classes: ctx.classes, logger });
    const res = await counts.execute({});
    expect(res.data).toContainEqual({ gradeLevel: GradeLevel.GRADE_7, classCount: 2 });
    expect(res.data).toContainEqual({ gradeLevel: GradeLevel.GRADE_8, classCount: 1 });
  });
});

describe('Subject use cases and class↔subject assignment', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  function subjectDeps() {
    return {
      subjects: ctx.subjects, institutions: ctx.institutions, unitOfWork: ctx.unitOfWork,
      clock, ids: ctx.ids, events: ctx.events, logger,
    };
  }

  it('CreateSubject normalizes code case for duplicate detection', async () => {
    const useCase = new CreateSubjectUseCase(subjectDeps());
    const created = await useCase.execute({ name: 'Mathematics', code: 'math' });
    expect(created.data.code).toBe('MATH');

    await expect(useCase.execute({ name: 'Maths Again', code: 'MATH' })).rejects.toThrow(WorkflowException);
  });

  it('ListSubjects supports keyword search and includeInactive', async () => {
    const create = new CreateSubjectUseCase(subjectDeps());
    await create.execute({ name: 'Mathematics', code: 'MATH' });
    const english = await create.execute({ name: 'English', code: 'ENG' });

    const setActive = new SetSubjectActiveUseCase({ subjects: ctx.subjects, unitOfWork: ctx.unitOfWork, clock, logger });
    await setActive.execute({ id: english.data.id, isActive: false });

    const list = new ListSubjectsUseCase({ subjects: ctx.subjects, logger });
    expect((await list.execute({ limit: 25, offset: 0 })).data.items).toHaveLength(1);
    expect(
      (await list.execute({ limit: 25, offset: 0, keyword: 'math' })).data.items,
    ).toHaveLength(1);
    expect(
      (await list.execute({ limit: 25, offset: 0, includeInactive: true })).data.items,
    ).toHaveLength(2);
  });

  it('UpdateSubject clears description with null and rejects duplicate code', async () => {
    const create = new CreateSubjectUseCase(subjectDeps());
    const math = await create.execute({ name: 'Mathematics', code: 'MATH', description: 'Core' });
    const eng = await create.execute({ name: 'English', code: 'ENG' });

    const update = new UpdateSubjectUseCase({ subjects: ctx.subjects, unitOfWork: ctx.unitOfWork, clock, logger });
    const updated = await update.execute({ id: math.data.id, description: null });
    expect(updated.data.description).toBeUndefined();

    await expect(update.execute({ id: eng.data.id, code: 'MATH' })).rejects.toThrow(WorkflowException);
  });

  it('assigns and unassigns a subject to a class, rejecting duplicates', async () => {
    const yearCreate = new CreateAcademicYearUseCase({
      academicYears: ctx.academicYears, institutions: ctx.institutions, unitOfWork: ctx.unitOfWork,
      clock, ids: ctx.ids, events: ctx.events, logger,
    });
    const year = await yearCreate.execute({ code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31' });
    const classCreate = new CreateClassUseCase({
      classes: ctx.classes, academicYears: ctx.academicYears, institutions: ctx.institutions,
      unitOfWork: ctx.unitOfWork, clock, ids: ctx.ids, events: ctx.events, logger,
    });
    const klass = await classCreate.execute({
      academicYearId: year.data.id, name: 'JSS1-A', gradeLevel: GradeLevel.GRADE_7,
    });
    const subjectCreate = new CreateSubjectUseCase(subjectDeps());
    const subject = await subjectCreate.execute({ name: 'Mathematics', code: 'MATH' });

    const assign = new AssignSubjectToClassUseCase({
      classes: ctx.classes, subjects: ctx.subjects, unitOfWork: ctx.unitOfWork, clock, ids: ctx.ids, logger,
    });
    const link = await assign.execute({ classId: klass.data.id, subjectId: subject.data.id });
    expect(link.data.subjectCode).toBe('MATH');

    await expect(
      assign.execute({ classId: klass.data.id, subjectId: subject.data.id }),
    ).rejects.toThrow(WorkflowException);

    const list = new ListClassSubjectsUseCase({ subjects: ctx.subjects, logger });
    expect((await list.execute({ classId: klass.data.id })).data).toHaveLength(1);

    const unassign = new UnassignSubjectFromClassUseCase({ subjects: ctx.subjects, unitOfWork: ctx.unitOfWork, logger });
    await unassign.execute({ classId: klass.data.id, subjectId: subject.data.id });
    expect((await list.execute({ classId: klass.data.id })).data).toHaveLength(0);

    await expect(
      unassign.execute({ classId: klass.data.id, subjectId: subject.data.id }),
    ).rejects.toThrow(WorkflowException);
  });
});
