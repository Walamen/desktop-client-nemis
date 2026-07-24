import type { ApprovalStatus, InstitutionType, OwnershipType, SystemRole } from './enums';

/** IPC wire shapes for the dashboard/bootstrap reads. Kept structurally
 * identical to the application-layer output DTOs so main-process handlers can
 * return the DTO directly and the renderer can pass the result straight to the
 * presentation layer. */
export interface DashboardOverviewResult {
  totalStudents: number;
  totalClasses: number;
  totalSubjects: number;
  attendanceToday: { present: number; total: number };
  studentsByGrade: { gradeLevel: string; studentCount: number }[];
  recentlyEnrolled: { id: string; fullName: string; admissionNumber: string; updatedAt: string }[];
}

export interface SchoolSummaryResult {
  id: string;
  code: string;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  approvalStatus: ApprovalStatus;
  isApproved: boolean;
  street?: string;
  communityTown?: string;
}

export interface AcademicYearResult {
  id: string;
  institutionId: string;
  code: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface CurrentUserResult {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  roles: SystemRole[];
}

export interface DeviceInfoResult {
  id: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
}
