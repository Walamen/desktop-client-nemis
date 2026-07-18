import type { Class } from '@nemis-desktop/domain';
import type { IClassRepository } from '../../interfaces/academics/class-repository';

export class InMemoryClassRepository implements IClassRepository {
  readonly store = new Map<string, Class>();
  findById(id: string): Class | null {
    return this.store.get(id) ?? null;
  }
  exists(id: string): boolean {
    return this.store.has(id);
  }
}
