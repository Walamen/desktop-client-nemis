import type { DistrictRef, IDistrictRepository } from '../../interfaces/institution/district-repository';

export class InMemoryDistrictRepository implements IDistrictRepository {
  readonly store = new Map<string, DistrictRef>();
  findAll(): DistrictRef[] {
    return [...this.store.values()];
  }
}
