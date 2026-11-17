import type { DeoSettingsResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IDistrictOverviewReadModel } from '../../interfaces/deo/district-overview-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetDeoSettingsDeps {
  readModel: IDistrictOverviewReadModel;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  currentUserId: string;
  logger: IAppLogger;
}

/** DEO Settings, the part this device holds: the signed-in user's synced
 * profile and the district and county names. Office address and saving are
 * online (docs/superpowers/specs/2026-11-17-deo-settings-design.md). */
export class GetDeoSettingsUseCase implements QueryHandler<Record<string, never>, ApplicationResponse<DeoSettingsResult>> {
  constructor(private readonly deps: GetDeoSettingsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoSettingsResult>> {
    return invokeUseCase('GetDeoSettings', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) return ok({ districtId: null, district: null, county: null, profile: null });
      const { readModel } = this.deps;
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;
      const profile = readModel.getUserProfile(this.deps.currentUserId);
      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        profile: profile ? { ...profile } : null,
      });
    });
  }
}
