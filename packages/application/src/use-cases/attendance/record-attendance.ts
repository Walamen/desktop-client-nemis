import { Attendance } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { RecordAttendanceDto, AttendanceOutput } from '../../dto/attendance/attendance-dto';
import type { IAttendanceRepository } from '../../interfaces/attendance/attendance-repository';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAttendanceOutput } from '../../mappers/attendance/attendance-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { AttendanceRecorded } from '../../events/attendance';

export interface RecordAttendanceDeps {
  attendance: IAttendanceRepository;
  students: IStudentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class RecordAttendanceUseCase implements CommandHandler<
  RecordAttendanceDto,
  ApplicationResponse<AttendanceOutput>
> {
  constructor(private readonly deps: RecordAttendanceDeps) {}

  execute(command: RecordAttendanceDto): Promise<ApplicationResponse<AttendanceOutput>> {
    return invokeUseCase('RecordAttendance', this.deps.logger, async () => {
      requireFields(command, ['studentId', 'classId', 'date', 'status']);
      if (!this.deps.students.exists(command.studentId)) {
        throw new WorkflowException(`Student ${command.studentId} does not exist.`);
      }

      const occurredAt = this.deps.clock.now();
      const attendance = Attendance.record({
        id: this.deps.ids.next(),
        studentId: command.studentId,
        classId: command.classId,
        subjectId: command.subjectId,
        date: command.date,
        status: command.status,
        recordedBy: command.recordedBy,
        remarks: command.remarks,
        updateReason: command.updateReason,
        occurredAt,
      });
      this.deps.unitOfWork.run(() => this.deps.attendance.save(attendance));

      const event: AttendanceRecorded = {
        name: 'AttendanceRecorded',
        occurredAt,
        attendanceId: attendance.id,
        studentId: attendance.studentId,
        date: attendance.date,
        status: attendance.status,
      };
      this.deps.events.publish(event);

      return ok(toAttendanceOutput(attendance));
    });
  }
}
