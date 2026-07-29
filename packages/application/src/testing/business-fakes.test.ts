import { describe, expect, it } from 'vitest';
import { AcademicYear, Attendance, Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, AttendanceStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { InMemoryAttendanceRepository } from './attendance/in-memory-attendance-repository';
import { InMemoryInstitutionRepository } from './institution/in-memory-institution-repository';
import { InMemoryAcademicYearRepository } from './academics/in-memory-academic-year-repository';
import { InMemoryDeviceGateway } from './infra/in-memory-device-gateway';

describe('business fakes new read methods', () => {
  it('InMemoryInstitutionRepository.findFirst returns the only institution or null', () => {
    const repo = new InMemoryInstitutionRepository();
    expect(repo.findFirst()).toBeNull();
    repo.store.set(
      'inst-1',
      Institution.reconstitute({
        id: 'inst-1',
        code: 'lib-001',
        name: 'Test',
        type: InstitutionType.SCHOOL,
        ownership: OwnershipType.GOVERNMENT,
        countyId: 'c-1',
        approvalStatus: ApprovalStatus.APPROVED,
        version: 1,
        updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    expect(repo.findFirst()?.id).toBe('inst-1');
  });

  it('InMemoryAcademicYearRepository.findCurrent returns the current year or null', () => {
    const repo = new InMemoryAcademicYearRepository();
    expect(repo.findCurrent()).toBeNull();
    repo.store.set(
      'ay-1',
      AcademicYear.reconstitute({
        id: 'ay-1',
        institutionId: 'inst-1',
        code: '2025/2026',
        start: '2025-09-01',
        end: '2026-07-31',
        isCurrent: true,
        version: 1,
        updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    expect(repo.findCurrent()?.id).toBe('ay-1');
  });

  it('InMemoryAttendanceRepository.countByDate counts present and total on a date', () => {
    const repo = new InMemoryAttendanceRepository();
    expect(repo.countByDate('2026-07-20')).toEqual({ present: 0, total: 0 });
    repo.save(
      Attendance.record({
        id: 'a-1', studentId: 's-1', classId: 'c-1', date: '2026-07-20',
        status: AttendanceStatus.PRESENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    repo.save(
      Attendance.record({
        id: 'a-2', studentId: 's-2', classId: 'c-1', date: '2026-07-20',
        status: AttendanceStatus.ABSENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    expect(repo.countByDate('2026-07-20')).toEqual({ present: 1, total: 2 });
  });

  it('InMemoryDeviceGateway.getCurrent returns the most recent registration or null', () => {
    const gw = new InMemoryDeviceGateway();
    expect(gw.getCurrent()).toBeNull();
    const d = gw.register({ deviceName: 'lab', platform: 'win32', osVersion: '10', appVersion: '1.0.0' });
    expect(gw.getCurrent()?.id).toBe(d.id);
  });
});
