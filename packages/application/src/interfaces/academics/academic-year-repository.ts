import type { AcademicYear } from '@nemis-desktop/domain';

export interface IAcademicYearRepository {
  /** The institution's current academic year, or null when none is configured. */
  findCurrent(): AcademicYear | null;
  findById(id: string): AcademicYear | null;
  /** Every academic year for this install, ordered startDate DESC. */
  findAll(): AcademicYear[];
  existsByCode(institutionId: string, code: string, excludeId?: string): boolean;
  /** Other years of the same institution currently flagged current — used to
   * clear them when a new year becomes current. */
  findCurrentOthers(institutionId: string, excludeId: string): AcademicYear[];
  save(year: AcademicYear): void;
  countTerms(academicYearId: string): number;
  countClasses(academicYearId: string): number;
}
