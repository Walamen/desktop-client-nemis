import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { EnrollmentStatus } from '@nemis-desktop/types';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerStudentHandlers } from './students';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

describe('student IPC handlers', () => {
  it('validates create-and-enroll and forwards it to the application layer', async () => {
    const calls = new Map<string, Captured>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
      calls.set(channel, { validate, handler: handler as Captured['handler'] });
    }) as IpcHandle;
    const createAndEnroll = vi.fn(async () => ({ data: { id: 'student-1' } }));
    registerStudentHandlers(handle, { students: { createAndEnroll }, academics: {} } as unknown as ApplicationLayer);
    const channel = calls.get('student:create-and-enroll')!;
    const request = {
      institutionId: 'inst-1', firstName: 'Ada', lastName: 'Toe', dateOfBirth: '2015-01-01', gender: 'FEMALE',
      gradeLevel: 'GRADE_7', academicYearId: 'y1', termId: 't1', classId: 'c1', assertedNoNemisId: true,
      guardians: [{ firstName: 'Mary', lastName: 'Toe', relationship: 'Mother', phoneNumber: '0770000000', isPrimary: true }],
    };
    expect(() => channel.validate([request])).not.toThrow();
    expect(() => channel.validate([{ ...request, classId: '' }])).toThrow();
    expect(() => channel.validate([{ ...request, assertedNoNemisId: 'yes' }])).toThrow();
    expect(() => channel.validate([{ ...request, guardians: [{ ...request.guardians[0], extra: 1 }] }])).toThrow();
    expect(() => channel.validate([{ ...request, guardians: Array.from({ length: 11 }, () => request.guardians[0]) }])).toThrow();
    expect(await channel.handler(request)).toEqual({ id: 'student-1' });
    expect(createAndEnroll).toHaveBeenCalledWith(request);
  });

  it('validates and forwards class-transfer requests through the application layer', async () => {
    const calls = new Map<string, Captured>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
      calls.set(channel, { validate, handler: handler as Captured['handler'] });
    }) as IpcHandle;
    const enrollment = {
      id: 'enr-1',
      studentId: 'student-1',
      classId: 'class-2',
      academicYearId: 'year-1',
      termId: 'term-1',
      enrollmentDate: '2026-09-01',
      status: EnrollmentStatus.ACTIVE,
      version: 2,
      updatedAt: '2026-09-02T00:00:00.000Z',
    };
    const moveEnrollmentClass = vi.fn(async () => ({ data: enrollment }));
    const app = {
      academics: { moveEnrollmentClass },
      students: {},
    } as unknown as ApplicationLayer;

    registerStudentHandlers(handle, app);
    const move = calls.get('student:move-class')!;
    expect(() =>
      move.validate([{ enrollmentId: 'enr-1', targetClassId: 'class-2' }]),
    ).not.toThrow();
    expect(() => move.validate([{ enrollmentId: 'enr-1' }])).toThrow();
    expect(
      await move.handler({ enrollmentId: 'enr-1', targetClassId: 'class-2' }),
    ).toEqual(enrollment);
    expect(moveEnrollmentClass).toHaveBeenCalledWith({
      enrollmentId: 'enr-1',
      targetClassId: 'class-2',
    });
  });
});
