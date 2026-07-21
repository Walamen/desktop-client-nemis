import type { Term } from '@nemis-desktop/domain';

export interface ITermRepository {
  findById(id: string): Term | null;
  /** Every term of the given year, ordered startDate ASC. */
  findByYear(academicYearId: string): Term[];
  /** The term flagged current within the institution's current year, or null. */
  findCurrent(): Term | null;
  existsByName(academicYearId: string, name: string, excludeId?: string): boolean;
  /** Other terms of the same year currently flagged current — used to clear
   * them when a new term becomes current. */
  findCurrentOthers(academicYearId: string, excludeId: string): Term[];
  save(term: Term): void;
  delete(id: string): void;
}
