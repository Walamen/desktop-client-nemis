import type { DeoTransfer, DeoTransfersResult, TransferDirection } from '@nemis-desktop/types';
import { isLapsed } from '@nemis-desktop/shared';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  DistrictTransferRow,
  IDistrictOverviewReadModel,
} from '../../interfaces/deo/district-overview-read-model';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetDeoTransfersDeps {
  readModel: IDistrictOverviewReadModel;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  clock: IClock;
  logger: IAppLogger;
}

/** DEO Transfers, oversight only, from this device: schools decide, the DEO
 * watches. Rules: docs/superpowers/specs/2026-11-17-deo-transfers-design.md;
 * the server builds the same (districts.service.ts getDistrictTransferOverview). */
export class GetDeoTransfersUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeoTransfersResult>
> {
  constructor(private readonly deps: GetDeoTransfersDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoTransfersResult>> {
    return invokeUseCase('GetDeoTransfers', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) {
        return ok({ districtId: null, district: null, county: null, transfers: [], summary: { pending: 0, lapsed: 0 } });
      }
      const { readModel } = this.deps;
      const now = Date.parse(this.deps.clock.now());
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;
      const transfers = readModel.listTransfers(districtId).map((row) => toTransfer(row, now));
      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        transfers,
        summary: {
          pending: transfers.filter((t) => t.status === 'PENDING' && !t.lapsed).length,
          lapsed: transfers.filter((t) => t.lapsed).length,
        },
      });
    });
  }
}

function toTransfer(row: DistrictTransferRow, now: number): DeoTransfer {
  const lapsed = isLapsed(row, now);
  const direction: TransferDirection =
    row.fromInDistrict && row.toInDistrict ? 'WITHIN' : row.fromInDistrict ? 'OUT_OF' : 'INTO';
  // Whoever did not ask reviews; a lapsed pull is back with the asker.
  const awaitingSchool =
    row.status !== 'PENDING'
      ? null
      : lapsed
        ? row.toSchool
        : row.initiatedBy === 'RECEIVING_SCHOOL'
          ? row.fromSchool
          : row.toSchool;
  return {
    id: row.id,
    studentName: row.studentName,
    studentNemisId: row.studentNemisId,
    fromSchool: { ...row.fromSchool },
    toSchool: { ...row.toSchool },
    direction,
    status: row.status as DeoTransfer['status'],
    lapsed,
    initiatedBy: row.initiatedBy as DeoTransfer['initiatedBy'],
    awaitingSchool: awaitingSchool ? { ...awaitingSchool } : null,
    requestedGrade: row.requestedGrade,
    reason: row.reason,
    reviewNotes: row.reviewNotes,
    createdAt: row.createdAt,
    requestedDate: row.requestedDate,
    reviewedAt: row.reviewedAt,
  };
}
