import type {
  AssignmentsApplicationService,
  CreateAssignmentDto,
  DeleteAssignmentDto,
  GradeSubmissionDto,
  UpdateAssignmentDto,
} from '@nemis-desktop/application';
import type { AssignmentStatus } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { CreateAssignmentUiCommand } from '../../commands/assignments/create-assignment-ui-command';
import { UpdateAssignmentUiCommand } from '../../commands/assignments/update-assignment-ui-command';
import { DeleteAssignmentUiCommand } from '../../commands/assignments/delete-assignment-ui-command';
import { GradeSubmissionUiCommand } from '../../commands/assignments/grade-submission-ui-command';
import { ListAssignmentsUiQuery } from '../../queries/assignments/list-assignments-ui-query';
import { GetAssignmentUiQuery } from '../../queries/assignments/get-assignment-ui-query';
import { ListSubmissionsUiQuery } from '../../queries/assignments/list-submissions-ui-query';
import {
  toAssignmentDetailView,
  toAssignmentRowView,
  toAssignmentSubmissionRowView,
} from '../../mappers/assignments/assignment-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type {
  AssignmentDetailView,
  AssignmentRowView,
  AssignmentSubmissionRowView,
} from './assignment-views';

export interface AssignmentFilters {
  readonly classId?: string;
  readonly status?: AssignmentStatus;
}

export interface AssignmentsState {
  readonly filters: AssignmentFilters;
  readonly list: AsyncState<readonly AssignmentRowView[]>;
  readonly detail: AsyncState<AssignmentDetailView>;
  readonly submissions: AsyncState<readonly AssignmentSubmissionRowView[]>;
  /** Named to avoid colliding with "submission" the domain noun (a
   * student's assignment submission) — this is the generic
   * create/update/delete/grade command-in-flight lifecycle. */
  readonly mutationStatus: SubmissionStatus;
}

export interface AssignmentsViewModelDeps {
  readonly assignments: AssignmentsApplicationService;
  readonly notifications: NotificationStore;
}

export class AssignmentsViewModel {
  readonly store = createStore<AssignmentsState>(() => ({
    filters: {},
    list: idleState(),
    detail: idleState(),
    submissions: idleState(),
    mutationStatus: 'idle',
  }));

  private readonly listQuery: ListAssignmentsUiQuery;
  private readonly getQuery: GetAssignmentUiQuery;
  private readonly listSubmissionsQuery: ListSubmissionsUiQuery;
  private readonly createCommand: CreateAssignmentUiCommand;
  private readonly updateCommand: UpdateAssignmentUiCommand;
  private readonly deleteCommand: DeleteAssignmentUiCommand;
  private readonly gradeCommand: GradeSubmissionUiCommand;

  constructor(deps: AssignmentsViewModelDeps) {
    this.listQuery = new ListAssignmentsUiQuery(deps.assignments);
    this.getQuery = new GetAssignmentUiQuery(deps.assignments);
    this.listSubmissionsQuery = new ListSubmissionsUiQuery(deps.assignments);
    const commandDeps = { assignments: deps.assignments, notifications: deps.notifications };
    this.createCommand = new CreateAssignmentUiCommand(commandDeps);
    this.updateCommand = new UpdateAssignmentUiCommand(commandDeps);
    this.deleteCommand = new DeleteAssignmentUiCommand(commandDeps);
    this.gradeCommand = new GradeSubmissionUiCommand(commandDeps);
  }

  setFilters(filters: AssignmentFilters): void {
    this.store.setState({ filters });
  }

  async loadAssignments(teacherId: string): Promise<void> {
    const { filters } = this.store.getState();
    await trackQuery({
      access: {
        get: () => this.store.getState().list,
        set: (list) => this.store.setState({ list }),
      },
      fetch: () => this.listQuery.execute({ teacherId, ...filters }),
      map: (rows) => rows.map(toAssignmentRowView),
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async loadAssignment(id: string, teacherId: string): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().detail,
        set: (detail) => this.store.setState({ detail }),
      },
      fetch: () => this.getQuery.execute({ id, teacherId }),
      map: toAssignmentDetailView,
    });
  }

  async loadSubmissions(assignmentId: string, teacherId: string): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().submissions,
        set: (submissions) => this.store.setState({ submissions }),
      },
      fetch: () => this.listSubmissionsQuery.execute({ assignmentId, teacherId }),
      map: (rows) => rows.map(toAssignmentSubmissionRowView),
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async createAssignment(dto: CreateAssignmentDto): Promise<CommandOutcome<AssignmentDetailView>> {
    this.store.setState({ mutationStatus: 'submitting' });
    const outcome = await this.createCommand.execute(dto);
    this.store.setState({ mutationStatus: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) await this.loadAssignments(dto.teacherId);
    return outcome;
  }

  async updateAssignment(dto: UpdateAssignmentDto): Promise<CommandOutcome<AssignmentDetailView>> {
    this.store.setState({ mutationStatus: 'submitting' });
    const outcome = await this.updateCommand.execute(dto);
    this.store.setState({ mutationStatus: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.store.setState({ detail: { status: 'success', data: outcome.data } });
      await this.loadAssignments(dto.teacherId);
    } else {
      // A background sync can rewrite this assignment's id between the page
      // loading it and the teacher submitting an edit (see
      // AssignmentSyncService.pushAssignment) — reloading surfaces the same
      // 'error' detail state a fresh page load would if the id is now
      // genuinely gone, which is what drives AssignmentForm's existing
      // auto-redirect. A failure for any other reason just refreshes detail
      // back to its current server state.
      await this.loadAssignment(dto.id, dto.teacherId);
    }
    return outcome;
  }

  async deleteAssignment(dto: DeleteAssignmentDto): Promise<CommandOutcome<{ id: string }>> {
    this.store.setState({ mutationStatus: 'submitting' });
    const outcome = await this.deleteCommand.execute(dto);
    this.store.setState({ mutationStatus: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      await this.loadAssignments(dto.teacherId);
    } else {
      // Same stale-id reasoning as updateAssignment's failure branch above.
      await this.loadAssignment(dto.id, dto.teacherId);
    }
    return outcome;
  }

  async gradeSubmission(
    dto: GradeSubmissionDto,
  ): Promise<CommandOutcome<AssignmentSubmissionRowView>> {
    this.store.setState({ mutationStatus: 'submitting' });
    const outcome = await this.gradeCommand.execute(dto);
    this.store.setState({ mutationStatus: outcome.ok ? 'submitted' : 'failed' });
    // Reload either way: on success this refreshes the graded row as before;
    // on failure it surfaces a stale-id 'error' state the same way a fresh
    // load would (driving SubmissionsTable's existing auto-redirect) if the
    // assignment is genuinely gone, or just leaves the table as-is if the
    // failure was for some other reason (e.g. a permission check).
    await this.loadSubmissions(dto.assignmentId, dto.teacherId);
    return outcome;
  }
}
