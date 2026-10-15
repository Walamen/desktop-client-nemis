import type {
  AcademicYearListItemOutput,
  AcademicsApplicationService,
  ApplicationResponse,
  ClassOutput,
  ClassSubjectOutput,
  CreateAcademicYearDto,
  CreateClassDto,
  CreateSubjectDto,
  CreateTermDto,
  GradeLevelCountOutput,
  ListClassesDto,
  ListSubjectsDto,
  SubjectOutput,
  TermOutput,
  UpdateAcademicYearDto,
  UpdateClassDto,
  UpdateSubjectDto,
  UpdateTermDto,
} from '@nemis-desktop/application';
import type { AcademicYearStatus } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { executeCommand, trackQuery, type CommandOutcome } from '../../core/async-runner';
import { idleState, type AsyncState } from '../../core/async-state';
import { OperationFailedError, toPresentationError } from '../../errors';
import { createPagination, toPageRequest, withPage, withTotal, type PaginationState } from '../../pagination/pagination';
import type { NotificationStore } from '../../stores/notification-store';

export type AcademicYearRowView = AcademicYearListItemOutput;
export type TermRowView = TermOutput;
export type ClassRowView = ClassOutput;
export type SubjectRowView = SubjectOutput;
export type ClassSubjectRowView = ClassSubjectOutput;
export type GradeLevelCountView = GradeLevelCountOutput;

export interface AcademicFoundationState {
  readonly academicYears: AsyncState<readonly AcademicYearRowView[]>;
  readonly terms: AsyncState<readonly TermRowView[]>;
  readonly currentTerm: AsyncState<TermRowView>;
  readonly classes: AsyncState<readonly ClassRowView[]>;
  /** Every class of one academic year (all pages) — see loadYearClasses. */
  readonly yearClasses: AsyncState<readonly ClassRowView[]>;
  /** The academic year the latest loadYearClasses call was for ('' before any). */
  readonly yearClassesYearId: string;
  readonly subjects: AsyncState<readonly SubjectRowView[]>;
  readonly classSubjects: AsyncState<readonly ClassSubjectRowView[]>;
  readonly gradeLevels: AsyncState<readonly GradeLevelCountView[]>;
  readonly classPagination: PaginationState;
  readonly subjectPagination: PaginationState;
  readonly classFilters: Omit<ListClassesDto, 'limit' | 'offset'>;
  readonly subjectFilters: Omit<ListSubjectsDto, 'limit' | 'offset'>;
}

export interface AcademicFoundationViewModelDeps {
  readonly academics: AcademicsApplicationService;
  readonly notifications: NotificationStore;
}

const identity = <T>(value: T): T => value;

/** ListSubjectsUseCase clamps `limit` to 100 and the IPC validator rejects more. */
const SUBJECT_PAGE_MAX = 100;
/** ListClassesUseCase clamps `limit` to 100 and the IPC validator rejects more. */
const CLASS_PAGE_MAX = 100;

/** Same normalization CreateSubjectUseCase applies before its duplicate check. */
const normalizeSubjectCode = (code: string): string => code.trim().toUpperCase();

const subjectCount = (n: number): string => `${n} subject${n === 1 ? '' : 's'}`;

/** Presentation facade for the complete Academic Foundation module. It keeps
 * all renderer data flowing through the ApplicationLayer and owns list reloads
 * after commands rather than exposing repositories to React. */
export class AcademicFoundationViewModel {
  readonly store = createStore<AcademicFoundationState>(() => ({
    academicYears: idleState(), terms: idleState(), currentTerm: idleState(),
    classes: idleState(), yearClasses: idleState(), yearClassesYearId: '', subjects: idleState(), classSubjects: idleState(), gradeLevels: idleState(),
    classPagination: createPagination(), subjectPagination: createPagination(),
    classFilters: {}, subjectFilters: {},
  }));

  /** Sequence of loadYearClasses calls: only the latest may write its result. */
  private yearClassesSeq = 0;

  constructor(private readonly deps: AcademicFoundationViewModelDeps) {}

