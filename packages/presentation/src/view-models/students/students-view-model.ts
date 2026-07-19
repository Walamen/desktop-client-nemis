import type {
  CreateStudentDto,
  DeactivateStudentDto,
  LinkGuardianDto,
  StudentApplicationService,
} from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { hasData, idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { CreateStudentUiCommand } from '../../commands/students/create-student-ui-command';
import { DeactivateStudentUiCommand } from '../../commands/students/deactivate-student-ui-command';
import { LinkGuardianUiCommand } from '../../commands/students/link-guardian-ui-command';
import { toStudentDetailsView, toStudentRowView } from '../../mappers/students/student-view-mapper';
import {
  createPagination,
  toPageRequest,
  withPage,
  withPageSize,
  withTotal,
  type PaginationState,
} from '../../pagination/pagination';
import { GetStudentByIdUiQuery } from '../../queries/students/get-student-by-id-ui-query';
import { ListStudentsUiQuery } from '../../queries/students/list-students-ui-query';
import { createSearch, withKeyword, type SearchState } from '../../search/search-state';
import type { NotificationStore } from '../../stores/notification-store';
import type { SessionStore } from '../../stores/session-store';
import type { StudentDetailsView, StudentRowView } from './students-views';

export interface StudentsState {
  readonly list: AsyncState<readonly StudentRowView[]>;
  readonly details: AsyncState<StudentDetailsView>;
  readonly pagination: PaginationState;
  readonly search: SearchState;
  readonly submission: SubmissionStatus;
}

export interface StudentsViewModelDeps {
  readonly students: StudentApplicationService;
  readonly notifications: NotificationStore;
  readonly session: SessionStore;
}

export class StudentsViewModel {
  readonly store = createStore<StudentsState>(() => ({
    list: idleState(),
    details: idleState(),
    pagination: createPagination(),
    search: createSearch(),
    submission: 'idle',
  }));

  private readonly listQuery: ListStudentsUiQuery;
  private readonly detailsQuery: GetStudentByIdUiQuery;
  private readonly createCommand: CreateStudentUiCommand;
  private readonly deactivateCommand: DeactivateStudentUiCommand;
  private readonly linkGuardianCommand: LinkGuardianUiCommand;

  constructor(private readonly deps: StudentsViewModelDeps) {
    const commandDeps = { students: deps.students, notifications: deps.notifications };
    this.listQuery = new ListStudentsUiQuery(deps.students);
    this.detailsQuery = new GetStudentByIdUiQuery(deps.students);
    this.createCommand = new CreateStudentUiCommand(commandDeps);
    this.deactivateCommand = new DeactivateStudentUiCommand(commandDeps);
    this.linkGuardianCommand = new LinkGuardianUiCommand(commandDeps);
  }

  async loadStudents(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().list,
        set: (list) => this.store.setState({ list }),
      },
      fetch: () => this.listQuery.execute(toPageRequest(this.store.getState().pagination)),
      onData: (page) =>
        this.store.setState((s) => ({ pagination: withTotal(s.pagination, page.total) })),
      map: (page) => page.items.map(toStudentRowView),
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async goToPage(page: number): Promise<void> {
    this.store.setState((s) => ({ pagination: withPage(s.pagination, page) }));
    await this.loadStudents();
  }

  async setPageSize(pageSize: number): Promise<void> {
    this.store.setState((s) => ({ pagination: withPageSize(s.pagination, pageSize) }));
    await this.loadStudents();
  }

  setKeyword(keyword: string): void {
    this.store.setState((s) => ({ search: withKeyword(s.search, keyword) }));
  }

  async selectStudent(studentId: string | null): Promise<void> {
    this.deps.session.selectStudent(studentId);
    if (studentId === null) {
      this.store.setState({ details: idleState() });
      return;
    }
    await this.loadDetails(studentId);
  }

  async loadDetails(studentId: string): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().details,
        set: (details) => this.store.setState({ details }),
      },
      fetch: () => this.detailsQuery.execute(studentId),
      map: toStudentDetailsView,
    });
  }

  async createStudent(dto: CreateStudentDto): Promise<CommandOutcome<StudentDetailsView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.createCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) await this.loadStudents();
    return outcome;
  }

  async deactivateStudent(dto: DeactivateStudentDto): Promise<CommandOutcome<StudentDetailsView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.deactivateCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.updateDetailsIfCurrent(outcome.data);
      await this.loadStudents();
    }
    return outcome;
  }

  async linkGuardian(dto: LinkGuardianDto): Promise<CommandOutcome<StudentDetailsView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.linkGuardianCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.updateDetailsIfCurrent(outcome.data);
    }
    return outcome;
  }

  /** Refresh the open details panel only when it is showing the mutated
   * student — never clobber a different student's open details. */
  private updateDetailsIfCurrent(view: StudentDetailsView): void {
    const details = this.store.getState().details;
    if (hasData(details) && details.data.id === view.id) {
      this.store.setState({ details: { status: 'success', data: view } });
    }
  }
}
