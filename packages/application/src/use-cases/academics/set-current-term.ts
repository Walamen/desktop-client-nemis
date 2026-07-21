import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { SetCurrentTermDto, TermOutput } from '../../dto/academics/academics-dto';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toTermOutput } from '../../mappers/academics/term-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface SetCurrentTermDeps {
  terms: ITermRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class SetCurrentTermUseCase implements CommandHandler<
  SetCurrentTermDto,
  ApplicationResponse<TermOutput>
> {
  constructor(private readonly deps: SetCurrentTermDeps) {}

  execute(command: SetCurrentTermDto): Promise<ApplicationResponse<TermOutput>> {
    return invokeUseCase('SetCurrentTerm', this.deps.logger, async () => {
      const term = this.deps.terms.findById(command.id);
      if (!term) {
        throw new WorkflowException(`Term ${command.id} does not exist.`);
      }

      const at = this.deps.clock.now();
      this.deps.unitOfWork.run(() => {
        for (const other of this.deps.terms.findCurrentOthers(term.academicYearId, term.id)) {
          other.clearCurrent(command.actorId, at);
          this.deps.terms.save(other);
        }
        term.makeCurrent(command.actorId, at);
        this.deps.terms.save(term);
      });

      return ok(toTermOutput(term));
    });
  }
}
