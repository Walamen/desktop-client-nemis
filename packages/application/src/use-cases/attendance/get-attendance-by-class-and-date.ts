import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  GetAttendanceByClassAndDateDto,
  AttendanceOutput,
} from '../../dto/attendance/attendance-dto';
import type { IAttendanceRepository } from '../../interfaces/attendance/attendance-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAttendanceOutput } from '../../mappers/attendance/attendance-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetAttendanceByClassAndDateDeps {
  attendance: IAttendanceRepository;
  logger: IAppLogger;
}

export class GetAttendanceByClassAndDateUseCase
  implements
    QueryHandler<GetAttendanceByClassAndDateDto, ApplicationResponse<AttendanceOutput[]>>
{
  constructor(private readonly deps: GetAttendanceByClassAndDateDeps) {}

  execute(
    query: GetAttendanceByClassAndDateDto,
  ): Promise<ApplicationResponse<AttendanceOutput[]>> {
    return invokeUseCase('GetAttendanceByClassAndDate', this.deps.logger, async () => {
      const records = this.deps.attendance
        .findByClassAndDate(query.classId, query.date)
        .map(toAttendanceOutput);
      return ok(records);
    });
  }
}
