import type { AcademicYear } from '@nemis-desktop/domain';

export interface IAcademicYearRepository {
  /** The institution's current academic year, or null when none is configured. */
  findCurrent(): AcademicYear | null;
}
