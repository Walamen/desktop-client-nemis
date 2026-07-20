import type { AcademicYear } from '@nemis-desktop/domain';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';

export class InMemoryAcademicYearRepository implements IAcademicYearRepository {
  readonly store = new Map<string, AcademicYear>();
  findCurrent(): AcademicYear | null {
    for (const year of this.store.values()) {
      if (year.isCurrent) return year;
    }
    return null;
  }
}
