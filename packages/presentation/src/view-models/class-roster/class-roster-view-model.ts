import type {
  AcademicsApplicationService,
  EnrollStudentDto,
  WithdrawEnrollmentDto,
} from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { EnrollStudentUiCommand } from '../../commands/academics/enroll-student-ui-command';
import { WithdrawEnrollmentUiCommand } from '../../commands/academics/withdraw-enrollment-ui-command';
import { toClassRosterView } from '../../mappers/academics/enrollment-view-mapper';
import { GetClassRosterUiQuery } from '../../queries/academics/get-class-roster-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { ClassRosterView, EnrollmentRowView } from './class-roster-views';

export interface ClassRosterState {
  readonly classId: string | null;
  readonly roster: AsyncState<ClassRosterView>;
  readonly submission: SubmissionStatus;
}

export interface ClassRosterViewModelDeps {
  readonly academics: AcademicsApplicationService;
  readonly notifications: NotificationStore;
}

export class ClassRosterViewModel {
  readonly store = createStore<ClassRosterState>(() => ({
    classId: null,
    roster: idleState(),
    submission: 'idle',
  }));

  private readonly rosterQuery: GetClassRosterUiQuery;
  private readonly enrollCommand: EnrollStudentUiCommand;
  private readonly withdrawCommand: WithdrawEnrollmentUiCommand;

  constructor(deps: ClassRosterViewModelDeps) {
    this.rosterQuery = new GetClassRosterUiQuery(deps.academics);
    const commandDeps = { academics: deps.academics, notifications: deps.notifications };
    this.enrollCommand = new EnrollStudentUiCommand(commandDeps);
    this.withdrawCommand = new WithdrawEnrollmentUiCommand(commandDeps);
  }

  async loadRoster(classId: string): Promise<void> {
    this.store.setState({ classId });
    await trackQuery({
      access: {
        get: () => this.store.getState().roster,
        set: (roster) => this.store.setState({ roster }),
      },
      fetch: () => this.rosterQuery.execute(classId),
      map: toClassRosterView,
      isEmpty: (view) => view.enrollments.length === 0,
    });
  }

  async enrollStudent(dto: EnrollStudentDto): Promise<CommandOutcome<EnrollmentRowView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.enrollCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) await this.loadRoster(dto.classId);
    return outcome;
  }

  async withdrawEnrollment(dto: WithdrawEnrollmentDto): Promise<CommandOutcome<EnrollmentRowView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.withdrawCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    const classId = this.store.getState().classId;
    if (outcome.ok && classId) await this.loadRoster(classId);
    return outcome;
  }
}
