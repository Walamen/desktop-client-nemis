import type {
  ApplicationResponse,
  AttendanceApplicationService,
  AttendanceOutput,
  GetAttendanceByClassAndDateDto,
} from '@nemis-desktop/application';

export class GetAttendanceUiQuery {
  constructor(private readonly attendance: AttendanceApplicationService) {}

  execute(dto: GetAttendanceByClassAndDateDto): Promise<ApplicationResponse<AttendanceOutput[]>> {
    return this.attendance.getByClassAndDate(dto);
  }
}
