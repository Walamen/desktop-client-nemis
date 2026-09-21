import type { StatusPresentation } from '../../presenters/status-presentation';

export interface StudentRowView {
  readonly id: string;
  readonly fullName: string;
  /** Absent for a legacy row awaiting its first post-rollout sync pull. */
  readonly nemisId?: string;
  readonly gradeLevel: string;
  readonly gender: string;
  readonly status: StatusPresentation;
}

export interface StudentDetailsView {
  readonly id: string;
  readonly institutionId: string;
  readonly fullName: string;
  readonly firstName: string;
  readonly middleName?: string;
  readonly lastName: string;
  /** Absent for a legacy row awaiting its first post-rollout sync pull. */
  readonly nemisId?: string;
  readonly dateOfBirth: string;
  readonly rawDateOfBirth: string;
  readonly gender: string;
  readonly gradeLevel: string;
  readonly status: StatusPresentation;
  readonly guardianCount: number;
  readonly guardians: readonly { id: string; guardianId: string; isPrimary: boolean }[];
  readonly phoneNumber?: string;
  readonly email?: string;
  readonly address?: string;
  readonly rawGender: string;
  readonly rawGradeLevel?: string;
  readonly updatedAt: string;
}
