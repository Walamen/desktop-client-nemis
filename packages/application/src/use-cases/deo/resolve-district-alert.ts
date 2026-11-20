import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IDistrictAlertStore } from '../../interfaces/deo/district-alert-store';
import type { IDistrictOverviewReadModel } from '../../interfaces/deo/district-overview-read-model';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { resolveOfficer } from './deo-officer';

export interface ResolveDistrictAlertDeps {
  store: IDistrictAlertStore;
  /** Source of the officer's name. */
  readModel: IDistrictOverviewReadModel;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  currentUserId: string;
  clock: IClock;
  logger: IAppLogger;
}

/** "Mark Reviewed" on the DEO dashboard. Offline: the change is written to
 * this device and the alerts outbox trigger queues it for the next sync. */
export class ResolveDistrictAlertUseCase implements CommandHandler<
  { alertId: string },
  ApplicationResponse<boolean>
> {
  constructor(private readonly deps: ResolveDistrictAlertDeps) {}

  execute(command: { alertId: string }): Promise<ApplicationResponse<boolean>> {
    return invokeUseCase('ResolveDistrictAlert', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) return ok(false);
      const by = resolveOfficer(this.deps.readModel, this.deps.currentUserId);
      return ok(this.deps.store.resolve(districtId, command.alertId, by, this.deps.clock.now()));
    });
  }
}
