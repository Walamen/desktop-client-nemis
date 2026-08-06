import { Assignment } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { AssignmentOutput, CreateAssignmentDto } from '../../dto/assignments/assignment-dto';
import type { IAssignmentRepository } from '../../interfaces/assignments/assignment-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { AssignmentCreated } from '../../events/assignments';

export interface CreateAssignmentDeps {
  assignments: IAssignmentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class CreateAssignmentUseCase
  implements CommandHandler<CreateAssignmentDto, ApplicationResponse<AssignmentOutput>>
{
  constructor(private readonly deps: CreateAssignmentDeps) {}

  execute(command: CreateAssignmentDto): Promise<ApplicationResponse<AssignmentOutput>> {
    return invokeUseCase('CreateAssignment', this.deps.logger, async () => {
      requireFields(command, ['classId', 'teacherId', 'title', 'type', 'status', 'dueDate']);

      const occurredAt = this.deps.clock.now();
      const id = this.deps.ids.next();
      const assignment = Assignment.create({
        id,
        classId: command.classId,
        subjectId: command.subjectId,
        teacherId: command.teacherId,
        title: command.title,
        type: command.type,
        status: command.status,
        instructions: command.instructions,
        dueDate: command.dueDate,
        totalMarks: command.totalMarks,
        attachmentUrl: command.attachmentUrl,
        attachmentName: command.attachmentName,
        occurredAt,
      });
      this.deps.unitOfWork.run(() => this.deps.assignments.save(assignment));

      const event: AssignmentCreated = {
        name: 'AssignmentCreated',
        occurredAt,
        assignmentId: id,
        classId: command.classId,
        teacherId: command.teacherId,
      };
      this.deps.events.publish(event);

      const detail = this.deps.assignments.getDetail(id);
      if (!detail) throw new WorkflowException('Assignment was not persisted.');
      return ok(detail);
    });
  }
}
