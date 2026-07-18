import type { User } from '@nemis-desktop/domain';
import type { UserOutput } from '../../dto/identity/identity-dto';

export function toUserOutput(user: User): UserOutput {
  return {
    id: user.id,
    fullName: user.name.full,
    email: user.email.value,
    isActive: user.isActive,
    roles: user.organizations.filter((o) => o.isActive).map((o) => o.role),
  };
}
