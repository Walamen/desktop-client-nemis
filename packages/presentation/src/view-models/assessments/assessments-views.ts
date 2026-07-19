import type { StatusPresentation } from '../../presenters/status-presentation';

export interface GradeRowView {
  readonly id: string;
  readonly studentId: string;
  readonly subjectId: string;
  readonly marks: string;
  readonly percent: string;
  readonly status: StatusPresentation;
}

export interface AssessmentView {
  readonly id: string;
  readonly typeLabel: string;
  readonly marks: string;
  readonly updatedAt: string;
}
