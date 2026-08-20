import type { GradeLevel } from '@nemis-desktop/types';
import type { StatusPresentation } from '../../presenters/status-presentation';

export interface InstitutionProfileView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly ownershipLabel: string;
  readonly approval: StatusPresentation;
  readonly address: string;
  readonly allowedGrades: readonly GradeLevel[];
}

export interface GradingConfigView {
  readonly id: string;
  readonly maxMarks: number;
  readonly passingMarks: number;
  readonly requireAdminApproval: boolean;
}
