import type { DeoDashboardResult } from '@nemis-desktop/types';
import type { ApplicationResponse } from '../core/response';
import type { GetDeoDashboardUseCase } from '../use-cases/deo/get-deo-dashboard';
import type { ResolveDistrictAlertUseCase } from '../use-cases/deo/resolve-district-alert';

export interface DeoApplicationServiceDeps {
  getDashboard: GetDeoDashboardUseCase;
  resolveAlert: ResolveDistrictAlertUseCase;
}

/** Everything the DEO (district) portal asks of the application layer. */
export class DeoApplicationService {
  constructor(private readonly deps: DeoApplicationServiceDeps) {}

  getDashboard(): Promise<ApplicationResponse<DeoDashboardResult>> {
    return this.deps.getDashboard.execute({});
  }

  resolveAlert(alertId: string): Promise<ApplicationResponse<boolean>> {
    return this.deps.resolveAlert.execute({ alertId });
  }
}
