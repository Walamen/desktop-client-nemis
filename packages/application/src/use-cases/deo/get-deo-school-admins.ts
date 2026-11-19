import type { DeoSchoolAdminsResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IDistrictOverviewReadModel } from '../../interfaces/deo/district-overview-read-model';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetDeoSchoolAdminsDeps {
  readModel: IDistrictOverviewReadModel;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  clock: IClock;
  logger: IAppLogger;
}

/** The DEO School Admin Directory, from this device: one entry per School
 * Admin account (the server builds the same for the web,
 * districts.service.ts getDistrictSchoolAdmins). */
export class GetDeoSchoolAdminsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeoSchoolAdminsResult>
> {
  constructor(private readonly deps: GetDeoSchoolAdminsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoSchoolAdminsResult>> {
    return invokeUseCase('GetDeoSchoolAdmins', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) {
        return ok({ districtId: null, district: null, county: null, admins: [], schoolsWithoutAdmin: [] });
      }
      const { readModel } = this.deps;
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;
      const issues = new Map(
        readModel.countOpenInfrastructureIssuesBySchool(districtId).map((row) => [row.institutionId, row.count]),
      );
      const admins = readModel
        .listSchoolAdmins(districtId)
        .map((row) => ({ ...row, openInfrastructureIssues: issues.get(row.schoolId) ?? 0 }))
        .sort(
          (a, b) =>
            a.schoolName.localeCompare(b.schoolName) ||
            `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
        );
      const withAdmin = new Set(admins.map((admin) => admin.schoolId));

      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        admins,
        schoolsWithoutAdmin: readModel
          .listActiveSchools(districtId)
          .filter((school) => !withAdmin.has(school.id))
          .map(({ id, name }) => ({ id, name })),
      });
    });
  }
}
