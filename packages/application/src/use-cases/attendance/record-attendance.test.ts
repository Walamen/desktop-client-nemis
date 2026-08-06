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

  it('carries subjectId, remarks and updateReason through to the output', async () => {
    const { useCase } = build();
    const res = await useCase.execute({
      ...dto,
      subjectId: 'subj-1',
      remarks: 'Arrived late',
      updateReason: 'Correcting register mix-up',
    });
    expect(res.data.subjectId).toBe('subj-1');
    expect(res.data.remarks).toBe('Arrived late');
    expect(res.data.updateReason).toBe('Correcting register mix-up');
  });

  it('upserts by (studentId, subjectId, date) instead of duplicating rows', async () => {
    const { attendance, useCase } = build();
    await useCase.execute({ ...dto, subjectId: 'subj-1', status: AttendanceStatus.PRESENT });
    await useCase.execute({ ...dto, subjectId: 'subj-1', status: AttendanceStatus.ABSENT });
    const rows = attendance.findByClassAndDate('cls-1', '2026-07-18', 'subj-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe(AttendanceStatus.ABSENT);
  });

  it('reuses the existing row\'s id when editing an already-recorded entry, instead of minting a new one', async () => {
    const { useCase } = build();
    const first = await useCase.execute({ ...dto, subjectId: 'subj-1', status: AttendanceStatus.PRESENT });
    const second = await useCase.execute({ ...dto, subjectId: 'subj-1', status: AttendanceStatus.ABSENT });
    expect(second.data.id).toBe(first.data.id);
  });

  it('still mints a new id for a different (studentId, subjectId, date) key', async () => {
    const { useCase } = build();
    const first = await useCase.execute({ ...dto, subjectId: 'subj-1' });
    const second = await useCase.execute({ ...dto, subjectId: 'subj-2' });
    expect(second.data.id).not.toBe(first.data.id);
  });
});
