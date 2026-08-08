import type { Institution } from '@nemis-desktop/domain';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';

export class InMemoryInstitutionRepository implements IInstitutionRepository {
  readonly store = new Map<string, Institution>();
  findById(id: string): Institution | null {
    return this.store.get(id) ?? null;
  }
  findFirst(): Institution | null {
    for (const institution of this.store.values()) return institution;
    return null;
  }
  findAll(): Institution[] {
    return [...this.store.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
