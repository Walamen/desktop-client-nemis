import type { User } from '@nemis-desktop/domain';

export interface IUserRepository {
  findById(id: string): User | null;
  /** The provisioned user for this installation, or null before authentication/import. */
  findFirst(): User | null;
}
