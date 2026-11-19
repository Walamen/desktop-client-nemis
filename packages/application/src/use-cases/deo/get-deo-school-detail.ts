import type { DeoSchoolDetailResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import type { ICountyReportsReadModel } from '../../interfaces/county/county-reports-read-model';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { buildDistrictSchoolRows, type DistrictSchoolRowsDeps } from './district-school-rows';

export interface GetDeoSchoolDetailDeps extends DistrictSchoolRowsDeps {
  /** The same academic report Generate Reports shows, for the average score. */
  reports: Pick<ICountyReportsReadModel, 'getAcademicReport'>;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  clock: IClock;
  logger: IAppLogger;
}

/** The DEO School detail page, from this device. The row is the Schools
 * page's (buildDistrictSchoolRows); a school outside the district is null. */
export class GetDeoSchoolDetailUseCase implements QueryHandler<
  { schoolId: string },
  ApplicationResponse<DeoSchoolDetailResult>
> {
  constructor(private readonly deps: GetDeoSchoolDetailDeps) {}

  execute(query: { schoolId: string }): Promise<ApplicationResponse<DeoSchoolDetailResult>> {
    return invokeUseCase('GetDeoSchoolDetail', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) return ok({ districtId: null, school: null });
      const { readModel, reports, clock } = this.deps;
      const row = buildDistrictSchoolRows(
        this.deps,
        districtId,
        new Date(clock.now()),
        readModel.listOpenAlerts(districtId),
      ).find((r) => r.id === query.schoolId);
      if (!row) return ok({ districtId, school: null });

      const profile = readModel.getSchoolProfile(query.schoolId);
      const genderRows = readModel.countSchoolStudentsByGender(query.schoolId);
      const count = (gender: string) =>
        genderRows.filter((g) => g.gender === gender).reduce((sum, g) => sum + g.count, 0);
      const academicRow = reports
        .getAcademicReport({ districtId, schoolId: query.schoolId, districtOnly: true })
        .bySchool.find((s) => s.schoolId === query.schoolId);
      const totalGrades = academicRow?.totalGrades ?? 0;

      return ok({
        districtId,
        school: {
          ...row,
          address: profile?.address ?? null,
          establishedYear: profile?.establishedYear ?? null,
          gender: { male: count('MALE'), female: count('FEMALE') },
          enrollmentByGrade: readModel.countSchoolStudentsByGrade(query.schoolId),
          academic: {
            totalGrades,
            averageScore: academicRow && totalGrades > 0 ? academicRow.averageScore : null,
          },
        },
      });
    });
  }
}
