import type { StatusPresentation } from '../../presenters/status-presentation';

export interface StudentRowView {
  readonly id: string;
  readonly fullName: string;
  readonly admissionNumber: string;
  readonly gradeLevel: string;
  readonly status: StatusPresentation;
}

export interface StudentDetailsView {
  readonly id: string;
  readonly institutionId: string;
  readonly fullName: string;
  readonly admissionNumber: string;
  readonly dateOfBirth: string;
  readonly gender: string;
  readonly gradeLevel: string;
  readonly status: StatusPresentation;
  readonly guardianCount: number;
  readonly updatedAt: string;
}
