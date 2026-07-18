import type { ApplicationResponse } from '../core/response';
import type {
  AttendanceOutput,
  GetAttendanceByClassAndDateDto,
  RecordAttendanceDto,
} from '../dto/attendance/attendance-dto';
import type { RecordAttendanceUseCase } from '../use-cases/attendance/record-attendance';
import type { GetAttendanceByClassAndDateUseCase } from '../use-cases/attendance/get-attendance-by-class-and-date';

export interface AttendanceApplicationServiceDeps {
  record: RecordAttendanceUseCase;
  getByClassAndDate: GetAttendanceByClassAndDateUseCase;
}

export class AttendanceApplicationService {
  constructor(private readonly deps: AttendanceApplicationServiceDeps) {}

  record(dto: RecordAttendanceDto): Promise<ApplicationResponse<AttendanceOutput>> {
    return this.deps.record.execute(dto);
  }

  getByClassAndDate(
    dto: GetAttendanceByClassAndDateDto,
  ): Promise<ApplicationResponse<AttendanceOutput[]>> {
    return this.deps.getByClassAndDate.execute(dto);
  }
}
