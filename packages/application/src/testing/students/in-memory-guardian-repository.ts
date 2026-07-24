import type { Guardian } from '@nemis-desktop/domain';
import type { IGuardianRepository } from '../../interfaces/students/guardian-repository';

export class InMemoryGuardianRepository implements IGuardianRepository {
  readonly store = new Map<string, Guardian>();
  findById(id: string): Guardian | null {
    return this.store.get(id) ?? null;
  }
  exists(id: string): boolean {
    return this.store.has(id);
  }
  save(guardian: Guardian): void { this.store.set(guardian.id, guardian); }
  findByStudentId(_studentId: string): Guardian[] { return []; }
}
