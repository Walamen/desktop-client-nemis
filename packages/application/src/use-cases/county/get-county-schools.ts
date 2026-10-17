import type { CountySchoolListItem } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CountySchoolsOutput } from '../../dto/county/county-schools-dto';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyDistrictsReadModel } from '../../interfaces/county/county-districts-read-model';
import type { ICountySchoolsReadModel } from '../../interfaces/county/county-schools-read-model';
import type { ISchoolRegistrationStore } from '../../interfaces/county/school-registration-store';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { registrationToListItem } from '../../mappers/county/school-registration-mapper';

export interface GetCountySchoolsDeps {
  readModel: ICountySchoolsReadModel;
  districtsReadModel: ICountyDistrictsReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  registrations: ISchoolRegistrationStore;
  currentUserId: string;
  logger: IAppLogger;
}

/** Schools list page data (portal-web's getSchoolsByCounty, plus the
 * Districts card's active-district count), with the schools this admin saved
 * on the device and the server has not sent back yet. A registration whose
 * institution has arrived is dropped: the institution wins. */
export class GetCountySchoolsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountySchoolsOutput>
> {
  constructor(private readonly deps: GetCountySchoolsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountySchoolsOutput>> {
    return invokeUseCase('GetCountySchools', this.deps.logger, async () => {
      const institutions = this.deps.readModel.listActiveSchools();
      const registrations = this.deps.registrations.listForUser(this.deps.currentUserId);
      // An institution row in ANY state wins: a school accepted and later
      // closed on the server stays hidden, as on the web.
      const known = new Set([
        ...institutions.map((school) => school.id),
        ...this.deps.registrations.knownInstitutionIds(registrations.map((r) => r.id)),
      ]);
      const districtName = new Map(this.deps.registrations.context().districts.map((d) => [d.id, d.name]));
      const waiting = registrations
        .filter((r) => !known.has(r.id))
        .map((r) => registrationToListItem(r, districtName.get(r.payload.districtId) ?? null));
      // Binary order, like the read model's ORDER BY name.
      const schools: CountySchoolListItem[] = [...institutions, ...waiting].sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      );
      return ok({
        county: this.deps.countyReadModel.getCounty(),
        districtCount: this.deps.districtsReadModel.listActiveDistricts().length,
        schools,
      });
    });
  }
}
