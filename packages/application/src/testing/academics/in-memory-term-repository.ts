import type { Term } from '@nemis-desktop/domain';
import type { ITermRepository } from '../../interfaces/academics/term-repository';

export class InMemoryTermRepository implements ITermRepository {
  readonly store = new Map<string, Term>();

  findById(id: string): Term | null {
    return this.store.get(id) ?? null;
  }

  findByYear(academicYearId: string): Term[] {
    return [...this.store.values()]
      .filter((t) => t.academicYearId === academicYearId)
      .sort((a, b) => a.period.start.localeCompare(b.period.start));
  }

  findCurrent(): Term | null {
    for (const term of this.store.values()) {
      if (term.isCurrent) return term;
    }
    return null;
  }

  existsByName(academicYearId: string, name: string, excludeId?: string): boolean {
    return [...this.store.values()].some(
      (t) => t.academicYearId === academicYearId && t.name === name && t.id !== excludeId,
    );
  }

  findCurrentOthers(academicYearId: string, excludeId: string): Term[] {
    return [...this.store.values()].filter(
      (t) => t.academicYearId === academicYearId && t.isCurrent && t.id !== excludeId,
    );
  }

  save(term: Term): void {
    this.store.set(term.id, term);
  }

  delete(id: string): void {
    this.store.delete(id);
  }
}
