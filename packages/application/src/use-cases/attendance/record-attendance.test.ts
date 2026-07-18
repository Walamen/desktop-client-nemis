import { describe, expect, it } from 'vitest';
import { Student } from '@nemis-desktop/domain';
import { AttendanceStatus, Gender } from '@nemis-desktop/types';
import { RecordAttendanceUseCase } from './record-attendance';
import { InMemoryAttendanceRepository } from '../../testing/attendance/in-memory-attendance-repository';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { WorkflowException } from '../../exceptions';

function build() {
  const attendance = new InMemoryAttendanceRepository();
  const students = new InMemoryStudentRepository();
  students.save(
    Student.create({
      id: 'stu-1',
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
      occurredAt: '2026-07-18T00:00:00.000Z',
    }),
  );
  const events = new CollectingEventPublisher();
  const useCase = new RecordAttendanceUseCase({
    attendance,
    students,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-18T08:00:00.000Z'),
    ids: new SequentialIdGenerator('att'),
    events,
    logger: new RecordingLogger(),
  });
  return { attendance, events, useCase };
}

const dto = {
  studentId: 'stu-1',
  classId: 'cls-1',
  date: '2026-07-18',
  status: AttendanceStatus.PRESENT,
  recordedBy: 'teacher-1',
};

describe('RecordAttendanceUseCase', () => {
  it('records attendance and emits an event', async () => {
    const { attendance, events, useCase } = build();
    const res = await useCase.execute(dto);
    expect(res.data.id).toBe('att-1');
    expect(res.data.status).toBe(AttendanceStatus.PRESENT);
    expect(attendance.store.has('att-1')).toBe(true);
    expect(events.published[0]?.name).toBe('AttendanceRecorded');
  });

  it('rejects when the student does not exist', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ ...dto, studentId: 'nope' })).rejects.toBeInstanceOf(
      WorkflowException,
    );
  });
});
