import type { UserOutput } from '@nemis-desktop/application';
import { humanizeRole } from '../../formatters/format-text';
import { presentActive } from '../../presenters/present-status';
import type { UserView } from '../../view-models/current-user/current-user-views';

export function toUserView(dto: UserOutput): UserView {
  return {
    id: dto.id,
    fullName: dto.fullName,
    email: dto.email,
    roleLabels: dto.roles.map(humanizeRole),
    status: presentActive(dto.isActive),
  };
}
