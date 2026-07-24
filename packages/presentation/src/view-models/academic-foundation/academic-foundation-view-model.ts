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

/** Presentation facade for the complete Academic Foundation module. It keeps
 * all renderer data flowing through the ApplicationLayer and owns list reloads
 * after commands rather than exposing repositories to React. */
export class AcademicFoundationViewModel {
  readonly store = createStore<AcademicFoundationState>(() => ({
    academicYears: idleState(), terms: idleState(), currentTerm: idleState(),
    classes: idleState(), subjects: idleState(), classSubjects: idleState(), gradeLevels: idleState(),
    classPagination: createPagination(), subjectPagination: createPagination(),
    classFilters: {}, subjectFilters: {},
  }));

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

  private async command<T>(run: () => Promise<ApplicationResponse<T>>, successMessage: string, reload: () => Promise<void>): Promise<CommandOutcome<T>> {
    const outcome = await executeCommand<T, T>({ run, map: identity, notifications: this.deps.notifications, successMessage });
    if (outcome.ok) await reload();
    return outcome;
  }
}
