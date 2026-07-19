import {
  ApprovalStatus,
  AttendanceStatus,
  EnrollmentStatus,
  GradeStatus,
} from '@nemis-desktop/types';
import { formatIsoDateTime } from '../formatters/format-date';
import type { StatusPresentation, SyncStatus } from './status-presentation';

export function presentActive(isActive: boolean): StatusPresentation {
  return isActive ? { label: 'Active', badge: 'active' } : { label: 'Inactive', badge: 'neutral' };
}

const ATTENDANCE: Record<AttendanceStatus, StatusPresentation> = {
  [AttendanceStatus.PRESENT]: { label: 'Present', badge: 'success' },
  [AttendanceStatus.ABSENT]: { label: 'Absent', badge: 'error' },
  [AttendanceStatus.LATE]: { label: 'Late', badge: 'pending' },
  [AttendanceStatus.EXCUSED]: { label: 'Excused', badge: 'neutral' },
  [AttendanceStatus.SICK]: { label: 'Sick', badge: 'pending' },
};

export function presentAttendanceStatus(status: AttendanceStatus): StatusPresentation {
  return ATTENDANCE[status];
}

const ENROLLMENT: Record<EnrollmentStatus, StatusPresentation> = {
  [EnrollmentStatus.ACTIVE]: { label: 'Active', badge: 'active' },
  [EnrollmentStatus.COMPLETED]: { label: 'Completed', badge: 'success' },
  [EnrollmentStatus.WITHDRAWN]: { label: 'Withdrawn', badge: 'neutral' },
  [EnrollmentStatus.TRANSFERRED]: { label: 'Transferred', badge: 'pending' },
  [EnrollmentStatus.SUSPENDED]: { label: 'Suspended', badge: 'error' },
};

export function presentEnrollmentStatus(status: EnrollmentStatus): StatusPresentation {
  return ENROLLMENT[status];
}

const GRADE: Record<GradeStatus, StatusPresentation> = {
  [GradeStatus.DRAFT]: { label: 'Draft', badge: 'neutral' },
  [GradeStatus.SUBMITTED]: { label: 'Submitted', badge: 'pending' },
  [GradeStatus.APPROVED]: { label: 'Approved', badge: 'active' },
  [GradeStatus.PUBLISHED]: { label: 'Published', badge: 'success' },
  [GradeStatus.LOCKED]: { label: 'Locked', badge: 'neutral' },
};

export function presentGradeStatus(status: GradeStatus, isPublished: boolean): StatusPresentation {
  if (isPublished || status === GradeStatus.PUBLISHED) {
    return { label: 'Published', badge: 'success' };
  }
  return GRADE[status];
}

const APPROVAL: Record<ApprovalStatus, StatusPresentation> = {
  [ApprovalStatus.APPROVED]: { label: 'Approved', badge: 'success' },
  [ApprovalStatus.PENDING]: { label: 'Pending', badge: 'pending' },
  [ApprovalStatus.UNDER_REVIEW]: { label: 'Under review', badge: 'pending' },
  [ApprovalStatus.REJECTED]: { label: 'Rejected', badge: 'error' },
};

export function presentApprovalStatus(status: ApprovalStatus): StatusPresentation {
  return APPROVAL[status];
}

export function presentSyncStatus(
  status: SyncStatus,
  lastSyncAt: string | null,
): StatusPresentation {
  if (status === 'syncing') return { label: 'Syncing…', badge: 'pending' };
  if (status === 'failed') return { label: 'Sync failed', badge: 'error' };
  return lastSyncAt
    ? { label: `Last synced ${formatIsoDateTime(lastSyncAt)}`, badge: 'neutral' }
    : { label: 'Not synced yet', badge: 'neutral' };
}

export function presentConnectivity(isOnline: boolean): StatusPresentation {
  return isOnline ? { label: 'Online', badge: 'success' } : { label: 'Offline', badge: 'pending' };
}