  async loadAcademicYears(): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().academicYears, set: (academicYears) => this.store.setState({ academicYears }) },
      fetch: () => this.deps.academics.listAcademicYears(), map: (rows) => rows,
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async loadTerms(academicYearId: string): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().terms, set: (terms) => this.store.setState({ terms }) },
      fetch: () => this.deps.academics.listTerms({ academicYearId }), map: identity,
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async loadCurrentTerm(): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().currentTerm, set: (currentTerm) => this.store.setState({ currentTerm }) },
      fetch: () => this.deps.academics.getCurrentTerm(), map: identity,
    });
  }

  async loadClasses(): Promise<void> {
    const state = this.store.getState();
    const page = toPageRequest(state.classPagination);
    await trackQuery({
      access: { get: () => this.store.getState().classes, set: (classes) => this.store.setState({ classes }) },
      fetch: () => this.deps.academics.listClasses({ ...state.classFilters, ...page }),
      onData: (result) => this.store.setState((s) => ({ classPagination: withTotal(s.classPagination, result.total) })),
      map: (result) => result.items,
      isEmpty: (rows) => rows.length === 0,
    });
  }

  /** Every class of one academic year, all pages, for pickers that must offer
   * every class (bulk import) — unlike `classes`, which is one 25-row page.
   * Leaves `classes`, its filters and its pagination untouched. Always
   * restarts from `loading` (another year's rows are never shown as
   * `refreshing`), tags the slice with its year, and ignores a response that a
   * newer call has superseded. */
  async loadYearClasses(academicYearId: string): Promise<void> {
    const seq = ++this.yearClassesSeq;
    this.store.setState({ yearClasses: { status: 'loading' }, yearClassesYearId: academicYearId });
    await trackQuery({
      access: {
        get: () => this.store.getState().yearClasses,
        set: (yearClasses) => { if (seq === this.yearClassesSeq) this.store.setState({ yearClasses }); },
      },
      fetch: async () => {
        const items: ClassRowView[] = [];
        let offset = 0;
        for (;;) {
          const { data } = await this.deps.academics.listClasses({ academicYearId, limit: CLASS_PAGE_MAX, offset });
          items.push(...data.items);
          offset += data.items.length;
          if (data.items.length === 0 || offset >= data.total) return { data: items };
        }
      },
      map: identity,
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async loadSubjects(): Promise<void> {
    const state = this.store.getState();
    const page = toPageRequest(state.subjectPagination);
    await trackQuery({
      access: { get: () => this.store.getState().subjects, set: (subjects) => this.store.setState({ subjects }) },
      fetch: () => this.deps.academics.listSubjects({ ...state.subjectFilters, ...page }),
      onData: (result) => this.store.setState((s) => ({ subjectPagination: withTotal(s.subjectPagination, result.total) })),
      map: (result) => result.items,
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async loadClassSubjects(classId: string): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().classSubjects, set: (classSubjects) => this.store.setState({ classSubjects }) },
      fetch: () => this.deps.academics.listClassSubjects({ classId }), map: identity,
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async loadGradeLevels(): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().gradeLevels, set: (gradeLevels) => this.store.setState({ gradeLevels }) },
      fetch: () => this.deps.academics.getGradeLevelCounts(), map: identity,
    });
  }

  setClassFilters(filters: Omit<ListClassesDto, 'limit' | 'offset'>): void {
    this.store.setState((s) => ({ classFilters: filters, classPagination: { ...s.classPagination, page: 1 } }));
  }
  setSubjectFilters(filters: Omit<ListSubjectsDto, 'limit' | 'offset'>): void {
    this.store.setState((s) => ({ subjectFilters: filters, subjectPagination: { ...s.subjectPagination, page: 1 } }));
  }
  async goToClassPage(page: number): Promise<void> {
    this.store.setState((s) => ({ classPagination: withPage(s.classPagination, page) })); await this.loadClasses();
  }
  async goToSubjectPage(page: number): Promise<void> {
    this.store.setState((s) => ({ subjectPagination: withPage(s.subjectPagination, page) })); await this.loadSubjects();
  }

  async createAcademicYear(dto: CreateAcademicYearDto): Promise<CommandOutcome<AcademicYearListItemOutput>> {
    return this.command(() => this.deps.academics.createAcademicYear(dto), 'Academic year created.', () => this.loadAcademicYears());
  }
  async updateAcademicYear(dto: UpdateAcademicYearDto): Promise<CommandOutcome<AcademicYearListItemOutput>> {
    return this.command(() => this.deps.academics.updateAcademicYear(dto), 'Academic year updated.', () => this.loadAcademicYears());
  }
  async setCurrentAcademicYear(id: string): Promise<CommandOutcome<AcademicYearListItemOutput>> {
    return this.command(() => this.deps.academics.setCurrentAcademicYear({ id }), 'Current academic year updated.', () => this.loadAcademicYears());
  }
  async setAcademicYearStatus(id: string, status: AcademicYearStatus): Promise<CommandOutcome<AcademicYearListItemOutput>> {
    return this.command(() => this.deps.academics.setAcademicYearStatus({ id, status }), 'Academic year status updated.', () => this.loadAcademicYears());
  }
  async createTerm(dto: CreateTermDto): Promise<CommandOutcome<TermOutput>> {
    return this.command(() => this.deps.academics.createTerm(dto), 'Term created.', () => this.loadTerms(dto.academicYearId));
  }
  async updateTerm(dto: UpdateTermDto, academicYearId: string): Promise<CommandOutcome<TermOutput>> {
    return this.command(() => this.deps.academics.updateTerm(dto), 'Term updated.', () => this.loadTerms(academicYearId));
  }
  async setCurrentTerm(id: string, academicYearId: string): Promise<CommandOutcome<TermOutput>> {
    return this.command(() => this.deps.academics.setCurrentTerm({ id }), 'Current term updated.', async () => { await this.loadTerms(academicYearId); await this.loadCurrentTerm(); });
  }
  async deleteTerm(id: string, academicYearId: string): Promise<CommandOutcome<{ id: string }>> {
    return this.command(() => this.deps.academics.deleteTerm({ id }), 'Term deleted.', () => this.loadTerms(academicYearId));
  }
  async createClass(dto: CreateClassDto): Promise<CommandOutcome<ClassOutput>> {
    return this.command(() => this.deps.academics.createClass(dto), 'Class created.', () => this.loadClasses());
  }
  async updateClass(dto: UpdateClassDto): Promise<CommandOutcome<ClassOutput>> {
    return this.command(() => this.deps.academics.updateClass(dto), 'Class updated.', () => this.loadClasses());
  }
  async setClassActive(id: string, isActive: boolean): Promise<CommandOutcome<ClassOutput>> {
    return this.command(() => this.deps.academics.setClassActive({ id, isActive }), isActive ? 'Class restored.' : 'Class deactivated.', () => this.loadClasses());
  }
  async createSubject(dto: CreateSubjectDto): Promise<CommandOutcome<SubjectOutput>> {
    return this.command(() => this.deps.academics.createSubject(dto), 'Subject created.', () => this.loadSubjects());
  }
  /** Creates several subjects, one at a time and in order, for the
   * multi-row New Subject drawer. Codes that already exist on the device
   * (deactivated included) are rejected up front with a clear message —
   * the use case's own "already exists" text does not survive IPC. One
   * summary toast and at most one list reload for the whole batch.
   * Returns one outcome per dto, same order. Never throws. */
  async createSubjects(dtos: readonly CreateSubjectDto[]): Promise<readonly CommandOutcome<SubjectOutput>[]> {
    if (dtos.length === 0) return [];
    const existing = (await this.existingSubjectCodes()) ?? new Map<string, boolean>();
    const outcomes: CommandOutcome<SubjectOutput>[] = [];
    for (const dto of dtos) {
      const code = normalizeSubjectCode(dto.code);
      const existingIsActive = existing.get(code);
      if (existingIsActive !== undefined) {
        outcomes.push({
          ok: false,
          error: new OperationFailedError(
            existingIsActive
              ? `A subject with code "${code}" already exists.`
              : `A deactivated subject with code "${code}" already exists. Tick "Include deactivated subjects" to find and restore it.`,
          ),
        });
        continue;
      }
      try {
        const res = await this.deps.academics.createSubject(dto);
        for (const warning of res.warnings ?? []) this.deps.notifications.warning(warning);
        existing.set(code, true);
        outcomes.push({ ok: true, data: res.data });
      } catch (err) {
        outcomes.push({ ok: false, error: toPresentationError(err, 'command') });
      }
    }
    const created = outcomes.filter((o) => o.ok).length;
    const failed = outcomes.length - created;
    if (failed === 0) this.deps.notifications.success(created === 1 ? 'Subject created.' : `${created} subjects created.`);
    else if (created === 0) this.deps.notifications.error('No subjects were created — see the errors in the drawer.');
    else this.deps.notifications.warning(`${subjectCount(created)} created, ${failed} failed — see the drawer.`);
    if (created > 0) await this.loadSubjects();
    return outcomes;
  }
  async updateSubject(dto: UpdateSubjectDto): Promise<CommandOutcome<SubjectOutput>> {
    return this.command(() => this.deps.academics.updateSubject(dto), 'Subject updated.', () => this.loadSubjects());
  }
  async setSubjectActive(id: string, isActive: boolean): Promise<CommandOutcome<SubjectOutput>> {
    return this.command(() => this.deps.academics.setSubjectActive({ id, isActive }), isActive ? 'Subject restored.' : 'Subject deactivated.', () => this.loadSubjects());
  }
  async assignSubject(classId: string, subjectId: string): Promise<CommandOutcome<ClassSubjectOutput>> {
    return this.command(() => this.deps.academics.assignSubjectToClass({ classId, subjectId }), 'Subject assigned to class.', async () => { await this.loadClassSubjects(classId); await this.loadClasses(); });
  }
  async unassignSubject(classId: string, subjectId: string): Promise<CommandOutcome<{ id: string }>> {
    return this.command(() => this.deps.academics.unassignSubjectFromClass({ classId, subjectId }), 'Subject removed from class.', async () => { await this.loadClassSubjects(classId); await this.loadClasses(); });
  }

  /** code → isActive for every subject on the device, ignoring the on-screen
   * filters; null when the list cannot be read (the batch then relies on the
   * use case's own duplicate check). */
  private async existingSubjectCodes(): Promise<Map<string, boolean> | null> {
    try {
      const codes = new Map<string, boolean>();
      let offset = 0;
      for (;;) {
        const { data } = await this.deps.academics.listSubjects({ limit: SUBJECT_PAGE_MAX, offset, includeInactive: true, sort: 'code' });
        for (const subject of data.items) codes.set(normalizeSubjectCode(subject.code), subject.isActive);
        offset += data.items.length;
        if (data.items.length === 0 || offset >= data.total) return codes;
      }
    } catch {
      return null;
    }
  }

  private async command<T>(run: () => Promise<ApplicationResponse<T>>, successMessage: string, reload: () => Promise<void>): Promise<CommandOutcome<T>> {
    const outcome = await executeCommand<T, T>({ run, map: identity, notifications: this.deps.notifications, successMessage });
    if (outcome.ok) await reload();
    return outcome;
  }
}
