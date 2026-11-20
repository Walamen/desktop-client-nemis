import { IpcChannels, type DeoInfrastructureActionRequest, type DeoInfrastructureEscalateRequest } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertDeoInfrastructureActionArgs,
  assertDeoInfrastructureEscalateArgs,
  assertNoArgs,
} from '@app/security/validateIpc';

/** DEO Infrastructure, from this device. The district comes from the signed-in
 * workspace, never from the renderer. Review / Resolve / Escalate are local
 * writes the outbox syncs later. */
export function registerDeoInfrastructureHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DEO_INFRASTRUCTURE, assertNoArgs, async () => (await app.deo.getInfrastructure()).data);
  handle(
    IpcChannels.DEO_INFRASTRUCTURE_REVIEW,
    assertDeoInfrastructureActionArgs,
    async (request: DeoInfrastructureActionRequest) => (await app.deo.reviewInfrastructure(request)).data,
  );
  handle(
    IpcChannels.DEO_INFRASTRUCTURE_RESOLVE,
    assertDeoInfrastructureActionArgs,
    async (request: DeoInfrastructureActionRequest) => (await app.deo.resolveInfrastructure(request)).data,
  );
  handle(
    IpcChannels.DEO_INFRASTRUCTURE_ESCALATE,
    assertDeoInfrastructureEscalateArgs,
    async (request: DeoInfrastructureEscalateRequest) => (await app.deo.escalateInfrastructure(request)).data,
  );
}
