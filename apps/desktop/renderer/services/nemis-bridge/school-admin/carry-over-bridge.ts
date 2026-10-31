import type {
  CarriedGradeCell,
  CarriedGradesForPeriodRequest,
  CarryOverPreview,
  OnlineCommandResult,
  PendingCarryOver,
  SaveCarryOverIpcRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

/** Match prior record (online only). A refused save rejects with the server
 * message; a saved matching arrives locally through the forced pull. */
export const carryOverBridge = {
  listPendingCarryOvers: (): Promise<PendingCarryOver[]> => api().carryOver.listPending(),
  listLocalPendingCarryOvers: (): Promise<PendingCarryOver[]> => api().carryOver.listLocalPending(),
  carriedGradesForPeriod: (request: CarriedGradesForPeriodRequest): Promise<CarriedGradeCell[]> =>
    api().carryOver.carriedForPeriod(request),
  getCarryOver: (id: string): Promise<CarryOverPreview> => api().carryOver.get(id),
  saveCarryOver: (request: SaveCarryOverIpcRequest): Promise<OnlineCommandResult<null>> =>
    api().carryOver.save(request),
};
