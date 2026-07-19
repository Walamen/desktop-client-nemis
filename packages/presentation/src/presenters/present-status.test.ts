import { describe, expect, it } from 'vitest';
import {
  ApprovalStatus,
  AttendanceStatus,
  EnrollmentStatus,
  GradeStatus,
} from '@nemis-desktop/types';
import {
  presentActive,
  presentApprovalStatus,
  presentAttendanceStatus,
  presentConnectivity,
  presentEnrollmentStatus,
  presentGradeStatus,
  presentSyncStatus,
} from './present-status';

describe('status presenters', () => {
  it('presents the active flag', () => {
    expect(presentActive(true)).toEqual({ label: 'Active', badge: 'active' });
    expect(presentActive(false)).toEqual({ label: 'Inactive', badge: 'neutral' });
  });

  it('presents attendance statuses', () => {
    expect(presentAttendanceStatus(AttendanceStatus.PRESENT)).toEqual({
      label: 'Present',
      badge: 'success',
    });
    expect(presentAttendanceStatus(AttendanceStatus.ABSENT).badge).toBe('error');
    expect(presentAttendanceStatus(AttendanceStatus.LATE).badge).toBe('pending');
  });

  it('presents enrollment statuses', () => {
    expect(presentEnrollmentStatus(EnrollmentStatus.ACTIVE).badge).toBe('active');
    expect(presentEnrollmentStatus(EnrollmentStatus.WITHDRAWN)).toEqual({
      label: 'Withdrawn',
      badge: 'neutral',
    });
  });

  it('presents grade statuses with publication overriding', () => {
    expect(presentGradeStatus(GradeStatus.DRAFT, false)).toEqual({
      label: 'Draft',
      badge: 'neutral',
    });
    expect(presentGradeStatus(GradeStatus.SUBMITTED, false).badge).toBe('pending');
    expect(presentGradeStatus(GradeStatus.SUBMITTED, true)).toEqual({
      label: 'Published',
      badge: 'success',
    });
    expect(presentGradeStatus(GradeStatus.PUBLISHED, false).label).toBe('Published');
  });

  it('presents approval statuses', () => {
    expect(presentApprovalStatus(ApprovalStatus.APPROVED).badge).toBe('success');
    expect(presentApprovalStatus(ApprovalStatus.UNDER_REVIEW).label).toBe('Under review');
  });

  it('presents sync and connectivity', () => {
    expect(presentSyncStatus('idle', null)).toEqual({ label: 'Not synced yet', badge: 'neutral' });
    expect(presentSyncStatus('idle', '2026-07-19T12:00:00.000Z').label).toBe(
      'Last synced 19 Jul 2026, 12:00',
    );
    expect(presentSyncStatus('syncing', null)).toEqual({ label: 'Syncing…', badge: 'pending' });
    expect(presentSyncStatus('failed', null)).toEqual({ label: 'Sync failed', badge: 'error' });
    expect(presentConnectivity(true)).toEqual({ label: 'Online', badge: 'success' });
    expect(presentConnectivity(false)).toEqual({ label: 'Offline', badge: 'pending' });
  });
});
