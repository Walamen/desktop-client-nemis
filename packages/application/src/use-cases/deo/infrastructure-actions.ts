import type { DeoInfrastructureActionRequest, DeoInfrastructureEscalateRequest } from '@nemis-desktop/types';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IDistrictAlertStore } from '../../interfaces/deo/district-alert-store';
import type { IDistrictOverviewReadModel } from '../../interfaces/deo/district-overview-read-model';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { resolveOfficer } from './deo-officer';

export interface InfrastructureActionDeps {
  store: IDistrictAlertStore;
  /** Source of the officer's name. */
  readModel: IDistrictOverviewReadModel;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  currentUserId: string;
  clock: IClock;
  logger: IAppLogger;
}

/** Local write, queued for sync by the alerts outbox trigger. Inputs are
 * normalised as the server does: comments trimmed, blank becomes null. */
abstract class InfrastructureActionUseCase<Req extends { issueId: string }> implements CommandHandler<
  Req,
  ApplicationResponse<boolean>
> {
  constructor(
    private readonly name: string,
    protected readonly deps: InfrastructureActionDeps,
  ) {}

  /** The store call, or false when the request is refused before it. */
  protected abstract act(districtId: string, req: Req, by: ReturnType<typeof resolveOfficer>, at: string): boolean;

  execute(command: Req): Promise<ApplicationResponse<boolean>> {
    return invokeUseCase(this.name, this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) return ok(false);
      const by = resolveOfficer(this.deps.readModel, this.deps.currentUserId);
      return ok(this.act(districtId, command, by, this.deps.clock.now()));
    });
  }
}

const trimmedOrNull = (text: string | undefined): string | null => text?.trim() || null;

/** OPEN -> UNDER_REVIEW. */
export class ReviewInfrastructureIssueUseCase extends InfrastructureActionUseCase<DeoInfrastructureActionRequest> {
  constructor(deps: InfrastructureActionDeps) {
    super('ReviewInfrastructureIssue', deps);
  }
  protected act(districtId: string, req: DeoInfrastructureActionRequest, by: { id: string; name: string }, at: string): boolean {
    return this.deps.store.review(districtId, req.issueId, by, trimmedOrNull(req.comments), at);
  }
}

/** OPEN or UNDER_REVIEW -> resolved. */
export class ResolveInfrastructureIssueUseCase extends InfrastructureActionUseCase<DeoInfrastructureActionRequest> {
  constructor(deps: InfrastructureActionDeps) {
    super('ResolveInfrastructureIssue', deps);
  }
  protected act(districtId: string, req: DeoInfrastructureActionRequest, by: { id: string; name: string }, at: string): boolean {
    return this.deps.store.resolveInfrastructure(districtId, req.issueId, by, trimmedOrNull(req.comments), at);
  }
}

/** Escalate to the county; a blank reason is refused without touching the store. */
export class EscalateInfrastructureIssueUseCase extends InfrastructureActionUseCase<DeoInfrastructureEscalateRequest> {
  constructor(deps: InfrastructureActionDeps) {
    super('EscalateInfrastructureIssue', deps);
  }
  protected act(districtId: string, req: DeoInfrastructureEscalateRequest, by: { id: string; name: string }, at: string): boolean {
    const reason = req.reason.trim();
    if (!reason) return false;
    return this.deps.store.escalate(districtId, req.issueId, by, reason, at);
  }
}
