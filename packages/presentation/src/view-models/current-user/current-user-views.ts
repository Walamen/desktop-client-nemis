import type { StatusPresentation } from '../../presenters/status-presentation';

export interface UserView {
  readonly id: string;
  readonly fullName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly photoUrl: string | null;
  readonly email: string | null;
  readonly roleLabels: readonly string[];
  readonly status: StatusPresentation;
}
