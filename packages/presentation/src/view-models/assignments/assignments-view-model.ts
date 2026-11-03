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
  /** The assignment `detail` / `submissions` belong to (null before any); consumers render them only for that assignment. */
  readonly detailFor: string | null;
  readonly submissionsFor: string | null;
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
    detailFor: null,
    submissionsFor: null,
    mutationStatus: 'idle',
  }));

  private detailSeq = 0;
  private submissionsSeq = 0;

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
    const seq = ++this.detailSeq;
    // Another assignment's detail is dropped at once; a late response from an
    // earlier call (seq no longer latest) is ignored.
    if (this.store.getState().detailFor !== id) {
      this.store.setState({ detail: idleState(), detailFor: id });
    }
    await trackQuery({
      access: {
        get: () => this.store.getState().detail,
        set: (detail) => { if (seq === this.detailSeq) this.store.setState({ detail }); },
      },
      fetch: () => this.getQuery.execute({ id, teacherId }),
      map: toAssignmentDetailView,
    });
  }

  async loadSubmissions(assignmentId: string, teacherId: string): Promise<void> {
    const seq = ++this.submissionsSeq;
    if (this.store.getState().submissionsFor !== assignmentId) {
      this.store.setState({ submissions: idleState(), submissionsFor: assignmentId });
    }
    await trackQuery({
      access: {
        get: () => this.store.getState().submissions,
        set: (submissions) => { if (seq === this.submissionsSeq) this.store.setState({ submissions }); },
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
      // Not when another assignment now holds the detail slot.
      if (this.slotIsFor(this.store.getState().detailFor, dto.id)) {
        this.store.setState({ detail: { status: 'success', data: outcome.data }, detailFor: dto.id });
      }
      await this.loadAssignments(dto.teacherId);
    } else {
      // A background sync can rewrite this assignment's id between the page
      // loading it and the teacher submitting an edit (see
      // AssignmentSyncService.pushAssignment) — reloading surfaces the same
      // 'error' detail state a fresh page load would if the id is now
      // genuinely gone, which is what drives AssignmentForm's existing
      // auto-redirect. A failure for any other reason just refreshes detail
      // back to its current server state. Only while it is still the one
      // shown: see reloadDetailIfShown.
      await this.reloadDetailIfShown(dto.id, dto.teacherId);
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
      await this.reloadDetailIfShown(dto.id, dto.teacherId);
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
    // failure was for some other reason (e.g. a permission check). Only
    // while that assignment's rows are still the ones shown.
    if (this.slotIsFor(this.store.getState().submissionsFor, dto.assignmentId)) {
      await this.loadSubmissions(dto.assignmentId, dto.teacherId);
    }
    return outcome;
  }

  /** A mutation's refresh: skipped once another assignment holds the detail
   * slot. Reloading then would claim the slot back and drop that assignment's
   * own response, leaving its page on loading. */
  private async reloadDetailIfShown(id: string, teacherId: string): Promise<void> {
    if (this.slotIsFor(this.store.getState().detailFor, id)) await this.loadAssignment(id, teacherId);
  }

  /** True while a per-assignment slot is empty or still belongs to `id`. */
  private slotIsFor(held: string | null, id: string): boolean {
    return held === null || held === id;
  }
}
