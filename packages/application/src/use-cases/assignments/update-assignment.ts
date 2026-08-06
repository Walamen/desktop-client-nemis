import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { AssignmentOutput, UpdateAssignmentDto } from '../../dto/assignments/assignment-dto';
import type { IAssignmentRepository } from '../../interfaces/assignments/assignment-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { PermissionDeniedException, WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface UpdateAssignmentDeps {
  assignments: IAssignmentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class UpdateAssignmentUseCase
  implements CommandHandler<UpdateAssignmentDto, ApplicationResponse<AssignmentOutput>>
{
  constructor(private readonly deps: UpdateAssignmentDeps) {}

  execute(command: UpdateAssignmentDto): Promise<ApplicationResponse<AssignmentOutput>> {
    return invokeUseCase('UpdateAssignment', this.deps.logger, async () => {
      const assignment = this.deps.assignments.findById(command.id);
      if (!assignment) throw new WorkflowException(`Assignment ${command.id} does not exist.`);
      if (assignment.teacherId !== command.teacherId) {
        throw new PermissionDeniedException('You do not own this assignment.');
      }

      const occurredAt = this.deps.clock.now();
      assignment.update(
        {
          title: command.title,
          subjectId: command.subjectId,
          type: command.type,
          status: command.status,
          instructions: command.instructions,
          dueDate: command.dueDate,
          totalMarks: command.totalMarks,
          attachmentUrl: command.attachmentUrl,
          attachmentName: command.attachmentName,
        },
        command.teacherId,
        occurredAt,
      );
      this.deps.unitOfWork.run(() => this.deps.assignments.save(assignment));

      const detail = this.deps.assignments.getDetail(command.id);
      if (!detail) throw new WorkflowException('Assignment was not persisted.');
      return ok(detail);
    });
  }
}
