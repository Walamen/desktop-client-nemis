import { IpcChannels, type PendingCarryOver, type SaveCarryOverIpcRequest } from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import { assertCarryOverSaveArgs, assertNoArgs, assertSingleIdArg } from '@app/security/validateIpc';
import { runOnline } from './online';

export type CarryOverGateway = Pick<
  BackendProvisioningGateway,
  'listPendingCarryOvers' | 'getCarryOver' | 'saveCarryOver'
>;

/** Match prior record (lifecycle Stage 5). Online only and INSTITUTION_ADMIN
 * only (authorizeChannel): the matching needs the origin school's record,
 * which only the server holds. A save forces a pull so the carried grades and
 * the SAVED status reach local SQLite. The local list (dashboard card,
 * student profile banner) reads pulled rows and works offline. */
export function registerCarryOverHandlers(
  handle: IpcHandle,
  gateway: CarryOverGateway,
  refresh: () => Promise<boolean>,
  readLocalPending: () => PendingCarryOver[],
): void {
  handle(IpcChannels.CARRY_OVER_LIST_LOCAL_PENDING, assertNoArgs, () => readLocalPending());
  handle(IpcChannels.CARRY_OVER_LIST_PENDING, assertNoArgs, () => gateway.listPendingCarryOvers());
  handle(IpcChannels.CARRY_OVER_GET, assertSingleIdArg, (id: string) => gateway.getCarryOver(id));
  handle(
    IpcChannels.CARRY_OVER_SAVE,
    assertCarryOverSaveArgs,
    ({ carryOverId, ...body }: SaveCarryOverIpcRequest) =>
      runOnline(() => gateway.saveCarryOver(carryOverId, body), refresh),
  );
}
