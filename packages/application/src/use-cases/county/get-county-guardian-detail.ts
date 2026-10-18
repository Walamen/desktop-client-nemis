import type { CountyGuardianDetail } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyGuardiansReadModel } from '../../interfaces/county/county-guardians-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyGuardianDetailDeps {
  readModel: ICountyGuardiansReadModel;
  logger: IAppLogger;
}

/** Parent profile page data from this device; null for a guardian it does not hold. */
export class GetCountyGuardianDetailUseCase implements QueryHandler<
  { guardianId: string },
  ApplicationResponse<CountyGuardianDetail | null>
> {
  constructor(private readonly deps: GetCountyGuardianDetailDeps) {}

  execute(query: { guardianId: string }): Promise<ApplicationResponse<CountyGuardianDetail | null>> {
    return invokeUseCase('GetCountyGuardianDetail', this.deps.logger, async () =>
      ok(this.deps.readModel.getGuardian(query.guardianId)),
    );
  }
}
