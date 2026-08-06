import { AssignmentSubmission } from '@nemis-desktop/domain';
import { SubmissionStatus } from '@nemis-desktop/types';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  AssignmentSubmissionOutput,
  GradeSubmissionDto,
} from '../../dto/assignments/assignment-dto';
import type { IAssignmentRepository } from '../../interfaces/assignments/assignment-repository';
import type { IAssignmentSubmissionRepository } from '../../interfaces/assignments/assignment-submission-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { PermissionDeniedException, WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { SubmissionGraded } from '../../events/assignments';

export interface GradeSubmissionDeps {
  assignments: IAssignmentRepository;
  submissions: IAssignmentSubmissionRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class GradeSubmissionUseCase
  implements CommandHandler<GradeSubmissionDto, ApplicationResponse<AssignmentSubmissionOutput>>
{
  constructor(private readonly deps: GradeSubmissionDeps) {}

  execute(command: GradeSubmissionDto): Promise<ApplicationResponse<AssignmentSubmissionOutput>> {
    return invokeUseCase('GradeSubmission', this.deps.logger, async () => {
      if (command.grade < 0) throw new WorkflowException('Grade must be zero or greater.');

      const assignment = this.deps.assignments.findById(command.assignmentId);
      if (!assignment) throw new WorkflowException(`Assignment ${command.assignmentId} does not exist.`);
      if (assignment.teacherId !== command.teacherId) {
        throw new PermissionDeniedException('You do not own this assignment.');
      }

      const occurredAt = this.deps.clock.now();
      const existing = this.deps.submissions.findByAssignmentAndStudent(
        command.assignmentId,
        command.studentId,
      );
      // A student who never submitted (a synthesized PENDING row) has no
      // backing submission row yet — grading one creates it, mirroring the
      // web backend's upsert.
      const submission =
        existing ??
        AssignmentSubmission.of({
          id: this.deps.ids.next(),
          assignmentId: command.assignmentId,
          studentId: command.studentId,
          status: SubmissionStatus.PENDING,
          occurredAt,
        });
      submission.recordGrade(command.grade, command.feedback, command.teacherId, occurredAt);
      this.deps.unitOfWork.run(() => this.deps.submissions.saveGrade(submission));

      const event: SubmissionGraded = {
        name: 'SubmissionGraded',
        occurredAt,
        assignmentId: command.assignmentId,
        studentId: command.studentId,
      };
      this.deps.events.publish(event);

      const row = this.deps.submissions
        .listByAssignment(command.assignmentId)
        .find((r) => r.studentId === command.studentId);
      if (!row) throw new WorkflowException('Submission was not persisted.');
      return ok(row);
    });
  }
}
