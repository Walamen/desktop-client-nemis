import { describe, expect, it } from 'vitest';
import { Attendance } from '@nemis-desktop/domain';
import { AttendanceStatus } from '@nemis-desktop/types';
import { GetAttendanceByClassAndDateUseCase } from './get-attendance-by-class-and-date';
import { InMemoryAttendanceRepository } from '../../testing/attendance/in-memory-attendance-repository';
import { RecordingLogger } from '../../testing';

describe('GetAttendanceByClassAndDateUseCase', () => {
  it('returns attendance for the class on the date', async () => {
    const attendance = new InMemoryAttendanceRepository();
    attendance.save(
      Attendance.record({
        id: 'att-1',
        studentId: 'stu-1',
        classId: 'cls-1',
        date: '2026-07-18',
        status: AttendanceStatus.PRESENT,
        occurredAt: '2026-07-18T08:00:00.000Z',
      }),
    );
    const useCase = new GetAttendanceByClassAndDateUseCase({
      attendance,
      logger: new RecordingLogger(),
    });
    const res = await useCase.execute({ classId: 'cls-1', date: '2026-07-18' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.studentId).toBe('stu-1');
  });
});
