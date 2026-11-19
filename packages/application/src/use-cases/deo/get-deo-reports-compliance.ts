import type { DeoReportsComplianceResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { complianceRows, complianceSummary } from './compliance-rows';
import { buildDistrictSchoolRows, type DistrictSchoolRowsDeps } from './district-school-rows';

export interface GetDeoReportsComplianceDeps extends DistrictSchoolRowsDeps {
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  clock: IClock;
  logger: IAppLogger;
}

/** The DEO Reports & Compliance page, from this device: three rows per
 * school (registration, teacher roster, monthly reports). */
export class GetDeoReportsComplianceUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeoReportsComplianceResult>
> {
  constructor(private readonly deps: GetDeoReportsComplianceDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoReportsComplianceResult>> {
    return invokeUseCase('GetDeoReportsCompliance', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) {
        return ok({
          districtId: null,
          district: null,
          county: null,
          summary: complianceSummary([]),
          items: [],
        });
      }
      const { readModel } = this.deps;
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;
      const schools = buildDistrictSchoolRows(
        this.deps,
        districtId,
        new Date(this.deps.clock.now()),
        readModel.listOpenAlerts(districtId),
      );
      const registrations = new Map(
        readModel.listSchoolRegistrations(districtId).map((row) => [row.institutionId, row]),
      );
      const rosters = new Map(readModel.teacherRosterBySchool(districtId).map((row) => [row.institutionId, row]));
      const items = schools.flatMap((school) => {
        const registration = registrations.get(school.id);
        const roster = rosters.get(school.id);
        return complianceRows({
          id: school.id,
          name: school.name,
          code: school.code,
          principalName: school.principalName,
          reportMonths: school.reportMonths,
          lastSubmissionAt: school.lastSubmissionAt,
          approvalStatus: registration?.approvalStatus ?? null,
          approvedAt: registration?.approvedAt ?? null,
          createdAt: registration?.createdAt ?? null,
          teachers: roster
            ? { total: roster.total, awaitingApproval: roster.awaitingApproval, newestCreatedAt: roster.newestCreatedAt }
            : { total: 0, awaitingApproval: 0, newestCreatedAt: null },
        });
      });
      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        summary: complianceSummary(items),
        items,
      });
    });
  }
}
