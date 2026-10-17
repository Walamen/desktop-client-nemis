import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CountySchoolDetailOutput } from '../../dto/county/county-schools-dto';
import type { ICountySchoolsReadModel } from '../../interfaces/county/county-schools-read-model';
import type { ISchoolRegistrationStore } from '../../interfaces/county/school-registration-store';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { registrationInfo, registrationToDetail } from '../../mappers/county/school-registration-mapper';

export interface GetCountySchoolDetailDeps {
  readModel: ICountySchoolsReadModel;
  registrations: ISchoolRegistrationStore;
  currentUserId: string;
  logger: IAppLogger;
}

/** School detail page data; null for an unknown or other-county school. A
 * school this admin registered on the device carries its registration (badge,
 * refusal, principal login); one the server has not sent back yet is built
 * from what was entered. */
export class GetCountySchoolDetailUseCase implements QueryHandler<
  { schoolId: string },
  ApplicationResponse<CountySchoolDetailOutput>
> {
  constructor(private readonly deps: GetCountySchoolDetailDeps) {}

  execute(query: { schoolId: string }): Promise<ApplicationResponse<CountySchoolDetailOutput>> {
    return invokeUseCase('GetCountySchoolDetail', this.deps.logger, async () => {
      const institution = this.deps.readModel.getSchool(query.schoolId);
      const registration = this.deps.registrations.getForUser(query.schoolId, this.deps.currentUserId);
      if (institution) {
        return ok(registration ? { ...institution, registration: registrationInfo(registration) } : institution);
      }
      if (!registration) return ok(null);
      const { county, districts } = this.deps.registrations.context();
      const district = districts.find((d) => d.id === registration.payload.districtId);
      return ok(registrationToDetail(registration, district?.name ?? null, county?.name ?? null));
    });
  }
}
