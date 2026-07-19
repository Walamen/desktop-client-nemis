import type { StatusPresentation } from '../../presenters/status-presentation';

export interface EnrollmentRowView {
  readonly id: string;
  readonly studentId: string;
  readonly classId: string;
  readonly status: StatusPresentation;
  readonly updatedAt: string;
}

export interface ClassRosterView {
  readonly classId: string;
  readonly enrollments: readonly EnrollmentRowView[];
  readonly activeCount: number;
}
