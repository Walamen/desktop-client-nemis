import type { ApprovalStatus, GradeLevel, InstitutionType, OwnershipType } from '@nemis-desktop/types';

export interface InstitutionProfileOutput {
  id: string;
  code: string;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  approvalStatus: ApprovalStatus;
  isApproved: boolean;
  street?: string;
  communityTown?: string;
  allowedGrades: GradeLevel[];
}

export interface InstitutionSummaryOutput {
  id: string;
  code: string;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  districtId?: string;
  districtName?: string;
  approvalStatus: ApprovalStatus;
  studentCount: number;
}

export interface UpdateGradingConfigDto {
  id: string;
  maxMarks: number;
  passingMarks: number;
  requireAdminApproval: boolean;
}

export interface GradingConfigOutput {
  id: string;
  maxMarks: number;
  passingMarks: number;
  requireAdminApproval: boolean;
}
