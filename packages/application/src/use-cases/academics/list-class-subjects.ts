import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ClassSubjectOutput } from '../../dto/academics/academics-dto';
import type { ISubjectRepository } from '../../interfaces/academics/subject-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toClassSubjectOutput } from '../../mappers/academics/subject-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface ListClassSubjectsDto {
  classId: string;
}

export interface ListClassSubjectsDeps {
  subjects: ISubjectRepository;
  logger: IAppLogger;
}

export class ListClassSubjectsUseCase implements QueryHandler<
  ListClassSubjectsDto,
  ApplicationResponse<ClassSubjectOutput[]>
> {
  constructor(private readonly deps: ListClassSubjectsDeps) {}

  execute(query: ListClassSubjectsDto): Promise<ApplicationResponse<ClassSubjectOutput[]>> {
    return invokeUseCase('ListClassSubjects', this.deps.logger, async () => {
      const links = this.deps.subjects.listClassSubjects(query.classId).map(toClassSubjectOutput);
      return ok(links);
    });
  }
}
