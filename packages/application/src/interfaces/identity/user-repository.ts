import type { User } from '@nemis-desktop/domain';

export interface IUserRepository {
  findById(id: string): User | null;
}
