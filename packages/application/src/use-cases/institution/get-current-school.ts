import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { InstitutionProfileOutput } from '../../dto/institution/institution-dto';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toInstitutionProfileOutput } from '../../mappers/institution/institution-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCurrentSchoolDeps {
  institutions: IInstitutionRepository;
  logger: IAppLogger;
}

export class GetCurrentSchoolUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<InstitutionProfileOutput | null>
> {
  constructor(private readonly deps: GetCurrentSchoolDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return invokeUseCase('GetCurrentSchool', this.deps.logger, async () => {
      const institution = this.deps.institutions.findFirst();
      return ok(institution ? toInstitutionProfileOutput(institution) : null);
    });
  }
}
