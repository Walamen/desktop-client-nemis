import type { DeoDashboardResult, DeoSchoolsResult } from '@nemis-desktop/types';
import type { ApplicationResponse } from '../core/response';
import type { GetDeoDashboardUseCase } from '../use-cases/deo/get-deo-dashboard';
import type { ResolveDistrictAlertUseCase } from '../use-cases/deo/resolve-district-alert';
import type { GetDeoSchoolsUseCase } from '../use-cases/deo/get-deo-schools';

export interface DeoApplicationServiceDeps {
  getDashboard: GetDeoDashboardUseCase;
  resolveAlert: ResolveDistrictAlertUseCase;
  listSchools: GetDeoSchoolsUseCase;
}

/** Everything the DEO (district) portal asks of the application layer. */
export class DeoApplicationService {
  constructor(private readonly deps: DeoApplicationServiceDeps) {}

  getDashboard(): Promise<ApplicationResponse<DeoDashboardResult>> {
    return this.deps.getDashboard.execute({});
  }

  listSchools(): Promise<ApplicationResponse<DeoSchoolsResult>> {
    return this.deps.listSchools.execute({});
  }

  resolveAlert(alertId: string): Promise<ApplicationResponse<boolean>> {
    return this.deps.resolveAlert.execute({ alertId });
  }
}
