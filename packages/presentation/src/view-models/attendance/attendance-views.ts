import type { StatusPresentation } from '../../presenters/status-presentation';

export interface AttendanceRowView {
  readonly id: string;
  readonly studentId: string;
  readonly subjectId?: string;
  readonly date: string;
  readonly status: StatusPresentation;
  readonly remarks?: string;
}
