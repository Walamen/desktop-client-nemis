import { AssignmentStatus } from '@nemis-desktop/types';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { DeleteAssignmentDto } from '../../dto/assignments/assignment-dto';
import type { IAssignmentRepository } from '../../interfaces/assignments/assignment-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IAppLogger } from '../../interfaces/app-logger';
import { PermissionDeniedException, WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface DeleteAssignmentDeps {
  assignments: IAssignmentRepository;
  unitOfWork: IUnitOfWork;
  logger: IAppLogger;
}

export class DeleteAssignmentUseCase
  implements CommandHandler<DeleteAssignmentDto, ApplicationResponse<{ id: string }>>
{
  constructor(private readonly deps: DeleteAssignmentDeps) {}

  execute(command: DeleteAssignmentDto): Promise<ApplicationResponse<{ id: string }>> {
    return invokeUseCase('DeleteAssignment', this.deps.logger, async () => {
      const assignment = this.deps.assignments.findById(command.id);
      if (!assignment) throw new WorkflowException(`Assignment ${command.id} does not exist.`);
      if (assignment.teacherId !== command.teacherId) {
        throw new PermissionDeniedException('You do not own this assignment.');
      }
      // Mirrors the web backend: once students may have seen it (ACTIVE) or
      // it's been closed, deleting would silently pull it out from under them.
      if (assignment.status !== AssignmentStatus.DRAFT) {
        throw new WorkflowException('Only DRAFT assignments can be deleted.');
      }

      this.deps.unitOfWork.run(() => this.deps.assignments.delete(command.id));
      return ok({ id: command.id });
    });
  }
}
