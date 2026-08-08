import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { InstitutionSummaryOutput } from '../../dto/institution/institution-dto';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';
import type { IDistrictRepository } from '../../interfaces/institution/district-repository';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toInstitutionSummaryOutput } from '../../mappers/institution/institution-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface ListInstitutionsDeps {
  institutions: IInstitutionRepository;
  districts: IDistrictRepository;
  students: IStudentRepository;
  logger: IAppLogger;
}

export class ListInstitutionsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<InstitutionSummaryOutput[]>
> {
  constructor(private readonly deps: ListInstitutionsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<InstitutionSummaryOutput[]>> {
    return invokeUseCase('ListInstitutions', this.deps.logger, async () => {
      const institutions = this.deps.institutions.findAll();
      const districtNameById = new Map(this.deps.districts.findAll().map((d) => [d.id, d.name]));
      const countByInstitutionId = new Map(
        this.deps.students.countByInstitution().map((c) => [c.institutionId, c.studentCount]),
      );
      const rows = institutions.map((institution) =>
        toInstitutionSummaryOutput(
          institution,
          institution.districtId ? districtNameById.get(institution.districtId) : undefined,
          countByInstitutionId.get(institution.id) ?? 0,
        ),
      );
      return ok(rows);
    });
  }
}
