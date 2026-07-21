import type { AcademicYear } from '@nemis-desktop/domain';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { InMemoryClassRepository } from './in-memory-class-repository';
import type { InMemoryTermRepository } from './in-memory-term-repository';

export class InMemoryAcademicYearRepository implements IAcademicYearRepository {
  readonly store = new Map<string, AcademicYear>();

  /** Optional references to the terms/classes fakes so countTerms()/
   * countClasses() can read their stores — mirrors a real SQL join. */
  constructor(
    private readonly terms?: InMemoryTermRepository,
    private readonly classes?: InMemoryClassRepository,
  ) {}

  findCurrent(): AcademicYear | null {
    for (const year of this.store.values()) {
      if (year.isCurrent) return year;
    }
    return null;
  }

  findById(id: string): AcademicYear | null {
    return this.store.get(id) ?? null;
  }

  findAll(): AcademicYear[] {
    return [...this.store.values()].sort((a, b) => b.period.start.localeCompare(a.period.start));
  }

  existsByCode(institutionId: string, code: string, excludeId?: string): boolean {
    return [...this.store.values()].some(
      (y) => y.institutionId === institutionId && y.code.value === code && y.id !== excludeId,
    );
  }

  findCurrentOthers(institutionId: string, excludeId: string): AcademicYear[] {
    return [...this.store.values()].filter(
      (y) => y.institutionId === institutionId && y.isCurrent && y.id !== excludeId,
    );
  }

  save(year: AcademicYear): void {
    this.store.set(year.id, year);
  }

  countTerms(academicYearId: string): number {
    if (!this.terms) return 0;
    return [...this.terms.store.values()].filter((t) => t.academicYearId === academicYearId)
      .length;
  }

  countClasses(academicYearId: string): number {
    if (!this.classes) return 0;
    return [...this.classes.store.values()].filter((c) => c.academicYearId === academicYearId)
      .length;
  }
}
