import type { StatusPresentation } from '../../presenters/status-presentation';

export interface UserView {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly roleLabels: readonly string[];
  readonly status: StatusPresentation;
}
