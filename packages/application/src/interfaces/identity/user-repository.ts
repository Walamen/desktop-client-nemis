import type { User } from '@nemis-desktop/domain';

export interface IUserRepository {
  findById(id: string): User | null;
  /** The single local user, or null before the first-run seed. */
  findFirst(): User | null;
}
