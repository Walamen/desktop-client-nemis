import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { DeleteTermDto, DeletedOutput } from '../../dto/academics/academics-dto';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IAppLogger } from '../../interfaces/app-logger';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface DeleteTermDeps {
  terms: ITermRepository;
  unitOfWork: IUnitOfWork;
  logger: IAppLogger;
}

export class DeleteTermUseCase implements CommandHandler<
  DeleteTermDto,
  ApplicationResponse<DeletedOutput>
> {
  constructor(private readonly deps: DeleteTermDeps) {}

  execute(command: DeleteTermDto): Promise<ApplicationResponse<DeletedOutput>> {
    return invokeUseCase('DeleteTerm', this.deps.logger, async () => {
      const term = this.deps.terms.findById(command.id);
      if (!term) {
        throw new WorkflowException(`Term ${command.id} does not exist.`);
      }
      this.deps.unitOfWork.run(() => this.deps.terms.delete(command.id));
      return ok({ id: command.id });
    });
  }
}
