import type { User } from '@nemis-desktop/domain';
import type { IUserRepository } from '../../interfaces/identity/user-repository';

export class InMemoryUserRepository implements IUserRepository {
  readonly store = new Map<string, User>();
  findById(id: string): User | null {
    return this.store.get(id) ?? null;
  }
  findFirst(): User | null {
    for (const user of this.store.values()) return user;
    return null;
  }
}
