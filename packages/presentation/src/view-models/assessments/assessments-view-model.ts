import type {
  AssessmentsApplicationService,
  CreateAssessmentDto,
  PublishGradeDto,
  RecordGradeDto,
} from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { CreateAssessmentUiCommand } from '../../commands/assessments/create-assessment-ui-command';
import { PublishGradeUiCommand } from '../../commands/assessments/publish-grade-ui-command';
import { RecordGradeUiCommand } from '../../commands/assessments/record-grade-ui-command';
import { toGradeRowView } from '../../mappers/assessments/assessment-view-mapper';
import { GetGradesByStudentUiQuery } from '../../queries/assessments/get-grades-by-student-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { AssessmentView, GradeRowView } from './assessments-views';

export interface AssessmentsState {
  readonly studentId: string | null;
  readonly grades: AsyncState<readonly GradeRowView[]>;
  readonly lastAssessment: AsyncState<AssessmentView>;
  readonly submission: SubmissionStatus;
}

export interface AssessmentsViewModelDeps {
  readonly assessments: AssessmentsApplicationService;
  readonly notifications: NotificationStore;
}

export class AssessmentsViewModel {
  readonly store = createStore<AssessmentsState>(() => ({
    studentId: null,
    grades: idleState(),
    lastAssessment: idleState(),
    submission: 'idle',
  }));

  private readonly gradesQuery: GetGradesByStudentUiQuery;
  private readonly createAssessmentCommand: CreateAssessmentUiCommand;
  private readonly recordGradeCommand: RecordGradeUiCommand;
  private readonly publishGradeCommand: PublishGradeUiCommand;

  constructor(deps: AssessmentsViewModelDeps) {
    this.gradesQuery = new GetGradesByStudentUiQuery(deps.assessments);
    const commandDeps = { assessments: deps.assessments, notifications: deps.notifications };
    this.createAssessmentCommand = new CreateAssessmentUiCommand(commandDeps);
    this.recordGradeCommand = new RecordGradeUiCommand(commandDeps);
    this.publishGradeCommand = new PublishGradeUiCommand(commandDeps);
  }

  async loadGrades(studentId: string): Promise<void> {
    this.store.setState({ studentId });
    await trackQuery({
      access: {
        get: () => this.store.getState().grades,
        set: (grades) => this.store.setState({ grades }),
      },
      fetch: () => this.gradesQuery.execute(studentId),
      map: (rows) => rows.map(toGradeRowView),
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async createAssessment(dto: CreateAssessmentDto): Promise<CommandOutcome<AssessmentView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.createAssessmentCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.store.setState({ lastAssessment: { status: 'success', data: outcome.data } });
    }
    return outcome;
  }

  async recordGrade(dto: RecordGradeDto): Promise<CommandOutcome<GradeRowView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.recordGradeCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) await this.loadGrades(dto.studentId);
    return outcome;
  }

  async publishGrade(dto: PublishGradeDto): Promise<CommandOutcome<GradeRowView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.publishGradeCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    const studentId = this.store.getState().studentId;
    if (outcome.ok && studentId) await this.loadGrades(studentId);
    return outcome;
  }
}
